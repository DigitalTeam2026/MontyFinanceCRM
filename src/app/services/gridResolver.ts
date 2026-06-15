import { supabase } from '../../lib/supabase';
import type { ColumnState } from '../components/ColumnCustomizer';
import type { ListRow } from './listService';
import { getTable } from './metadata/metadataStore';

export interface LookupSpec {
  colKey: string;
  fkColumn: string;
  lookupTable: string;
  lookupLabelField: string;
  fallbackFields?: string[];
}

export interface OptionSetSpec {
  colKey: string;
  physicalColumn: string;
  optionSetId: string;
}

export interface InlineChoiceSpec {
  colKey: string;
  physicalColumn: string;
  choices: { value: string; label: string }[];
}

const LABEL_FALLBACKS: Record<string, string[]> = {
  lead: ['topic', 'company_name', 'email'],
  contact: ['email', 'business_phone'],
};

const PK_OVERRIDES: Record<string, string> = {
  product_family: 'family_id',
  line_of_business: 'lob_id',
  crm_user: 'user_id',
  security_role: 'role_id',
  crm_source: 'source_id',
  marketing_email: 'email_id',
};

export function buildLookupSpecs(columns: ColumnState[]): LookupSpec[] {
  const specs: LookupSpec[] = [];
  for (const c of columns) {
    if (!c.visible) continue;
    if (c.relationship_definition_id) continue;
    if (!c.lookup_table || !c.lookup_label_field) continue;
    const fkCol = c.field_physical_column ?? c.key;
    if (fkCol === 'owner_id' || fkCol === 'ownerid') continue;
    specs.push({
      colKey: c.key,
      fkColumn: fkCol,
      lookupTable: c.lookup_table,
      lookupLabelField: c.lookup_label_field,
      fallbackFields: LABEL_FALLBACKS[c.lookup_table],
    });
  }

  return specs;
}

export function buildInlineChoiceSpecs(columns: ColumnState[]): InlineChoiceSpec[] {
  const specs: InlineChoiceSpec[] = [];
  for (const c of columns) {
    if (!c.visible) continue;
    if (!c.inline_choices || c.inline_choices.length === 0) continue;
    const phys = c.field_physical_column ?? c.key;
    specs.push({ colKey: c.key, physicalColumn: phys, choices: c.inline_choices });
  }
  return specs;
}

export function buildOptionSetSpecs(columns: ColumnState[]): OptionSetSpec[] {
  const specs: OptionSetSpec[] = [];
  for (const c of columns) {
    if (!c.visible) continue;
    if (!c.option_set_name) continue;
    if (c.type !== 'badge' && c.type !== 'multi_badge' && c.type !== 'choice' && c.type !== 'multi_choice') continue;
    const phys = c.field_physical_column ?? c.key;
    if (phys === 'state_code' || phys === 'status_reason') continue;
    specs.push({
      colKey: c.key,
      physicalColumn: phys,
      optionSetId: c.option_set_name,
    });
  }
  return specs;
}

const optionSetCache = new Map<string, Record<string, string>>();
let optionSetTableExists: boolean | null = null;

/** Drop the grid option-set cache after a publish (see metadata/cacheBus.ts). */
export function resetGridOptionSetCache(): void {
  optionSetCache.clear();
}

async function resolveOptionSetLabels(optionSetId: string): Promise<Record<string, string>> {
  const cached = optionSetCache.get(optionSetId);
  if (cached) return cached;

  const snap = getTable<{ value: string; display_label: string; option_set_id: string; is_active: boolean; display_order: number }>('option_set_value');
  if (snap !== null) {
    const map: Record<string, string> = {};
    for (const r of snap
      .filter((r) => r.option_set_id === optionSetId && r.is_active === true)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))) {
      map[String(r.value)] = r.display_label;
    }
    optionSetCache.set(optionSetId, map);
    return map;
  }

  if (optionSetTableExists === false) {
    const map: Record<string, string> = {};
    optionSetCache.set(optionSetId, map);
    return map;
  }

  const { data, error } = await supabase
    .from('option_set_value')
    .select('value, display_label')
    .eq('option_set_id', optionSetId)
    .eq('is_active', true)
    .order('display_order');

  if (error && error.code === '42P01') {
    optionSetTableExists = false;
  } else if (!error) {
    optionSetTableExists = true;
  }

  const map: Record<string, string> = {};
  for (const r of (data ?? []) as { value: string; display_label: string }[]) {
    map[String(r.value)] = r.display_label;
  }
  optionSetCache.set(optionSetId, map);
  return map;
}

async function batchResolveLookup(
  spec: LookupSpec,
  fkValues: string[],
): Promise<Record<string, string>> {
  if (fkValues.length === 0) return {};

  if (spec.lookupTable === 'crm_user') {
    const { data } = await supabase.rpc('fn_get_user_display_map', { p_user_ids: fkValues });
    const map: Record<string, string> = {};
    for (const u of (data ?? []) as { user_id: string; display_name: string }[]) {
      map[u.user_id] = u.display_name;
    }
    return map;
  }

  const pk = PK_OVERRIDES[spec.lookupTable] ?? `${spec.lookupTable}_id`;
  const selectFields = new Set([pk, spec.lookupLabelField, ...(spec.fallbackFields ?? [])]);
  const selectExpr = [...selectFields].join(', ');

  const qb = supabase.from(spec.lookupTable).select(selectExpr).in(pk, fkValues).limit(1000);

  const { data } = await qb;
  if (!data) return {};

  const map: Record<string, string> = {};
  for (const r of data as unknown as Record<string, unknown>[]) {
    const id = String(r[pk]);
    let label = r[spec.lookupLabelField] as string | null;
    if ((!label || (typeof label === 'string' && !label.trim())) && spec.fallbackFields) {
      for (const fb of spec.fallbackFields) {
        const fbVal = r[fb];
        if (fbVal && (typeof fbVal !== 'string' || fbVal.trim())) {
          label = String(fbVal);
          break;
        }
      }
    }
    if (label) map[id] = label;
  }
  return map;
}

export async function resolveGridValues(
  rows: ListRow[],
  columns: ColumnState[],
): Promise<ListRow[]> {
  const lookupSpecs = buildLookupSpecs(columns);
  const optionSetSpecs = buildOptionSetSpecs(columns);
  const inlineChoiceSpecs = buildInlineChoiceSpecs(columns);

  if (lookupSpecs.length === 0 && optionSetSpecs.length === 0 && inlineChoiceSpecs.length === 0) {
    return rows;
  }

  const lookupPromises = lookupSpecs.map(async (spec) => {
    const fkValues = [...new Set(
      rows.map((r) => r[spec.fkColumn]).filter((v) => v != null) as string[]
    )];
    const map = await batchResolveLookup(spec, fkValues);
    return { spec, map };
  });

  const optionSetPromises = optionSetSpecs.map(async (spec) => {
    const labelMap = await resolveOptionSetLabels(spec.optionSetId);
    return { spec, labelMap };
  });

  const [lookupResults, optionSetResults] = await Promise.all([
    Promise.all(lookupPromises),
    Promise.all(optionSetPromises),
  ]);

  const lookupMaps = new Map<string, { fkColumn: string; map: Record<string, string> }>();
  for (const { spec, map } of lookupResults) {
    lookupMaps.set(spec.colKey, { fkColumn: spec.fkColumn, map });
  }

  const optionMaps = new Map<string, { physicalColumn: string; labelMap: Record<string, string> }>();
  for (const { spec, labelMap } of optionSetResults) {
    optionMaps.set(spec.colKey, { physicalColumn: spec.physicalColumn, labelMap });
  }

  // Build inline choice maps (value → label)
  const inlineMaps = new Map<string, { physicalColumn: string; labelMap: Record<string, string> }>();
  for (const spec of inlineChoiceSpecs) {
    const labelMap: Record<string, string> = {};
    for (const ch of spec.choices) {
      labelMap[String(ch.value)] = ch.label;
    }
    inlineMaps.set(spec.colKey, { physicalColumn: spec.physicalColumn, labelMap });
  }

  return rows.map((row) => {
    const patched: Record<string, unknown> = {};

    for (const [colKey, { fkColumn, map }] of lookupMaps) {
      const fkVal = row[fkColumn];
      if (fkVal && typeof fkVal === 'string' && map[fkVal]) {
        patched[colKey] = map[fkVal];
      }
    }

    for (const [colKey, { physicalColumn, labelMap }] of optionMaps) {
      const rawVal = row[physicalColumn] ?? row[colKey];
      if (rawVal != null && rawVal !== '') {
        const label = labelMap[String(rawVal)];
        if (label) patched[colKey] = label;
      }
    }

    for (const [colKey, { physicalColumn, labelMap }] of inlineMaps) {
      const rawVal = row[physicalColumn] ?? row[colKey];
      if (rawVal == null || rawVal === '') continue;

      let vals: string[] | null = null;
      if (Array.isArray(rawVal)) {
        vals = (rawVal as unknown[]).map(String).filter(Boolean);
      } else if (typeof rawVal === 'string') {
        const s = rawVal.trim();
        if (s.startsWith('[')) {
          try { vals = (JSON.parse(s) as unknown[]).map(String).filter(Boolean); } catch { /* single value */ }
        }
      }

      if (vals !== null) {
        // multi-choice: map each value to its label
        const labels = vals.map((v) => labelMap[v] ?? v).filter(Boolean);
        if (labels.length > 0) patched[colKey] = labels.join(', ');
      } else {
        const label = labelMap[String(rawVal)];
        if (label) patched[colKey] = label;
      }
    }

    return Object.keys(patched).length > 0 ? { ...row, ...patched } : row;
  });
}
