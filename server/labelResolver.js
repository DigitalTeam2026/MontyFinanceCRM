// server/labelResolver.js
// Server-side "raw code → label" resolution for Power Automation outputs (generated
// documents, list_rows tables, {{record.field}} email tokens). The frontend resolves
// choice/lookup/statecode codes before display, but the automation worker reads raw
// physical columns straight from Postgres, so without this it emits raw codes/UUIDs.
//
// Mirrors the frontend rules: choice options live INLINE in config_json.choices
// (option_set tables are empty); state_code / status_reason resolve via their
// definition tables; lookups resolve to the target entity's primary_field_name.
//
// All resolvers are async and memoize within the pool's lifetime.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const lookupEntityCache = new Map(); // entity_definition_id -> {table, pk, labelField} | null
const lookupLabelCache = new Map();  // `${table}:${id}` -> label | null
const stateCache = new Map();        // `${entityDefId}:${val}` -> label | null
const reasonCache = new Map();       // `${entityDefId}:${val}` -> label | null

async function getLookupEntity(pool, entityDefinitionId) {
  if (lookupEntityCache.has(entityDefinitionId)) return lookupEntityCache.get(entityDefinitionId);
  const r = await pool.query(
    `select physical_table_name, primary_key_column, primary_field_name
       from entity_definition where entity_definition_id = $1 limit 1`,
    [entityDefinitionId]
  );
  const row = r.rows[0];
  const meta = row
    ? { table: row.physical_table_name, pk: row.primary_key_column, labelField: row.primary_field_name || 'name' }
    : null;
  lookupEntityCache.set(entityDefinitionId, meta);
  return meta;
}

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function safeIdent(name) { return IDENT_RE.test(String(name)); }

async function resolveLookup(pool, lookupEntityId, id) {
  if (!id || !UUID_RE.test(String(id))) return null;
  const meta = await getLookupEntity(pool, lookupEntityId);
  if (!meta || !meta.table || !meta.pk || !meta.labelField) return null;
  if (!safeIdent(meta.table) || !safeIdent(meta.pk) || !safeIdent(meta.labelField)) return null;
  const key = `${meta.table}:${id}`;
  if (lookupLabelCache.has(key)) return lookupLabelCache.get(key);
  const r = await pool.query(
    `select "${meta.labelField}" as label from "${meta.table}" where "${meta.pk}" = $1 limit 1`,
    [id]
  );
  const label = r.rows[0] && r.rows[0].label != null ? String(r.rows[0].label) : null;
  lookupLabelCache.set(key, label);
  return label;
}

async function resolveStatecode(pool, entityDefinitionId, value) {
  const key = `${entityDefinitionId}:${value}`;
  if (stateCache.has(key)) return stateCache.get(key);
  const r = await pool.query(
    `select display_label from statecode_definition where entity_definition_id = $1 and state_value = $2 limit 1`,
    [entityDefinitionId, Number(value)]
  );
  const label = r.rows[0] ? r.rows[0].display_label : null;
  stateCache.set(key, label);
  return label;
}

async function resolveStatusreason(pool, entityDefinitionId, value) {
  const key = `${entityDefinitionId}:${value}`;
  if (reasonCache.has(key)) return reasonCache.get(key);
  const r = await pool.query(
    `select display_label from status_reason_definition where entity_definition_id = $1 and reason_value = $2 limit 1`,
    [entityDefinitionId, Number(value)]
  );
  const label = r.rows[0] ? r.rows[0].display_label : null;
  reasonCache.set(key, label);
  return label;
}

function mapInlineChoice(configJson, value) {
  const choices = configJson && Array.isArray(configJson.choices) ? configJson.choices : null;
  if (!choices || choices.length === 0) return null;
  const map = {};
  for (const ch of choices) map[String(ch.value)] = ch.label;
  // multi-choice values may be a JSON array string.
  let vals = null;
  if (Array.isArray(value)) vals = value.map(String).filter(Boolean);
  else if (typeof value === 'string' && value.trim().startsWith('[')) {
    try { vals = JSON.parse(value).map(String).filter(Boolean); } catch { /* single */ }
  }
  if (vals) {
    const labels = vals.map((v) => map[v] != null ? map[v] : v).filter(Boolean);
    return labels.length ? labels.join(', ') : null;
  }
  return map[String(value)] != null ? map[String(value)] : null;
}

/**
 * Resolve one field's raw stored value to its human label. `fieldMeta` is a row from
 * automationWorker.getFields (has: type, lookup_entity_id, config_json,
 * physical_column_name). `entityDefinitionId` is the OWNING entity (for state/status).
 * Returns a display string (falls back to the raw value stringified).
 */
async function resolveFieldDisplay(pool, fieldMeta, entityDefinitionId, value) {
  if (value == null) return '';
  const type = fieldMeta && fieldMeta.type;
  const cfg = fieldMeta && fieldMeta.config_json;
  const phys = fieldMeta && fieldMeta.physical_column_name;

  // statecode / statusreason (no option set — definition tables).
  if ((cfg && cfg.is_statecode_field) || phys === 'state_code') {
    const l = await resolveStatecode(pool, entityDefinitionId, value);
    return l != null ? l : String(value);
  }
  if ((cfg && cfg.is_statusreason_field) || phys === 'status_reason') {
    const l = await resolveStatusreason(pool, entityDefinitionId, value);
    return l != null ? l : String(value);
  }

  if ((type === 'lookup' || type === 'owner') && fieldMeta.lookup_entity_id) {
    const l = await resolveLookup(pool, fieldMeta.lookup_entity_id, value);
    return l != null ? l : String(value);
  }

  if (type === 'boolean') {
    if (value === true || value === 'true' || value === 1 || value === '1') return 'Yes';
    if (value === false || value === 'false' || value === 0 || value === '0') return 'No';
    return String(value);
  }

  if (type === 'choice' || type === 'multi_choice' || type === 'option_set' || type === 'multi_option_set') {
    const l = mapInlineChoice(cfg, value);
    return l != null ? l : String(value);
  }

  return String(value);
}

/**
 * Resolve a whole logical-keyed record ({field: value}) to display labels.
 * `fields` is the getFields() result for the entity. Returns a new object.
 */
async function resolveLogicalRecordDisplay(pool, entityDefinitionId, fields, logicalRecord) {
  const out = {};
  await Promise.all(Object.keys(logicalRecord || {}).map(async (logical) => {
    const meta = fields.byLogical.get(logical);
    out[logical] = meta
      ? await resolveFieldDisplay(pool, meta, entityDefinitionId, logicalRecord[logical])
      : (logicalRecord[logical] == null ? '' : String(logicalRecord[logical]));
  }));
  return out;
}

module.exports = {
  resolveFieldDisplay,
  resolveLogicalRecordDisplay,
};
