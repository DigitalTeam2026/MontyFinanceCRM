// server/aiFlowBuilder.js
// Power Automation — "AI build" endpoint. Takes a plain-language prompt + the
// target table and asks Claude to draft a full flow spec (trigger + ordered
// actions with run_after branches). Returns the spec as JSON; the browser
// previews it and applies it through the normal automation services, so this
// endpoint stays stateless (no DB writes).
//
// Credentials: set ANTHROPIC_API_KEY in the root .env (same file the rest of the
// server reads). Without it the endpoint returns 503 so the UI can say "AI isn't
// configured" instead of failing cryptically.
//
// We call the Messages API over fetch (Node 18+ global) rather than pulling in an
// SDK dependency for one route. Model is Claude Opus 4.8 (claude-opus-4-8).

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-8";

const ACTION_TYPES = ["list_rows", "send_email", "update_field", "generate_document"];
const TRIGGER_OPERATORS = ["changes_to", "equals", "is_any_of", "changes_from_to", "changed"];
const RUN_AFTER = ["success", "failure", "always"];

/**
 * When the caller doesn't pick a table, ask Claude to choose one from the full
 * list purely from the prompt. Keeps this cheap: no field context, just table
 * names, and we constrain the answer to a known logical_name.
 */
async function pickTableFromPrompt(pool, apiKey, prompt) {
  const tables = (
    await pool.query(
      "select logical_name, display_name from entity_definition order by display_name"
    )
  ).rows;
  const valid = new Set(tables.map((t) => t.logical_name));
  const list = tables.map((t) => `  - ${t.logical_name} (${t.display_name})`).join("\n");

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 64,
      system: `Pick the single table this automation request is about. Reply with ONLY the table's logical_name (exactly as listed) and nothing else.\n\nTABLES:\n${list}`,
      messages: [{ role: "user", content: String(prompt).trim() }],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    const err = new Error(`Anthropic API ${resp.status}: ${body.slice(0, 300)}`);
    err.statusCode = 502;
    throw err;
  }
  const data = await resp.json();
  const answer = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  // The model may wrap it in quotes/backticks or add a trailing period.
  const cleaned = answer.replace(/[`'".]/g, "").trim();
  if (valid.has(cleaned)) return cleaned;
  // Fall back to a substring match against the raw answer.
  const hit = tables.find((t) => answer.includes(t.logical_name));
  if (hit) return hit.logical_name;
  const err = new Error(
    "Couldn't tell which table this flow is for — pick a table and try again."
  );
  err.statusCode = 422;
  throw err;
}

async function loadTableContext(pool, tableLogical) {
  const ent = (
    await pool.query(
      "select entity_definition_id, logical_name, display_name from entity_definition where logical_name = $1 limit 1",
      [tableLogical]
    )
  ).rows[0];
  if (!ent) throw new Error(`unknown table: ${tableLogical}`);

  const fields = (
    await pool.query(
      `select fd.logical_name, fd.display_name, ft.name as type
         from field_definition fd
         left join field_type ft on ft.field_type_id = fd.field_type_id
        where fd.entity_definition_id = $1 and fd.is_active = true and fd.deleted_at is null
        order by fd.display_name`,
      [ent.entity_definition_id]
    )
  ).rows;

  const tables = (
    await pool.query(
      "select logical_name, display_name from entity_definition order by display_name"
    )
  ).rows;

  return { ent, fields, tables };
}

function systemPrompt(ent, fields, tables) {
  const fieldList = fields
    .map((f) => `  - ${f.logical_name} (${f.display_name}) [${f.type || "text"}]`)
    .join("\n");
  const tableList = tables.map((t) => `  - ${t.logical_name} (${t.display_name})`).join("\n");

  return `You design automation flows for a CRM's "Power Automation" engine. Given a user's request, output ONE JSON object describing the flow. Output ONLY the JSON — no prose, no markdown fences.

The flow runs on the "${ent.logical_name}" (${ent.display_name}) table.

TRIGGER: fires when a record on this table is created/updated.
  trigger_event: "create" | "update" | "both"
  field_logical_name: a field's logical_name to watch, or null for "any change"
  operator: ${TRIGGER_OPERATORS.join(" | ")}
    - changes_to: fires on transition INTO trigger_value
    - equals: fires whenever the field equals trigger_value
    - is_any_of: trigger_value is a comma-joined list
    - changes_from_to: trigger_value is "from>to"
    - changed: any change (no value)
  trigger_value: string (or null when operator is "changed")
  conditions: array of extra AND filters, each { field, operator, value } where
    operator is "equals" | "not_equals" | "is_empty" | "is_not_empty".

ACTIONS: an ordered array. Each action = { action_type, run_after, config }.
  run_after: ${RUN_AFTER.join(" | ")}  (success = run only if nothing before failed [default];
    failure = a catch step that runs only if an earlier step failed; always = a finally step)
  action_type + config shapes:
   - list_rows: { step_name, source_table, filters:[{field,operator,value}], columns:[logical...], limit }
       operators: equals|not_equals|contains|is_any_of|is_empty|is_not_empty. Publishes {{steps.<step_name>.*}}.
   - send_email: { to, cc, subject, body, email_account_id }
       to/cc/subject/body are templates. body is HTML. email_account_id: null for the default mailbox.
   - update_field: { target:"record"|"related", related_lookup_field?, field, value }
   - generate_document: { format:"xlsx"|"csv", filename, scope:"record"|"all", columns:[logical...] }

TOKENS usable in any template string:
  {{record.<logical_name>}}   a field on the triggering record
  {{record.url}}              a link to the triggering record
  {{record.regarding.url}}    for timeline notes/emails: a link to the PARENT record
  {{steps.<name>.count}}      row count from an earlier list_rows step
  {{steps.<name>.join(<col>, ';')}}   one column joined with ';' (great for email "to")
  {{steps.<name>.rows}}       an HTML table of the rows (for email bodies)

FIELDS on ${ent.logical_name}:
${fieldList || "  (none)"}

TABLES available for list_rows source_table:
${tableList}

Rules: use only fields/tables listed above; prefer real logical_names; keep it minimal and correct.
Also include a short "summary" string explaining the flow in one sentence.

Output JSON shape:
{ "name": string, "summary": string, "trigger": { trigger_event, field_logical_name, operator, trigger_value, conditions }, "actions": [ { action_type, run_after, config } ] }`;
}

function extractJson(text) {
  if (!text) throw new Error("empty AI response");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON found in AI response");
  return JSON.parse(text.slice(start, end + 1));
}

/** Light normalization so a slightly-off spec still applies cleanly. */
function normalizeSpec(spec, fields) {
  const fieldSet = new Set(fields.map((f) => f.logical_name));
  const warnings = [];

  const t = spec.trigger || {};
  if (!["create", "update", "both"].includes(t.trigger_event)) t.trigger_event = "update";
  if (!TRIGGER_OPERATORS.includes(t.operator)) t.operator = t.field_logical_name ? "changes_to" : "changed";
  if (t.field_logical_name && !fieldSet.has(t.field_logical_name)) {
    warnings.push(`trigger field "${t.field_logical_name}" not found on the table`);
  }
  if (!Array.isArray(t.conditions)) t.conditions = [];

  const actions = Array.isArray(spec.actions) ? spec.actions : [];
  for (const a of actions) {
    if (!ACTION_TYPES.includes(a.action_type)) warnings.push(`unknown action type "${a.action_type}"`);
    if (!RUN_AFTER.includes(a.run_after)) a.run_after = "success";
    if (!a.config || typeof a.config !== "object") a.config = {};
  }

  return {
    spec: {
      name: typeof spec.name === "string" ? spec.name : "AI-generated flow",
      summary: typeof spec.summary === "string" ? spec.summary : "",
      trigger: {
        trigger_event: t.trigger_event,
        field_logical_name: t.field_logical_name || null,
        operator: t.operator,
        trigger_value: t.trigger_value ?? null,
        conditions: t.conditions,
      },
      actions: actions.filter((a) => ACTION_TYPES.includes(a.action_type)),
    },
    warnings,
  };
}

async function buildFlowFromPrompt(pool, { prompt, table_logical_name }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error("AI is not configured: set ANTHROPIC_API_KEY in the server .env");
    err.statusCode = 503;
    throw err;
  }
  if (!prompt || !String(prompt).trim()) throw new Error("prompt is required");

  // Table is optional: when the caller doesn't pick one, let the AI infer it
  // from the prompt so the user can build a flow from text alone.
  const tableLogical = table_logical_name
    ? table_logical_name
    : await pickTableFromPrompt(pool, apiKey, prompt);

  const { ent, fields, tables } = await loadTableContext(pool, tableLogical);

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "medium" },
      system: systemPrompt(ent, fields, tables),
      messages: [{ role: "user", content: String(prompt).trim() }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    const err = new Error(`Anthropic API ${resp.status}: ${body.slice(0, 300)}`);
    err.statusCode = 502;
    throw err;
  }

  const data = await resp.json();
  if (data.stop_reason === "refusal") {
    const err = new Error("The AI declined this request.");
    err.statusCode = 422;
    throw err;
  }
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const raw = extractJson(text);
  const result = normalizeSpec(raw, fields);
  // Surface the table we ran on so callers that omitted it know what was picked.
  result.table_logical_name = ent.logical_name;
  return result;
}

module.exports = { buildFlowFromPrompt };
