// Shared "code → label" resolver for audit / history surfaces (Field Change History,
// Merge Audit). These read field_change_log / audit_log rows whose old/new values are
// stored as raw codes (choice codes, state_code / status_reason ints). Given an entity's
// field metadata we resolve those codes to labels so the audit trail never shows a raw
// "1"/"2". Lookups (UUIDs) are resolved separately by each caller.
//
// Choice options are stored INLINE in field_definition.config_json.choices (the
// option_set/option_set_value tables are empty), so inline choices are the primary source.

import { supabase } from '../../lib/supabase';
import { resolveStateCodeLabel, resolveStatusReasonLabel } from './displayResolver';

interface FieldCodeEntry {
  statusKind?: 'statecode' | 'statusreason';
  choices?: Record<string, string>;
}

export interface EntityFieldCodeMeta {
  entityDefinitionId: string;
  /** Keyed by BOTH logical_name and physical_column_name (audit logs use the logical key). */
  byName: Map<string, FieldCodeEntry>;
}

const metaCache = new Map<string, EntityFieldCodeMeta>();

export function clearFieldCodeMetaCache(): void {
  metaCache.clear();
}

/** Load the choice / statecode / statusreason fields for one entity (cached). */
export async function loadEntityFieldCodeMeta(entityDefinitionId: string): Promise<EntityFieldCodeMeta> {
  const cached = metaCache.get(entityDefinitionId);
  if (cached) return cached;

  const { data } = await supabase
    .from('field_definition')
    .select('logical_name, physical_column_name, config_json, field_type(name)')
    .eq('entity_definition_id', entityDefinitionId)
    .is('deleted_at', null);

  const byName = new Map<string, FieldCodeEntry>();
  for (const f of (data ?? []) as Record<string, unknown>[]) {
    const ftName = (f.field_type as { name?: string } | null)?.name ?? '';
    const cfg = f.config_json as { choices?: { value: string; label: string }[]; is_statecode_field?: boolean; is_statusreason_field?: boolean } | null;
    const phys = f.physical_column_name as string | null;
    let entry: FieldCodeEntry | null = null;

    if (cfg?.is_statecode_field || phys === 'state_code') entry = { statusKind: 'statecode' };
    else if (cfg?.is_statusreason_field || phys === 'status_reason') entry = { statusKind: 'statusreason' };
    else if (['choice', 'multi_choice', 'option_set', 'multi_option_set'].includes(ftName)
      && Array.isArray(cfg?.choices) && cfg!.choices!.length > 0) {
      const map: Record<string, string> = {};
      for (const ch of cfg!.choices!) map[String(ch.value)] = ch.label;
      entry = { choices: map };
    }

    if (entry) {
      const logical = f.logical_name as string | null;
      if (logical) byName.set(logical, entry);
      if (phys) byName.set(phys, entry);
    }
  }

  const meta: EntityFieldCodeMeta = { entityDefinitionId, byName };
  metaCache.set(entityDefinitionId, meta);
  return meta;
}

/** Load field code metadata by the entity's logical name (resolves the id first). */
export async function loadEntityFieldCodeMetaByLogical(logicalName: string): Promise<EntityFieldCodeMeta | null> {
  const singular = logicalName.replace(/s$/, '');
  const { data } = await supabase
    .from('entity_definition')
    .select('entity_definition_id')
    .or(`logical_name.eq.${logicalName},logical_name.eq.${singular}`)
    .maybeSingle();
  const id = data?.entity_definition_id as string | undefined;
  if (!id) return null;
  return loadEntityFieldCodeMeta(id);
}

/** Resolve one field's raw stored code to its label; null when the field isn't a
 *  code field or the value has no matching option. Handles multi-choice JSON arrays. */
export async function resolveFieldCode(
  meta: EntityFieldCodeMeta,
  fieldName: string,
  raw: unknown,
): Promise<string | null> {
  const entry = meta.byName.get(fieldName);
  if (!entry || raw == null || raw === '') return null;

  if (entry.choices) {
    const map = entry.choices;
    let vals: string[] | null = null;
    if (Array.isArray(raw)) vals = (raw as unknown[]).map(String).filter(Boolean);
    else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
      try { vals = (JSON.parse(raw) as unknown[]).map(String).filter(Boolean); } catch { /* single */ }
    }
    if (vals !== null) {
      const labels = vals.map((v) => map[v] ?? v).filter(Boolean);
      return labels.length > 0 ? labels.join(', ') : null;
    }
    return map[String(raw)] ?? null;
  }

  if (entry.statusKind === 'statecode') return resolveStateCodeLabel(meta.entityDefinitionId, String(raw));
  if (entry.statusKind === 'statusreason') return resolveStatusReasonLabel(meta.entityDefinitionId, String(raw));
  return null;
}
