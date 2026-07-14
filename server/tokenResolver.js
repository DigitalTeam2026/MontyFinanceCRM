// server/tokenResolver.js
// Shared token-resolution service for Power Automation action configs. Every
// action (email To/Cc/subject/body, update_field value, generate_document
// filename, list_rows filter values) renders its templates through here, so the
// supported token set and the escaping rules are defined in exactly one place.
//
// Context shape:
//   { after: {<logical field>: value}, recordUrl, count, steps: { <name>: { count, columns, rows } } }
//
// Tokens:
//   {{record.<field>}} | {{<field>}}   -> triggering record field
//   {{record.url}}                     -> record deep link
//   {{record.regarding.url}}           -> parent-record deep link (timeline notes/emails)
//   {{count}}                          -> batch count
//   {{steps.<name>.count}}             -> rows returned by an earlier list_rows/get_row step
//   {{steps.<name>.first(<col>)}}      -> one column DISPLAY value from the FIRST row
//   {{steps.<name>.raw(<col>)}}        -> one column STORED value (id/code) from the FIRST row
//                                         (use to feed a later match/lookup by id)
//   {{steps.<name>.join(<col>, 'sep')}}-> one column joined into a string
//   {{steps.<name>.rows}}              -> the row collection (HTML table in bodies)
//   {{export.count}} | {{export.view}} -> scheduled view-export row count / view name
//
// Escaping: pass html=true for email bodies (scalars HTML-escaped, .rows -> table);
// html=false for address fields / values (no escaping — callers validate emails).

function escapeHtml(v) {
  if (v == null) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isEmail(s) {
  return typeof s === "string" && EMAIL_RE.test(s.trim());
}

function renderRowsHtml(step, html) {
  const cols = (step && step.columns) || [];
  const rows = (step && step.rows) || [];
  if (!cols.length || !rows.length) return "";
  const esc = html ? escapeHtml : (v) => (v == null ? "" : String(v));
  if (!html) {
    // plain-text fallback: tab-separated cells, newline-separated rows
    return rows.map((r) => cols.map((c) => esc(r[c])).join("\t")).join("\n");
  }
  const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${cols.map((c) => `<td>${escapeHtml(r[c])}</td>`).join("")}</tr>`)
    .join("");
  return `<table border="1" cellpadding="4" cellspacing="0"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// {{steps.name.join(col, 'sep')}}  — sep may be single- or double-quoted or bare.
const JOIN_RE = /^join\(\s*([\w]+)\s*,\s*(?:(['"])([\s\S]*?)\2|([^)]*?))\s*\)$/;
// {{steps.name.first(col)}}  — the DISPLAY value of one column from the first row.
const FIRST_RE = /^first\(\s*([\w]+)\s*\)$/;
// {{steps.name.raw(col)}}    — the STORED value (id/code) of one column, first row.
const RAW_RE = /^raw\(\s*([\w]+)\s*\)$/;

function resolveExpr(expr, ctx, html) {
  const esc = html ? escapeHtml : (v) => (v == null ? "" : String(v));

  if (expr === "record.url") return esc(ctx.recordUrl);
  if (expr === "record.regarding.url") return esc(ctx.regardingUrl);
  if (expr === "count") return esc(ctx.count);

  // Scheduled view export ({{export.count}} rows, {{export.view}} name).
  if (expr === "export.count") return esc(ctx.export ? ctx.export.count : "");
  if (expr === "export.view") return esc(ctx.export ? ctx.export.view : "");

  if (expr.startsWith("steps.")) {
    const rest = expr.slice("steps.".length);
    const dot = rest.indexOf(".");
    const name = dot === -1 ? rest : rest.slice(0, dot);
    const op = dot === -1 ? "" : rest.slice(dot + 1);
    const step = ctx.steps && ctx.steps[name];
    if (!step) return "";
    if (op === "count") return esc(step.count);
    if (op === "rows") return renderRowsHtml(step, html);
    const fm = op.match(FIRST_RE);
    if (fm) {
      const row = (step.rows || [])[0];
      return esc(row ? row[fm[1]] : "");
    }
    const rm = op.match(RAW_RE);
    if (rm) {
      const row = (step.rawRows || step.rows || [])[0];
      return esc(row ? row[rm[1]] : "");
    }
    const jm = op.match(JOIN_RE);
    if (jm) {
      const col = jm[1];
      const sep = jm[3] !== undefined ? jm[3] : jm[4] || "";
      return (step.rows || [])
        .map((r) => esc(r[col]))
        .filter((v) => v !== "" && v != null)
        .join(sep);
    }
    return "";
  }

  // Raw stored value (bypasses label resolution): {{record.raw.<field>}} or
  // {{raw.<field>}}. Use this when copying a code/id field into another field
  // (choice → choice, lookup → lookup) so the CODE is written, not its label.
  if (expr.startsWith("raw.") || expr.startsWith("record.raw.")) {
    const f = expr.slice(expr.lastIndexOf("raw.") + 4);
    return esc(ctx.after ? ctx.after[f] : undefined);
  }

  // Triggering-record field: {{record.<field>}} or bare {{<field>}}.
  // Prefer the label-resolved value (choice/lookup/state/status → label) when present,
  // falling back to the raw stored value.
  const field = expr.includes(".") ? expr.slice(expr.indexOf(".") + 1) : expr;
  const display = ctx.afterDisplay && Object.prototype.hasOwnProperty.call(ctx.afterDisplay, field)
    ? ctx.afterDisplay[field]
    : (ctx.after ? ctx.after[field] : undefined);
  return esc(display);
}

/** Render every {{token}} in a template string. */
function resolveTokens(tpl, ctx, html = false) {
  if (tpl == null) return "";
  return String(tpl).replace(/{{\s*([\s\S]+?)\s*}}/g, (_m, expr) => resolveExpr(expr.trim(), ctx, html));
}

/** A config value that may be a static value or a token string (unescaped). */
function resolveValue(raw, ctx) {
  if (typeof raw === "string" && raw.includes("{{")) return resolveTokens(raw, ctx, false);
  return raw;
}

/** Case-insensitive dedupe of an email list, preserving first-seen casing. */
function dedupeEmails(list) {
  const seen = new Set();
  const out = [];
  for (const e of list) {
    const key = String(e).trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(String(e).trim());
    }
  }
  return out;
}

/**
 * Resolve an address-field template (static + tokens) into a validated, deduped
 * email array. Splits on ; or , after token resolution.
 */
function resolveEmailList(tpl, ctx) {
  if (!tpl) return [];
  const resolved = resolveTokens(tpl, ctx, false);
  const parts = String(resolved)
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return dedupeEmails(parts.filter(isEmail));
}

module.exports = {
  escapeHtml,
  isEmail,
  resolveTokens,
  resolveValue,
  resolveEmailList,
  dedupeEmails,
};
