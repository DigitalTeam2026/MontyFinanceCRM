// Resolves raw physical values returned by the query engine into human labels —
// lookup display names, choice/option-set labels, status/state labels, Yes/No,
// and user names. Reuses the CRM's displayResolver so dashboards show exactly
// what the entity grids show (never GUIDs or numeric choice codes).

import { supabase } from '../../../lib/supabase';
import { fetchEntities } from '../../../services/entityService';
import { fetchFieldsForEntity } from '../../../services/fieldService';
import type { FieldDefinition } from '../../../types/field';
import {
  batchResolveLookupLabels, resolveOptionSetLabel, resolveStateCodeLabel,
  resolveStatusReasonLabel, formatBoolean, isUUID,
} from '../../../app/services/displayResolver';
import type { GroupBySpec } from '../types/dashboard';

export interface ColumnMeta {
  physical: string;
  fieldType: string;          // normalized: lookup | choice | boolean | statecode | statusreason | date | …
  lookupTable: string | null;
  optionSetName: string | null;
  inlineChoices: { value: string; label: string }[] | null;  // config_json.choices
  entityDefinitionId: string;
  isUser: boolean;
  displayName: string;
}

const USER_COLUMNS = new Set(['owner_id', 'created_by', 'modified_by', 'assigned_to']);

// ── entity → fields cache ──────────────────────────────────────────────────────
const fieldCache = new Map<string, { entityId: string; byColumn: Map<string, ColumnMeta>; fields: FieldDefinition[] }>();
let entityIndex: Promise<Map<string, string>> | null = null;

async function entityNameToId(): Promise<Map<string, string>> {
  if (!entityIndex) {
    entityIndex = fetchEntities().then((ents) => {
      const m = new Map<string, string>();
      for (const e of ents) {
        m.set(e.logical_name, e.entity_definition_id);
        m.set(e.physical_table_name, e.entity_definition_id);
      }
      return m;
    });
  }
  return entityIndex;
}

function normalizeFieldType(f: FieldDefinition): string {
  const phys = f.physical_column_name;
  if (phys === 'status_reason' || phys === 'statuscode') return 'statusreason';
  if (phys === 'state_code' || phys === 'statecode') return 'statecode';
  return f.field_type?.name ?? 'text';
}

export async function loadColumnMeta(entityName: string): Promise<{ entityId: string; byColumn: Map<string, ColumnMeta> } | null> {
  if (fieldCache.has(entityName)) {
    const c = fieldCache.get(entityName)!;
    return { entityId: c.entityId, byColumn: c.byColumn };
  }
  const idx = await entityNameToId();
  const entityId = idx.get(entityName);
  if (!entityId) return null;
  const fields = await fetchFieldsForEntity(entityId);
  const byColumn = new Map<string, ColumnMeta>();
  for (const f of fields) {
    const lookupTable = f.lookup_entity?.physical_table_name ?? null;
    const choices = (f.config_json as { choices?: { value: string; label: string }[] } | null)?.choices ?? null;
    byColumn.set(f.physical_column_name, {
      physical: f.physical_column_name,
      fieldType: normalizeFieldType(f),
      lookupTable,
      optionSetName: (f as unknown as { option_set_id?: string }).option_set_id ?? null,
      inlineChoices: choices && choices.length ? choices : null,
      entityDefinitionId: entityId,
      isUser: lookupTable === 'crm_user' || USER_COLUMNS.has(f.physical_column_name),
      displayName: f.display_name,
    });
  }
  fieldCache.set(entityName, { entityId, byColumn, fields });
  return { entityId, byColumn };
}

export function clearLabelResolverCache(): void {
  fieldCache.clear();
  entityIndex = null;
}

// ── batch user-name resolution (crm_user) ───────────────────────────────────────
async function resolveUserNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((v) => isUUID(v)))];
  if (!unique.length) return {};
  const { data } = await supabase.rpc('fn_get_user_display_map', { p_user_ids: unique });
  const map: Record<string, string> = {};
  for (const u of (data ?? []) as { user_id: string; display_name: string }[]) map[u.user_id] = u.display_name;
  return map;
}

// Resolve a set of raw values for a single column to a value→label map.
async function resolveColumnValueMap(meta: ColumnMeta, raws: unknown[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const strs = [...new Set(raws.filter((v) => v != null && v !== '').map(String))];
  if (!strs.length) return out;

  if (meta.isUser || (meta.fieldType === 'lookup' && meta.lookupTable === 'crm_user')) {
    const m = await resolveUserNames(strs);
    for (const [k, v] of Object.entries(m)) out.set(k, v);
    return out;
  }
  if (meta.fieldType === 'lookup' && meta.lookupTable) {
    const m = await batchResolveLookupLabels(meta.lookupTable, strs);
    for (const [k, v] of Object.entries(m)) out.set(k, v);
    return out;
  }
  if (meta.fieldType === 'boolean') {
    for (const s of strs) out.set(s, formatBoolean(s));
    return out;
  }
  if (meta.fieldType === 'choice' || meta.fieldType === 'multi_choice') {
    // Inline choices (config_json.choices) are the common case in this DB.
    if (meta.inlineChoices) {
      const m = new Map(meta.inlineChoices.map((c) => [String(c.value), c.label]));
      for (const s of strs) { const l = m.get(s); if (l) out.set(s, l); }
    } else if (meta.optionSetName) {
      for (const s of strs) { try { const l = await resolveOptionSetLabel(meta.optionSetName, s); if (l) out.set(s, l); } catch { /* option_set table absent */ } }
    }
    return out;
  }
  if (meta.fieldType === 'statusreason') {
    for (const s of strs) { const l = await resolveStatusReasonLabel(meta.entityDefinitionId, s); if (l) out.set(s, l); }
    return out;
  }
  if (meta.fieldType === 'statecode') {
    for (const s of strs) { const l = await resolveStateCodeLabel(meta.entityDefinitionId, s); if (l) out.set(s, l); }
    return out;
  }
  return out;
}

/**
 * Relabel aggregate-result dimension values in place (returns a new array).
 * Each groupBy maps a result key (alias) to its source field; we resolve the
 * values under that key. Date-grained dimensions are left untouched (formatted
 * downstream). Numeric measures are never touched.
 */
export async function resolveAggregateLabels(
  entityName: string | undefined, rows: Record<string, unknown>[], groupBy: GroupBySpec[],
): Promise<Record<string, unknown>[]> {
  if (!entityName || !rows.length || !groupBy.length) return rows;
  const meta = await loadColumnMeta(entityName);
  if (!meta) return rows;

  const maps: { key: string; map: Map<string, string> }[] = [];
  for (const g of groupBy) {
    if (g.dateGrain) continue;                         // dates handled by formatter
    const cm = meta.byColumn.get(g.field);
    if (!cm) continue;
    const key = g.alias || g.field;
    const map = await resolveColumnValueMap(cm, rows.map((r) => r[key]));
    if (map.size) maps.push({ key, map });
  }
  if (!maps.length) return rows;

  return rows.map((r) => {
    const next = { ...r };
    for (const { key, map } of maps) {
      const raw = r[key];
      if (raw != null && map.has(String(raw))) next[key] = map.get(String(raw));
    }
    return next;
  });
}

/** Relabel table/record rows — every displayed column resolved to its label. */
export async function resolveRecordLabels(
  entityName: string | undefined, rows: Record<string, unknown>[], columns: string[],
): Promise<Record<string, unknown>[]> {
  if (!entityName || !rows.length) return rows;
  const meta = await loadColumnMeta(entityName);
  if (!meta) return rows;

  const cols = columns.length ? columns : Object.keys(rows[0]);
  const maps: { key: string; map: Map<string, string> }[] = [];
  for (const col of cols) {
    const cm = meta.byColumn.get(col);
    if (!cm) continue;
    if (!['lookup', 'choice', 'multi_choice', 'boolean', 'statusreason', 'statecode'].includes(cm.fieldType)) continue;
    const map = await resolveColumnValueMap(cm, rows.map((r) => r[col]));
    if (map.size) maps.push({ key: col, map });
  }
  if (!maps.length) return rows;

  return rows.map((r) => {
    const next = { ...r };
    for (const { key, map } of maps) {
      const raw = r[key];
      if (raw != null && map.has(String(raw))) next[key] = map.get(String(raw));
    }
    return next;
  });
}

// ── filter/condition value options (label-driven pickers) ───────────────────────
export interface FilterValueOption { value: string; label: string }
export interface FilterFieldInfo { kind: 'choice' | 'boolean' | 'lookup' | 'text'; options: FilterValueOption[] }

export async function getFilterFieldInfo(entityName: string, physicalColumn: string): Promise<FilterFieldInfo> {
  const meta = await loadColumnMeta(entityName);
  const cm = meta?.byColumn.get(physicalColumn);
  if (!cm) return { kind: 'text', options: [] };

  if (cm.fieldType === 'boolean') {
    return { kind: 'boolean', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] };
  }

  const field = fieldCache.get(entityName)?.fields.find((f) => f.physical_column_name === physicalColumn);

  if (cm.fieldType === 'choice' || cm.fieldType === 'multi_choice') {
    const inline = (field?.config_json as { choices?: FilterValueOption[] } | null)?.choices;
    if (inline?.length) return { kind: 'choice', options: inline };
    if (cm.optionSetName) {
      const { data } = await supabase.from('option_set_value')
        .select('value, display_label').eq('option_set_id', cm.optionSetName).eq('is_active', true).order('display_order');
      return { kind: 'choice', options: (data ?? []).map((r: { value: string; display_label: string }) => ({ value: String(r.value), label: r.display_label })) };
    }
    return { kind: 'choice', options: [] };
  }
  if (cm.fieldType === 'statusreason') {
    const { data } = await supabase.from('status_reason_definition')
      .select('reason_value, display_label').eq('entity_definition_id', cm.entityDefinitionId).eq('is_active', true);
    return { kind: 'choice', options: (data ?? []).map((r: { reason_value: string; display_label: string }) => ({ value: String(r.reason_value), label: r.display_label })) };
  }
  if (cm.fieldType === 'statecode') {
    const { data } = await supabase.from('statecode_definition')
      .select('state_value, display_label').eq('entity_definition_id', cm.entityDefinitionId);
    return { kind: 'choice', options: (data ?? []).map((r: { state_value: number; display_label: string }) => ({ value: String(r.state_value), label: r.display_label })) };
  }
  if (cm.fieldType === 'lookup' && cm.lookupTable) {
    if (cm.isUser || cm.lookupTable === 'crm_user') {
      const { data } = await supabase.rpc('list_active_crm_users');
      return { kind: 'lookup', options: (data ?? []).map((u: { user_id: string; display_name?: string; full_name?: string; email?: string }) => ({ value: u.user_id, label: u.display_name || u.full_name || u.email || u.user_id })) };
    }
    const pk = `${cm.lookupTable}_id`;
    const { data } = await supabase.from(cm.lookupTable).select('*').limit(200);
    const opts: FilterValueOption[] = (data ?? []).map((r: Record<string, unknown>) => ({
      value: String(r[pk] ?? Object.values(r)[0]),
      label: String(r.name ?? r.full_name ?? r.topic ?? r.title ?? Object.values(r)[1] ?? r[pk]),
    }));
    return { kind: 'lookup', options: opts };
  }
  return { kind: 'text', options: [] };
}
