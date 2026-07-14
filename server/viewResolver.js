// server/viewResolver.js
// Resolve a saved VIEW (view_definition + view_column + filter_json + sort_json)
// to display-ready rows, server-side, for the Power Automation 'export_view_email'
// action. This is the pg/worker-side counterpart to the client's listService: it
// reads raw physical columns from Postgres and resolves each cell to its label
// (choice/lookup/state/status/boolean) via labelResolver, exactly like the grid.
//
// Only DIRECT entity fields are exported. "Borrowed" related columns (view_column
// rows with a relationship_definition_id — added via the grid's Add-related-field)
// are skipped, since they are a cross-entity join the export doesn't reconstruct.
// A lookup field (e.g. Account on a Lead) is a direct column and IS included,
// resolved to the related record's name.

const { resolveFieldDisplay } = require("./labelResolver");

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function quoteIdent(name) {
  if (!IDENT_RE.test(String(name))) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HARD_CAP = Number(process.env.AUTOMATION_VIEW_EXPORT_CAP || 10000);

// Logical → physical aliases matching the grid (statecode/statusreason columns).
const LOGICAL_ALIASES = { statecode: "state_code", statusreason: "status_reason" };

/**
 * Resolve a view to { viewName, entityLogical, entityDefId, headers, rows, rowCount }.
 * `rows` is an array of arrays of display strings (aligned to `headers`).
 * Throws (with a clear message) on a missing view/entity or an unresolvable filter
 * field — a scheduled export must fail loudly rather than silently email the wrong
 * (broader) data set.
 */
async function resolveViewToRows(pool, viewId) {
  // 1. View + its entity.
  const vr = await pool.query(
    `select v.view_id, v.name, v.filter_json, v.sort_json,
            e.entity_definition_id, e.logical_name, e.physical_table_name, e.primary_key_column
       from view_definition v
       join entity_definition e on e.entity_definition_id = v.entity_definition_id
      where v.view_id = $1
      limit 1`,
    [viewId]
  );
  const view = vr.rows[0];
  if (!view) throw new Error(`view ${viewId} not found`);

  // 2. ALL active fields of the entity (for filter mapping + display metadata).
  const fr = await pool.query(
    `select fd.field_definition_id, fd.logical_name, fd.physical_column_name, fd.display_name,
            fd.lookup_entity_id, fd.config_json, ft.name as type
       from field_definition fd
       left join field_type ft on ft.field_type_id = fd.field_type_id
      where fd.entity_definition_id = $1 and fd.is_active = true and fd.deleted_at is null`,
    [view.entity_definition_id]
  );
  const byLogical = new Map();
  const byPhysical = new Map();
  const byId = new Map();
  for (const f of fr.rows) {
    byLogical.set(f.logical_name, f);
    if (f.physical_column_name) byPhysical.set(f.physical_column_name, f);
    byId.set(f.field_definition_id, f);
  }

  // 3. Output columns — the view's own columns in order (direct fields only).
  const cr = await pool.query(
    `select field_definition_id, display_order, label_override, relationship_definition_id
       from view_column where view_id = $1 order by display_order asc`,
    [viewId]
  );
  let columns = cr.rows
    .filter((c) => !c.relationship_definition_id) // skip borrowed related columns
    .map((c) => {
      const meta = byId.get(c.field_definition_id);
      if (!meta || !meta.physical_column_name) return null;
      return { meta, header: c.label_override || meta.display_name || meta.logical_name };
    })
    .filter(Boolean);

  // Fallback: a view with no (usable) columns exports every direct field.
  if (columns.length === 0) {
    columns = fr.rows
      .filter((f) => f.physical_column_name)
      .map((f) => ({ meta: f, header: f.display_name || f.logical_name }));
  }
  if (columns.length === 0) throw new Error(`view "${view.name}" has no exportable columns`);

  // 4. WHERE from filter_json (nested FilterGroup).
  const params = [];
  const resolveCol = (logical) => {
    const key = LOGICAL_ALIASES[logical] || logical;
    const f = byLogical.get(key) || byLogical.get(logical) || byPhysical.get(key);
    return f || null;
  };
  const whereSql = buildGroupSql(parseJson(view.filter_json), resolveCol, params);

  // 5. ORDER BY from sort_json.
  const orderSql = buildOrderSql(parseJson(view.sort_json), resolveCol);

  // 6. Query.
  const selectList = columns.map((c) => quoteIdent(c.meta.physical_column_name)).join(", ");
  let sql = `select ${selectList} from ${quoteIdent(view.physical_table_name)}`;
  if (whereSql) sql += ` where ${whereSql}`;
  if (orderSql) sql += ` order by ${orderSql}`;
  params.push(HARD_CAP);
  sql += ` limit $${params.length}`;

  const res = await pool.query(sql, params);

  // 7. Resolve each cell to its label (choice/lookup/state/status/boolean).
  const rows = await Promise.all(
    res.rows.map((r) =>
      Promise.all(
        columns.map((c) =>
          resolveFieldDisplay(pool, c.meta, view.entity_definition_id, r[c.meta.physical_column_name])
        )
      )
    )
  );

  return {
    viewName: view.name,
    entityLogical: view.logical_name,
    entityDefId: view.entity_definition_id,
    headers: columns.map((c) => c.header),
    rows,
    rowCount: rows.length,
  };
}

function parseJson(v) {
  if (v == null) return null;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

// Recursively translate a FilterGroup {operator:'AND'|'OR', conditions[], groups[]}.
function buildGroupSql(group, resolveCol, params) {
  if (!group || typeof group !== "object") return "";
  const parts = [];
  for (const cond of group.conditions || []) {
    const sql = buildCondSql(cond, resolveCol, params);
    if (sql) parts.push(sql);
  }
  for (const g of group.groups || []) {
    const sub = buildGroupSql(g, resolveCol, params);
    if (sub) parts.push(`(${sub})`);
  }
  if (parts.length === 0) return "";
  const glue = group.operator === "OR" ? " or " : " and ";
  return parts.join(glue);
}

function buildCondSql(cond, resolveCol, params) {
  if (!cond || !cond.field_logical_name) return "";
  const op = cond.operator;
  const field = resolveCol(cond.field_logical_name);
  if (!field) {
    throw new Error(`view filter references unknown field "${cond.field_logical_name}"`);
  }
  const cq = quoteIdent(field.physical_column_name);
  const type = (field.type || "").toLowerCase();
  const isDate = type === "date" || type === "datetime";
  const push = (v) => { params.push(v); return `$${params.length}`; };

  // Null/empty checks first (value-independent).
  if (op === "is_null") return `(${cq} is null or ${cq}::text = '')`;
  if (op === "is_not_null") return `(${cq} is not null and ${cq}::text <> '')`;

  const raw = cond.value;
  const val = Array.isArray(raw) ? raw : raw;

  switch (op) {
    case "eq":
      if (val == null || val === "") return "";
      if (isDate && DATE_ONLY.test(String(val))) {
        return `${cq} >= ${push(`${val}T00:00:00.000Z`)} and ${cq} <= ${push(`${val}T23:59:59.999Z`)}`;
      }
      return `${cq}::text = ${push(String(val))}`;
    case "neq":
      if (val == null || val === "") return "";
      if (isDate && DATE_ONLY.test(String(val))) {
        return `(${cq} < ${push(`${val}T00:00:00.000Z`)} or ${cq} > ${push(`${val}T23:59:59.999Z`)})`;
      }
      return `(${cq}::text is distinct from ${push(String(val))})`;
    case "contains":     return val ? `${cq}::text ilike ${push(`%${val}%`)}` : "";
    case "not_contains": return val ? `${cq}::text not ilike ${push(`%${val}%`)}` : "";
    case "begins_with":  return val ? `${cq}::text ilike ${push(`${val}%`)}` : "";
    case "ends_with":    return val ? `${cq}::text ilike ${push(`%${val}`)}` : "";
    case "gt":
      if (val == null || val === "") return "";
      return `${cq} > ${push(isDate && DATE_ONLY.test(String(val)) ? `${val}T23:59:59.999Z` : val)}`;
    case "gte":
      if (val == null || val === "") return "";
      return `${cq} >= ${push(isDate && DATE_ONLY.test(String(val)) ? `${val}T00:00:00.000Z` : val)}`;
    case "lt":
      if (val == null || val === "") return "";
      return `${cq} < ${push(isDate && DATE_ONLY.test(String(val)) ? `${val}T00:00:00.000Z` : val)}`;
    case "lte":
      if (val == null || val === "") return "";
      return `${cq} <= ${push(isDate && DATE_ONLY.test(String(val)) ? `${val}T23:59:59.999Z` : val)}`;
    case "in":
    case "not_in": {
      const list = Array.isArray(val)
        ? val.map(String)
        : String(val ?? "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      if (list.length === 0) return op === "in" ? "false" : "";
      const p = push(list);
      return op === "in"
        ? `${cq}::text = any(${p}::text[])`
        : `(${cq} is null or ${cq}::text <> all(${p}::text[]))`;
    }
    case "between": {
      const lo = val;
      const hi = cond.value2;
      if (lo == null || lo === "" || hi == null || hi === "") return "";
      const loP = push(isDate && DATE_ONLY.test(String(lo)) ? `${lo}T00:00:00.000Z` : lo);
      const hiP = push(isDate && DATE_ONLY.test(String(hi)) ? `${hi}T23:59:59.999Z` : hi);
      return `${cq} >= ${loP} and ${cq} <= ${hiP}`;
    }
    default:
      // Unknown operator — skip rather than fail the whole export.
      return "";
  }
}

function buildOrderSql(sort, resolveCol) {
  if (!Array.isArray(sort) || sort.length === 0) return "";
  const parts = [];
  for (const s of [...sort].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const f = resolveCol(s.field_logical_name);
    if (!f) continue;
    parts.push(`${quoteIdent(f.physical_column_name)} ${s.direction === "desc" ? "desc" : "asc"}`);
  }
  return parts.join(", ");
}

module.exports = { resolveViewToRows };
