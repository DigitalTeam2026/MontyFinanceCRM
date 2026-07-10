import { supabase } from '../../lib/supabase';
import { getTableColumns } from './recordService';
import { resolveOptionSetLabel, resolveStateCodeLabel, resolveStatusReasonLabel } from './displayResolver';

export interface SubgridColumn {
  key: string;
  label: string;
  type?: 'text' | 'currency' | 'date' | 'badge';
  sortable?: boolean;
  filterable?: boolean;
}

export interface SubgridConfig {
  table: string;
  pk: string;
  fkColumn: string;
  columns: SubgridColumn[];
  displayName: string;
  entitySlug: string;
  defaultValues?: Record<string, unknown>;
  nameField?: string;
  nameFields?: string[];
  hasCurrency?: boolean;
}

export type SubgridRow = Record<string, unknown>;

export interface SubgridSort {
  column: string;
  direction: 'asc' | 'desc';
}

export interface SubgridFilter {
  column: string;
  value: string;
}

export interface SubgridFetchOptions {
  sort?: SubgridSort;
  filters?: SubgridFilter[];
  page?: number;
  pageSize?: number;
}

export interface SubgridFetchResult {
  rows: SubgridRow[];
  totalCount: number;
}

export const SUBGRID_CONFIGS: Record<string, SubgridConfig> = {
  contact: {
    table: 'contact',
    pk: 'contact_id',
    fkColumn: 'account_id',
    displayName: 'Contacts',
    entitySlug: 'contacts',
    nameField: 'last_name',
    nameFields: ['first_name', 'last_name'],
    columns: [
      { key: '_full_name', label: 'Name', type: 'text', sortable: false, filterable: false },
      { key: 'job_title', label: 'Job Title', type: 'text', sortable: true, filterable: true },
      { key: 'email', label: 'Email', type: 'text', sortable: true, filterable: true },
      { key: 'business_phone', label: 'Phone', type: 'text', sortable: false, filterable: false },
      { key: 'state_code', label: 'Status', type: 'badge', sortable: true, filterable: true },
    ],
  },
  opportunity: {
    table: 'opportunity',
    pk: 'opportunity_id',
    fkColumn: 'account_id',
    displayName: 'Opportunities',
    entitySlug: 'opportunities',
    nameField: 'topic',
    hasCurrency: true,
    columns: [
      { key: 'topic', label: 'Name', type: 'text', sortable: true, filterable: true },
      { key: 'stage', label: 'Stage', type: 'text', sortable: true, filterable: true },
      { key: 'estimated_value', label: 'Est. Value', type: 'currency', sortable: true, filterable: false },
      { key: 'estimated_close_date', label: 'Close Date', type: 'date', sortable: true, filterable: false },
      { key: 'state_code', label: 'Status', type: 'badge', sortable: true, filterable: true },
    ],
  },
  ticket: {
    table: 'ticket',
    pk: 'ticket_id',
    fkColumn: 'account_id',
    displayName: 'Tickets',
    entitySlug: 'tickets',
    nameField: 'title',
    columns: [
      { key: 'ticket_number', label: 'Ticket #', type: 'text', sortable: true, filterable: false },
      { key: 'title', label: 'Subject', type: 'text', sortable: true, filterable: true },
      { key: 'state_code', label: 'Status', type: 'badge', sortable: true, filterable: true },
    ],
  },
  ticket_contact: {
    table: 'ticket',
    pk: 'ticket_id',
    fkColumn: 'contact_id',
    displayName: 'Tickets',
    entitySlug: 'tickets',
    nameField: 'title',
    columns: [
      { key: 'ticket_number', label: 'Ticket #', type: 'text', sortable: true, filterable: false },
      { key: 'title', label: 'Subject', type: 'text', sortable: true, filterable: true },
      { key: 'state_code', label: 'Status', type: 'badge', sortable: true, filterable: true },
    ],
  },
};

export async function fetchSubgridRows(
  configKey: string,
  parentId: string,
  limit = 10
): Promise<SubgridRow[]> {
  const result = await fetchSubgridRowsPaged(configKey, parentId, { page: 1, pageSize: limit });
  return result.rows;
}

export async function fetchSubgridRowsPaged(
  configKey: string,
  parentId: string,
  options: SubgridFetchOptions = {}
): Promise<SubgridFetchResult> {
  const conf = SUBGRID_CONFIGS[configKey];
  if (!conf || !parentId) return { rows: [], totalCount: 0 };

  const { sort, filters = [], page = 1, pageSize = 10 } = options;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const selectExpr = conf.hasCurrency
    ? '*, currency:currency_id(code, symbol)'
    : '*';

  let query = supabase
    .from(conf.table)
    .select(selectExpr, { count: 'exact' })
    .eq(conf.fkColumn, parentId)
    .eq('is_deleted', false);

  for (const f of filters) {
    if (f.value.trim()) {
      const realKey =
        f.column === '_full_name'
          ? (conf.nameFields?.[1] ?? conf.nameField ?? 'name')
          : f.column;
      query = query.ilike(realKey, `%${f.value.trim()}%`);
    }
  }

  if (sort) {
    const realKey =
      sort.column === '_full_name' ? (conf.nameField ?? 'created_at') : sort.column;
    query = query.order(realKey, { ascending: sort.direction === 'asc' });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = ((data as unknown as SubgridRow[]) ?? []).map((row) => {
    let enriched = row;
    if (conf.hasCurrency) {
      const cur = row.currency as { code: string; symbol: string } | null;
      enriched = { ...row, currency_code: cur?.code ?? null, currency_symbol: cur?.symbol ?? null };
    }
    if (conf.nameFields) {
      const fullName = conf.nameFields.map((f) => enriched[f]).filter(Boolean).join(' ');
      return { ...enriched, _full_name: fullName };
    }
    return enriched;
  });

  return { rows, totalCount: count ?? 0 };
}

export async function createSubgridRecord(
  configKey: string,
  parentId: string,
  values: Record<string, unknown>,
  userId: string
): Promise<SubgridRow> {
  const conf = SUBGRID_CONFIGS[configKey];
  if (!conf) throw new Error(`Unknown subgrid config: ${configKey}`);

  const tCols = await getTableColumns(conf.table);
  const insertPayload: Record<string, unknown> = {
    ...values,
    [conf.fkColumn]: parentId,
  };
  if (tCols.has('created_by')) insertPayload.created_by = userId;
  if (tCols.has('owner_id')) insertPayload.owner_id = userId;
  if (tCols.has('owner_type')) insertPayload.owner_type = 'user';
  const { data, error } = await supabase
    .from(conf.table)
    .insert(insertPayload)
    .select()
    .single();

  if (error) throw error;

  const row = data as SubgridRow;
  if (conf.nameFields) {
    const fullName = conf.nameFields.map((f) => row[f]).filter(Boolean).join(' ');
    return { ...row, _full_name: fullName };
  }
  return row;
}

// ---------------------------------------------------------------------------
// View-driven columns: load SubgridColumn[] from view_column table
// ---------------------------------------------------------------------------

export interface ViewDrivenColumn {
  key: string;
  label: string;
  fieldType: string | null;
  sortable: boolean;
  width: number | null;
  lookupTable?: string;
  lookupLabelField?: string;
  lookupPk?: string;
  /** For choice/option-set columns backed by a named option set (field_definition.option_set_id). */
  optionSetId?: string;
  /** For inline-choice columns: the choices stored directly in config_json.choices. */
  inlineChoices?: { value: string; label: string }[];
  /** statecode/statusreason columns resolve their integer code via the definition
   *  tables (statecode_definition / status_reason_definition), keyed by entity. */
  statusKind?: 'statecode' | 'statusreason';
  /** Owning entity's definition id — required to resolve statecode/statusreason codes. */
  entityDefinitionId?: string;
}

export const viewColumnCache = new Map<string, ViewDrivenColumn[]>();

const LOOKUP_PK_OVERRIDES: Record<string, string> = {
  product_family: 'family_id',
  line_of_business: 'lob_id',
  crm_user: 'user_id',
  security_role: 'role_id',
};

export async function fetchViewColumnsForSubgrid(viewId: string): Promise<ViewDrivenColumn[]> {
  if (viewColumnCache.has(viewId)) return viewColumnCache.get(viewId)!;

  const { data, error } = await supabase
    .from('view_column')
    .select('*, field_definition(logical_name, physical_column_name, display_name, entity_definition_id, option_set_id, config_json, field_type(name), lookup_entity:entity_definition!lookup_entity_id(physical_table_name, primary_field_name, primary_key_column))')
    .eq('view_id', viewId)
    .eq('is_hidden', false)
    .order('display_order');

  if (error || !data) return [];

  const cols = (data as Record<string, unknown>[]).map((row): ViewDrivenColumn => {
    const fd = row.field_definition as Record<string, unknown> | null;
    const ft = fd?.field_type as Record<string, unknown> | null;
    const lookupEntity = fd?.lookup_entity as Record<string, unknown> | null;
    const physicalCol = fd?.physical_column_name as string | undefined;
    const fieldTypeName = ft?.name as string | null ?? null;

    const col: ViewDrivenColumn = {
      key: physicalCol ?? fd?.logical_name as string ?? String(row.field_definition_id),
      label: (row.label_override as string | null) ?? (fd?.display_name as string) ?? '',
      fieldType: fieldTypeName,
      sortable: row.is_sortable as boolean,
      width: row.width as number | null,
    };

    // Choice / option-set columns store a raw code (e.g. "1"); capture the metadata
    // needed to resolve it to a label (named option set, or inline choices from config_json).
    const cfg = fd?.config_json as Record<string, unknown> | null;
    const optionSetId = fd?.option_set_id as string | null | undefined;
    if (optionSetId) col.optionSetId = optionSetId;
    const inlineChoices = cfg?.choices as { value: string; label: string }[] | undefined;
    if (Array.isArray(inlineChoices) && inlineChoices.length > 0) col.inlineChoices = inlineChoices;

    // statecode / statusreason columns carry no option set or inline choices — they
    // resolve their integer code via the definition tables, keyed by entity. Detect
    // from the config flags or the physical column name so the code never leaks raw.
    if (cfg?.is_statecode_field || physicalCol === 'state_code') col.statusKind = 'statecode';
    else if (cfg?.is_statusreason_field || physicalCol === 'status_reason') col.statusKind = 'statusreason';
    if (col.statusKind) col.entityDefinitionId = fd?.entity_definition_id as string | undefined;

    if (fieldTypeName === 'lookup' && lookupEntity) {
      const table = lookupEntity.physical_table_name as string;
      col.lookupTable = table;
      col.lookupLabelField = lookupEntity.primary_field_name as string ?? 'name';
      // Use the real PK from metadata (the `crm_` prefix is dropped for PK columns,
      // so `${table}_id` is wrong for prefixed tables like crm_leadsource → 400).
      col.lookupPk = (lookupEntity.primary_key_column as string | null)
        ?? LOOKUP_PK_OVERRIDES[table]
        ?? `${table.replace(/^crm_/, '')}_id`;
    }

    return col;
  });

  viewColumnCache.set(viewId, cols);
  return cols;
}

const entityDefIdCache = new Map<string, string | null>();

/** Resolve an entity's definition id from its logical name or physical table (cached). */
export async function resolveEntityDefId(logicalOrTable: string, table?: string): Promise<string | undefined> {
  const cacheKey = `${logicalOrTable}|${table ?? ''}`;
  if (entityDefIdCache.has(cacheKey)) return entityDefIdCache.get(cacheKey) ?? undefined;
  const singular = logicalOrTable.replace(/s$/, '');
  const ors = [`logical_name.eq.${logicalOrTable}`, `logical_name.eq.${singular}`];
  if (table) ors.push(`physical_table_name.eq.${table}`);
  const { data } = await supabase
    .from('entity_definition')
    .select('entity_definition_id')
    .or(ors.join(','))
    .maybeSingle();
  const id = (data?.entity_definition_id as string | undefined) ?? null;
  entityDefIdCache.set(cacheKey, id);
  return id ?? undefined;
}

/** Build resolution specs for a static SUBGRID_CONFIGS entry so the static path
 *  resolves the same code→label surfaces the view-driven path does. Today the only
 *  static columns storing raw codes are state_code / status_reason (badge). */
export async function buildStaticResolutionColumns(configKey: string): Promise<ViewDrivenColumn[]> {
  const conf = SUBGRID_CONFIGS[configKey];
  if (!conf) return [];
  const statusCols = conf.columns.filter((c) => c.key === 'state_code' || c.key === 'status_reason');
  if (statusCols.length === 0) return [];
  const entId = await resolveEntityDefId(conf.entitySlug, conf.table);
  if (!entId) return [];
  return statusCols.map((c) => ({
    key: c.key,
    label: c.label,
    fieldType: 'choice',
    sortable: c.sortable ?? false,
    width: null,
    statusKind: c.key === 'state_code' ? 'statecode' : 'statusreason',
    entityDefinitionId: entId,
  }));
}

export async function fetchDefaultViewForEntity(entityLogicalName: string): Promise<{ view_id: string; name: string } | null> {
  const { data: eDef } = await supabase
    .from('entity_definition')
    .select('entity_definition_id')
    .eq('logical_name', entityLogicalName)
    .maybeSingle();
  if (!eDef) return null;

  const { data } = await supabase
    .from('view_definition')
    .select('view_id, name')
    .eq('entity_definition_id', eDef.entity_definition_id)
    .eq('is_default', true)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  return data as { view_id: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Metadata-driven path: resolve a SubgridConfig from relationship_definition
// ---------------------------------------------------------------------------

export interface ResolvedRelationshipConfig {
  relationshipDefinitionId: string;
  sourceEntityLogical: string;
  targetEntityLogical: string;
  targetEntityTable: string;
  targetEntityPk: string;
  fkColumn: string;
  displayName: string;
}

const ENTITY_TABLE_MAP: Record<string, string> = {
  account: 'account',
  contact: 'contact',
  lead: 'lead',
  opportunity: 'opportunity',
  ticket: 'ticket',
};

const ENTITY_PK_MAP: Record<string, string> = {
  account: 'account_id',
  contact: 'contact_id',
  lead: 'lead_id',
  opportunity: 'opportunity_id',
  ticket: 'ticket_id',
};

const relConfigCache = new Map<string, ResolvedRelationshipConfig | null>();

export async function resolveRelationshipConfig(
  relationshipDefinitionId: string
): Promise<ResolvedRelationshipConfig | null> {
  if (relConfigCache.has(relationshipDefinitionId)) {
    return relConfigCache.get(relationshipDefinitionId) ?? null;
  }

  const { data, error } = await supabase
    .from('relationship_definition')
    .select(`
      relationship_definition_id,
      display_name,
      relationship_storage_type,
      source_entity:source_entity_id(logical_name, physical_table_name),
      target_entity:target_entity_id(logical_name, physical_table_name),
      lookup_field:source_lookup_field_id(physical_column_name)
    `)
    .eq('relationship_definition_id', relationshipDefinitionId)
    .eq('relationship_storage_type', 'lookup')
    .maybeSingle();

  if (error || !data) {
    relConfigCache.set(relationshipDefinitionId, null);
    return null;
  }

  const sourceEntityLogical = (data.source_entity as unknown as { logical_name: string } | null)?.logical_name ?? '';
  const targetEntityLogical = (data.target_entity as unknown as { logical_name: string } | null)?.logical_name ?? '';
  const targetEntityPhysical = (data.target_entity as unknown as { physical_table_name: string } | null)?.physical_table_name ?? '';
  const fkColumn = (data.lookup_field as unknown as { physical_column_name: string } | null)?.physical_column_name ?? '';

  if (!fkColumn || !targetEntityLogical) {
    relConfigCache.set(relationshipDefinitionId, null);
    return null;
  }

  const result: ResolvedRelationshipConfig = {
    relationshipDefinitionId,
    sourceEntityLogical,
    targetEntityLogical,
    // For custom entities ENTITY_TABLE_MAP has no entry — use physical_table_name from entity_definition
    targetEntityTable: ENTITY_TABLE_MAP[targetEntityLogical] ?? targetEntityPhysical ?? targetEntityLogical,
    targetEntityPk: ENTITY_PK_MAP[targetEntityLogical] ?? `${targetEntityLogical}_id`,
    fkColumn,
    displayName: (data as { display_name: string }).display_name,
  };

  relConfigCache.set(relationshipDefinitionId, result);
  return result;
}

export async function fetchSubgridRowsPagedByRelDef(
  relationshipDefinitionId: string,
  parentId: string,
  options: SubgridFetchOptions = {}
): Promise<SubgridFetchResult> {
  const relConf = await resolveRelationshipConfig(relationshipDefinitionId);
  if (!relConf || !parentId) return { rows: [], totalCount: 0 };

  const { sort, filters = [], page = 1, pageSize = 10 } = options;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from(relConf.targetEntityTable)
    .select('*', { count: 'exact' })
    .eq(relConf.fkColumn, parentId)
    .eq('is_deleted', false);

  for (const f of filters) {
    if (f.value.trim()) {
      query = query.ilike(f.column, `%${f.value.trim()}%`);
    }
  }

  if (sort) {
    query = query.order(sort.column, { ascending: sort.direction === 'asc' });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data as SubgridRow[]) ?? [], totalCount: count ?? 0 };
}

export async function createSubgridRecordByRelDef(
  relationshipDefinitionId: string,
  parentId: string,
  values: Record<string, unknown>,
  userId: string
): Promise<SubgridRow> {
  const relConf = await resolveRelationshipConfig(relationshipDefinitionId);
  if (!relConf) throw new Error(`Cannot resolve relationship: ${relationshipDefinitionId}`);

  const rtCols = await getTableColumns(relConf.targetEntityTable);
  const relInsert: Record<string, unknown> = {
    ...values,
    [relConf.fkColumn]: parentId,
  };
  if (rtCols.has('created_by')) relInsert.created_by = userId;
  if (rtCols.has('owner_id')) relInsert.owner_id = userId;
  if (rtCols.has('owner_type')) relInsert.owner_type = 'user';
  const { data, error } = await supabase
    .from(relConf.targetEntityTable)
    .insert(relInsert)
    .select()
    .single();

  if (error) throw error;
  return data as SubgridRow;
}

export async function deleteSubgridRecord(
  configKey: string,
  recordId: string
): Promise<void> {
  const conf = SUBGRID_CONFIGS[configKey];
  if (!conf) throw new Error(`Unknown subgrid config: ${configKey}`);
  const { error } = await supabase
    .from(conf.table)
    .update({ is_deleted: true })
    .eq(conf.pk, recordId);
  if (error) throw error;
}

export async function deleteSubgridRecordByRelDef(
  relationshipDefinitionId: string,
  recordId: string
): Promise<void> {
  const relConf = await resolveRelationshipConfig(relationshipDefinitionId);
  if (!relConf) throw new Error(`Cannot resolve relationship: ${relationshipDefinitionId}`);
  const { error } = await supabase
    .from(relConf.targetEntityTable)
    .update({ is_deleted: true })
    .eq(relConf.targetEntityPk, recordId);
  if (error) throw error;
}

/** Turn one raw cell value into its choice label(s) using a value→label map.
 *  Handles both single values and multi-choice values stored as a JSON array string. */
function mapChoiceValue(rawVal: unknown, labelMap: Record<string, string>): string | null {
  if (rawVal == null || rawVal === '') return null;

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
    const labels = vals.map((v) => labelMap[v] ?? v).filter(Boolean);
    return labels.length > 0 ? labels.join(', ') : null;
  }
  return labelMap[String(rawVal)] ?? null;
}

export async function resolveSubgridLookups(
  rows: SubgridRow[],
  columns: ViewDrivenColumn[],
): Promise<SubgridRow[]> {
  if (rows.length === 0) return rows;

  const lookupCols = columns.filter(
    (c) => c.fieldType === 'lookup' && c.lookupTable && c.lookupLabelField && c.lookupPk,
  );
  // Choice / option-set columns that carry a resolvable value→label source.
  const choiceCols = columns.filter((c) => c.optionSetId || (c.inlineChoices && c.inlineChoices.length > 0));
  // statecode / statusreason columns resolve via the definition tables, keyed by entity.
  const statusCols = columns.filter((c) => c.statusKind && c.entityDefinitionId);

  if (lookupCols.length === 0 && choiceCols.length === 0 && statusCols.length === 0) return rows;

  const resolved = await Promise.all(
    lookupCols.map(async (col) => {
      const fkValues = [...new Set(
        rows.map((r) => r[col.key]).filter((v) => v != null && typeof v === 'string') as string[],
      )];
      if (fkValues.length === 0) return { col, map: {} as Record<string, string> };
      const { data } = await supabase
        .from(col.lookupTable!)
        .select(`${col.lookupPk}, ${col.lookupLabelField}`)
        .in(col.lookupPk!, fkValues)
        .limit(1000);
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        const id = String(row[col.lookupPk!]);
        const label = String(row[col.lookupLabelField!] ?? '');
        if (label) map[id] = label;
      }
      return { col, map };
    }),
  );

  const lookupMaps = new Map<string, Record<string, string>>();
  for (const { col, map } of resolved) {
    lookupMaps.set(col.key, map);
  }

  // Build value→label maps for every choice column. Inline choices resolve locally;
  // named option sets resolve from option_set_value (cached inside resolveOptionSetLabel).
  const choiceMaps = new Map<string, Record<string, string>>();
  await Promise.all(
    choiceCols.map(async (col) => {
      const map: Record<string, string> = {};
      if (col.inlineChoices) {
        for (const ch of col.inlineChoices) map[String(ch.value)] = ch.label;
      }
      if (col.optionSetId) {
        const rawValues = [...new Set(
          rows.flatMap((r) => {
            const v = r[col.key];
            if (v == null || v === '') return [];
            if (Array.isArray(v)) return (v as unknown[]).map(String);
            const s = String(v).trim();
            if (s.startsWith('[')) {
              try { return (JSON.parse(s) as unknown[]).map(String); } catch { /* single value */ }
            }
            return [s];
          }),
        )];
        await Promise.all(rawValues.map(async (rv) => {
          if (map[rv]) return;
          const label = await resolveOptionSetLabel(col.optionSetId!, rv);
          if (label) map[rv] = label;
        }));
      }
      choiceMaps.set(col.key, map);
    }),
  );

  // statecode / statusreason: resolve each distinct code via the definition tables.
  const statusMaps = new Map<string, Record<string, string>>();
  await Promise.all(
    statusCols.map(async (col) => {
      const map: Record<string, string> = {};
      const rawValues = [...new Set(
        rows.map((r) => r[col.key]).filter((v) => v != null && v !== '').map(String),
      )];
      await Promise.all(rawValues.map(async (rv) => {
        const label = col.statusKind === 'statecode'
          ? await resolveStateCodeLabel(col.entityDefinitionId!, rv)
          : await resolveStatusReasonLabel(col.entityDefinitionId!, rv);
        if (label) map[rv] = label;
      }));
      statusMaps.set(col.key, map);
    }),
  );

  return rows.map((row) => {
    const patched: Record<string, unknown> = {};
    for (const [colKey, map] of lookupMaps) {
      const fkVal = row[colKey];
      if (fkVal && typeof fkVal === 'string' && map[fkVal]) {
        patched[colKey] = map[fkVal];
      }
    }
    for (const [colKey, map] of choiceMaps) {
      const label = mapChoiceValue(row[colKey], map);
      if (label) patched[colKey] = label;
    }
    for (const [colKey, map] of statusMaps) {
      const rawVal = row[colKey];
      if (rawVal != null && rawVal !== '' && map[String(rawVal)]) {
        patched[colKey] = map[String(rawVal)];
      }
    }
    return Object.keys(patched).length > 0 ? { ...row, ...patched } : row;
  });
}
