// server/automationWorker.js
// Power Automation — durable queue worker.
//
// Polls automation_job, claims a batch atomically (FOR UPDATE SKIP LOCKED so
// multiple workers/instances never double-process), and runs each rule's ordered
// actions under a system identity. Retries with exponential backoff, then
// dead-letters. Already-succeeded actions are not re-run on retry, so a partial
// failure never re-sends an email (exactly-once side effects).
//
// Adding a new action type = one entry in the ACTIONS registry below. Nothing
// else in the worker changes.

const fs = require("fs");
const path = require("path");
const { sendEmail } = require("./emailTransport");
const { ruleMatches, conditionHolds } = require("./ruleMatch");
const { resolveFieldDisplay, resolveLogicalRecordDisplay } = require("./labelResolver");
const { resolveViewToRows } = require("./viewResolver");
const {
  resolveTokens, resolveValue, resolveEmailList, dedupeEmails, escapeHtml,
} = require("./tokenResolver");

const POLL_INTERVAL_MS = Number(process.env.AUTOMATION_POLL_MS || 1500);
const CLAIM_BATCH = Number(process.env.AUTOMATION_BATCH || 10);
const MAX_DEPTH = 3;
const BACKOFF_BASE_MS = 15_000;
const BACKOFF_CAP_MS = 10 * 60_000;
const LIST_ROWS_HARD_CAP = Number(process.env.AUTOMATION_LIST_ROWS_CAP || 1000);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveRecipients(pool, config, after) {
  const out = new Set();
  for (const addr of config.to_static || []) {
    if (typeof addr === "string" && addr.includes("@")) out.add(addr.trim());
  }
  for (const field of config.to_fields || []) {
    const val = after ? after[field] : undefined;
    if (typeof val === "string" && val.includes("@")) {
      out.add(val.trim());
    } else if (typeof val === "string" && UUID_RE.test(val)) {
      // A user lookup — resolve to the user's email.
      try {
        const r = await pool.query(
          "select email from crm_user where user_id = $1 limit 1",
          [val]
        );
        if (r.rows[0]?.email) out.add(r.rows[0].email);
      } catch {
        /* ignore lookup failures */
      }
    }
  }
  return [...out];
}

/** Resolve a list of crm_user ids to their email addresses. Never throws. */
async function resolveUserEmails(pool, userIds) {
  const ids = (userIds || []).filter((v) => typeof v === "string" && UUID_RE.test(v));
  if (ids.length === 0) return [];
  try {
    const r = await pool.query(
      "select email from crm_user where user_id = any($1) and email is not null",
      [ids]
    );
    return r.rows.map((x) => x.email).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Resolve the triggering record's owner (owner_id) to their email address(es).
 * Uses the change snapshot's owner_id when present, else reads it fresh from the
 * record. Never throws — returns [] on any miss so the send just skips the owner.
 */
async function resolveOwnerEmail(pool, job, after) {
  try {
    let ownerId = after && after.owner_id;
    if (!(typeof ownerId === "string" && UUID_RE.test(ownerId))) {
      // Snapshot didn't carry owner_id — read it from the record.
      const entity = await getEntity(pool, job.record_table);
      if (!entity) return [];
      const cols = await getTableColumns(pool, entity.physical_table_name);
      if (!cols.has("owner_id")) return [];
      const pk = await getPrimaryKey(pool, entity);
      const r = await pool.query(
        `select owner_id from ${quoteIdent(entity.physical_table_name)} where ${quoteIdent(pk)} = $1 limit 1`,
        [job.record_id]
      );
      ownerId = r.rows[0]?.owner_id;
    }
    if (!(typeof ownerId === "string" && UUID_RE.test(ownerId))) return [];
    return await resolveUserEmails(pool, [ownerId]);
  } catch {
    return [];
  }
}

/**
 * Resolve the sender mailbox for a send_email action. Returns the flow's chosen
 * enabled account, else the default enabled account, else null (transport then
 * falls back to GRAPH_* env / edge-fn / stub). Never throws.
 */
async function resolveSenderAccount(pool, accountId) {
  try {
    if (accountId) {
      const r = await pool.query(
        "select * from automation_email_account where account_id = $1 and enabled = true limit 1",
        [accountId]
      );
      if (r.rows[0]) return r.rows[0];
    }
    const d = await pool.query(
      "select * from automation_email_account where is_default = true and enabled = true limit 1"
    );
    return d.rows[0] || null;
  } catch {
    return null; // table missing or query failed — fall back to env/stub
  }
}

// ── metadata resolution (logical → physical), cached ─────────────────────────

const entityCache = new Map(); // logical_name -> entity_definition row
const fieldCache = new Map(); // entity_definition_id -> { byLogical, physToLogical }

async function getEntity(pool, logical) {
  if (entityCache.has(logical)) return entityCache.get(logical);
  const r = await pool.query(
    `select entity_definition_id, logical_name, physical_table_name, primary_key_column, primary_field_name
       from entity_definition where logical_name = $1 limit 1`,
    [logical]
  );
  const row = r.rows[0] || null;
  entityCache.set(logical, row);
  return row;
}

const entityByIdCache = new Map(); // entity_definition_id -> entity row
async function getEntityById(pool, entityDefId) {
  if (entityByIdCache.has(entityDefId)) return entityByIdCache.get(entityDefId);
  const r = await pool.query(
    `select entity_definition_id, logical_name, physical_table_name, primary_key_column, primary_field_name
       from entity_definition where entity_definition_id = $1 limit 1`,
    [entityDefId]
  );
  const row = r.rows[0] || null;
  entityByIdCache.set(entityDefId, row);
  return row;
}

async function getFields(pool, entityDefId) {
  if (fieldCache.has(entityDefId)) return fieldCache.get(entityDefId);
  const r = await pool.query(
    `select fd.logical_name, fd.physical_column_name, fd.display_name, fd.lookup_entity_id, fd.config_json, ft.name as type
       from field_definition fd
       left join field_type ft on ft.field_type_id = fd.field_type_id
      where fd.entity_definition_id = $1 and fd.is_active = true and fd.deleted_at is null`,
    [entityDefId]
  );
  const byLogical = new Map();
  const physToLogical = new Map();
  for (const f of r.rows) {
    byLogical.set(f.logical_name, f);
    if (f.physical_column_name) physToLogical.set(f.physical_column_name, f.logical_name);
  }
  const val = { byLogical, physToLogical };
  fieldCache.set(entityDefId, val);
  return val;
}

const pkCache = new Map(); // physical_table_name -> pk column
/** Resolve a table's primary-key column, tolerating a null metadata value. */
async function getPrimaryKey(pool, entity) {
  if (entity.primary_key_column) return entity.primary_key_column;
  if (pkCache.has(entity.physical_table_name)) return pkCache.get(entity.physical_table_name);
  const r = await pool.query(
    `select a.attname as col
       from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ('public.' || $1)::regclass and i.indisprimary limit 1`,
    [entity.physical_table_name]
  );
  const col = r.rows[0]?.col || `${entity.logical_name}_id`;
  pkCache.set(entity.physical_table_name, col);
  return col;
}

const tableColsCache = new Map(); // physical_table_name -> Set(column_name)
async function getTableColumns(pool, table) {
  if (tableColsCache.has(table)) return tableColsCache.get(table);
  const r = await pool.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
    [table]
  );
  const set = new Set(r.rows.map((x) => x.column_name));
  tableColsCache.set(table, set);
  return set;
}

/** Read a record's current logical values (used to build before/after for chaining). */
async function readRecordLogical(pool, entity, recordId) {
  const { physToLogical } = await getFields(pool, entity.entity_definition_id);
  const r = await pool.query(
    `select * from ${quoteIdent(entity.physical_table_name)} where ${quoteIdent(entity.primary_key_column)} = $1 limit 1`,
    [recordId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const logical = {};
  for (const [phys, val] of Object.entries(row)) {
    logical[physToLogical.get(phys) || phys] = val;
  }
  return logical;
}

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function quoteIdent(name) {
  if (!IDENT_RE.test(String(name))) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
}

/**
 * Walk the relationship graph from the trigger record and assemble a denormalized
 * table for `related_export_email`. Sources:
 *   - kind 'record'  → the trigger record itself (single row).
 *   - kind 'parent'  → follow an N:1 lookup path (logical lookup field names) from
 *                      the trigger record to ONE related record.
 *   - kind 'child'   → a 1:N list hanging off an anchor source (the row multiplier):
 *                      child rows where <child_fk_physical> = anchor record id.
 * At most one child source expands the output (one row per child); columns from the
 * record/parent sources repeat across those rows. Returns { headers, rows }.
 */
async function buildRelatedRows(pool, job, sources, columns) {
  const rootEntity = await getEntity(pool, job.record_table);
  if (!rootEntity) throw new Error(`related export: unknown table ${job.record_table}`);
  const rootFields = await getFields(pool, rootEntity.entity_definition_id);
  const rootRow = await readRecordLogical(pool, rootEntity, job.record_id);

  // Resolve every non-child source first (children reference an anchor source).
  const resolved = new Map(); // source_id -> { kind, entity, entityDefId, fields, single, id, rows }
  resolved.set('record', {
    kind: 'record', entity: rootEntity, entityDefId: rootEntity.entity_definition_id,
    fields: rootFields, single: rootRow, id: job.record_id,
  });

  const byId = new Map(sources.map((s) => [s.id, s]));

  async function resolveParent(src) {
    if (resolved.has(src.id)) return resolved.get(src.id);
    let cur = { entity: rootEntity, fields: rootFields, row: rootRow, id: job.record_id };
    for (const lookupLogical of src.lookup_path || []) {
      const meta = cur.fields.byLogical.get(lookupLogical);
      const fkVal = cur.row ? cur.row[lookupLogical] : null;
      if (!meta || !meta.lookup_entity_id || !fkVal) { cur = { entity: null, fields: null, row: null, id: null }; break; }
      const te = await getEntityById(pool, meta.lookup_entity_id);
      if (!te) { cur = { entity: null, fields: null, row: null, id: null }; break; }
      const tf = await getFields(pool, te.entity_definition_id);
      const trow = await readRecordLogical(pool, te, fkVal);
      cur = { entity: te, fields: tf, row: trow, id: fkVal };
    }
    const out = cur.entity
      ? { kind: 'parent', entity: cur.entity, entityDefId: cur.entity.entity_definition_id, fields: cur.fields, single: cur.row, id: cur.id }
      : { kind: 'parent', entity: null, entityDefId: null, fields: null, single: null, id: null };
    resolved.set(src.id, out);
    return out;
  }

  for (const src of sources) {
    if (src.kind === 'parent') await resolveParent(src);
  }

  // The single child source (row multiplier), if any.
  const childSrc = sources.find((s) => s.kind === 'child');
  let childRows = [null]; // [null] = no expansion → a single output row
  let childCtx = null;
  if (childSrc) {
    const anchor = resolved.get(childSrc.anchor_source_id)
      || (byId.get(childSrc.anchor_source_id)?.kind === 'parent'
        ? await resolveParent(byId.get(childSrc.anchor_source_id))
        : resolved.get('record'));
    const childEntity = await getEntity(pool, childSrc.child_entity_logical);
    if (childEntity && anchor && anchor.id && childSrc.child_fk_physical) {
      const childFields = await getFields(pool, childEntity.entity_definition_id);
      const limit = Math.min(Math.max(1, Number(childSrc.limit) || 500), LIST_ROWS_HARD_CAP);
      const res = await pool.query(
        `select * from ${quoteIdent(childEntity.physical_table_name)} where ${quoteIdent(childSrc.child_fk_physical)} = $1 limit $2`,
        [anchor.id, limit]
      );
      const rows = res.rows.map((r) => {
        const logical = {};
        for (const [phys, val] of Object.entries(r)) logical[childFields.physToLogical.get(phys) || phys] = val;
        return logical;
      });
      childCtx = { entity: childEntity, entityDefId: childEntity.entity_definition_id, fields: childFields };
      resolved.set(childSrc.id, { kind: 'child', ...childCtx, single: null, id: null });
      childRows = rows.length ? rows : [null];
    } else {
      resolved.set(childSrc.id, { kind: 'child', entity: childEntity, entityDefId: childEntity?.entity_definition_id, fields: null, single: null, id: null });
    }
  }

  // Headers.
  const headers = columns.map((col) => {
    if (col.header) return col.header;
    const src = resolved.get(col.source_id);
    const meta = src && src.fields ? src.fields.byLogical.get(col.field) : null;
    return meta?.display_name || col.field;
  });

  // Rows (one per child row, or a single row when no child source).
  const rows = [];
  for (const childRow of childRows) {
    const cells = await Promise.all(columns.map(async (col) => {
      const src = resolved.get(col.source_id);
      if (!src) return '';
      const rec = src.kind === 'child' ? childRow : src.single;
      const meta = src.fields ? src.fields.byLogical.get(col.field) : null;
      const raw = rec ? rec[col.field] : null;
      return resolveFieldDisplay(pool, meta, src.entityDefId, raw);
    }));
    rows.push(cells);
  }
  return { headers, rows };
}

/**
 * Authoritative AND-condition gate. Own-record conditions evaluate against the
 * saved snapshot; related conditions ("<lookup>.<field>") follow the lookup to
 * the related row and read its current value.
 *
 * Unlike a plain pass/fail check, this evaluates EVERY condition (no short-circuit)
 * and returns a diagnostic trace so the run history can show, n8n-style, exactly
 * which condition blocked a skipped run:
 *   { pass, trace: [{ field, operator, expected, actual, pass }, ...] }
 * `pass` is true only when every condition holds (AND semantics). This is also
 * where related-record conditions actually get enforced (the client/enqueue
 * matchers defer them — see ruleMatch conditionHolds).
 */
async function evaluateConditions(pool, rule, job, after) {
  let conds = rule.conditions;
  if (typeof conds === "string") {
    try { conds = JSON.parse(conds); } catch { conds = []; }
  }
  if (!Array.isArray(conds) || conds.length === 0) return { pass: true, trace: [] };

  const entity = await getEntity(pool, job.record_table);
  const fields = entity ? await getFields(pool, entity.entity_definition_id) : null;

  const trace = [];
  for (const c of conds) {
    if (!c || !c.field) continue;
    const fieldStr = String(c.field);
    let actual;
    let pass;

    if (!fieldStr.includes(".")) {
      // Own field.
      actual = after ? after[c.field] : undefined;
      pass = conditionHolds(c, after);
    } else if (fieldStr.startsWith("regarding.")) {
      // Parent (polymorphic "regarding") record: "regarding.<relField>" — follow the
      // note's regarding_entity_name + regarding_record_id to its parent row. This is
      // how a Note rule conditions on the Lead/Opportunity it was created on.
      const relField = fieldStr.slice("regarding.".length);
      const parentName = after ? after.regarding_entity_name : null;
      const parentId = after ? after.regarding_record_id : null;
      actual = null;
      if (parentName && parentId) {
        const pe = await getEntity(pool, parentName);
        if (pe) {
          const pf = await getFields(pool, pe.entity_definition_id);
          const col = pf.byLogical.get(relField)?.physical_column_name;
          if (col) {
            const r = await pool.query(
              `select ${quoteIdent(col)} as v from ${quoteIdent(pe.physical_table_name)} where ${quoteIdent(pe.primary_key_column)} = $1 limit 1`,
              [parentId]
            );
            actual = r.rows[0] ? r.rows[0].v : null;
          }
        }
      }
      pass = conditionHolds({ field: "v", operator: c.operator, value: c.value }, { v: actual });
    } else {
      // Related: <lookupLogical>.<relField>
      const [lookupLogical, relField] = fieldStr.split(".");
      const lf = fields && fields.byLogical.get(lookupLogical);
      const relId = after ? after[lookupLogical] : null;
      actual = null;
      if (lf && lf.lookup_entity_id && relId) {
        const relEnt = (
          await pool.query(
            "select entity_definition_id, physical_table_name, primary_key_column from entity_definition where entity_definition_id = $1",
            [lf.lookup_entity_id]
          )
        ).rows[0];
        if (relEnt) {
          const relFields = await getFields(pool, relEnt.entity_definition_id);
          const col = relFields.byLogical.get(relField)?.physical_column_name;
          if (col) {
            const r = await pool.query(
              `select ${quoteIdent(col)} as v from ${quoteIdent(relEnt.physical_table_name)} where ${quoteIdent(relEnt.primary_key_column)} = $1 limit 1`,
              [relId]
            );
            actual = r.rows[0] ? r.rows[0].v : null;
          }
        }
      }
      // Reuse conditionHolds with a non-dotted synthetic field so it evaluates normally.
      pass = conditionHolds({ field: "v", operator: c.operator, value: c.value }, { v: actual });
    }

    trace.push({
      field: c.field,
      operator: c.operator,
      expected: c.value ?? null,
      actual: actual ?? null,
      pass,
    });
  }

  return { pass: trace.every((t) => t.pass), trace };
}

let chainNonce = 0;
/**
 * Loop-protected chaining: after an update_field changes a record, re-evaluate
 * enabled rules for that table and enqueue matching follow-up jobs at depth+1.
 * The processJob depth guard hard-stops runaway loops at depth >= MAX_DEPTH.
 */
async function enqueueChainedJobs(pool, tableLogical, recordId, before, after, depth, createdBy) {
  if (depth + 1 >= MAX_DEPTH) return; // don't even enqueue past the limit
  const rules = (
    await pool.query(
      "select * from automation_rule where table_logical_name = $1 and enabled = true",
      [tableLogical]
    )
  ).rows;
  for (const rule of rules) {
    if (!ruleMatches(rule, "update", before, after)) continue;
    const idem = `${rule.automation_rule_id}:${recordId}:chain-${Date.now()}-${chainNonce++}`;
    await pool
      .query(
        `insert into automation_job
           (rule_id, record_table, record_id, trigger_event, change_snapshot, status, depth, idempotency_key, created_by)
         values ($1,$2,$3,'update',$4,'pending',$5,$6,$7)`,
        [
          rule.automation_rule_id,
          tableLogical,
          recordId,
          JSON.stringify({ before, after, changed_fields: Object.keys(after) }),
          depth + 1,
          idem,
          createdBy,
        ]
      )
      .catch(() => {});
  }
}

// ── action registry ──────────────────────────────────────────────────────────
// Each handler returns an `output` object recorded in the run history, or throws
// to fail the action (which triggers retry/dead-letter for the whole job).

function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Shared tail for the export actions: turn resolved (headers, rows) into an
 * Excel/CSV attachment and email it. `name` seeds the file name / subject / body
 * defaults and the {{export.*}} tokens. Returns the action output (or a __skipped
 * marker for no-rows / no-recipients). Used by export_view_email + related_export_email.
 */
async function sendExportEmail(ctx, { headers, rows, name, extra = {} }) {
  const c = ctx.action.config || {};
  const rowCount = rows.length;
  ctx.export = { count: rowCount, view: name };

  if (rowCount === 0 && c.skip_if_empty) {
    return { __skipped: true, reason: "export returned no rows", ...extra };
  }

  const userEmails = await resolveUserEmails(ctx.pool, c.to_user_ids);
  const to = dedupeEmails([...resolveEmailList(c.to, ctx), ...userEmails]);
  const cc = dedupeEmails(resolveEmailList(c.cc, ctx));
  if (to.length === 0 && cc.length === 0) {
    return { __skipped: true, reason: "no recipients", to: [], cc: [], ...extra };
  }

  const format = c.format === "csv" ? "csv" : "xlsx";
  const rawName = resolveTokens(c.filename || name || "export", ctx, false) || "export";
  const safeBase = (String(rawName).replace(/[^\w.-]+/g, "_").slice(0, 80)) || "export";
  const filename = `${safeBase}.${format}`;
  let contentBytes;
  let contentType;
  if (format === "xlsx") {
    const XLSX = require("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export");
    contentBytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }).toString("base64");
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  } else {
    const csv = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
    contentBytes = Buffer.from(csv, "utf8").toString("base64");
    contentType = "text/csv";
  }

  const account = await resolveSenderAccount(ctx.pool, c.email_account_id);
  const subject = resolveTokens(c.subject || `${name} export`, ctx, false);
  const html = resolveTokens(
    c.body || `<p>Please find attached the <strong>${escapeHtml(name)}</strong> export (${rowCount} rows).</p>`,
    ctx,
    true
  );

  const result = await sendEmail({ to, cc, subject, html, account, attachments: [{ filename, contentBytes, contentType }] });
  return {
    transport: result.transport,
    message_id: result.messageId,
    from: result.from || account?.from_address || null,
    to, cc, subject, row_count: rowCount, filename, ...extra,
  };
}

const ACTIONS = {
  async send_email(ctx) {
    const config = ctx.action.config || {};
    // Server-side config guard (enforcement point; the editor validates too).
    if (!config.subject || !String(config.subject).trim()) {
      throw new Error("send_email config invalid: subject is required");
    }
    // Recipients = legacy static/field list + the record's owner + token-resolved To string.
    const legacy = await resolveRecipients(ctx.pool, config, ctx.after);
    const owner = config.send_to_owner
      ? await resolveOwnerEmail(ctx.pool, ctx.job, ctx.after)
      : [];
    const to = dedupeEmails([...legacy, ...owner, ...resolveEmailList(config.to, ctx)]);
    const cc = dedupeEmails(resolveEmailList(config.cc, ctx));

    // Zero valid recipients -> skip (not fail). Visible in run history.
    if (to.length === 0 && cc.length === 0) {
      return { __skipped: true, reason: "no recipients", to: [], cc: [] };
    }

    // Sender mailbox ("send on behalf"): the flow's chosen account, else the
    // default account. Carries its own Graph credentials to the transport.
    const account = await resolveSenderAccount(ctx.pool, config.email_account_id);

    const subject = resolveTokens(config.subject, ctx, false);
    let html = resolveTokens(config.body, ctx, true);

    // Optionally link a document generated earlier in this same job.
    if (config.attach_document) {
      const doc = (
        await ctx.pool.query(
          `select output from automation_job_action_log
            where job_id = $1 and action_type = 'generate_document' and status = 'succeeded'
            order by finished_at desc limit 1`,
          [ctx.job.automation_job_id]
        )
      ).rows[0];
      const url = doc?.output?.document_path;
      if (url) {
        const base = process.env.APP_BASE_URL || "";
        html += `<p><a href="${escapeHtml(base + url)}">Attached document</a></p>`;
      }
    }

    const result = await sendEmail({ to, cc, subject, html, account });
    return {
      transport: result.transport,
      message_id: result.messageId,
      from: result.from || account?.from_address || null,
      to, cc, subject,
    };
  },

  async list_rows(ctx) {
    const c = ctx.action.config || {};
    const stepName = c.step_name;
    if (!stepName) throw new Error("list_rows config invalid: step name required");
    const entity = await getEntity(ctx.pool, c.source_table);
    if (!entity) throw new Error(`list_rows: unknown source table ${c.source_table}`);
    const fields = await getFields(ctx.pool, entity.entity_definition_id);

    // Columns (chosen logical names, else all active fields). Carry field metadata
    // so the emitted rows resolve codes→labels (these rows feed email bodies/tables).
    const cols = (Array.isArray(c.columns) && c.columns.length
      ? c.columns.map((l) => { const f = fields.byLogical.get(l); return { logical: l, physical: f?.physical_column_name, meta: f }; })
      : [...fields.byLogical.values()].map((f) => ({ logical: f.logical_name, physical: f.physical_column_name, meta: f }))
    ).filter((x) => x.physical);
    if (cols.length === 0) throw new Error("list_rows: no valid columns");

    // WHERE from AND filters. Values may be tokens — resolved then PARAMETERIZED.
    const where = [];
    const params = [];
    for (const f of c.filters || []) {
      const col = fields.byLogical.get(f.field)?.physical_column_name;
      if (!col) throw new Error(`list_rows: filter field "${f.field}" not found on ${c.source_table}`);
      const cq = quoteIdent(col);
      if (f.operator === "is_empty") { where.push(`(${cq} is null or ${cq}::text = '')`); continue; }
      if (f.operator === "is_not_empty") { where.push(`(${cq} is not null and ${cq}::text <> '')`); continue; }

      const raw = resolveValue(f.value, ctx);
      if (f.operator === "is_any_of") {
        const list = Array.isArray(raw)
          ? raw.map(String)
          : String(raw).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
        if (list.length === 0) { where.push("false"); continue; }
        params.push(list);
        where.push(`${cq}::text = any($${params.length}::text[])`);
      } else if (f.operator === "contains") {
        params.push("%" + String(raw) + "%");
        where.push(`${cq}::text ilike $${params.length}`);
      } else if (f.operator === "not_equals") {
        params.push(raw == null ? "" : String(raw));
        where.push(`${cq}::text <> $${params.length}::text`);
      } else { // equals (default)
        params.push(raw == null ? "" : String(raw));
        where.push(`${cq}::text = $${params.length}::text`);
      }
    }

    const limit = Math.min(Math.max(1, Number(c.limit) || 100), LIST_ROWS_HARD_CAP);
    let sql = `select ${cols.map((x) => quoteIdent(x.physical)).join(", ")} from ${quoteIdent(entity.physical_table_name)}`;
    if (where.length) sql += " where " + where.join(" and ");
    if (c.sort && c.sort.field) {
      const sc = fields.byLogical.get(c.sort.field)?.physical_column_name;
      if (sc) sql += ` order by ${quoteIdent(sc)} ${c.sort.dir === "desc" ? "desc" : "asc"}`;
    }
    params.push(limit);
    sql += ` limit $${params.length}`;

    const res = await ctx.pool.query(sql, params);
    const rows = await Promise.all(res.rows.map(async (r) => {
      const o = {};
      await Promise.all(cols.map(async (x) => {
        o[x.logical] = await resolveFieldDisplay(ctx.pool, x.meta, entity.entity_definition_id, r[x.physical]);
      }));
      return o;
    }));
    // rawRows carry the STORED value (ids/codes) so {{steps.<n>.raw(col)}} can feed
    // a later match/lookup (display rows would give a name, not the id).
    const rawRows = res.rows.map((r) => Object.fromEntries(cols.map((x) => [x.logical, r[x.physical]])));
    // __step tells processJob to publish this into ctx.steps for later actions.
    return { __step: stepName, step_name: stepName, count: rows.length, columns: cols.map((x) => x.logical), rows, rawRows };
  },

  async get_row(ctx) {
    const c = ctx.action.config || {};
    const stepName = c.step_name;
    if (!stepName) throw new Error("get_row config invalid: step name required");
    const entity = await getEntity(ctx.pool, c.source_table);
    if (!entity) throw new Error(`get_row: unknown source table ${c.source_table}`);
    const fields = await getFields(ctx.pool, entity.entity_definition_id);

    // Match column: the chosen logical field, else the table's primary key.
    let matchCol;
    if (c.match_field) {
      matchCol = fields.byLogical.get(c.match_field)?.physical_column_name;
      if (!matchCol) throw new Error(`get_row: match field "${c.match_field}" not found on ${c.source_table}`);
    } else {
      matchCol = await getPrimaryKey(ctx.pool, entity);
    }

    // Columns to expose (chosen logical names, else all active fields).
    const cols = (Array.isArray(c.columns) && c.columns.length
      ? c.columns.map((l) => { const f = fields.byLogical.get(l); return { logical: l, physical: f?.physical_column_name, meta: f }; })
      : [...fields.byLogical.values()].map((f) => ({ logical: f.logical_name, physical: f.physical_column_name, meta: f }))
    ).filter((x) => x.physical);
    if (cols.length === 0) throw new Error("get_row: no valid columns");

    // The id/value to look up — a static value or a {{token}} from the flow.
    const raw = resolveValue(c.match_value, ctx);
    // No id to match on -> publish an empty step (not a failure); tokens resolve to "".
    if (raw == null || String(raw).trim() === "") {
      return { __step: stepName, step_name: stepName, count: 0, columns: cols.map((x) => x.logical), rows: [], rawRows: [] };
    }

    const sql = `select ${cols.map((x) => quoteIdent(x.physical)).join(", ")} from ${quoteIdent(entity.physical_table_name)} where ${quoteIdent(matchCol)}::text = $1::text limit 1`;
    const res = await ctx.pool.query(sql, [String(raw)]);
    const rows = await Promise.all(res.rows.map(async (r) => {
      const o = {};
      await Promise.all(cols.map(async (x) => {
        o[x.logical] = await resolveFieldDisplay(ctx.pool, x.meta, entity.entity_definition_id, r[x.physical]);
      }));
      return o;
    }));
    // rawRows carry stored ids/codes so {{steps.<n>.raw(col)}} can feed a later lookup.
    const rawRows = res.rows.map((r) => Object.fromEntries(cols.map((x) => [x.logical, r[x.physical]])));
    return { __step: stepName, step_name: stepName, count: rows.length, columns: cols.map((x) => x.logical), rows, rawRows };
  },

  async update_field(ctx) {
    const c = ctx.action.config || {};
    if (!c.field) throw new Error("update_field config invalid: field is required");
    const value = resolveValue(c.value, ctx);
    const depth = ctx.job.depth || 0;

    if (c.target === "related") {
      if (!c.related_lookup_field) {
        throw new Error("update_field config invalid: related_lookup_field required");
      }
      const srcEntity = await getEntity(ctx.pool, ctx.job.record_table);
      if (!srcEntity) throw new Error(`unknown table ${ctx.job.record_table}`);
      const srcFields = await getFields(ctx.pool, srcEntity.entity_definition_id);
      const lookup = srcFields.byLogical.get(c.related_lookup_field);
      if (!lookup || !lookup.lookup_entity_id) {
        throw new Error(`${c.related_lookup_field} is not a lookup field`);
      }
      const relatedId = ctx.after ? ctx.after[c.related_lookup_field] : null;
      if (!relatedId) return { target: "related", skipped: "lookup empty", field: c.field };

      const relEnt = (
        await ctx.pool.query(
          `select entity_definition_id, logical_name, physical_table_name, primary_key_column
             from entity_definition where entity_definition_id = $1`,
          [lookup.lookup_entity_id]
        )
      ).rows[0];
      if (!relEnt) throw new Error("related entity not found");
      const relFields = await getFields(ctx.pool, relEnt.entity_definition_id);
      const targetCol = relFields.byLogical.get(c.field)?.physical_column_name;
      if (!targetCol) throw new Error(`field ${c.field} not found on ${relEnt.logical_name}`);

      const beforeLogical = (await readRecordLogical(ctx.pool, relEnt, relatedId)) || {};
      await ctx.pool.query(
        `update ${quoteIdent(relEnt.physical_table_name)} set ${quoteIdent(targetCol)} = $1
          where ${quoteIdent(relEnt.primary_key_column)} = $2`,
        [value, relatedId]
      );
      const afterLogical = { ...beforeLogical, [c.field]: value };
      await enqueueChainedJobs(ctx.pool, relEnt.logical_name, relatedId, beforeLogical, afterLogical, depth, ctx.job.created_by);
      return { target: "related", related_entity: relEnt.logical_name, related_id: relatedId, field: c.field, value };
    }

    // target === 'record'
    const entity = await getEntity(ctx.pool, ctx.job.record_table);
    if (!entity) throw new Error(`unknown table ${ctx.job.record_table}`);
    const fields = await getFields(ctx.pool, entity.entity_definition_id);
    const targetCol = fields.byLogical.get(c.field)?.physical_column_name;
    if (!targetCol) throw new Error(`field ${c.field} not found on ${ctx.job.record_table}`);

    await ctx.pool.query(
      `update ${quoteIdent(entity.physical_table_name)} set ${quoteIdent(targetCol)} = $1
        where ${quoteIdent(entity.primary_key_column)} = $2`,
      [value, ctx.job.record_id]
    );
    const base = ctx.after || {};
    await enqueueChainedJobs(ctx.pool, ctx.job.record_table, ctx.job.record_id, base, { ...base, [c.field]: value }, depth, ctx.job.created_by);
    return { target: "record", field: c.field, value };
  },

  async generate_document(ctx) {
    const c = ctx.action.config || {};
    const format = c.format === "xlsx" ? "xlsx" : "csv";
    const entity = await getEntity(ctx.pool, c.entity || ctx.job.record_table);
    if (!entity) throw new Error("unknown table for document");
    const fields = await getFields(ctx.pool, entity.entity_definition_id);

    // Columns: explicit config.columns (logical names), else all active fields.
    // Carry the field metadata + display label so cells resolve codes→labels and the
    // header row shows the display name, not the logical name.
    const cols = (Array.isArray(c.columns) && c.columns.length
      ? c.columns.map((l) => { const f = fields.byLogical.get(l); return { logical: l, physical: f?.physical_column_name, meta: f, header: f?.display_name || l }; })
      : [...fields.byLogical.values()].map((f) => ({ logical: f.logical_name, physical: f.physical_column_name, meta: f, header: f.display_name || f.logical_name }))
    ).filter((x) => x.physical);
    if (cols.length === 0) throw new Error("no exportable columns");

    const scope = c.scope === "all" ? "all" : "record";
    const selectList = cols.map((x) => quoteIdent(x.physical)).join(", ");
    const rows = scope === "record"
      ? (await ctx.pool.query(
          `select ${selectList} from ${quoteIdent(entity.physical_table_name)} where ${quoteIdent(entity.primary_key_column)} = $1`,
          [ctx.job.record_id]
        )).rows
      : (await ctx.pool.query(`select ${selectList} from ${quoteIdent(entity.physical_table_name)} limit 5000`)).rows;

    const headers = cols.map((x) => x.header);
    // Resolve each cell's raw stored value to its label (choice/lookup/state/status/boolean).
    const displayRows = await Promise.all(rows.map(async (r) =>
      Promise.all(cols.map((x) => resolveFieldDisplay(ctx.pool, x.meta, entity.entity_definition_id, r[x.physical])))
    ));
    const rawName = resolveTokens(c.filename || "export", ctx, false) || "export";
    const safeBase = (String(rawName).replace(/[^\w.-]+/g, "_").slice(0, 80)) || "export";
    const dir = path.join(__dirname, "storage", "documents");
    fs.mkdirSync(dir, { recursive: true });
    const fname = `${safeBase}-${Date.now()}.${format}`;
    const full = path.join(dir, fname);

    if (format === "xlsx") {
      const XLSX = require("xlsx"); // resolves from repo-root node_modules (no new dep)
      const aoa = [headers, ...displayRows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Export");
      XLSX.writeFile(wb, full);
    } else {
      const csv = [headers.map(csvCell).join(","), ...displayRows.map((r) => r.map(csvCell).join(","))].join("\r\n");
      fs.writeFileSync(full, csv, "utf8");
    }
    return { document_path: `/storage/documents/${fname}`, format, row_count: rows.length };
  },

  // Run a saved VIEW → build an Excel/CSV file → email it as an attachment.
  // The workhorse of a scheduled ("recurring") flow: e.g. every Monday 8am, export
  // the "Open leads" view and mail the spreadsheet to the sales team.
  async export_view_email(ctx) {
    const c = ctx.action.config || {};
    if (!c.view_id) throw new Error("export_view_email config invalid: a view is required");
    const view = await resolveViewToRows(ctx.pool, c.view_id);
    return sendExportEmail(ctx, {
      headers: view.headers, rows: view.rows, name: view.viewName,
      extra: { view_id: c.view_id, view: view.viewName },
    });
  },

  // Walk the relationship graph from the trigger record → assemble a report across
  // the record + its parents (N:1 lookups) + a 1:N child list → export & email it.
  async related_export_email(ctx) {
    const c = ctx.action.config || {};
    if (!ctx.job.record_id) throw new Error("related_export_email: needs a triggering record");
    const columns = (Array.isArray(c.columns) ? c.columns : []).filter((x) => x && x.source_id && x.field);
    if (columns.length === 0) throw new Error("related_export_email: no columns selected");
    const sources = Array.isArray(c.sources) ? c.sources : [];
    const built = await buildRelatedRows(ctx.pool, ctx.job, sources, columns);
    return sendExportEmail(ctx, {
      headers: built.headers, rows: built.rows, name: c.report_name || "Related report",
      extra: { report: c.report_name || "Related report" },
    });
  },

  // Insert a row into a child table X (linked to the trigger record via a lookup on
  // X). Optional dedupe skips when a linked record already exists — so a
  // No→Yes→No→Yes toggle never creates duplicates.
  async create_related_record(ctx) {
    const c = ctx.action.config || {};
    if (!c.target_entity) throw new Error("create_related_record: target table is required");
    if (!ctx.job.record_id) throw new Error("create_related_record: needs a triggering record");

    const target = await getEntity(ctx.pool, c.target_entity);
    if (!target) throw new Error(`create_related_record: unknown table ${c.target_entity}`);
    const tf = await getFields(ctx.pool, target.entity_definition_id);
    const cols = await getTableColumns(ctx.pool, target.physical_table_name);
    const source = await sourceLogical(ctx);
    const srcFields = await sourceFieldsFor(ctx);

    const { matchCol, matchVal } = resolveMatch(c, tf, source, ctx);
    if (!matchCol) throw new Error("create_related_record: link/match field is required");

    const setPhys = mapToPhysical(c.mappings, tf, source, ctx, srcFields);
    setPhys[matchCol] = matchVal; // links the new row to the trigger record

    if (c.dedupe) {
      const where = [`${quoteIdent(matchCol)} = $1`];
      const params = [matchVal];
      for (const f of c.dedupe_match || []) {
        const col = tf.byLogical.get(f)?.physical_column_name;
        if (!col || !(col in setPhys)) continue;
        params.push(setPhys[col]);
        where.push(`${quoteIdent(col)}::text is not distinct from $${params.length}::text`);
      }
      const ex = await ctx.pool.query(
        `select 1 from ${quoteIdent(target.physical_table_name)} where ${where.join(" and ")} limit 1`,
        params
      );
      if (ex.rows[0]) return { __skipped: true, reason: "related record already exists", target: c.target_entity };
    }

    // System columns, when present and not explicitly mapped.
    const now = new Date();
    const dflt = (col, val) => { if (cols.has(col) && !(col in setPhys)) setPhys[col] = val; };
    dflt("created_at", now); dflt("modified_at", now);
    dflt("created_by", ctx.job.created_by || null); dflt("modified_by", ctx.job.created_by || null);
    dflt("owner_id", ctx.job.created_by || null);

    const keys = Object.keys(setPhys).filter((k) => cols.has(k));
    if (keys.length === 0) throw new Error("create_related_record: nothing to insert");
    const vals = keys.map((k) => setPhys[k]);
    const pk = await getPrimaryKey(ctx.pool, target);
    const sql = `insert into ${quoteIdent(target.physical_table_name)} (${keys.map(quoteIdent).join(", ")})`
      + ` values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`
      + ` returning ${quoteIdent(pk)} as id`;
    const r = await ctx.pool.query(sql, vals);
    return { target: c.target_entity, created_id: r.rows[0]?.id, link_field: c.link_field_physical };
  },

  // Update the child rows of X linked to the trigger record, setting mapped fields.
  async update_related_record(ctx) {
    const c = ctx.action.config || {};
    if (!c.target_entity) throw new Error("update_related_record: target table is required");
    if (!ctx.job.record_id) throw new Error("update_related_record: needs a triggering record");

    const target = await getEntity(ctx.pool, c.target_entity);
    if (!target) throw new Error(`update_related_record: unknown table ${c.target_entity}`);
    const tf = await getFields(ctx.pool, target.entity_definition_id);
    const cols = await getTableColumns(ctx.pool, target.physical_table_name);
    const source = await sourceLogical(ctx);
    const srcFields = await sourceFieldsFor(ctx);

    const { matchCol, matchVal } = resolveMatch(c, tf, source, ctx);
    if (!matchCol) throw new Error("update_related_record: match field is required");

    const setPhys = mapToPhysical(c.mappings, tf, source, ctx, srcFields);
    if (cols.has("modified_at") && !("modified_at" in setPhys)) setPhys.modified_at = new Date();
    if (cols.has("modified_by") && !("modified_by" in setPhys)) setPhys.modified_by = ctx.job.created_by || null;
    const keys = Object.keys(setPhys).filter((k) => cols.has(k));
    if (keys.length === 0) throw new Error("update_related_record: no fields to set");

    const pk = await getPrimaryKey(ctx.pool, target);
    const idRes = await ctx.pool.query(
      `select ${quoteIdent(pk)} as id from ${quoteIdent(target.physical_table_name)}`
      + ` where ${quoteIdent(matchCol)} = $1${c.match_first ? " limit 1" : ""}`,
      [matchVal]
    );
    const ids = idRes.rows.map((x) => x.id);
    if (ids.length === 0) return { __skipped: true, reason: "no related records to update", target: c.target_entity };

    const setSql = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`).join(", ");
    const params = keys.map((k) => setPhys[k]);
    params.push(ids);
    await ctx.pool.query(
      `update ${quoteIdent(target.physical_table_name)} set ${setSql}`
      + ` where ${quoteIdent(pk)} = any($${params.length})`,
      params
    );
    return { target: c.target_entity, updated: ids.length };
  },
};

// The trigger entity's field definitions (for label-based choice translation on copy).
async function sourceFieldsFor(ctx) {
  const srcEntity = await getEntity(ctx.pool, ctx.job.record_table);
  return srcEntity ? getFields(ctx.pool, srcEntity.entity_definition_id) : null;
}

// The trigger record's current logical values (fresh read; falls back to snapshot).
async function sourceLogical(ctx) {
  const srcEntity = await getEntity(ctx.pool, ctx.job.record_table);
  if (srcEntity && ctx.job.record_id) {
    const row = await readRecordLogical(ctx.pool, srcEntity, ctx.job.record_id);
    if (row) return row;
  }
  return ctx.after || {};
}

// Resolve the match/link column + value for a related write: which field on the
// target table links to the trigger (WHERE for update, FK-set for create), and the
// value it equals (the trigger record id, a trigger field, or a literal). Falls
// back to the deprecated link_field_physical (= trigger record id).
function resolveMatch(c, targetFields, source, ctx) {
  const matchCol = c.match_field
    ? targetFields.byLogical.get(c.match_field)?.physical_column_name
    : c.link_field_physical;
  let matchVal;
  if (!c.match_mode) matchVal = ctx.job.record_id; // back-compat
  else if (c.match_mode === "record_id") matchVal = ctx.job.record_id;
  else if (c.match_mode === "field") matchVal = source ? source[c.match_value] ?? null : null;
  else matchVal = resolveValue(c.match_value, ctx); // static / token
  return { matchCol, matchVal };
}

// Choice options list for a field def ([] when not a choice field).
function choiceList(def) {
  const c = def && def.config_json && def.config_json.choices;
  return Array.isArray(c) ? c : [];
}

/**
 * Translate a choice CODE from a source field to the equivalent code on a target
 * field by matching the option LABEL. This keeps "copy compliance → compliance"
 * correct even when the two fields use different numeric codes for the same label
 * (e.g. Opportunity Approve=2 → Agreement Tracker Approve=1). Returns:
 *   - the translated target code (string) when a confident label match exists,
 *   - `undefined` when translation doesn't apply (not both choice fields) or no
 *     label match — caller then keeps the raw value.
 */
function translateChoiceByLabel(code, srcDef, tgtDef) {
  const src = choiceList(srcDef);
  const tgt = choiceList(tgtDef);
  if (!src.length || !tgt.length || code == null || code === "") return undefined;
  const norm = (o) => String(o.label != null ? o.label : (o.display_label != null ? o.display_label : "")).trim().toLowerCase();
  const srcOpt = src.find((o) => String(o.value) === String(code));
  if (!srcOpt) return undefined;
  const lbl = norm(srcOpt);
  const tgtOpt = tgt.find((o) => norm(o) === lbl);
  return tgtOpt ? String(tgtOpt.value) : undefined;
}

// Resolve field mappings to a { physical_column: value } object for a write action.
// `sourceFields` (the trigger entity's field defs) enables label-based choice
// translation when copying a choice field from the source into a choice target.
function mapToPhysical(mappings, targetFields, source, ctx, sourceFields) {
  const out = {};
  for (const m of mappings || []) {
    if (!m || !m.target_field) continue;
    const tgtDef = targetFields.byLogical.get(m.target_field);
    const col = tgtDef && tgtDef.physical_column_name;
    if (!col) continue;
    if (m.mode === "field") {
      let v = source ? (source[m.value] ?? null) : null;
      const srcDef = sourceFields ? sourceFields.byLogical.get(m.value) : null;
      const translated = translateChoiceByLabel(v, srcDef, tgtDef);
      if (translated !== undefined) v = translated;
      out[col] = v;
    } else {
      out[col] = resolveValue(m.value, ctx); // static or {{token}}
    }
  }
  return out;
}

// ── scheduler (recurring flows) ───────────────────────────────────────────────

function clampInt(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

/**
 * Compute the next fire time (server local time) for a schedule config, strictly
 * AFTER `from`. Pure. Config: {frequency, minute, hour, weekday(0=Sun), monthday}.
 */
function computeNextRun(cfg, from) {
  const c = cfg || {};
  const freq = c.frequency || "daily";
  const minute = clampInt(c.minute, 0, 59, 0);
  const hour = clampInt(c.hour, 0, 23, 8);
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);

  if (freq === "hourly") {
    d.setMinutes(minute);
    if (d <= from) d.setTime(d.getTime() + 3_600_000);
    return d;
  }
  if (freq === "weekly") {
    const weekday = clampInt(c.weekday, 0, 6, 1);
    d.setHours(hour, minute, 0, 0);
    let delta = (weekday - d.getDay() + 7) % 7;
    if (delta === 0 && d <= from) delta = 7;
    d.setDate(d.getDate() + delta);
    return d;
  }
  if (freq === "monthly") {
    const monthday = clampInt(c.monthday, 1, 31, 1);
    const setDay = (dt) => {
      const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
      dt.setDate(Math.min(monthday, last));
    };
    d.setHours(hour, minute, 0, 0);
    setDay(d);
    if (d <= from) { d.setDate(1); d.setMonth(d.getMonth() + 1); setDay(d); }
    return d;
  }
  // daily (default)
  d.setHours(hour, minute, 0, 0);
  if (d <= from) d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Enqueue a job for every enabled schedule rule that is due (next_run_at <= now),
 * then advance next_run_at to the following slot. Rules with a null next_run_at are
 * initialised (no immediate fire). Runs in a transaction with FOR UPDATE SKIP
 * LOCKED so concurrent workers never double-fire a slot; the idempotency_key
 * (rule:schedule:<slot ISO>) is a second guard.
 */
async function enqueueDueSchedules(pool) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const due = await client.query(
      `select automation_rule_id, schedule_config, next_run_at, table_logical_name
         from automation_rule
        where trigger_type = 'schedule' and enabled = true
          and (next_run_at is null or next_run_at <= now())
        order by next_run_at nulls first
        for update skip locked
        limit 50`
    );
    const now = new Date();
    for (const rule of due.rows) {
      let cfg = rule.schedule_config;
      if (typeof cfg === "string") { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }

      if (!rule.next_run_at) {
        // First activation — set the first slot, don't fire now.
        await client.query(
          "update automation_rule set next_run_at = $2 where automation_rule_id = $1",
          [rule.automation_rule_id, computeNextRun(cfg || {}, now)]
        );
        continue;
      }

      const slotIso = new Date(rule.next_run_at).toISOString();
      const idem = `${rule.automation_rule_id}:schedule:${slotIso}`;
      await client.query(
        `insert into automation_job
           (rule_id, record_table, record_id, trigger_event, change_snapshot, status, idempotency_key)
         values ($1, $2, null, 'schedule', '{}'::jsonb, 'pending', $3)
         on conflict (idempotency_key) do nothing`,
        [rule.automation_rule_id, rule.table_logical_name, idem]
      );

      // Advance to the next slot after the one we just fired; if that is still in
      // the past (worker was down), roll forward from now so we don't storm.
      let next = computeNextRun(cfg || {}, new Date(rule.next_run_at));
      if (next <= now) next = computeNextRun(cfg || {}, now);
      await client.query(
        "update automation_rule set next_run_at = $2 where automation_rule_id = $1",
        [rule.automation_rule_id, next]
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    console.error("[automation.scheduler] error:", e.message);
  } finally {
    client.release();
  }
}

// ── core ─────────────────────────────────────────────────────────────────────

async function claimJobs(pool) {
  const { rows } = await pool.query(
    `WITH claimable AS (
       SELECT automation_job_id
         FROM automation_job
        WHERE status IN ('pending','failed')
          AND next_attempt_at <= now()
        ORDER BY queued_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE automation_job j
        SET status = 'running', started_at = now(), attempts = attempts + 1
       FROM claimable c
      WHERE j.automation_job_id = c.automation_job_id
      RETURNING j.*`,
    [CLAIM_BATCH]
  );
  return rows;
}

// Build a deep link to a record. `base` is the host to prefix — the origin the
// user was working on (captured at trigger time), else APP_BASE_URL from the root
// .env. Without either the link is relative (host-less) and won't open from email.
function recordUrlFor(table, id, base) {
  const b = base || process.env.APP_BASE_URL || "";
  // Must match the app's hash-route serialization (src/lib/appRoute.ts): the ONLY
  // recognized record deep-link is #/record/<entity>/<id>. Emitting #/<entity>/<id>
  // isn't a known route, so parseRoute() falls back to the default dashboard —
  // which redirects to #/login when the recipient isn't authenticated yet.
  return `${b}/#/record/${table}/${id}`;
}

async function markJob(pool, id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await pool.query(
    `UPDATE automation_job SET ${sets} WHERE automation_job_id = $1`,
    [id, ...keys.map((k) => fields[k])]
  );
}

// Evaluate a per-action "Only run if" gate. `left`/`right` are template strings that
// may contain {{tokens}}; both are resolved against the run context and compared as
// trimmed, case-insensitive text. Returns { pass, summary } for the run-history log.
function evalRunCondition(rc, ctx) {
  if (!rc || !rc.operator) return { pass: true, summary: "" };
  const left = String(resolveValue(rc.left, ctx) ?? "").trim();
  const right = String(resolveValue(rc.right, ctx) ?? "").trim();
  const l = left.toLowerCase();
  const r = right.toLowerCase();
  let pass;
  switch (rc.operator) {
    case "equals":       pass = l === r; break;
    case "not_equals":   pass = l !== r; break;
    case "is_empty":     pass = left === ""; break;
    case "is_not_empty": pass = left !== ""; break;
    default:             pass = true;
  }
  const OP = { equals: "=", not_equals: "≠", is_empty: "is empty", is_not_empty: "is not empty" };
  const opText = OP[rc.operator] || rc.operator;
  const summary =
    rc.operator === "is_empty" || rc.operator === "is_not_empty"
      ? `"${left}" ${opText}`
      : `"${left}" ${opText} "${right}"`;
  return { pass, left, right, operator: rc.operator, summary };
}

async function processJob(pool, job, opts = {}) {
  // Loop protection.
  if ((job.depth || 0) >= MAX_DEPTH) {
    await markJob(pool, job.automation_job_id, {
      status: "skipped",
      finished_at: new Date(),
      error: "possible automation loop (depth >= 3)",
    });
    return;
  }

  const rule = (
    await pool.query(
      "select * from automation_rule where automation_rule_id = $1",
      [job.rule_id]
    )
  ).rows[0];
  if (!rule) {
    await markJob(pool, job.automation_job_id, {
      status: "skipped",
      finished_at: new Date(),
      error: "rule no longer exists",
    });
    return;
  }

  const actions = (
    await pool.query(
      "select * from automation_rule_action where rule_id = $1 order by sort_order asc",
      [job.rule_id]
    )
  ).rows;

  // Actions already completed on a previous attempt — don't re-run them. Load
  // their outputs too so step outputs survive a retry (a list_rows that ran on
  // attempt 1 must still be referenceable by a send_email that failed).
  const doneRows = (
    await pool.query(
      "select action_id, action_type, output from automation_job_action_log where job_id = $1 and status = 'succeeded'",
      [job.automation_job_id]
    )
  ).rows;
  const done = new Set(doneRows.map((r) => r.action_id));
  // For a Condition/Switch that already ran on a prior attempt, remember which
  // branch it took so a retry recurses into the SAME branch (rather than
  // re-evaluating with a possibly-different ctx) to finish not-yet-done children.
  const condBranch = new Map();
  for (const d of doneRows) {
    if ((d.action_type === "condition" || d.action_type === "switch") && d.output && d.output.branch) {
      condBranch.set(d.action_id, d.output.branch);
    }
  }

  const after = job.change_snapshot?.after || {};
  // Prefer the host the user was working on (captured client-side at trigger time)
  // so record links open on that exact address; else the configured APP_BASE_URL.
  const linkBase = job.change_snapshot?.origin || process.env.APP_BASE_URL || "";
  const ctx = {
    pool,
    job,
    rule,
    after,
    recordUrl: recordUrlFor(job.record_table, job.record_id, linkBase),
    // Deep link to the PARENT record for polymorphic timeline rows (notes/emails
    // carry regarding_entity_name + regarding_record_id) — used by {{record.regarding.url}}
    // so "note created on an opportunity" emails can open the opportunity directly.
    regardingUrl:
      after && after.regarding_entity_name && after.regarding_record_id
        ? recordUrlFor(after.regarding_entity_name, after.regarding_record_id, linkBase)
        : null,
    count: opts.batchCount || 1,
    steps: {}, // { <step_name>: { count, columns, rows } } — for {{steps.*}} tokens
  };
  // Rehydrate step outputs from already-succeeded list_rows logs.
  for (const d of doneRows) {
    if ((d.action_type === "list_rows" || d.action_type === "get_row") && d.output && d.output.step_name) {
      ctx.steps[d.output.step_name] = {
        count: d.output.count,
        columns: d.output.columns,
        rows: d.output.rows || [],
        rawRows: d.output.rawRows || [],
      };
    }
  }

  // Resolve the triggering record's field codes → labels so {{record.<field>}} email
  // tokens render "Active"/related-record names instead of raw codes/UUIDs. Non-fatal.
  try {
    const recEntity = await getEntity(pool, job.record_table);
    if (recEntity) {
      const recFields = await getFields(pool, recEntity.entity_definition_id);
      ctx.afterDisplay = await resolveLogicalRecordDisplay(pool, recEntity.entity_definition_id, recFields, after);
    }
  } catch { /* fall back to raw values in tokenResolver */ }

  // Parent ("regarding") record — follow the note/email's regarding_entity_name +
  // regarding_record_id to its parent row so {{record.regarding.<field>}} tokens
  // (and conditions comparing against them) resolve to the parent's data. Non-fatal.
  try {
    if (after.regarding_entity_name && after.regarding_record_id) {
      const pEntity = await getEntity(pool, after.regarding_entity_name);
      if (pEntity) {
        const pFields = await getFields(pool, pEntity.entity_definition_id);
        const pRaw = await readRecordLogical(pool, pEntity, after.regarding_record_id);
        if (pRaw) {
          ctx.regarding = {
            raw: pRaw,
            display: await resolveLogicalRecordDisplay(pool, pEntity.entity_definition_id, pFields, pRaw),
          };
        }
      }
    }
  } catch { /* regarding tokens resolve empty on any miss */ }

  // AND-condition gate (authoritative — includes related-record conditions the
  // client deferred). Record the evaluation as a synthetic "Conditions" step so the
  // run history always shows WHY a run ran or was skipped (n8n-style), then gate.
  let condEval = { pass: true, trace: [] };
  try {
    condEval = await evaluateConditions(pool, rule, job, after);
  } catch (e) {
    console.error("[automation.worker] condition eval error:", e.message);
    // On evaluation error, fall through and run (fail-open) rather than silently drop.
    condEval = { pass: true, trace: [] };
  }
  if (condEval.trace.length > 0) {
    // Idempotent across re-runs/retries: replace any prior condition step for this job.
    await pool.query(
      "delete from automation_job_action_log where job_id = $1 and action_type = 'condition_check'",
      [job.automation_job_id]
    );
    const failedCount = condEval.trace.filter((t) => !t.pass).length;
    await pool.query(
      `insert into automation_job_action_log
         (job_id, action_id, action_type, sort_order, status, error, output, started_at, finished_at)
       values ($1, null, 'condition_check', -1, $2, $3, $4, now(), now())`,
      [
        job.automation_job_id,
        condEval.pass ? "succeeded" : "skipped",
        condEval.pass ? null : `${failedCount} condition${failedCount === 1 ? "" : "s"} not met`,
        JSON.stringify({ conditions: condEval.trace }),
      ]
    );
  }
  if (!condEval.pass) {
    await markJob(pool, job.automation_job_id, {
      status: "skipped",
      finished_at: new Date(),
      error: "conditions not met",
    });
    return;
  }

  // Fresh slate per attempt: drop this job's non-succeeded logs so a retry (or the
  // failure/always branches below) don't pile up duplicate failed/skipped rows.
  // Succeeded rows are kept — they drive the `done` set and step rehydration above.
  await pool.query(
    "delete from automation_job_action_log where job_id = $1 and status <> 'succeeded'",
    [job.automation_job_id]
  );

  // First error seen this run. Set once, never cleared — it decides the final job
  // status AND which run_after branch each later action takes.
  let firstError = null;
  const logAction = (action, status, extra = {}) =>
    pool.query(
      `insert into automation_job_action_log
         (job_id, action_id, action_type, sort_order, status, error, output, started_at, finished_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now())`,
      [
        job.automation_job_id,
        action.automation_rule_action_id,
        action.action_type,
        action.sort_order,
        status,
        extra.error ?? null,
        extra.output ?? null,
        extra.started ?? new Date(),
      ]
    );

  // Build the action TREE. sort_order orders siblings WITHIN a group (same
  // parent_action_id + branch); top-level actions have no parent. A Condition
  // step's children live under (its id, 'yes'|'no'); branches nest arbitrarily.
  const childIndex = new Map(); // `${parentId}:${branch}` -> action[]
  for (const a of actions) {
    if (a.parent_action_id) {
      const key = `${a.parent_action_id}:${a.branch}`;
      if (!childIndex.has(key)) childIndex.set(key, []);
      childIndex.get(key).push(a);
    }
  }
  for (const arr of childIndex.values()) arr.sort((x, y) => x.sort_order - y.sort_order);
  const topLevel = actions.filter((a) => !a.parent_action_id).sort((x, y) => x.sort_order - y.sort_order);
  const childrenOf = (id, branch) => childIndex.get(`${id}:${branch}`) || [];

  // Run a sibling list in order. Recurses into a Condition's taken branch.
  // `firstError` (closed over) tracks the run's first failure for run_after gating.
  const runList = async (list) => {
    for (const action of list) {
      const isDone = done.has(action.automation_rule_action_id);

      // A Condition/Switch that already completed on a prior attempt: don't re-run
      // it, but DO recurse into the branch it took so not-yet-done children finish.
      if ((action.action_type === "condition" || action.action_type === "switch") && isDone) {
        const branch = condBranch.get(action.automation_rule_action_id);
        if (branch) await runList(childrenOf(action.automation_rule_action_id, branch));
        continue;
      }
      if (isDone) continue;

      // Power Automate "Configure run after": does this action run given whether
      // an earlier action has already failed?
      const runAfter = action.run_after || "success";
      const shouldRun =
        runAfter === "always" ? true : runAfter === "failure" ? !!firstError : !firstError;
      if (!shouldRun) {
        await logAction(action, "skipped", {
          error: firstError
            ? "skipped — an earlier action failed"
            : "skipped — runs only if an earlier action fails",
        });
        continue;
      }

      // Per-step "Only run if" gate — a field-to-field comparison of resolved token
      // templates. A failed gate is a 'skipped' (not a failure) so the run continues.
      if (action.run_condition) {
        const gate = evalRunCondition(action.run_condition, ctx);
        if (!gate.pass) {
          await logAction(action, "skipped", {
            error: `only-run-if not met — ${gate.summary}`,
            output: { run_condition: gate },
            started: new Date(),
          });
          continue;
        }
      }

      // Condition step: evaluate its comparison, record which branch was taken,
      // then run that branch's child steps (recursively). The condition itself
      // never "fails" — an empty/unmatched branch is a no-op.
      if (action.action_type === "condition") {
        const started = new Date();
        const gate = evalRunCondition(action.config, ctx);
        const branch = gate.pass ? "yes" : "no";
        await logAction(action, "succeeded", { output: { condition: gate, branch }, started });
        await runList(childrenOf(action.automation_rule_action_id, branch));
        continue;
      }

      // Switch step: resolve `on` to its display value, then run the FIRST case
      // whose value matches (equals, trimmed/case-insensitive — reusing the same
      // comparison as Condition), else the 'default' branch. Like Condition, the
      // switch itself never "fails"; an empty/unmatched branch is a no-op.
      if (action.action_type === "switch") {
        const started = new Date();
        const cfg = action.config || {};
        const cases = Array.isArray(cfg.cases) ? cfg.cases : [];
        let branch = "default";
        let matched = null;
        for (const c of cases) {
          if (!c || !c.key) continue;
          const gate = evalRunCondition({ left: cfg.on, operator: "equals", right: c.value }, ctx);
          if (gate.pass) { branch = c.key; matched = c; break; }
        }
        const onValue = String(resolveValue(cfg.on, ctx) ?? "").trim();
        await logAction(action, "succeeded", {
          output: { switch: { on: onValue, matched: matched ? matched.value : null }, branch },
          started,
        });
        await runList(childrenOf(action.automation_rule_action_id, branch));
        continue;
      }

      const handler = ACTIONS[action.action_type];
      const started = new Date();

      if (!handler) {
        await logAction(action, "skipped", {
          error: `action type "${action.action_type}" not implemented yet`,
          started,
        });
        continue;
      }

      try {
        const output = await handler({ ...ctx, action });

        // A handler may opt to SKIP (not fail) — e.g. send_email with no
        // recipients. Recorded as 'skipped'; the job continues + can succeed.
        if (output && output.__skipped) {
          await logAction(action, "skipped", { error: output.reason || "skipped", output, started });
          continue;
        }

        // Publish a list_rows / get_row step output for later actions in this rule.
        if (output && output.__step) {
          ctx.steps[output.__step] = { count: output.count, columns: output.columns, rows: output.rows, rawRows: output.rawRows || [] };
        }

        await logAction(action, "succeeded", { output: output || {}, started });
      } catch (actErr) {
        await logAction(action, "failed", {
          error: String(actErr.message || actErr).slice(0, 1000),
          started,
        });
        // Don't abort the run — later failure/always branches still need to fire.
        // The job is marked failed after the loop; the retry re-runs this action.
        if (!firstError) firstError = actErr;
      }
    }
  };

  try {
    await runList(topLevel);

    if (firstError) throw firstError;

    // Every action that ran succeeded.
    await markJob(pool, job.automation_job_id, {
      status: "succeeded",
      finished_at: new Date(),
      error: null,
    });
    await pool.query(
      // A clean run clears the error badge — error_count reflects the LAST run,
      // not the lifetime total, otherwise the banner sticks forever.
      "update automation_rule set error_count = 0, last_run_at = now() where automation_rule_id = $1",
      [job.rule_id]
    );
  } catch (err) {
    const attempts = job.attempts; // already incremented at claim time
    const max = job.max_attempts || 3;
    const msg = String(err.message || err).slice(0, 1000);

    if (attempts >= max) {
      await markJob(pool, job.automation_job_id, {
        status: "dead",
        finished_at: new Date(),
        error: msg,
      });
      await pool.query(
        "update automation_rule set error_count = error_count + 1, last_run_at = now() where automation_rule_id = $1",
        [job.rule_id]
      );
    } else {
      const backoff = Math.min(
        BACKOFF_BASE_MS * Math.pow(2, attempts - 1),
        BACKOFF_CAP_MS
      );
      await markJob(pool, job.automation_job_id, {
        status: "failed",
        error: msg,
        next_attempt_at: new Date(Date.now() + backoff),
      });
    }
  }
}

let running = false;
async function tick(pool) {
  if (running) return; // no overlapping ticks
  running = true;
  try {
    // Recurring flows: enqueue any schedule rule that has come due this tick.
    await enqueueDueSchedules(pool);

    const jobs = await claimJobs(pool);
    if (jobs.length === 0) return;

    // Batching: for rules with a batch window, coalesce this tick's claimed jobs
    // (plus any still-pending siblings) into ONE run with {{count}} = total. This
    // is what stops a 10k-row import from sending 10k emails.
    const ruleIds = [...new Set(jobs.map((j) => j.rule_id).filter(Boolean))];
    const winRows = ruleIds.length
      ? (await pool.query(
          "select automation_rule_id, batch_window_seconds from automation_rule where automation_rule_id = any($1)",
          [ruleIds]
        )).rows
      : [];
    const batchWin = new Map(winRows.map((r) => [r.automation_rule_id, r.batch_window_seconds]));

    const groups = new Map();
    const singles = [];
    for (const j of jobs) {
      const w = batchWin.get(j.rule_id);
      if (w && w > 0) {
        const arr = groups.get(j.rule_id) || [];
        arr.push(j);
        groups.set(j.rule_id, arr);
      } else {
        singles.push(j);
      }
    }

    for (const job of singles) await processJob(pool, job);

    for (const [ruleId, gjobs] of groups) {
      const rep = gjobs[0];
      // Absorb the rest of this tick's claimed jobs + any pending siblings.
      const pend = (await pool.query(
        "update automation_job set status='skipped', finished_at=now(), error='batched' where rule_id=$1 and status='pending' returning automation_job_id",
        [ruleId]
      )).rows;
      for (const o of gjobs.slice(1)) {
        await markJob(pool, o.automation_job_id, { status: "skipped", finished_at: new Date(), error: "batched" });
      }
      await processJob(pool, rep, { batchCount: gjobs.length + pend.length });
    }
  } catch (e) {
    console.error("[automation.worker] tick error:", e.message);
  } finally {
    running = false;
  }
}

/**
 * Start the polling worker. Returns a stop() function.
 * @param {import('pg').Pool} pool
 */
function startAutomationWorker(pool) {
  console.log(
    `[automation.worker] started (poll ${POLL_INTERVAL_MS}ms, batch ${CLAIM_BATCH})`
  );
  const handle = setInterval(() => {
    void tick(pool);
  }, POLL_INTERVAL_MS);
  handle.unref?.(); // don't keep the process alive solely for the poller
  return () => clearInterval(handle);
}

module.exports = {
  startAutomationWorker,
  // exported for tests
  resolveTokens,
  escapeHtml,
  resolveRecipients,
  computeNextRun,
  buildRelatedRows,
  ACTIONS,
};
