// Resolves the DISPLAY LABEL for a read-only "borrowed" field shown on a form
// (a column pulled from a related entity via an N:1 FK — see RecordFormPage's
// collectBorrowedSpecs / fetchBorrowedFieldValues). A borrowed field stores only
// its raw column value (e.g. a choice code "1", a boolean, or a lookup id/GUID);
// this turns that into the same human label the field shows on its own form:
//   choice / option-set  -> the option's label ("1" -> "Branch")
//   boolean / two-options -> "Yes" / "No" (or the field's custom true/false labels)
//   lookup / owner        -> the related record's name (GUID -> "Acme Corp")
//
// Metadata is read live from field_definition (by field_definition_id) so it works
// for borrowed fields that were added before this resolution existed — nothing is
// baked into the saved layout.

import { supabase } from '../../lib/supabase';
import { fetchNestedLabelMap, LOOKUP_LABEL_FALLBACKS } from './lookupLabel';

/** Field types whose stored value is a code/id and must be resolved to a label.
 *  Anything not in here (text, number, date, currency, …) is shown as-is. */
const BOOLEAN_TYPES = new Set(['boolean', 'two_options', 'twooptions', 'bool', 'yesno', 'yes_no']);
const CHOICE_TYPES = new Set([
  'choice', 'multi_choice', 'multichoice', 'option_set', 'optionset',
  'multi_option_set', 'multioptionset', 'picklist',
]);
const LOOKUP_TYPES = new Set(['lookup', 'owner', 'customer']);

/** True when a borrowed field of this type needs its value mapped to a label
 *  (and therefore rendered as read-only text rather than a typed input). */
export function borrowedTypeIsLabelResolved(typeName: string | null | undefined): boolean {
  const t = (typeName ?? '').toLowerCase();
  return BOOLEAN_TYPES.has(t) || CHOICE_TYPES.has(t) || LOOKUP_TYPES.has(t);
}

export interface BorrowedResolveItem {
  controlId: string;
  fieldDefinitionId: string;
  fieldTypeName: string | null;
  rawValue: unknown;
}

interface FieldMeta {
  config: Record<string, unknown> | null;
  lookupTable?: string;
  lookupLabelField?: string;
  lookupPk?: string;
}

const hasVal = (v: unknown): boolean => v != null && !(typeof v === 'string' && v.trim() === '');

/** Batch-load resolution metadata (config_json + lookup target) for the given field ids. */
async function fetchFieldMeta(ids: string[]): Promise<Record<string, FieldMeta>> {
  const out: Record<string, FieldMeta> = {};
  if (ids.length === 0) return out;
  const { data } = await supabase
    .from('field_definition')
    .select(
      'field_definition_id, config_json, lookup_entity_id, ' +
      'lookup_entity:entity_definition!lookup_entity_id(physical_table_name, primary_field_name, primary_key_column)',
    )
    .in('field_definition_id', ids);
  for (const r of (data ?? []) as unknown as Array<{
    field_definition_id: string;
    config_json: Record<string, unknown> | null;
    lookup_entity?: { physical_table_name?: string; primary_field_name?: string; primary_key_column?: string | null } | null;
  }>) {
    const le = r.lookup_entity ?? null;
    const table = le?.physical_table_name;
    out[r.field_definition_id] = {
      config: r.config_json ?? null,
      lookupTable: table,
      lookupLabelField: table === 'crm_user' ? 'email' : (le?.primary_field_name ?? 'name'),
      lookupPk: le?.primary_key_column ?? undefined,
    };
  }
  return out;
}

/** Build a value→label map for a choice field from a named option set (queried) or inline choices. */
async function optionMapFor(meta: FieldMeta | undefined): Promise<Record<string, string>> {
  const cfg = meta?.config ?? {};
  const inline = cfg.choices as Array<{ value: unknown; label: string }> | undefined;
  if (Array.isArray(inline) && inline.length) {
    const m: Record<string, string> = {};
    for (const c of inline) m[String(c.value)] = c.label;
    return m;
  }
  const osName = cfg.option_set_name as string | undefined;
  if (!osName) return {};
  const { data } = await supabase
    .from('option_set_value')
    .select('value, display_label')
    .eq('option_set_id', osName)
    .eq('is_active', true)
    .order('display_order');
  const m: Record<string, string> = {};
  for (const r of (data ?? []) as { value: unknown; display_label: string }[]) {
    m[String(r.value)] = r.display_label;
  }
  return m;
}

/** Map a (possibly multi) choice raw value to its label(s) via a value→label map. */
function applyChoiceMap(raw: unknown, map: Record<string, string>): string {
  let vals: string[] | null = null;
  if (Array.isArray(raw)) {
    vals = raw.map(String).filter(Boolean);
  } else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try { vals = (JSON.parse(raw) as unknown[]).map(String).filter(Boolean); } catch { /* single */ }
  }
  if (vals) return vals.map((v) => map[v] ?? v).join(', ');
  return map[String(raw)] ?? String(raw);
}

/** Map a boolean-ish raw value to a Yes/No-style label (honouring custom labels in config). */
function applyBoolean(raw: unknown, cfg: Record<string, unknown> | null): string {
  const truthy = raw === true || raw === 1 || raw === '1' || raw === 't' || raw === 'true';
  const trueLabel = (cfg?.true_label as string) || (cfg?.trueLabel as string) || 'Yes';
  const falseLabel = (cfg?.false_label as string) || (cfg?.falseLabel as string) || 'No';
  return truthy ? trueLabel : falseLabel;
}

/**
 * Resolve display labels for a batch of borrowed items. Returns a map controlId →
 * label, ONLY for items whose type needs resolution and whose value resolved to a
 * label. Callers overlay this onto the raw values (so unresolved items keep raw).
 */
export async function resolveBorrowedLabels(
  items: BorrowedResolveItem[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const targets = items.filter(
    (i) => i.fieldDefinitionId && borrowedTypeIsLabelResolved(i.fieldTypeName) && hasVal(i.rawValue),
  );
  if (targets.length === 0) return out;

  const meta = await fetchFieldMeta([...new Set(targets.map((i) => i.fieldDefinitionId))]);

  // Choice/option-set: one option map per distinct field, then apply.
  const choiceItems = targets.filter((i) => CHOICE_TYPES.has((i.fieldTypeName ?? '').toLowerCase()));
  const optionMaps = new Map<string, Record<string, string>>();
  await Promise.all(
    [...new Set(choiceItems.map((i) => i.fieldDefinitionId))].map(async (fid) => {
      optionMaps.set(fid, await optionMapFor(meta[fid]));
    }),
  );
  for (const i of choiceItems) {
    out[i.controlId] = applyChoiceMap(i.rawValue, optionMaps.get(i.fieldDefinitionId) ?? {});
  }

  // Boolean: no query needed.
  for (const i of targets.filter((i) => BOOLEAN_TYPES.has((i.fieldTypeName ?? '').toLowerCase()))) {
    out[i.controlId] = applyBoolean(i.rawValue, meta[i.fieldDefinitionId]?.config ?? null);
  }

  // Lookup/owner: resolve ids → related record names, batched per target table.
  const lookupItems = targets.filter((i) => LOOKUP_TYPES.has((i.fieldTypeName ?? '').toLowerCase()));
  const byTable = new Map<string, { labelField: string; pk?: string; items: BorrowedResolveItem[] }>();
  for (const i of lookupItems) {
    const m = meta[i.fieldDefinitionId];
    const table = m?.lookupTable ?? (LOOKUP_TYPES.has((i.fieldTypeName ?? '').toLowerCase()) && !m?.lookupTable ? 'crm_user' : undefined);
    if (!table) continue;
    if (!byTable.has(table)) byTable.set(table, { labelField: m?.lookupLabelField ?? 'name', pk: m?.lookupPk, items: [] });
    byTable.get(table)!.items.push(i);
  }
  await Promise.all(
    [...byTable.entries()].map(async ([table, g]) => {
      const map = await fetchNestedLabelMap(
        table,
        g.items.map((i) => String(i.rawValue)),
        g.labelField,
        LOOKUP_LABEL_FALLBACKS[table] ?? [],
        g.pk,
      );
      for (const i of g.items) {
        const lbl = map[String(i.rawValue)];
        if (lbl) out[i.controlId] = lbl;
      }
    }),
  );

  return out;
}
