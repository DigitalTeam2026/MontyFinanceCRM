import { supabase } from '../../lib/supabase';
import { getTable } from './metadata/metadataStore';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PK_OVERRIDES: Record<string, string> = {
  product_family: 'family_id',
  line_of_business: 'lob_id',
  crm_user: 'user_id',
  security_role: 'role_id',
  crm_source: 'source_id',
  marketing_email: 'email_id',
};

interface EntityMeta {
  table: string;
  pk: string;
  labelField: string;
}

const entityMetaCache = new Map<string, EntityMeta | null>();

async function resolveEntityMeta(entitySlugOrTable: string): Promise<EntityMeta | null> {
  if (entityMetaCache.has(entitySlugOrTable)) return entityMetaCache.get(entitySlugOrTable)!;
  const singular = entitySlugOrTable.replace(/s$/, '');
  // Callers pass either a logical name (e.g. "leadsource") or a physical table
  // name (e.g. "crm_leadsource" — labelResolver hands us lookup_entity.physical_
  // table_name). Match on both so prefixed tables (crm_*/timeline_*) resolve.
  const { data } = await supabase
    .from('entity_definition')
    .select('physical_table_name, primary_field_name, primary_key_column, logical_name')
    .or(`logical_name.eq.${entitySlugOrTable},logical_name.eq.${singular},physical_table_name.eq.${entitySlugOrTable}`)
    .maybeSingle();
  if (!data) { entityMetaCache.set(entitySlugOrTable, null); return null; }
  const table = data.physical_table_name;
  const meta: EntityMeta = {
    table,
    // Prefer the authoritative PK column; the ${table}_id convention breaks when
    // the table is prefixed (crm_leadsource → leadsource_id, not crm_leadsource_id).
    pk: data.primary_key_column ?? PK_OVERRIDES[table] ?? `${table}_id`,
    labelField: data.primary_field_name ?? 'name',
  };
  entityMetaCache.set(entitySlugOrTable, meta);
  return meta;
}

const lookupLabelCache = new Map<string, string>();

export async function resolveLookupLabel(
  entitySlugOrTable: string,
  id: string,
): Promise<string | null> {
  if (!id || !UUID_RE.test(id)) return null;
  const cacheKey = `${entitySlugOrTable}:${id}`;
  if (lookupLabelCache.has(cacheKey)) return lookupLabelCache.get(cacheKey)!;
  const meta = await resolveEntityMeta(entitySlugOrTable);
  if (!meta) return null;
  const { data } = await supabase
    .from(meta.table)
    .select(`${meta.pk}, ${meta.labelField}`)
    .eq(meta.pk, id)
    .maybeSingle();
  if (!data) return null;
  const label = String((data as unknown as Record<string, unknown>)[meta.labelField] ?? '');
  if (label) lookupLabelCache.set(cacheKey, label);
  return label || null;
}

export async function batchResolveLookupLabels(
  entitySlugOrTable: string,
  ids: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id) => id && UUID_RE.test(id)))];
  if (unique.length === 0) return {};
  const meta = await resolveEntityMeta(entitySlugOrTable);
  if (!meta) return {};

  const uncached: string[] = [];
  const result: Record<string, string> = {};
  for (const id of unique) {
    const ck = `${entitySlugOrTable}:${id}`;
    if (lookupLabelCache.has(ck)) {
      result[id] = lookupLabelCache.get(ck)!;
    } else {
      uncached.push(id);
    }
  }
  if (uncached.length === 0) return result;

  const { data } = await supabase
    .from(meta.table)
    .select(`${meta.pk}, ${meta.labelField}`)
    .in(meta.pk, uncached)
    .limit(1000);

  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const id = String(row[meta.pk]);
    const label = String(row[meta.labelField] ?? '');
    if (label) {
      result[id] = label;
      lookupLabelCache.set(`${entitySlugOrTable}:${id}`, label);
    }
  }
  return result;
}

const optionSetCache = new Map<string, Record<string, string>>();

let optionSetTableExists: boolean | null = null;

export async function resolveOptionSetLabel(
  optionSetName: string,
  rawValue: string,
): Promise<string | null> {
  let map = optionSetCache.get(optionSetName);
  if (!map) {
    const snap = getTable<{ value: string; display_label: string; option_set_id: string; is_active: boolean; display_order: number }>('option_set_value');
    if (snap !== null) {
      map = {};
      for (const r of snap
        .filter((r) => r.option_set_id === optionSetName && r.is_active === true)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))) {
        map[String(r.value)] = r.display_label;
      }
      optionSetCache.set(optionSetName, map);
    } else if (optionSetTableExists === false) {
      map = {};
      optionSetCache.set(optionSetName, map);
    } else {
      const { data, error } = await supabase
        .from('option_set_value')
        .select('value, display_label')
        .eq('option_set_id', optionSetName)
        .eq('is_active', true)
        .order('display_order');
      if (error && error.code === '42P01') {
        optionSetTableExists = false;
      } else if (!error) {
        optionSetTableExists = true;
      }
      map = {};
      for (const r of (data ?? []) as { value: string; display_label: string }[]) {
        map[String(r.value)] = r.display_label;
      }
      optionSetCache.set(optionSetName, map);
    }
  }
  return map[String(rawValue)] ?? null;
}

const stateCodeCache = new Map<string, Record<number, string>>();

export async function resolveStateCodeLabel(
  entityDefId: string,
  rawValue: number | string,
): Promise<string | null> {
  let map = stateCodeCache.get(entityDefId);
  if (!map) {
    map = {};
    const snap = getTable<{ state_value: number; display_label: string; entity_definition_id: string }>('statecode_definition');
    if (snap !== null) {
      for (const r of snap.filter((r) => r.entity_definition_id === entityDefId)) {
        map[r.state_value] = r.display_label;
      }
    } else {
      const { data } = await supabase
        .from('statecode_definition')
        .select('state_value, display_label')
        .eq('entity_definition_id', entityDefId);
      for (const r of (data ?? []) as { state_value: number; display_label: string }[]) {
        map[r.state_value] = r.display_label;
      }
    }
    stateCodeCache.set(entityDefId, map);
  }
  return map[Number(rawValue)] ?? null;
}

const statusReasonCache = new Map<string, Record<string, string>>();

export async function resolveStatusReasonLabel(
  entityDefId: string,
  rawValue: string,
): Promise<string | null> {
  let map = statusReasonCache.get(entityDefId);
  if (!map) {
    map = {};
    // Resolve labels regardless of is_active — some seeds (lead/opportunity) inserted
    // reason rows without setting is_active; filtering on it would leave the map empty
    // and leak raw codes. Mirrors resolveStatusReasonLabels in listService.ts.
    const snap = getTable<{ reason_value: string; display_label: string; entity_definition_id: string; is_active: boolean }>('status_reason_definition');
    if (snap !== null) {
      for (const r of snap.filter((r) => r.entity_definition_id === entityDefId)) {
        map[String(r.reason_value)] = r.display_label;
      }
    } else {
      const { data } = await supabase
        .from('status_reason_definition')
        .select('reason_value, display_label')
        .eq('entity_definition_id', entityDefId);
      for (const r of (data ?? []) as { reason_value: string; display_label: string }[]) {
        map[String(r.reason_value)] = r.display_label;
      }
    }
    statusReasonCache.set(entityDefId, map);
  }
  return map[String(rawValue)] ?? null;
}

export function isUUID(val: unknown): boolean {
  return typeof val === 'string' && UUID_RE.test(val);
}

export function formatBoolean(val: unknown): string {
  if (val === true || val === 'true' || val === 1 || val === '1') return 'Yes';
  if (val === false || val === 'false' || val === 0 || val === '0') return 'No';
  return String(val ?? '');
}

export function formatDate(val: unknown): string {
  if (!val) return '';
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(val: unknown): string {
  if (!val) return '';
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatCurrency(val: unknown, currencyCode?: string | null): string {
  const num = Number(val);
  if (isNaN(num)) return String(val ?? '');
  try {
    return new Intl.NumberFormat(undefined, {
      style: currencyCode ? 'currency' : 'decimal',
      currency: currencyCode || undefined,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return num.toFixed(2);
  }
}

export interface FieldMeta {
  fieldType: string;
  lookupEntitySlug?: string | null;
  optionSetName?: string | null;
  entityDefinitionId?: string | null;
  /** Inline choices from field_definition.config_json.choices. Choice options in this
   *  system are stored inline (the option_set/option_set_value tables are empty), so a
   *  choice field with no named option set MUST resolve through these or the raw code leaks. */
  inlineChoices?: { value: string; label: string }[] | null;
}

/** Map a single stored choice code (or a JSON array of codes) to its label(s) using inline choices. */
function mapInlineChoice(rawValue: unknown, choices: { value: string; label: string }[]): string | null {
  const map: Record<string, string> = {};
  for (const ch of choices) map[String(ch.value)] = ch.label;
  const raw = rawValue as unknown;
  let vals: string[] | null = null;
  if (Array.isArray(raw)) vals = (raw as unknown[]).map(String).filter(Boolean);
  else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try { vals = (JSON.parse(raw) as unknown[]).map(String).filter(Boolean); } catch { /* single */ }
  }
  if (vals !== null) {
    const labels = vals.map((v) => map[v] ?? v).filter(Boolean);
    return labels.length > 0 ? labels.join(', ') : null;
  }
  return map[String(rawValue)] ?? null;
}

export async function resolveDisplayValue(
  rawValue: unknown,
  fieldMeta: FieldMeta,
): Promise<string> {
  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') return '\u2014';
  const str = String(rawValue);
  const type = fieldMeta.fieldType;

  switch (type) {
    case 'lookup': {
      if (!isUUID(rawValue)) return str;
      if (fieldMeta.lookupEntitySlug) {
        const label = await resolveLookupLabel(fieldMeta.lookupEntitySlug, str);
        if (label) return label;
      }
      return str;
    }
    case 'boolean':
      return formatBoolean(rawValue);
    case 'choice':
    case 'multi_choice':
    case 'option_set':
    case 'multi_option_set': {
      // Inline choices are the primary storage in this system; try them first.
      if (fieldMeta.inlineChoices && fieldMeta.inlineChoices.length > 0) {
        const label = mapInlineChoice(rawValue, fieldMeta.inlineChoices);
        if (label) return label;
      }
      if (fieldMeta.optionSetName) {
        const label = await resolveOptionSetLabel(fieldMeta.optionSetName, str);
        if (label) return label;
      }
      return str;
    }
    case 'statecode': {
      if (fieldMeta.entityDefinitionId) {
        const label = await resolveStateCodeLabel(fieldMeta.entityDefinitionId, rawValue as number);
        if (label) return label;
      }
      return str;
    }
    case 'statusreason': {
      if (fieldMeta.entityDefinitionId) {
        const label = await resolveStatusReasonLabel(fieldMeta.entityDefinitionId, str);
        if (label) return label;
      }
      return str;
    }
    case 'date':
      return formatDate(rawValue);
    case 'datetime':
      return formatDateTime(rawValue);
    case 'currency':
      return formatCurrency(rawValue);
    case 'number':
    case 'decimal': {
      const num = Number(rawValue);
      return isNaN(num) ? str : num.toLocaleString();
    }
    case 'whole_number': {
      const num = Number(rawValue);
      return isNaN(num) ? str : `${num.toLocaleString()}%`;
    }
    default:
      if (isUUID(rawValue)) return str;
      return str;
  }
}

export async function resolveRecordDisplayValues(
  record: Record<string, unknown>,
  fieldMetas: Record<string, FieldMeta>,
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  const lookupBatches = new Map<string, { fields: string[]; ids: string[] }>();
  for (const [field, meta] of Object.entries(fieldMetas)) {
    const val = record[field];
    if (meta.fieldType === 'lookup' && meta.lookupEntitySlug && val && isUUID(val)) {
      const slug = meta.lookupEntitySlug;
      if (!lookupBatches.has(slug)) lookupBatches.set(slug, { fields: [], ids: [] });
      const batch = lookupBatches.get(slug)!;
      batch.fields.push(field);
      batch.ids.push(String(val));
    }
  }

  const lookupResults = new Map<string, Record<string, string>>();
  await Promise.all(
    [...lookupBatches.entries()].map(async ([slug, { ids }]) => {
      const labels = await batchResolveLookupLabels(slug, ids);
      lookupResults.set(slug, labels);
    }),
  );

  for (const [field, meta] of Object.entries(fieldMetas)) {
    const val = record[field];
    if (meta.fieldType === 'lookup' && meta.lookupEntitySlug && val && isUUID(val)) {
      const labels = lookupResults.get(meta.lookupEntitySlug);
      results[field] = labels?.[String(val)] ?? String(val);
    } else {
      results[field] = await resolveDisplayValue(val, meta);
    }
  }

  return results;
}

export function clearDisplayCaches(): void {
  entityMetaCache.clear();
  lookupLabelCache.clear();
  optionSetCache.clear();
  stateCodeCache.clear();
  statusReasonCache.clear();
}
