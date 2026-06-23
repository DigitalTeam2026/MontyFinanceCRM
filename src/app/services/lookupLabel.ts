// Shared lookup-label resolution used by both the grid (gridResolver) and the
// column filter popover (ColumnFilterDropdown) so they always display/search the
// SAME field. When a lookup table's primary field is empty (e.g. lead.name is
// blank but lead.topic is populated) these fallbacks fill the gap.

import { supabase } from '../../lib/supabase';
import { getTable } from './metadata/metadataStore';
import { fetchFieldsForEntity } from '../../services/fieldService';

export const LOOKUP_LABEL_FALLBACKS: Record<string, string[]> = {
  lead: ['topic', 'company_name', 'email'],
  contact: ['email', 'business_phone'],
};

const hasValue = (v: unknown): boolean =>
  v != null && (typeof v !== 'string' || v.trim() !== '');

/** Pick the first non-empty value among the primary field then the fallbacks. */
export function pickLookupLabel(
  row: Record<string, unknown>,
  primaryField: string,
  fallbacks: string[] = [],
): string {
  if (hasValue(row[primaryField])) return String(row[primaryField]);
  for (const f of fallbacks) {
    if (hasValue(row[f])) return String(row[f]);
  }
  return '';
}

/** The distinct columns to SELECT/search for a lookup: primary first, then any
 *  fallbacks not already included. */
export function lookupLabelColumns(primaryField: string, table: string): string[] {
  const fallbacks = LOOKUP_LABEL_FALLBACKS[table] ?? [];
  return [...new Set([primaryField, ...fallbacks])].filter(Boolean);
}

/** When a lookup column is filtered/displayed BY another lookup field (e.g. show
 *  the "Originating Lead" picker by each lead's Account), the chosen field is
 *  itself a foreign key. This resolves — from published metadata — the nested
 *  target table + its display field so we can show the related record's NAME
 *  instead of a raw id. Returns { isNested:false } for plain (text/choice) fields. */
export interface NestedLabelSpec {
  isNested: boolean;
  /** FK column on the lookup table (e.g. "account_id" on lead) */
  fkColumn?: string;
  /** Nested target table (e.g. "account") */
  table?: string;
  /** Display field on the nested target (e.g. "account_name", or "email" for users) */
  labelField?: string;
  /** Nested target primary key, when known from metadata */
  pk?: string;
  fallbackFields?: string[];
}

/** The entity's primary display field for a table (used when reverting to default). */
export function resolvePrimaryLabelField(table: string): string {
  if (table === 'crm_user') return 'email';
  const ents = getTable<Record<string, unknown>>('entity_definition');
  const ent = ents?.find((e) => e.physical_table_name === table);
  return (ent?.primary_field_name as string) ?? 'name';
}

// Field types that can't serve as a display/search label. Lookup/owner ARE allowed
// (they resolve to the related record's name).
const PICK_EXCLUDE_TYPES = new Set(['boolean', 'two_options', 'twooptions', 'file', 'image']);

/** Options for the "filter / search by field" picker: the lookup entity's fields,
 *  with relationship fields marked (↗) since they show the related record's name. */
export async function fetchLookupFieldOptions(
  table: string,
): Promise<{ value: string; label: string }[]> {
  const ents = getTable<Record<string, unknown>>('entity_definition');
  let entId = ents?.find((e) => e.physical_table_name === table)?.entity_definition_id as string | undefined;
  if (!entId) {
    const { data } = await supabase
      .from('entity_definition')
      .select('entity_definition_id')
      .eq('physical_table_name', table)
      .maybeSingle();
    entId = data?.entity_definition_id as string | undefined;
  }
  if (!entId) return [];
  const fields = await fetchFieldsForEntity(entId);
  return fields
    .filter((f) =>
      f.physical_column_name &&
      !PICK_EXCLUDE_TYPES.has(((f.field_type as { name?: string } | null)?.name ?? '').toLowerCase()))
    .map((f) => {
      const t = ((f.field_type as { name?: string } | null)?.name ?? '').toLowerCase();
      const isRel = t === 'lookup' || t === 'owner';
      return { value: f.physical_column_name as string, label: isRel ? `${f.display_name}  ↗` : f.display_name };
    });
}

export function resolveNestedLabel(
  lookupTable: string | undefined | null,
  labelField: string | undefined | null,
): NestedLabelSpec {
  if (!lookupTable || !labelField) return { isNested: false };
  const fields = getTable<Record<string, unknown>>('field_definition');
  const ents = getTable<Record<string, unknown>>('entity_definition');
  if (!fields || !ents) return { isNested: false };
  const ent = ents.find((e) => e.physical_table_name === lookupTable);
  if (!ent) return { isNested: false };
  const fd = fields.find((f) =>
    f.entity_definition_id === ent.entity_definition_id &&
    f.physical_column_name === labelField);
  const nestedEntId = fd?.lookup_entity_id as string | undefined;
  if (!nestedEntId) return { isNested: false };
  const target = ents.find((e) => e.entity_definition_id === nestedEntId);
  if (!target) return { isNested: false };
  const table = target.physical_table_name as string;
  return {
    isNested: true,
    fkColumn: labelField,
    table,
    labelField: table === 'crm_user' ? 'email' : ((target.primary_field_name as string) ?? 'name'),
    pk: (target.primary_key_column as string | null) ?? undefined,
    fallbackFields: LOOKUP_LABEL_FALLBACKS[table],
  };
}

/** Resolve a batch of nested-target ids → display labels (related record names).
 *  crm_user goes through the user display RPC; everything else is a single
 *  select on the nested table with the same fallback logic as direct lookups. */
export async function fetchNestedLabelMap(
  table: string,
  ids: Array<string | null | undefined>,
  labelField: string,
  fallbacks: string[] = [],
  pk?: string,
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];
  if (uniqueIds.length === 0) return {};
  if (table === 'crm_user') {
    const { data } = await supabase.rpc('fn_get_user_display_map', { p_user_ids: uniqueIds });
    const map: Record<string, string> = {};
    for (const u of (data ?? []) as { user_id: string; display_name: string }[]) {
      map[u.user_id] = u.display_name;
    }
    return map;
  }
  const realPk = pk ?? `${table.replace(/^crm_/, '')}_id`;
  const sel = [...new Set([realPk, labelField, ...fallbacks])].join(', ');
  const { data } = await supabase.from(table).select(sel).in(realPk, uniqueIds).limit(1000);
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const lbl = pickLookupLabel(r, labelField, fallbacks);
    if (lbl) map[String(r[realPk])] = lbl;
  }
  return map;
}
