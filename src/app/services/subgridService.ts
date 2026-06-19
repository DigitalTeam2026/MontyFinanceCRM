import { supabase } from '../../lib/supabase';
import { getTableColumns } from './recordService';

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
    .select('*, field_definition(logical_name, physical_column_name, display_name, field_type(name), lookup_entity:entity_definition!lookup_entity_id(physical_table_name, primary_field_name, primary_key_column))')
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

export async function resolveSubgridLookups(
  rows: SubgridRow[],
  columns: ViewDrivenColumn[],
): Promise<SubgridRow[]> {
  const lookupCols = columns.filter(
    (c) => c.fieldType === 'lookup' && c.lookupTable && c.lookupLabelField && c.lookupPk,
  );
  if (lookupCols.length === 0 || rows.length === 0) return rows;

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

  return rows.map((row) => {
    const patched: Record<string, unknown> = {};
    for (const [colKey, map] of lookupMaps) {
      const fkVal = row[colKey];
      if (fkVal && typeof fkVal === 'string' && map[fkVal]) {
        patched[colKey] = map[fkVal];
      }
    }
    return Object.keys(patched).length > 0 ? { ...row, ...patched } : row;
  });
}
