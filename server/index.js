// server/index.js
// Local Node/Express API that replaces Supabase cloud for the Monty Finance CRM.
//
// Architecture:
//   React/Vite frontend
//     -> src/lib/supabase.ts  (Supabase-compatible local adapter)
//       -> THIS API (Express)
//         -> local PostgreSQL (monty_finance_crm)
//
// It speaks a small JSON protocol that mirrors the subset of PostgREST/Supabase
// the frontend uses: select with filters/ordering/range/count, embedded relations
// (foreign-table selects), insert/update/delete/upsert and RPC (Postgres functions).
//
// Safety:
//   - Every table / column / function name is validated against /^[a-zA-Z_][a-zA-Z0-9_]*$/.
//   - Every value is passed as a parameter ($1, $2, ...). No value is concatenated
//     into SQL text.

// Single source of truth: the repo-root .env (one folder up from /server).
// Holds DATABASE_URL and API_PORT; also read by vite.config.ts and the deploy script.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { hashPassword, verifyPassword, signToken, verifyToken, TOKEN_TTL_MS } = require("./auth");
const totp = require("./totp");
const { startAutomationWorker } = require("./automationWorker");

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://172.16.78.27:5173",
      // Frontend served by IIS on this server
      "http://172.16.78.27",       // IIS port 80
      "http://172.16.78.27:8080",  // IIS port 8080
      "http://localhost",
      "http://localhost:8080",
    ],
    credentials: true,
  })
);

// Allow reasonably large payloads (bulk insert / import).
app.use(express.json({ limit: "25mb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ---------------------------------------------------------------------------
// Errors & identifier safety
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Validate + quote an identifier (table / column / function name).
function ident(name) {
  if (typeof name !== "string" || !IDENT_RE.test(name)) {
    throw new ApiError(`Invalid identifier: ${String(name)}`, 400);
  }
  return `"${name}"`;
}

function colRef(alias, column) {
  return `"${alias}".${ident(column)}`;
}

// ---------------------------------------------------------------------------
// Schema metadata cache (foreign keys, columns, primary keys)
// ---------------------------------------------------------------------------

let metaCache = null;
let metaLoadedAt = 0;
const META_TTL_MS = 60_000;

async function loadMeta() {
  const now = Date.now();
  if (metaCache && now - metaLoadedAt < META_TTL_MS) return metaCache;

  const [fkRes, colRes, pkRes] = await Promise.all([
    pool.query(`
      SELECT tc.table_name      AS from_table,
             kcu.column_name    AS from_column,
             ccu.table_name     AS to_table,
             ccu.column_name    AS to_column,
             tc.constraint_name AS constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `),
    pool.query(`
      SELECT table_name, column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `),
    pool.query(`
      SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
      ORDER BY kcu.ordinal_position
    `),
  ]);

  const fksByTable = new Map(); // table -> [{ column, toTable, toColumn, constraint }]
  const incomingByTable = new Map(); // table -> [{ fromTable, fromColumn, toColumn, constraint }]
  for (const r of fkRes.rows) {
    if (!fksByTable.has(r.from_table)) fksByTable.set(r.from_table, []);
    fksByTable.get(r.from_table).push({
      column: r.from_column,
      toTable: r.to_table,
      toColumn: r.to_column,
      constraint: r.constraint_name,
    });
    if (!incomingByTable.has(r.to_table)) incomingByTable.set(r.to_table, []);
    incomingByTable.get(r.to_table).push({
      fromTable: r.from_table,
      fromColumn: r.from_column,
      toColumn: r.to_column,
      constraint: r.constraint_name,
    });
  }

  const columnsByTable = new Map(); // table -> Map(col -> { data_type, udt_name })
  for (const r of colRes.rows) {
    if (!columnsByTable.has(r.table_name)) columnsByTable.set(r.table_name, new Map());
    columnsByTable.get(r.table_name).set(r.column_name, {
      data_type: r.data_type,
      udt_name: r.udt_name,
    });
  }

  const pksByTable = new Map(); // table -> [col, ...]
  for (const r of pkRes.rows) {
    if (!pksByTable.has(r.table_name)) pksByTable.set(r.table_name, []);
    pksByTable.get(r.table_name).push(r.column_name);
  }

  metaCache = { fksByTable, incomingByTable, columnsByTable, pksByTable };
  metaLoadedAt = now;
  return metaCache;
}

// ---------------------------------------------------------------------------
// Value coercion (so JSON/array columns round-trip correctly)
// ---------------------------------------------------------------------------

// True for column types where an empty string is a legitimate value (text-ish).
// Everything else (numeric/date/uuid/boolean/json/enum/...) cannot store "".
function isTextColumn(info) {
  const t = info.data_type;
  if (t === "text" || t === "character varying" || t === "character") return true;
  const u = info.udt_name;
  return u === "text" || u === "varchar" || u === "bpchar" || u === "citext" || u === "name";
}

function coerceValue(meta, table, column, value) {
  if (value === undefined) return null;
  if (value === null) return null;

  const info = meta.columnsByTable?.get(table)?.get(column);

  // An empty string from an untouched or cleared form input means "no value". Every
  // non-text column (numeric/date/uuid/boolean/json/enum) rejects "" with SQLSTATE
  // 22P02 / 22007, which 500s any full-record re-save that carries such a field —
  // e.g. reopening or closing an opportunity re-sends all ~180 columns. Normalize
  // "" -> NULL for non-text columns so those writes succeed.
  if (value === "" && info && !isTextColumn(info)) return null;

  const isArrayCol = info && (info.data_type === "ARRAY" || info.udt_name?.startsWith("_"));
  const isJsonCol = info && (info.data_type === "json" || info.data_type === "jsonb");

  if (isArrayCol) {
    // node-postgres turns a JS array into a Postgres array literal.
    return Array.isArray(value) ? value : value;
  }
  if (isJsonCol) {
    return typeof value === "object" ? JSON.stringify(value) : value;
  }
  // Unknown column type: best-effort. Objects/arrays are most likely json(b).
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === "object") return JSON.stringify(value);
  return value;
}

// ---------------------------------------------------------------------------
// PostgREST-style select list parsing (supports embedded relations)
// ---------------------------------------------------------------------------

// Split a comma-separated list while respecting () nesting and "..." quotes.
function splitTopLevel(str) {
  const out = [];
  let depth = 0;
  let inQuote = false;
  let cur = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inQuote) {
      cur += ch;
      if (ch === "\\" && i + 1 < str.length) {
        cur += str[++i];
      } else if (ch === '"') {
        inQuote = false;
      }
      continue;
    }
    if (ch === '"') {
      inQuote = true;
      cur += ch;
    } else if (ch === "(") {
      depth++;
      cur += ch;
    } else if (ch === ")") {
      depth--;
      cur += ch;
    } else if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== "" || out.length === 0) out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== "");
}

// Parse a single select item: either a plain column or an embedded relation.
// Embed grammar: [alias ':'] core ['!' hint] ['!inner'|'!left'] '(' innerSelect ')'
function parseSelectItem(item) {
  const paren = item.indexOf("(");
  if (paren === -1) {
    return { kind: "column", name: item.trim() };
  }
  const head = item.slice(0, paren).trim();
  const inner = item.slice(paren + 1, item.lastIndexOf(")"));

  let alias = null;
  let rest = head;
  const colon = rest.indexOf(":");
  if (colon !== -1) {
    alias = rest.slice(0, colon).trim();
    rest = rest.slice(colon + 1).trim();
  }

  // rest may contain hint / join markers separated by '!'
  const bangParts = rest.split("!").map((s) => s.trim());
  const core = bangParts.shift();
  let hint = null;
  let join = "left";
  for (const p of bangParts) {
    if (p === "inner") join = "inner";
    else if (p === "left") join = "left";
    else hint = p; // foreign key column or constraint name
  }

  return {
    kind: "embed",
    alias: alias || core,
    core,
    hint,
    join,
    inner,
  };
}

// Resolve how an embed relates to its base table.
// Returns { targetTable, localColumn, foreignColumn, toMany }.
function resolveEmbed(meta, baseTable, embed) {
  const baseFks = meta.fksByTable.get(baseTable) || [];
  const baseCols = meta.columnsByTable.get(baseTable);

  // 1. Explicit hint.
  if (embed.hint) {
    // hint is a constraint name on the base table
    const byConstraint = baseFks.find((f) => f.constraint === embed.hint);
    if (byConstraint) {
      return {
        targetTable: byConstraint.toTable,
        localColumn: byConstraint.column,
        foreignColumn: byConstraint.toColumn,
        toMany: false,
      };
    }
    // hint is an FK column on the base table
    const byColumn = baseFks.find((f) => f.column === embed.hint);
    if (byColumn) {
      return {
        targetTable: byColumn.toTable,
        localColumn: byColumn.column,
        foreignColumn: byColumn.toColumn,
        toMany: false,
      };
    }
    // hint is a constraint / column on the foreign (core) table -> to-many
    const coreFks = meta.fksByTable.get(embed.core) || [];
    const reverse =
      coreFks.find((f) => f.constraint === embed.hint && f.toTable === baseTable) ||
      coreFks.find((f) => f.column === embed.hint && f.toTable === baseTable);
    if (reverse) {
      return {
        targetTable: embed.core,
        localColumn: reverse.toColumn,
        foreignColumn: reverse.column,
        toMany: true,
      };
    }
  }

  // 2. core is an FK column on the base table -> to-one.
  if (baseCols && baseCols.has(embed.core)) {
    const fk = baseFks.find((f) => f.column === embed.core);
    if (fk) {
      return {
        targetTable: fk.toTable,
        localColumn: fk.column,
        foreignColumn: fk.toColumn,
        toMany: false,
      };
    }
  }

  // 3. core is a table name.
  // 3a. base has an FK pointing at core -> to-one.
  const toCore = baseFks.filter((f) => f.toTable === embed.core);
  if (toCore.length >= 1) {
    const fk = toCore[0];
    return {
      targetTable: embed.core,
      localColumn: fk.column,
      foreignColumn: fk.toColumn,
      toMany: false,
    };
  }
  // 3b. core has an FK pointing back at base -> to-many.
  const coreFks = meta.fksByTable.get(embed.core) || [];
  const back = coreFks.filter((f) => f.toTable === baseTable);
  if (back.length >= 1) {
    const fk = back[0];
    return {
      targetTable: embed.core,
      localColumn: fk.toColumn,
      foreignColumn: fk.column,
      toMany: true,
    };
  }

  // 4. Naming-convention fallback for tables that have no FK *constraints*
  //    (the relationship is logical, via <name>_id columns).
  const pkOf = (t) => (meta.pksByTable.get(t) || [])[0] || `${t}_id`;
  const colExists = (t, c) => Boolean(meta.columnsByTable.get(t)?.has(c));

  // 4a. Explicit hint that is a column on the base -> to-one into the core table.
  if (embed.hint && baseCols && baseCols.has(embed.hint) && meta.columnsByTable.has(embed.core)) {
    return {
      targetTable: embed.core,
      localColumn: embed.hint,
      foreignColumn: pkOf(embed.core),
      toMany: false,
    };
  }
  // 4b. core is an "<x>_id" column on the base -> to-one.
  if (baseCols && baseCols.has(embed.core) && embed.core.endsWith("_id")) {
    const guess = [embed.alias, embed.core.replace(/_id$/, "")].find((t) =>
      meta.columnsByTable.has(t)
    );
    if (guess) {
      return { targetTable: guess, localColumn: embed.core, foreignColumn: pkOf(guess), toMany: false };
    }
  }
  // 4c. core is a table and the base has a "<core>_id" column -> to-one.
  if (meta.columnsByTable.has(embed.core) && baseCols && baseCols.has(`${embed.core}_id`)) {
    return {
      targetTable: embed.core,
      localColumn: `${embed.core}_id`,
      foreignColumn: pkOf(embed.core),
      toMany: false,
    };
  }
  // 4d. core is a table that has a "<base>_id" column -> to-many.
  if (meta.columnsByTable.has(embed.core) && colExists(embed.core, `${baseTable}_id`)) {
    return {
      targetTable: embed.core,
      localColumn: pkOf(baseTable),
      foreignColumn: `${baseTable}_id`,
      toMany: true,
    };
  }

  throw new ApiError(
    `Cannot resolve relationship "${embed.alias}" (${embed.core}) on table "${baseTable}"`,
    400
  );
}

let aliasCounter = 0;
function nextAlias() {
  aliasCounter = (aliasCounter + 1) % 1_000_000;
  return `e${aliasCounter}`;
}

// Build the SQL select-list for a (base) table from a PostgREST select string.
// Returns { sql, innerNotNull } where innerNotNull lists base columns that an
// inner-joined to-one embed requires to be non-null.
function buildSelectList(meta, table, baseAlias, selectStr) {
  const items = splitTopLevel(selectStr || "*");
  const pieces = [];
  const innerNotNull = [];

  for (const raw of items) {
    const item = parseSelectItem(raw);
    if (item.kind === "column") {
      if (item.name === "*") {
        pieces.push(`"${baseAlias}".*`);
      } else {
        pieces.push(`${colRef(baseAlias, item.name)} AS ${ident(item.name)}`);
      }
      continue;
    }

    // Embedded relation.
    const rel = resolveEmbed(meta, table, item);
    const childAlias = nextAlias();
    const childSelect = buildSelectList(meta, rel.targetTable, childAlias, item.inner);
    const joinCond = `${colRef(childAlias, rel.foreignColumn)} = ${colRef(baseAlias, rel.localColumn)}`;

    if (rel.toMany) {
      pieces.push(
        `(SELECT COALESCE(jsonb_agg(_s), '[]'::jsonb) FROM ` +
          `(SELECT ${childSelect.sql} FROM ${ident(rel.targetTable)} "${childAlias}" WHERE ${joinCond}) _s) ` +
          `AS ${ident(item.alias)}`
      );
    } else {
      pieces.push(
        `(SELECT to_jsonb(_s) FROM ` +
          `(SELECT ${childSelect.sql} FROM ${ident(rel.targetTable)} "${childAlias}" WHERE ${joinCond} LIMIT 1) _s) ` +
          `AS ${ident(item.alias)}`
      );
      if (item.join === "inner") innerNotNull.push(rel.localColumn);
    }
  }

  return { sql: pieces.join(", "), innerNotNull };
}

// ---------------------------------------------------------------------------
// WHERE clause building
// ---------------------------------------------------------------------------

const OP_SQL = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  like: "LIKE",
  ilike: "ILIKE",
};

// Build a WHERE fragment from the structured filter list.
function buildWhere(meta, table, baseAlias, filters, params) {
  const clauses = [];

  for (const f of filters || []) {
    // .or() carries a PostgREST boolean expression rather than a single column,
    // so it must be handled before colRef() — which would otherwise reject the
    // missing column with "Invalid identifier: undefined".
    if (f.type === "or") {
      clauses.push(`(${parseOrExpr(f.expr, params, baseAlias)})`);
      continue;
    }

    const ref = colRef(baseAlias, f.column ?? f.field);

    switch (f.type) {
      case "eq":
        if (f.value === null) clauses.push(`${ref} IS NULL`);
        else {
          params.push(f.value);
          clauses.push(`${ref} = $${params.length}`);
        }
        break;
      case "neq":
        if (f.value === null) clauses.push(`${ref} IS NOT NULL`);
        else {
          params.push(f.value);
          clauses.push(`${ref} <> $${params.length}`);
        }
        break;
      case "gt":
      case "gte":
      case "lt":
      case "lte":
      case "like":
      case "ilike":
        params.push(f.value);
        clauses.push(`${ref} ${OP_SQL[f.type]} $${params.length}`);
        break;
      case "is":
        if (f.value === null) clauses.push(`${ref} IS NULL`);
        else if (f.value === true) clauses.push(`${ref} IS TRUE`);
        else if (f.value === false) clauses.push(`${ref} IS FALSE`);
        else {
          params.push(f.value);
          clauses.push(`${ref} IS NOT DISTINCT FROM $${params.length}`);
        }
        break;
      case "in": {
        const list = Array.isArray(f.value) ? f.value : [];
        if (list.length === 0) {
          clauses.push("FALSE");
        } else {
          const ph = list.map((v) => {
            params.push(v);
            return `$${params.length}`;
          });
          clauses.push(`${ref} IN (${ph.join(", ")})`);
        }
        break;
      }
      case "contains":
      case "overlaps": {
        const sqlOp = f.type === "contains" ? "@>" : "&&";
        const info = meta.columnsByTable?.get(table)?.get(f.column);
        const isArrayCol = info && (info.data_type === "ARRAY" || info.udt_name?.startsWith("_"));
        if (isArrayCol) {
          // Postgres array column: pass a JS array (node-postgres -> array literal).
          params.push(Array.isArray(f.value) ? f.value : [f.value]);
          clauses.push(`${ref} ${sqlOp} $${params.length}`);
        } else {
          // jsonb column: containment uses @> with a json value.
          params.push(JSON.stringify(f.value));
          clauses.push(`${ref} ${sqlOp} $${params.length}::jsonb`);
        }
        break;
      }
      case "not": {
        const op = f.op;
        if (op === "is") {
          if (f.value === null) clauses.push(`NOT (${ref} IS NULL)`);
          else if (f.value === true) clauses.push(`NOT (${ref} IS TRUE)`);
          else if (f.value === false) clauses.push(`NOT (${ref} IS FALSE)`);
          else {
            params.push(f.value);
            clauses.push(`NOT (${ref} IS NOT DISTINCT FROM $${params.length})`);
          }
        } else if (op === "in") {
          // .not(col, 'in', '(a,b,c)') — value is a PostgREST-style paren list
          // string (supabase-js convention) or a JS array. An empty set means
          // "exclude nothing", so the NOT-IN clause is a no-op (TRUE).
          let list;
          if (Array.isArray(f.value)) {
            list = f.value;
          } else {
            let listStr = String(f.value).trim();
            if (listStr.startsWith("(") && listStr.endsWith(")")) {
              listStr = listStr.slice(1, -1);
            }
            list = listStr.length ? splitTopLevel(listStr).map(unquote) : [];
          }
          if (list.length === 0) {
            clauses.push("TRUE");
          } else {
            const ph = list.map((v) => {
              params.push(v);
              return `$${params.length}`;
            });
            clauses.push(`${ref} NOT IN (${ph.join(", ")})`);
          }
        } else if (OP_SQL[op]) {
          params.push(f.value);
          clauses.push(`NOT (${ref} ${OP_SQL[op]} $${params.length})`);
        } else {
          throw new ApiError(`Unsupported not() operator: ${op}`, 400);
        }
        break;
      }
      default:
        throw new ApiError(`Unsupported filter type: ${f.type}`, 400);
    }
  }

  return clauses;
}

// Parse a PostgREST boolean expression (used by .or()).
// Supports: comma-separated conditions, and(...)/or(...)/not(...) groups,
// leaf conditions "column.op.value", lists "(a,b,c)", quoted "..." values.
function parseOrExpr(expr, params, baseAlias, joiner = " OR ") {
  const parts = splitTopLevel(expr);
  const sqlParts = parts.map((p) => parseOrCondition(p, params, baseAlias));
  return sqlParts.join(joiner);
}

function parseOrCondition(part, params, baseAlias) {
  const trimmed = part.trim();

  const groupMatch = /^(and|or|not)\((.*)\)$/is.exec(trimmed);
  if (groupMatch) {
    const kind = groupMatch[1].toLowerCase();
    const inner = groupMatch[2];
    if (kind === "not") {
      return `NOT (${parseOrExpr(inner, params, baseAlias, " OR ")})`;
    }
    const j = kind === "and" ? " AND " : " OR ";
    return `(${parseOrExpr(inner, params, baseAlias, j)})`;
  }

  let negate = false;
  let body = trimmed;
  if (body.startsWith("not.")) {
    negate = true;
    body = body.slice(4);
  }

  const firstDot = body.indexOf(".");
  const secondDot = body.indexOf(".", firstDot + 1);
  if (firstDot === -1 || secondDot === -1) {
    throw new ApiError(`Invalid filter expression: ${part}`, 400);
  }
  const column = body.slice(0, firstDot);
  const op = body.slice(firstDot + 1, secondDot);
  let value = body.slice(secondDot + 1);
  const ref = colRef(baseAlias, column);

  let sql;
  if (op === "is") {
    const v = value.toLowerCase();
    if (v === "null") sql = `${ref} IS NULL`;
    else if (v === "true") sql = `${ref} IS TRUE`;
    else if (v === "false") sql = `${ref} IS FALSE`;
    else {
      params.push(value);
      sql = `${ref} IS NOT DISTINCT FROM $${params.length}`;
    }
  } else if (op === "in") {
    let listStr = value.trim();
    if (listStr.startsWith("(") && listStr.endsWith(")")) {
      listStr = listStr.slice(1, -1);
    }
    const list = splitTopLevel(listStr).map(unquote);
    if (list.length === 0) {
      sql = "FALSE";
    } else {
      const ph = list.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      sql = `${ref} IN (${ph.join(", ")})`;
    }
  } else if (OP_SQL[op]) {
    params.push(unquote(value));
    sql = `${ref} ${OP_SQL[op]} $${params.length}`;
  } else {
    throw new ApiError(`Unsupported operator in expression: ${op}`, 400);
  }

  return negate ? `NOT (${sql})` : sql;
}

function unquote(v) {
  let s = v.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return s;
}

// ---------------------------------------------------------------------------
// SELECT
// ---------------------------------------------------------------------------

// Columns that must never be returned to a client, even via select('*').
// The login endpoint reads these via a direct pool.query, so redacting them
// here on the generic read path is safe for the rest of the app.
const SENSITIVE_COLUMNS = {
  crm_user: ["password_hash", "totp_secret"],
};

function redactRow(table, row) {
  const sensitive = SENSITIVE_COLUMNS[table];
  if (!sensitive || !row || typeof row !== "object") return row;
  for (const col of sensitive) {
    if (col in row) row[col] = undefined;
  }
  return row;
}

function redactRows(table, rows) {
  if (!SENSITIVE_COLUMNS[table] || !Array.isArray(rows)) return rows;
  for (const row of rows) redactRow(table, row);
  return rows;
}

async function runSelect(table, spec) {
  const meta = await loadMeta();
  ident(table); // validate

  const params = [];
  const where = buildWhere(meta, table, "_b", spec.filters, params);

  let count = null;
  if (spec.count) {
    const countSql =
      `SELECT COUNT(*)::int AS count FROM ${ident(table)} "_b"` +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "");
    const countRes = await pool.query(countSql, params.slice());
    count = countRes.rows[0].count;
  }

  let rows = [];
  if (!spec.head) {
    const selectList = buildSelectList(meta, table, "_b", spec.select || "*");
    const allWhere = where.concat(
      selectList.innerNotNull.map((c) => `${colRef("_b", c)} IS NOT NULL`)
    );

    let sql = `SELECT ${selectList.sql} FROM ${ident(table)} "_b"`;
    if (allWhere.length) sql += ` WHERE ${allWhere.join(" AND ")}`;

    if (Array.isArray(spec.order) && spec.order.length) {
      const parts = spec.order.map((o) => {
        const dir = o.ascending === false ? "DESC" : "ASC";
        let frag = `${colRef("_b", o.column)} ${dir}`;
        if (o.nullsFirst === true) frag += " NULLS FIRST";
        else if (o.nullsFirst === false) frag += " NULLS LAST";
        return frag;
      });
      sql += ` ORDER BY ${parts.join(", ")}`;
    }

    if (Number.isFinite(spec.limit)) sql += ` LIMIT ${Math.max(0, Math.trunc(spec.limit))}`;
    if (Number.isFinite(spec.offset)) sql += ` OFFSET ${Math.max(0, Math.trunc(spec.offset))}`;

    const res = await pool.query(sql, params);
    rows = res.rows;
  }

  if (spec.single || spec.maybeSingle) {
    if (rows.length > 1) {
      throw new ApiError("JSON object requested, multiple (or no) rows returned", 406);
    }
    if (rows.length === 0) {
      if (spec.single) throw new ApiError("No rows found", 406, "PGRST116");
      return { data: null, count };
    }
    return { data: redactRow(table, rows[0]), count };
  }

  return { data: spec.head ? null : redactRows(table, rows), count };
}

// ---------------------------------------------------------------------------
// INSERT / UPSERT
// ---------------------------------------------------------------------------

async function runInsert(table, spec) {
  const meta = await loadMeta();
  ident(table);

  const rows = Array.isArray(spec.values) ? spec.values : [spec.values];
  if (!rows.length || !rows[0] || typeof rows[0] !== "object") {
    throw new ApiError("No values provided for insert", 400);
  }

  // Union of all keys across the rows.
  const colSet = [];
  const seen = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        ident(k);
        colSet.push(k);
      }
    }
  }

  const params = [];
  const valueTuples = rows.map((row) => {
    const ph = colSet.map((c) => {
      params.push(coerceValue(meta, table, c, row[c]));
      return `$${params.length}`;
    });
    return `(${ph.join(", ")})`;
  });

  const colSql = colSet.map((c) => ident(c)).join(", ");
  let sql = `INSERT INTO ${ident(table)} (${colSql}) VALUES ${valueTuples.join(", ")}`;

  // Upsert handling.
  if (spec.upsert) {
    let conflictCols;
    if (spec.onConflict) {
      conflictCols = String(spec.onConflict).split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      conflictCols = meta.pksByTable.get(table) || [];
    }
    if (!conflictCols.length) {
      throw new ApiError(`Upsert on "${table}" requires onConflict (no primary key found)`, 400);
    }
    conflictCols.forEach((c) => ident(c));
    const updateCols = colSet.filter((c) => !conflictCols.includes(c));
    if (updateCols.length === 0) {
      sql += ` ON CONFLICT (${conflictCols.map((c) => ident(c)).join(", ")}) DO NOTHING`;
    } else {
      const setSql = updateCols.map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`).join(", ");
      sql += ` ON CONFLICT (${conflictCols.map((c) => ident(c)).join(", ")}) DO UPDATE SET ${setSql}`;
    }
  }

  sql += " RETURNING *";

  const res = await pool.query(sql, params);
  return finalizeMutation(res.rows, spec);
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

async function runUpdate(table, spec) {
  const meta = await loadMeta();
  ident(table);

  const values = spec.values || {};
  const cols = Object.keys(values);
  if (!cols.length) throw new ApiError("No values provided for update", 400);

  const params = [];
  const setParts = cols.map((c) => {
    ident(c);
    params.push(coerceValue(meta, table, c, values[c]));
    return `${ident(c)} = $${params.length}`;
  });

  const where = buildWhere(meta, table, "_b", spec.filters, params);
  let sql = `UPDATE ${ident(table)} "_b" SET ${setParts.join(", ")}`;
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += " RETURNING *";

  const res = await pool.query(sql, params);
  return finalizeMutation(res.rows, spec);
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

async function runDelete(table, spec) {
  const meta = await loadMeta();
  ident(table);

  const params = [];
  const where = buildWhere(meta, table, "_b", spec.filters, params);
  let sql = `DELETE FROM ${ident(table)} "_b"`;
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += " RETURNING *";

  const res = await pool.query(sql, params);
  return finalizeMutation(res.rows, spec);
}

function finalizeMutation(rows, spec) {
  if (spec.single || spec.maybeSingle) {
    if (rows.length > 1) {
      throw new ApiError("JSON object requested, multiple rows returned", 406);
    }
    if (rows.length === 0) {
      if (spec.single) throw new ApiError("No rows found", 406, "PGRST116");
      return { data: null };
    }
    return { data: rows[0] };
  }
  return { data: rows };
}

// ---------------------------------------------------------------------------
// RPC (Postgres functions)
// ---------------------------------------------------------------------------

async function runRpc(fnName, paramsObj, authContext) {
  ident(fnName);
  const keys = paramsObj && typeof paramsObj === "object" ? Object.keys(paramsObj) : [];

  const params = [];
  const namedArgs = keys.map((k) => {
    ident(k);
    params.push(paramsObj[k]);
    return `${ident(k)} := $${params.length}`;
  });

  const sql = `SELECT * FROM ${ident(fnName)}(${namedArgs.join(", ")})`;

  // When the caller is authenticated, expose their identity to the DB session so
  // Supabase-style helpers resolve it: auth.uid() reads request.jwt.claims->>'sub'.
  // Privilege-checked RPCs (e.g. publish_all_customizations) fail without this.
  // set_config(..., is_local=true) is transaction-scoped, so run on one client
  // inside a txn rather than the auto-committed pool.query.
  if (authContext && authContext.sub) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: authContext.sub, role: "authenticated" }),
      ]);
      const res = await client.query(sql, params);
      await client.query("COMMIT");
      return { data: unwrapRpcResult(fnName, res) };
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch { /* already aborted */ }
      throw err;
    } finally {
      client.release();
    }
  }

  const res = await pool.query(sql, params);
  return { data: unwrapRpcResult(fnName, res) };
}

function unwrapRpcResult(fnName, res) {
  const fields = res.fields || [];
  const rows = res.rows || [];

  if (fields.length === 1) {
    const col = fields[0].name;
    if (col === fnName) {
      // Scalar / json / void / setof-scalar return.
      if (rows.length === 0) return null;
      if (rows.length === 1) {
        const v = rows[0][col];
        return v === undefined ? null : v;
      }
      return rows.map((r) => r[col]);
    }
    // Single-column TABLE/SETOF -> array of row objects.
    return rows;
  }

  // Multi-column composite TABLE/SETOF -> array of row objects.
  return rows;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Postgres SQLSTATEs that represent client-caused (4xx) conditions rather than
// server faults. Used to translate errors raised by SECURITY DEFINER RPCs
// (e.g. publish_all_customizations) into meaningful HTTP statuses.
const PG_ERROR_HTTP_STATUS = {
  "42501": 403, // insufficient_privilege  -> not_authorized
  "40001": 409, // serialization_failure   -> version_conflict
  "P0001": 400, // raise_exception         -> validation_failed
  "P0002": 404, // (custom) unknown_version
};

function sendError(res, error) {
  const status = error instanceof ApiError
    ? error.status
    : (error && PG_ERROR_HTTP_STATUS[error.code]) || 500;
  // Log server-side (5xx) failures so the exact SQL/pg error is visible in the
  // terminal. Client errors (4xx) are expected and stay quiet.
  if (status >= 500) {
    console.error(
      `[${new Date().toISOString()}] ${status} ${res.req?.method} ${res.req?.originalUrl} ->`,
      error.message,
      error.code ? `(code ${error.code})` : "",
      "\n  body:", JSON.stringify(res.req?.body)?.slice(0, 500)
    );
  }
  res.status(status).json({
    error: {
      message: error.message || "Internal server error",
      status,
      code: error.code,
    },
  });
}

app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS server_time");
    res.json({ ok: true, database: "connected", time: result.rows[0].server_time });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/tables", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    res.json(result.rows);
  } catch (error) {
    sendError(res, error);
  }
});

// RPC
app.post("/api/rpc/:functionName", async (req, res) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = token ? verifyToken(token) : null;
    const authContext = payload && payload.sub ? { sub: payload.sub } : null;
    const result = await runRpc(req.params.functionName, req.body || {}, authContext);
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

// Auth — password login + session validation.
// Registered before the generic /api/:table routes so these specific paths win.
// (verifyPassword/signToken/verifyToken/TOKEN_TTL_MS are required at the top.)

function publicUser(u) {
  return {
    id: u.user_id,
    email: u.email,
    name: u.full_name,
    role: u.is_system_admin ? "admin" : "user",
    is_system_admin: u.is_system_admin,
  };
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password, code } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: { message: "Email and password are required.", status: 400 } });
    }
    const { rows } = await pool.query(
      `SELECT user_id, email, full_name, is_system_admin, is_active, password_hash,
              totp_enabled, totp_secret
       FROM crm_user
       WHERE lower(email) = lower($1) AND deleted_at IS NULL
       LIMIT 1`,
      [email]
    );
    const u = rows[0];
    // Same generic error whether the user is missing, inactive, or the password
    // is wrong — don't leak which emails exist.
    if (!u || !u.is_active || !verifyPassword(password, u.password_hash)) {
      return res.status(401).json({ error: { message: "Invalid email or password.", status: 401 } });
    }
    // Second factor: when enabled, the password alone is not enough. The client
    // first gets { mfa_required: true } (no token), then re-submits with `code`.
    if (u.totp_enabled) {
      if (!code) {
        return res.json({ data: { mfa_required: true } });
      }
      if (!totp.verifyToken(u.totp_secret, code)) {
        return res.status(401).json({ error: { message: "Invalid authentication code.", status: 401 } });
      }
    }
    const exp = Date.now() + TOKEN_TTL_MS;
    const token = signToken({ sub: u.user_id, email: u.email, exp });
    res.json({ data: { token, user: publicUser(u) } });
  } catch (error) {
    sendError(res, error);
  }
});

// "Who am I" — a session check. Returns 200 with { user } when the token is
// valid, or 200 with { user: null } when there is no valid session. Deliberately
// NOT a 401: an absent/expired token on load is a normal state, and a 401 would
// show as a noisy "Failed to load resource" error in the browser console.
app.get("/api/auth/session", async (req, res) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = verifyToken(token);
    if (!payload) {
      return res.json({ data: { user: null } });
    }
    const { rows } = await pool.query(
      `SELECT user_id, email, full_name, is_system_admin, is_active
       FROM crm_user
       WHERE user_id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [payload.sub]
    );
    const u = rows[0];
    if (!u || !u.is_active) {
      return res.json({ data: { user: null } });
    }
    res.json({ data: { user: publicUser(u) } });
  } catch (error) {
    sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Admin: user provisioning + two-factor authentication management.
// These endpoints require the caller to be an active system administrator.
// (User creation lives here — not on the generic /api/crm_user path — because it
//  must hash the password and create the backing auth.users row atomically.)
// ---------------------------------------------------------------------------

const TOTP_ISSUER = "Monty Finance CRM";
const PASSWORD_MIN = 12;

// Mirror of the client-side complexity rules (src/admin/security/UsersPage.tsx),
// enforced on the server so the policy holds even if the API is called directly.
function passwordComplexityError(pw) {
  const s = String(pw || "");
  const missing = [];
  if (s.length < PASSWORD_MIN) missing.push(`at least ${PASSWORD_MIN} characters`);
  if (!/[a-z]/.test(s)) missing.push("a lowercase letter");
  if (!/[A-Z]/.test(s)) missing.push("an uppercase letter");
  if (!/[0-9]/.test(s)) missing.push("a number");
  if (!/[^A-Za-z0-9]/.test(s)) missing.push("a special character");
  return missing.length ? `Password must include ${missing.join(", ")}.` : null;
}

// Resolve and authorize the caller. Throws ApiError (handled by sendError).
async function requireAdmin(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = verifyToken(token);
  if (!payload || !payload.sub) throw new ApiError("Authentication required.", 401);
  const { rows } = await pool.query(
    `SELECT user_id, is_active, is_system_admin FROM crm_user
     WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [payload.sub]
  );
  const caller = rows[0];
  if (!caller || !caller.is_active) throw new ApiError("Authentication required.", 401);
  if (!caller.is_system_admin) {
    throw new ApiError("Only system administrators can perform this action.", 403);
  }
  return caller;
}

// Public-safe user columns (never password_hash / totp_secret).
const USER_PUBLIC_COLS =
  `user_id, business_unit_id, full_name, email, username, job_title, mobile_phone,
   is_active, is_system_admin, deleted_at, created_at, modified_at, totp_enabled`;

// Create a user: validates a complex password, hashes it, and creates the
// backing auth.users row + crm_user profile atomically.
app.post("/api/admin/users", async (req, res) => {
  try {
    await requireAdmin(req);
    const b = req.body || {};
    const email = String(b.email || "").trim();
    if (!email || !/.+@.+\..+/.test(email)) {
      throw new ApiError("A valid email is required.", 400);
    }
    const pwErr = passwordComplexityError(b.password);
    if (pwErr) throw new ApiError(pwErr, 400);

    const dup = await pool.query(
      `SELECT 1 FROM crm_user WHERE lower(email) = lower($1) AND deleted_at IS NULL LIMIT 1`,
      [email]
    );
    if (dup.rowCount) throw new ApiError("A user with this email already exists.", 409);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const authRes = await client.query(
        `INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), $1) RETURNING id`,
        [email]
      );
      const id = authRes.rows[0].id;
      const ins = await client.query(
        `INSERT INTO crm_user
           (user_id, email, full_name, username, job_title, mobile_phone,
            business_unit_id, is_active, is_system_admin, password_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING ${USER_PUBLIC_COLS}`,
        [
          id,
          email,
          b.full_name ?? "",
          b.username ?? null,
          b.job_title ?? null,
          b.mobile_phone ?? null,
          b.business_unit_id ?? null,
          b.is_active ?? true,
          b.is_system_admin ?? false,
          hashPassword(b.password),
        ]
      );
      await client.query("COMMIT");
      res.status(201).json({ data: { user: ins.rows[0] } });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    sendError(res, error);
  }
});

// Begin 2FA enrollment: generate a fresh secret (not yet active) and return the
// otpauth:// URI + Base32 key so the UI can show a QR code / manual entry key.
// Re-running this rotates the secret and leaves 2FA disabled until confirmed.
app.post("/api/admin/users/:id/2fa/setup", async (req, res) => {
  try {
    await requireAdmin(req);
    const { rows } = await pool.query(
      `SELECT user_id, email FROM crm_user WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [req.params.id]
    );
    const u = rows[0];
    if (!u) throw new ApiError("User not found.", 404);
    const secret = totp.generateSecret();
    await pool.query(
      `UPDATE crm_user SET totp_secret = $1, totp_enabled = false, modified_at = now()
       WHERE user_id = $2`,
      [secret, u.user_id]
    );
    res.json({
      data: { secret, otpauth_url: totp.otpauthUrl(secret, u.email, TOTP_ISSUER) },
    });
  } catch (error) {
    sendError(res, error);
  }
});

// Confirm enrollment: the code must match the pending secret before 2FA turns on.
app.post("/api/admin/users/:id/2fa/enable", async (req, res) => {
  try {
    await requireAdmin(req);
    const { code } = req.body || {};
    const { rows } = await pool.query(
      `SELECT totp_secret FROM crm_user WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [req.params.id]
    );
    const u = rows[0];
    if (!u) throw new ApiError("User not found.", 404);
    if (!u.totp_secret) {
      throw new ApiError("Start setup before enabling two-factor authentication.", 400);
    }
    if (!totp.verifyToken(u.totp_secret, code)) {
      throw new ApiError("That code is incorrect. Check the authenticator app and try again.", 400);
    }
    await pool.query(
      `UPDATE crm_user SET totp_enabled = true, modified_at = now() WHERE user_id = $1`,
      [req.params.id]
    );
    res.json({ data: { totp_enabled: true } });
  } catch (error) {
    sendError(res, error);
  }
});

// Disable / reset 2FA: clears the secret and turns the requirement off.
app.post("/api/admin/users/:id/2fa/disable", async (req, res) => {
  try {
    await requireAdmin(req);
    await pool.query(
      `UPDATE crm_user SET totp_secret = NULL, totp_enabled = false, modified_at = now()
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    res.json({ data: { totp_enabled: false } });
  } catch (error) {
    sendError(res, error);
  }
});

// Reset a user's password: validates the complex-password policy and stores a
// fresh scrypt hash. (Same policy as user creation.)
app.post("/api/admin/users/:id/password", async (req, res) => {
  try {
    await requireAdmin(req);
    const pwErr = passwordComplexityError((req.body || {}).password);
    if (pwErr) throw new ApiError(pwErr, 400);
    const result = await pool.query(
      `UPDATE crm_user SET password_hash = $1, modified_at = now()
       WHERE user_id = $2 AND deleted_at IS NULL`,
      [hashPassword((req.body || {}).password), req.params.id]
    );
    if (result.rowCount === 0) throw new ApiError("User not found.", 404);
    res.json({ data: { ok: true } });
  } catch (error) {
    sendError(res, error);
  }
});

// Convenience count endpoint (kept for manual testing / api helper).
app.get("/api/:table/count", async (req, res) => {
  try {
    const result = await runSelect(req.params.table, { count: true, head: true });
    res.json({ count: result.count });
  } catch (error) {
    sendError(res, error);
  }
});

// Manual / browser-friendly read. Optional ?q=<url-encoded JSON spec>.
app.get("/api/:table", async (req, res) => {
  try {
    let spec = { select: "*", limit: 100 };
    if (req.query.q) {
      spec = JSON.parse(req.query.q);
    } else {
      if (req.query.select) spec.select = String(req.query.select);
      if (req.query.limit) spec.limit = parseInt(String(req.query.limit), 10);
    }
    const result = await runSelect(req.params.table, spec);
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

// Primary read path for the adapter (avoids URL length limits) + insert/upsert.
app.post("/api/:table", async (req, res) => {
  try {
    const body = req.body || {};
    if (body.action === "select") {
      const result = await runSelect(req.params.table, body);
      res.json(result);
    } else {
      const result = await runInsert(req.params.table, body);
      res.json(result);
    }
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/:table", async (req, res) => {
  try {
    const result = await runUpdate(req.params.table, req.body || {});
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.delete("/api/:table", async (req, res) => {
  try {
    const result = await runDelete(req.params.table, req.body || {});
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Storage (local disk) — replaces Supabase Storage buckets.
// ---------------------------------------------------------------------------

const STORAGE_DIR = path.join(__dirname, "storage");

// Reject bucket names that are not simple identifiers and paths that try to
// escape the storage directory.
function safeStoragePath(bucket, relPath) {
  if (!IDENT_RE.test(String(bucket).replace(/-/g, "_"))) {
    throw new ApiError("Invalid bucket name", 400);
  }
  const clean = String(relPath || "").replace(/\\/g, "/");
  if (clean.includes("..") || clean.startsWith("/")) {
    throw new ApiError("Invalid storage path", 400);
  }
  const full = path.join(STORAGE_DIR, bucket, clean);
  if (!full.startsWith(path.join(STORAGE_DIR, bucket))) {
    throw new ApiError("Invalid storage path", 400);
  }
  return full;
}

// Serve uploaded files publicly: GET /storage/:bucket/<path>
app.use("/storage", express.static(STORAGE_DIR));

app.post("/api/storage/:bucket/upload", async (req, res) => {
  try {
    const { path: relPath, contentBase64, upsert } = req.body || {};
    const full = safeStoragePath(req.params.bucket, relPath);
    if (!upsert && fs.existsSync(full)) {
      throw new ApiError("The resource already exists", 409);
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.from(contentBase64 || "", "base64"));
    res.json({ data: { path: relPath } });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/storage/:bucket/remove", async (req, res) => {
  try {
    const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
    const removed = [];
    for (const p of paths) {
      const full = safeStoragePath(req.params.bucket, p);
      if (fs.existsSync(full)) {
        fs.unlinkSync(full);
        removed.push(p);
      }
    }
    res.json({ data: removed });
  } catch (error) {
    sendError(res, error);
  }
});

const port = process.env.API_PORT || process.env.PORT || 3001;

// Idempotent: guarantees the auth-related columns exist before we accept
// traffic (the login + admin endpoints read/write them). Safe to run every boot.
async function ensureAuthSchema() {
  await pool.query(`ALTER TABLE crm_user ADD COLUMN IF NOT EXISTS totp_secret text`);
  await pool.query(
    `ALTER TABLE crm_user ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false`
  );
}

ensureAuthSchema()
  .catch((e) => console.error("ensureAuthSchema failed:", e.message))
  .finally(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Local API running on port ${port}`);
    });
    // Power Automation: drain the automation_job queue (send_email, etc.).
    startAutomationWorker(pool);
  });
