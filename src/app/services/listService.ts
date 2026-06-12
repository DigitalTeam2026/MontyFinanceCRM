import { supabase } from '../../lib/supabase';
import { type AppEntity, ENTITY_DEFINITION_ID } from '../types';
import { getTableColumns } from './recordService';
import type { AccessLevel, UserAccessContext } from './permissionService';


export interface ListColumn {
  key: string;
  label: string;
  sortable?: boolean;
  type?: 'text' | 'date' | 'currency' | 'badge' | 'link' | 'owner' | 'phone' | 'lookup';
  /** DB field_definition_id — required so the column can be saved to view_column */
  field_definition_id?: string;
  /** Physical column name on the entity table — used for related-entity joins */
  field_physical_column?: string;
  /** For lookup columns: target physical table name (e.g. "account") */
  lookup_table?: string;
  /** For lookup columns: primary display field on the target table (e.g. "account_name") */
  lookup_label_field?: string;
  /** For choice/badge columns: option_set.name used to load filter options */
  option_set_name?: string;
}

export interface ListRow {
  id: string;
  [key: string]: unknown;
}

export interface ListResult {
  rows: ListRow[];
  total: number;
}

/**
 * Describes a single column that comes from a related entity via a lookup FK.
 * Used by list fetch functions to dynamically join and populate rel: keys.
 */
export interface RelatedColumnSpec {
  /** The full column key used in ColumnState, e.g. "rel:{relId}:{logicalName}" */
  colKey: string;
  /** Physical table of the related entity, e.g. "account" */
  relatedTable: string;
  /** FK column on the source table, e.g. "account_id" */
  fkColumn: string;
  /** Physical column on the related table, e.g. "website" */
  fieldPhysicalColumn: string;
  /** Fallback columns to try when the primary label field is empty */
  fallbackFields?: string[];
}

export interface ListOptions {
  search?: string;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  filters?: ActiveFilter[];
  /** Related entity columns to join and populate */
  relatedColumns?: RelatedColumnSpec[];
  /** Maps logical column key → physical DB column name. Used to copy physical values to logical keys. */
  columnKeyMap?: Record<string, string>;
  /** When set, applies an owner_id filter matching this access level. Omit for system admins. */
  readAccessLevel?: AccessLevel;
  /** User access context required when readAccessLevel is set */
  accessContext?: UserAccessContext;
  /**
   * IDs of records the user can access via explicit sharing, even if they fall
   * outside normal ownership/BU scope. When provided alongside readAccessLevel,
   * the query is: (normal scope filter) OR (pk IN sharedRecordIds).
   */
  sharedRecordIds?: Set<string>;
  /** PK column name for the entity table — used when constructing the shared-id OR clause */
  entityPk?: string;
}

/**
 * Apply a read access level constraint (owner_id filter) to a query.
 * organization → no constraint; parent_bu → IN subtree users; business_unit → IN BU users; user → eq own id.
 *
 * Records with owner_id IS NULL are treated as shared/system reference data and always visible.
 * sharedIds: additional record PKs the user can access via explicit record sharing — appended
 * as an OR clause so shared records bypass the normal ownership/BU scope.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyReadAccessFilter(
  q: any,
  level: AccessLevel,
  ctx: UserAccessContext,
  pk: string,
  sharedIds?: Set<string>,
): any {
  const sharedClause = sharedIds && sharedIds.size > 0
    ? `${pk}.in.(${[...sharedIds].join(',')})`
    : null;

  const addShared = (baseClause: string) =>
    sharedClause ? q.or(`${baseClause},${sharedClause}`) : q.or(baseClause);

  switch (level) {
    case 'organization':
      // All records visible; still include shared for completeness (no-op in terms of filtering)
      return q;
    case 'parent_bu': {
      const ids = ctx.buSubtreeUserIds;
      const ownerClause = ids.length > 0
        ? `owner_id.is.null,owner_id.in.(${ids.join(',')})`
        : 'owner_id.is.null';
      return sharedClause ? q.or(`${ownerClause},${sharedClause}`) : q.or(ownerClause);
    }
    case 'business_unit': {
      const ids = ctx.buUserIds;
      const ownerClause = ids.length > 0
        ? `owner_id.is.null,owner_id.in.(${ids.join(',')})`
        : 'owner_id.is.null';
      return sharedClause ? q.or(`${ownerClause},${sharedClause}`) : q.or(ownerClause);
    }
    case 'user':
    default:
      return addShared(`owner_id.is.null,owner_id.eq.${ctx.userId}`);
  }
}

export type FilterOperator =
  | 'eq' | 'neq' | 'in'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'is_empty' | 'is_not_empty'
  | 'last_7_days' | 'last_30_days' | 'last_90_days'
  | 'this_month' | 'last_month' | 'next_month'
  | 'this_year'  | 'last_year'  | 'next_year'
  | 'this_week'  | 'last_week'  | 'next_week'
  | 'today' | 'yesterday' | 'tomorrow'
  | 'on' | 'on_or_after' | 'on_or_before';

export interface ActiveFilter {
  id: string;
  field: string;
  label: string;
  operator: FilterOperator;
  value: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  entity: string;
  conditions: ActiveFilter[];
}

export const ENTITY_COLUMNS: Record<AppEntity, ListColumn[]> = {
  accounts: [
    { key: 'account_name', label: 'Name',     sortable: true,  type: 'link',   field_definition_id: '366dccd7-f807-4622-8e1b-4c1bb89ec373', field_physical_column: 'account_name' },
    { key: 'industry',     label: 'Industry', sortable: true,  type: 'lookup', field_definition_id: '39e20333-7de6-49db-9d76-c327f37879fb', field_physical_column: 'industry_id', lookup_table: 'industry', lookup_label_field: 'name' },
    { key: 'country',      label: 'Country',  sortable: true,  type: 'lookup', field_definition_id: 'ae38b755-2f11-42fe-bbc5-2b5229860e64', field_physical_column: 'country_id',  lookup_table: 'country',  lookup_label_field: 'name' },
    { key: 'phone',        label: 'Phone',    sortable: false, type: 'phone',  field_definition_id: '0eac8214-e657-4251-9195-5c2627b10863', field_physical_column: 'phone' },
    { key: 'website',      label: 'Website',  sortable: false, type: 'text',   field_definition_id: '95087b6f-4931-43b4-b374-114aa48f28a0', field_physical_column: 'website' },
    { key: 'owner_email',  label: 'Owner',    sortable: false, type: 'owner',  field_definition_id: 'e8178944-59ef-4e01-abcc-efb17a257875', field_physical_column: 'owner_id', lookup_table: 'crm_user', lookup_label_field: 'email' },
    { key: 'created_at',   label: 'Created',  sortable: true,  type: 'date',   field_definition_id: 'a4762974-93e8-4ec2-b8ef-cd27b8041145', field_physical_column: 'created_at' },
  ],
  contacts: [
    { key: 'full_name',      label: 'Name',      sortable: true,  type: 'link',  field_definition_id: '6ea1a4e1-99a3-484a-959c-e087719755d7', field_physical_column: 'first_name' },
    { key: 'email',          label: 'Email',     sortable: true,  type: 'text',  field_definition_id: 'eaec5e2e-27a8-435c-b958-e120a2d78f14', field_physical_column: 'email' },
    { key: 'business_phone', label: 'Phone',     sortable: false, type: 'phone', field_definition_id: 'aa5167b0-19f1-4452-ab3c-b32583ad0dbb', field_physical_column: 'business_phone' },
    { key: 'account_name',   label: 'Account',   sortable: true,  type: 'lookup', field_definition_id: '272bb636-0f60-4db8-a651-688c70f3c9cc', field_physical_column: 'account_id', lookup_table: 'account', lookup_label_field: 'account_name' },
    { key: 'job_title',      label: 'Job Title', sortable: true,  type: 'text',  field_definition_id: 'f1448c24-f18f-4256-8f3b-3c931341aa28', field_physical_column: 'job_title' },
    { key: 'owner_email',    label: 'Owner',     sortable: false, type: 'owner', field_definition_id: 'c641f0df-b17a-474f-bc86-1e2ec549ddd9', field_physical_column: 'owner_id', lookup_table: 'crm_user', lookup_label_field: 'email' },
    { key: 'created_at',     label: 'Created',   sortable: true,  type: 'date',  field_definition_id: 'dd44d9c5-bc5b-4fc5-aa07-1eb582d48cdb', field_physical_column: 'created_at' },
  ],
  leads: [
    { key: 'full_name',    label: 'Name',        sortable: true,  type: 'link',   field_definition_id: 'f2df5d02-37cf-4c05-bb97-b3f5a2ed5dcc', field_physical_column: 'first_name' },
    { key: 'topic',        label: 'Topic',       sortable: true,  type: 'link',   field_definition_id: 'dc78b4a2-0099-412c-859e-cd0c94383ad3', field_physical_column: 'topic' },
    { key: 'account_id',   label: 'Account',     sortable: false, type: 'lookup', field_definition_id: 'f390122d-5b49-4d17-8c1d-5121f6252dbf', field_physical_column: 'account_id', lookup_table: 'account', lookup_label_field: 'account_name' },
    { key: 'contact_id',   label: 'Contact',     sortable: false, type: 'lookup', field_definition_id: '27bff63b-1a3a-466a-abc8-a67bb13ce5a3', field_physical_column: 'contact_id', lookup_table: 'contact', lookup_label_field: 'full_name' },
    { key: 'email',        label: 'Email',       sortable: true,  type: 'text',   field_definition_id: '5624e6b8-e0b9-4b25-8d52-62b2bd2138c6', field_physical_column: 'email' },
    { key: 'company_name', label: 'Company',     sortable: true,  type: 'text',   field_definition_id: '63fc6a1e-e757-43fe-bd39-3b9061584d98', field_physical_column: 'company_name' },
    { key: 'owner_email',  label: 'Owner',       sortable: false, type: 'owner',  field_definition_id: 'bd22618f-6a19-4425-900b-27ef681fc3a4', field_physical_column: 'owner_id', lookup_table: 'crm_user', lookup_label_field: 'email' },
    { key: 'modified_at',  label: 'Modified On', sortable: true,  type: 'date',   field_definition_id: 'fe108c2b-ee05-44f6-9912-89dd3403f91b', field_physical_column: 'modified_at' },
    { key: 'created_at',   label: 'Created',     sortable: true,  type: 'date',   field_definition_id: 'bec5daab-1279-4362-b91c-6eec8b169eb9', field_physical_column: 'created_at' },
  ],
  opportunities: [
    { key: 'topic',                label: 'Name',       sortable: true,  type: 'link',     field_definition_id: 'ab7a8c63-8fba-4a82-942d-97d2b79003e5', field_physical_column: 'topic' },
    { key: 'account_name',         label: 'Account',    sortable: true,  type: 'lookup',   field_definition_id: '0312fcf7-d199-48b6-a8b9-815909883bb4', field_physical_column: 'account_id', lookup_table: 'account', lookup_label_field: 'account_name' },
    { key: 'stage',                label: 'Stage',      sortable: true,  type: 'badge',    field_definition_id: 'a3b786f0-e118-4b4f-8b32-2ad77c839935', field_physical_column: 'stage' },
    { key: 'estimated_close_date', label: 'Close Date', sortable: true,  type: 'date',     field_definition_id: 'd499fbae-2af1-4bba-bad8-9de18c07f1a9', field_physical_column: 'estimated_close_date' },
    { key: 'estimated_value',      label: 'Value',      sortable: true,  type: 'currency', field_definition_id: '167639a3-4fe4-4935-97c3-1b47fa2ad234', field_physical_column: 'estimated_value' },
    { key: 'owner_email',          label: 'Owner',      sortable: false, type: 'owner',    field_definition_id: 'ad532025-1217-4efd-9e78-a4b839c26eb0', field_physical_column: 'owner_id', lookup_table: 'crm_user', lookup_label_field: 'email' },
  ],
  tickets: [
    { key: 'subject',      label: 'Subject',     sortable: true,  type: 'link',  field_definition_id: 'd6f87ac8-708b-45af-b836-264f07fae6eb', field_physical_column: 'title' },
    { key: 'owner_email',  label: 'Assigned To', sortable: false, type: 'owner', field_definition_id: 'ecd09176-89b3-4cfc-b7e0-dd244ca80db3', field_physical_column: 'owner_id', lookup_table: 'crm_user', lookup_label_field: 'email' },
    { key: 'created_at',   label: 'Created',     sortable: true,  type: 'date',  field_definition_id: 'da1d3114-e07e-4719-8e01-8a1b61aa3cd8', field_physical_column: 'created_at' },
  ],
  product_family: [
    { key: 'name',        label: 'Name',    sortable: true,  type: 'link',  field_definition_id: 'a0bb503f-c380-44f5-8bd6-b64f058d3809', field_physical_column: 'name' },
    { key: 'code',        label: 'Code',    sortable: true,  type: 'text',  field_definition_id: '894de44c-99b0-483c-a241-6749c3d2afa2', field_physical_column: 'code' },
    { key: 'description', label: 'Description', sortable: false, type: 'text', field_definition_id: '3e5c3f23-0e3d-47ad-a622-5da634385a07', field_physical_column: 'description' },
    { key: 'is_active',   label: 'Active',  sortable: true,  type: 'badge', field_definition_id: 'eefc48dd-adb3-4e2c-9a4f-8cc6b96db317', field_physical_column: 'is_active' },
    { key: 'created_at',  label: 'Created', sortable: true,  type: 'date',  field_definition_id: '97b3ffdb-0b62-47ee-9280-ff4ae0df9284', field_physical_column: 'created_at' },
  ],
  product: [
    { key: 'name',         label: 'Name',    sortable: true,  type: 'link',  field_definition_id: '21628af9-35c2-4f7c-919b-bfccf9895730', field_physical_column: 'name' },
    { key: 'code',         label: 'Code',    sortable: true,  type: 'text',  field_definition_id: 'bea8d36e-6d5d-4999-93f5-eb6b40641b98', field_physical_column: 'code' },
    { key: 'product_type', label: 'Type',    sortable: true,  type: 'badge', field_definition_id: '55a0808f-ad4a-49ca-ad5a-c37fad125d5f', field_physical_column: 'product_type' },
    { key: 'is_active',    label: 'Active',  sortable: true,  type: 'badge', field_definition_id: '0b46060a-0154-4eb7-a2a8-ebbbe0d2301e', field_physical_column: 'is_active' },
    { key: 'created_at',   label: 'Created', sortable: true,  type: 'date',  field_definition_id: '1a85ba1b-eea6-41da-a1f0-6d7388ba8824', field_physical_column: 'created_at' },
  ],
};

export type FilterableFieldType = 'text' | 'select' | 'date' | 'number' | 'boolean';

export interface FilterableField {
  key: string;
  label: string;
  type: FilterableFieldType;
  options?: string[];
}

export const FILTERABLE_FIELDS: Record<AppEntity, FilterableField[]> = {
  accounts: [
    { key: 'account_name', label: 'Name',       type: 'text' },
    { key: 'industry',     label: 'Industry',    type: 'text' },
    { key: 'phone',        label: 'Phone',       type: 'text' },
    { key: 'website',      label: 'Website',     type: 'text' },
    { key: 'state_code',   label: 'Status',      type: 'select', options: ['Active', 'Inactive'] },
    { key: 'created_at',   label: 'Created Date', type: 'date' },
  ],
  contacts: [
    { key: 'first_name',   label: 'First Name',  type: 'text' },
    { key: 'last_name',    label: 'Last Name',   type: 'text' },
    { key: 'email',        label: 'Email',       type: 'text' },
    { key: 'job_title',    label: 'Job Title',   type: 'text' },
    { key: 'business_phone', label: 'Phone',       type: 'text' },
    { key: 'state_code',   label: 'Status',      type: 'select', options: ['Active', 'Inactive'] },
    { key: 'created_at',   label: 'Created Date', type: 'date' },
  ],
  leads: [
    { key: 'first_name',   label: 'First Name',  type: 'text' },
    { key: 'last_name',    label: 'Last Name',   type: 'text' },
    { key: 'company_name', label: 'Company',     type: 'text' },
    { key: 'email',        label: 'Email',       type: 'text' },
    { key: 'state_code',   label: 'Status',      type: 'select', options: ['Open', 'Qualified', 'Disqualified'] },
    { key: 'rating',       label: 'Rating',      type: 'select', options: ['hot', 'warm', 'cold'] },
    { key: 'created_at',   label: 'Created Date', type: 'date' },
  ],
  opportunities: [
    { key: 'topic',                label: 'Name',       type: 'text' },
    { key: 'stage',                label: 'Stage',      type: 'select', options: ['qualify', 'develop', 'propose', 'close', 'won', 'lost'] },
    { key: 'state_code',           label: 'Status',     type: 'select', options: ['Open', 'Won', 'Lost'] },
    { key: 'estimated_value',      label: 'Value',      type: 'number' },
    { key: 'estimated_close_date', label: 'Close Date', type: 'date' },
    { key: 'created_at',           label: 'Created Date', type: 'date' },
  ],
  tickets: [
    { key: 'subject',     label: 'Subject',  type: 'text' },
    { key: 'state_code',  label: 'Status',   type: 'select', options: ['Active', 'Inactive'] },
    { key: 'priority',    label: 'Priority', type: 'select', options: ['low', 'normal', 'high', 'urgent'] },
    { key: 'created_at',  label: 'Created Date', type: 'date' },
  ],
  product_family: [
    { key: 'name',        label: 'Name',   type: 'text' },
    { key: 'code',        label: 'Code',   type: 'text' },
    { key: 'created_at',  label: 'Created Date', type: 'date' },
  ],
  product: [
    { key: 'name',         label: 'Name',   type: 'text' },
    { key: 'code',         label: 'Code',   type: 'text' },
    { key: 'product_type', label: 'Type',   type: 'text' },
    { key: 'created_at',   label: 'Created Date', type: 'date' },
  ],
};

// For lookup-text filters encoded as "LOOKUP:table|labelCol|fkCol", resolve the
// matching FK IDs from the lookup table and return a plain eq-in filter on the FK column.
// Returns null if no matches found (caller should add a never-match filter).
export async function resolveLookupTextFilter(f: ActiveFilter): Promise<ActiveFilter[] | null> {
  // Encoded as "LOOKUP:table|labelCol|fkCol|value|operator"
  if (!f.field.startsWith('LOOKUP:')) return null;
  const [, rest] = f.field.split('LOOKUP:');
  const [table, labelCol, fkCol] = rest.split('|');
  if (!table || !labelCol || !fkCol) return null;

  // crm_user has no is_deleted column — filter by is_active; also use user_id as PK
  const pkCol = table === 'crm_user' ? 'user_id' : fkCol;
  let qb: ReturnType<typeof supabase.from> = supabase.from(table).select(`${pkCol},${labelCol}`).limit(200);
  if (table === 'crm_user') {
    qb = (qb as any).eq('is_active', true);
  }
  switch (f.operator) {
    case 'contains':     qb = (qb as any).ilike(labelCol, `%${f.value}%`); break;
    case 'not_contains': qb = (qb as any).not(labelCol, 'ilike', `%${f.value}%`); break;
    case 'starts_with':  qb = (qb as any).ilike(labelCol, `${f.value}%`); break;
    case 'ends_with':    qb = (qb as any).ilike(labelCol, `%${f.value}`); break;
    case 'eq':           qb = (qb as any).ilike(labelCol, f.value); break;
    default:             qb = (qb as any).ilike(labelCol, `%${f.value}%`);
  }
  const { data } = await qb;
  if (!data?.length) {
    // Return a filter that matches nothing
    return [{ id: f.id, field: fkCol, label: f.label, operator: 'eq', value: '__no_match__' }];
  }
  // Map each result ID into an IN-style filter on the FK column
  // For crm_user, pkCol = user_id but fkCol = owner_id (the FK on the source table)
  const ids = (data as Record<string, unknown>[]).map((r) => String(r[pkCol])).filter(Boolean);
  return [{ id: f.id, field: fkCol, label: f.label, operator: 'in' as FilterOperator, value: ids.join(',') }];
}

// Map logical field names to physical column names where they differ
const LOGICAL_TO_PHYSICAL: Record<string, string> = {
  statecode: 'state_code',
  statusreason: 'status_reason',
};

// Resolve any LOOKUP: filters to concrete ID-based filters before building query
async function resolveFilters(filters: ActiveFilter[]): Promise<ActiveFilter[]> {
  const resolved: ActiveFilter[] = [];
  for (const f of filters) {
    if (f.field.startsWith('LOOKUP:')) {
      const r = await resolveLookupTextFilter(f);
      if (r) resolved.push(...r);
    } else {
      const physField = LOGICAL_TO_PHYSICAL[f.field] ?? f.field;
      resolved.push(physField === f.field ? f : { ...f, field: physField });
    }
  }
  return resolved;
}

/**
 * Normalise an input date string to YYYY-MM-DD regardless of input format.
 * <input type="date"> always produces YYYY-MM-DD, but guard against MM/DD/YYYY too.
 */
function toUtcDateStr(value: string): string {
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // MM/DD/YYYY → YYYY-MM-DD
  const parts = value.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  // Fallback: let Date parse it and re-format in UTC
  const d = new Date(value);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns [startISO, endISO] for a full local calendar day offset from `base`.
 * offsetDays=0 → today, -1 → yesterday, +1 → tomorrow, etc.
 * Midnight boundaries are in local time, then converted to UTC for the DB.
 */
function localDayRange(base: Date, offsetDays: number): [string, string] {
  const start = new Date(base);
  start.setDate(start.getDate() + offsetDays);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return [start.toISOString(), end.toISOString()];
}

function applyFilterToQuery<T>(q: T, f: ActiveFilter): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qb = q as any;
  const now = new Date();

  switch (f.operator) {
    case 'contains':     return qb.ilike(f.field, `%${f.value}%`);
    case 'not_contains': return qb.not(f.field, 'ilike', `%${f.value}%`);
    case 'starts_with':  return qb.ilike(f.field, `${f.value}%`);
    case 'ends_with':    return qb.ilike(f.field, `%${f.value}`);
    case 'eq':           return qb.eq(f.field, f.value);
    case 'neq':          return qb.neq(f.field, f.value);
    case 'in':           return qb.in(f.field, f.value.split(',').filter(Boolean));
    case 'gt':           return qb.gt(f.field, f.value);
    case 'gte':          return qb.gte(f.field, f.value);
    case 'lt':           return qb.lt(f.field, f.value);
    case 'lte':          return qb.lte(f.field, f.value);
    case 'is_empty':     return qb.or(`${f.field}.is.null,${f.field}.eq.`);
    case 'is_not_empty': return qb.not(f.field, 'is', null);
    case 'last_7_days': {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      return qb.gte(f.field, d.toISOString());
    }
    case 'last_30_days': {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      return qb.gte(f.field, d.toISOString());
    }
    case 'last_90_days': {
      const d = new Date(now); d.setDate(d.getDate() - 90);
      return qb.gte(f.field, d.toISOString());
    }
    // --- date: absolute ---
    // Use UTC-based parsing to avoid local-timezone shifts corrupting the day boundary.
    // Input f.value is "YYYY-MM-DD" from <input type="date">; treat it as a UTC calendar day.
    case 'on': {
      const dateStr = toUtcDateStr(f.value);
      return qb.gte(f.field, `${dateStr}T00:00:00.000Z`).lte(f.field, `${dateStr}T23:59:59.999Z`);
    }
    case 'on_or_after': {
      const dateStr = toUtcDateStr(f.value);
      return qb.gte(f.field, `${dateStr}T00:00:00.000Z`);
    }
    case 'on_or_before': {
      const dateStr = toUtcDateStr(f.value);
      return qb.lte(f.field, `${dateStr}T23:59:59.999Z`);
    }
    // --- date: relative ---
    // All relative ranges use the local calendar day so "today" means today in the user's TZ.
    // localDayRange() converts local midnight→midnight to UTC ISO strings for the DB query.
    case 'today': {
      const [s, e] = localDayRange(now, 0);
      return qb.gte(f.field, s).lte(f.field, e);
    }
    case 'yesterday': {
      const [s, e] = localDayRange(now, -1);
      return qb.gte(f.field, s).lte(f.field, e);
    }
    case 'tomorrow': {
      const [s, e] = localDayRange(now, 1);
      return qb.gte(f.field, s).lte(f.field, e);
    }
    case 'this_week': {
      const day   = now.getDay();
      const [s]   = localDayRange(now, -day);
      const [, e] = localDayRange(now, 6 - day);
      return qb.gte(f.field, s).lte(f.field, e);
    }
    case 'last_week': {
      const day   = now.getDay();
      const [, e] = localDayRange(now, -day - 1);
      const [s]   = localDayRange(now, -day - 7);
      return qb.gte(f.field, s).lte(f.field, e);
    }
    case 'next_week': {
      const day   = now.getDay();
      const [s]   = localDayRange(now, 7 - day);
      const [, e] = localDayRange(now, 13 - day);
      return qb.gte(f.field, s).lte(f.field, e);
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return qb.gte(f.field, start.toISOString()).lte(f.field, end.toISOString());
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return qb.gte(f.field, start.toISOString()).lte(f.field, end.toISOString());
    }
    case 'next_month': {
      const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
      return qb.gte(f.field, start.toISOString()).lte(f.field, end.toISOString());
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return qb.gte(f.field, start.toISOString()).lte(f.field, end.toISOString());
    }
    case 'last_year': {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end   = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      return qb.gte(f.field, start.toISOString()).lte(f.field, end.toISOString());
    }
    case 'next_year': {
      const start = new Date(now.getFullYear() + 1, 0, 1);
      const end   = new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59, 999);
      return qb.gte(f.field, start.toISOString()).lte(f.field, end.toISOString());
    }
    default: return qb.eq(f.field, f.value);
  }
}

async function resolveOwnerEmails(ownerIds: (string | null)[]): Promise<Record<string, string>> {
  const ids = [...new Set(ownerIds.filter(Boolean))] as string[];
  if (ids.length === 0) return {};
  const { data } = await supabase.rpc('fn_get_user_display_map', { p_user_ids: ids });
  const map: Record<string, string> = {};
  for (const u of (data ?? []) as { user_id: string; display_name: string }[]) {
    map[u.user_id] = u.display_name;
  }
  return map;
}

const stateCodeLabelCache = new Map<string, { data: Record<string, string>; ts: number }>();
const statusReasonLabelCache = new Map<string, { data: Record<string, string>; ts: number }>();
const STATUS_LABEL_CACHE_TTL = 300_000;

async function resolveStateCodeLabels(entityDefId: string): Promise<Record<string, string>> {
  const cached = stateCodeLabelCache.get(entityDefId);
  if (cached && Date.now() - cached.ts < STATUS_LABEL_CACHE_TTL) return cached.data;
  const { data } = await supabase
    .from('statecode_definition')
    .select('state_value, display_label')
    .eq('entity_definition_id', entityDefId);
  const map: Record<string, string> = {};
  for (const r of data ?? []) map[String(r.state_value)] = r.display_label;
  stateCodeLabelCache.set(entityDefId, { data: map, ts: Date.now() });
  return map;
}

async function resolveStatusReasonLabels(entityDefId: string): Promise<Record<string, string>> {
  const cached = statusReasonLabelCache.get(entityDefId);
  if (cached && Date.now() - cached.ts < STATUS_LABEL_CACHE_TTL) return cached.data;
  const { data } = await supabase
    .from('status_reason_definition')
    .select('reason_value, display_label')
    .eq('entity_definition_id', entityDefId)
    .eq('is_active', true);
  const map: Record<string, string> = {};
  for (const r of data ?? []) map[String(r.reason_value)] = r.display_label;
  statusReasonLabelCache.set(entityDefId, { data: map, ts: Date.now() });
  return map;
}

// A BPF stage key (e.g. "stage_1780914561053" / "condition_…") must never surface
// in the lifecycle Status / Status Reason columns. It leaks in when a process flow
// is misconfigured to write its stage into state_code/status_reason instead of
// bpf_stage. Such records are lifecycle-Open, so resolve any stray stage key to the
// default ('1') label rather than exposing the raw id in the grid — for every entity.
const STAGE_KEY_RE = /^(stage|condition)_/i;

function applyStatusLabels(
  rows: ListRow[],
  stateCodeMap: Record<string, string>,
  statusReasonMap: Record<string, string>,
): ListRow[] {
  const resolve = (
    value: unknown,
    map: Record<string, string>,
    fallback: string,
  ): string | null => {
    if (value == null) return null;
    const code = String(value);
    if (STAGE_KEY_RE.test(code)) return map['1'] ?? fallback;
    return map[code] ?? code;
  };
  return rows.map((r) => ({
    ...r,
    state_code: resolve(r.state_code, stateCodeMap, 'Open'),
    status_reason: resolve(r.status_reason, statusReasonMap, 'New'),
  }));
}

/**
 * For each related column spec, batch-fetches the related field values keyed by FK value.
 * Returns a map: colKey → { fkValue → fieldValue }
 */
async function resolveRelatedColumns(
  specs: RelatedColumnSpec[],
  rows: { id: string; [key: string]: unknown }[]
): Promise<Record<string, Record<string, unknown>>> {
  if (specs.length === 0) return {};

  // Group specs by (relatedTable + fkColumn) to batch queries per relationship
  type GroupKey = string;
  const groups = new Map<GroupKey, { specs: RelatedColumnSpec[]; relatedTable: string; fkColumn: string }>();
  for (const spec of specs) {
    const key: GroupKey = `${spec.relatedTable}::${spec.fkColumn}`;
    if (!groups.has(key)) groups.set(key, { specs: [], relatedTable: spec.relatedTable, fkColumn: spec.fkColumn });
    groups.get(key)!.specs.push(spec);
  }

  const result: Record<string, Record<string, unknown>> = {};

  await Promise.all(
    [...groups.values()].map(async ({ specs: groupSpecs, relatedTable, fkColumn }) => {
      // Collect unique FK values from all rows
      const fkValues = [...new Set(
        rows.map((r) => r[fkColumn]).filter((v) => v != null) as string[]
      )];
      if (fkValues.length === 0) return;

      const PK_OVERRIDES: Record<string, string> = {
        product_family: 'family_id', line_of_business: 'lob_id',
        crm_user: 'user_id', security_role: 'role_id',
      };
      const relatedPk = PK_OVERRIDES[relatedTable] ?? `${relatedTable}_id`;

      const physCols = [...new Set(groupSpecs.map((s) => s.fieldPhysicalColumn))];
      const fallbackCols = [...new Set(groupSpecs.flatMap((s) => s.fallbackFields ?? []))];
      const selectSet = new Set([relatedPk, ...physCols, ...fallbackCols]);
      const selectCols = [...selectSet].join(', ');

      const { data } = await supabase
        .from(relatedTable)
        .select(selectCols)
        .in(relatedPk, fkValues);

      if (!data) return;

      // Build lookup: pkValue → row data
      const pkToRow = new Map<string, Record<string, unknown>>();
      for (const r of data) pkToRow.set(String((r as unknown as Record<string, unknown>)[relatedPk]), r as unknown as Record<string, unknown>);

      // Populate result for each spec
      for (const spec of groupSpecs) {
        result[spec.colKey] = {};
        for (const sourceRow of rows) {
          const fkVal = sourceRow[fkColumn];
          if (fkVal == null) continue;
          const relRow = pkToRow.get(String(fkVal));
          if (relRow) {
            let val = relRow[spec.fieldPhysicalColumn] ?? null;
            if ((!val || (typeof val === 'string' && val.trim() === '')) && spec.fallbackFields) {
              for (const fb of spec.fallbackFields) {
                const fbVal = relRow[fb];
                if (fbVal && (typeof fbVal !== 'string' || fbVal.trim() !== '')) { val = fbVal; break; }
              }
            }
            result[spec.colKey][sourceRow.id] = val;
          }
        }
      }
    })
  );

  return result;
}

/** Merges related-column values into each row using the result of resolveRelatedColumns */
function applyRelatedColumns(
  rows: ListRow[],
  relValues: Record<string, Record<string, unknown>>
): ListRow[] {
  if (Object.keys(relValues).length === 0) return rows;
  return rows.map((row) => {
    const extra: Record<string, unknown> = {};
    for (const [colKey, byRowId] of Object.entries(relValues)) {
      extra[colKey] = byRowId[row.id] ?? '—';
    }
    return { ...row, ...extra };
  });
}

// Search fields per entity for full-text search
const SEARCH_FIELDS: Record<string, string[]> = {
  accounts:      ['account_name'],
  contacts:      ['first_name', 'last_name', 'email'],
  leads:         ['first_name', 'last_name', 'company_name', 'email'],
  opportunities: ['topic'],
  tickets:       ['title'],
};

// Entities that have computed full_name from first_name + last_name
const HAS_FULL_NAME = new Set(['contact', 'lead']);


/**
 * Universal entity list fetcher.
 * Uses select('*') to return ALL columns from the entity table,
 * then post-processes to resolve owners, status labels, and lookup labels.
 */
async function fetchUniversal(entity: AppEntity, opts: ListOptions): Promise<ListResult> {
  const { table, pk, entityDefinitionId: resolvedDefId } = await resolveEntityMeta(entity);
  const tableCols = await getTableColumns(table);

  const { search, sortKey = 'created_at', sortDir = 'desc', page = 1, pageSize = 25, filters: rawFilters = [], relatedColumns = [], columnKeyMap = {}, readAccessLevel, accessContext, sharedRecordIds } = opts;
  const filters = await resolveFilters(rawFilters);
  const from = (page - 1) * pageSize;

  const hasOwner = tableCols.has('owner_id');
  const hasCurrency = tableCols.has('currency_id') && table !== 'currency';
  const defaultSortCol = tableCols.has('created_at') ? 'created_at' : pk;

  const selectExpr = hasCurrency ? `*, currency:currency_id(code, symbol)` : '*';

  const buildQuery = (filtersToApply: ActiveFilter[], overrideSortKey?: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from(table).select(selectExpr, { count: 'exact' });

    if (tableCols.has('is_deleted')) q = q.eq('is_deleted', false);
    else if (tableCols.has('deleted_at')) q = q.is('deleted_at', null);

    if (hasOwner && (readAccessLevel || sharedRecordIds?.size)) {
      if (readAccessLevel && accessContext) {
        q = applyReadAccessFilter(q, readAccessLevel, accessContext, pk, sharedRecordIds);
      } else if (sharedRecordIds?.size) {
        // No scope restriction but shared IDs — just add the shared records via OR
        q = q.or(`owner_id.is.null,${pk}.in.(${[...sharedRecordIds].join(',')})`);
      }
    }

    if (search) {
      const fields = SEARCH_FIELDS[entity];
      if (fields && fields.length > 0) {
        // Quote + escape the term so commas/parentheses in the search string
        // cannot break out of the or() filter expression (PostgREST injection).
        const safe = search.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const expr = fields.map((f) => `${f}.ilike."%${safe}%"`).join(',');
        q = q.or(expr);
      } else {
        const columns = ENTITY_COLUMNS[entity] ?? [];
        const linkCol = columns.find((c) => c.type === 'link')?.field_physical_column
          ?? (tableCols.has('name') ? 'name' : null);
        if (linkCol) q = q.ilike(linkCol, `%${search}%`);
      }
    }

    for (const f of filtersToApply) {
      if (tableCols.has(f.field)) q = applyFilterToQuery(q, f);
    }

    const effectiveSortKey = overrideSortKey
      ?? (tableCols.has(sortKey) ? sortKey : defaultSortCol);
    q = q.order(effectiveSortKey, { ascending: sortDir === 'asc' }).range(from, from + pageSize - 1);
    return q;
  };

  let result = await buildQuery(filters);
  if (result.error && filters.length > 0) result = await buildQuery([]);
  if (result.error) result = await buildQuery([], pk);
  if (result.error) throw result.error;

  const data: Record<string, unknown>[] = result.data ?? [];
  const count: number = result.count ?? 0;

  // --- Post-processing ---
  const entityDefId = ENTITY_DEFINITION_ID[entity] ?? resolvedDefId;
  const hasStateCode = tableCols.has('state_code');
  const hasStatusReason = tableCols.has('status_reason');

  const [ownerMap, stateCodeMap, statusReasonMap] = await Promise.all([
    hasOwner ? resolveOwnerEmails(data.map((r) => r.owner_id as string | null)) : Promise.resolve({} as Record<string, string>),
    hasStateCode && entityDefId ? resolveStateCodeLabels(entityDefId) : Promise.resolve({} as Record<string, string>),
    hasStatusReason && entityDefId ? resolveStatusReasonLabels(entityDefId) : Promise.resolve({} as Record<string, string>),
  ]);

  const computeFullName = HAS_FULL_NAME.has(table);

  let rows: ListRow[] = data.map((r) => {
    const row: ListRow = { id: r[pk] as string };
    for (const [k, v] of Object.entries(r)) {
      if (k === pk) continue;
      // Skip Supabase nested join objects (currency, etc.) — handled separately
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) continue;
      row[k] = v ?? null;
    }
    // Owner email
    if (hasOwner && r.owner_id) {
      row.owner_email = ownerMap[r.owner_id as string] ?? null;
    }
    // Currency from join
    if (hasCurrency) {
      const cur = r.currency as { code: string; symbol: string } | null;
      row.currency_code = cur?.code ?? null;
      row.currency_symbol = cur?.symbol ?? null;
    }
    // Computed full_name
    if (computeFullName) {
      row.full_name = [r.first_name, r.last_name].filter(Boolean).join(' ') || null;
    }
    // Ticket subject alias
    if (table === 'ticket' && r.title) {
      row.subject = r.title;
    }
    return row;
  });

  // Apply status/state label resolution
  if (hasStateCode || hasStatusReason) {
    rows = applyStatusLabels(rows, stateCodeMap, statusReasonMap);
  }

  // Resolve related entity columns
  const relValues = await resolveRelatedColumns(relatedColumns, rows);
  rows = applyRelatedColumns(rows, relValues);

  // Copy physical column values to logical column keys so dynamically added columns resolve.
  // Runs AFTER all label resolution so labels (not raw codes) are copied.
  if (Object.keys(columnKeyMap).length > 0) {
    rows = rows.map((row) => {
      const extra: Record<string, unknown> = {};
      for (const [logicalKey, physicalCol] of Object.entries(columnKeyMap)) {
        if (logicalKey === physicalCol) continue;
        if (row[logicalKey] !== undefined) continue;
        if (row[physicalCol] !== undefined) extra[logicalKey] = row[physicalCol];
      }
      return Object.keys(extra).length > 0 ? { ...row, ...extra } : row;
    });
  }

  return { rows, total: count };
}

export async function fetchEntityList(entity: AppEntity, opts: ListOptions): Promise<ListResult> {
  return fetchUniversal(entity, opts);
}

const ENTITY_TABLE_MAP: Record<string, string> = {
  accounts:       'account',
  contacts:       'contact',
  leads:          'lead',
  opportunities:  'opportunity',
  tickets:        'ticket',
  product_family: 'product_family',
  product:        'product',
};

const ENTITY_PK_MAP: Record<string, string> = {
  accounts:       'account_id',
  contacts:       'contact_id',
  leads:          'lead_id',
  opportunities:  'opportunity_id',
  tickets:        'case_id',
  product_family: 'family_id',
  product:        'product_id',
};

const dynamicEntityMetaCache = new Map<string, { table: string; pk: string; entityDefinitionId?: string }>();

async function resolveEntityMeta(entity: AppEntity): Promise<{ table: string; pk: string; entityDefinitionId?: string }> {
  if (ENTITY_TABLE_MAP[entity] && ENTITY_PK_MAP[entity]) {
    return { table: ENTITY_TABLE_MAP[entity], pk: ENTITY_PK_MAP[entity], entityDefinitionId: ENTITY_DEFINITION_ID[entity] };
  }
  const cached = dynamicEntityMetaCache.get(entity);
  if (cached) return cached;

  const logicalName = entity;
  const { data } = await supabase
    .from('entity_definition')
    .select('entity_definition_id, physical_table_name, primary_field_name')
    .eq('logical_name', logicalName)
    .maybeSingle();

  if (!data?.physical_table_name) throw new Error(`Unknown entity: ${entity}`);

  const table = data.physical_table_name;
  // Use the DB to find the real PK — avoids wrong guesses when the table name
  // has a prefix (e.g. crm_partners → partners_id, not crm_partners_id).
  // Fallback uses logical_name (not physical table name) because the PK is always logical_name + '_id'.
  const { data: pkCol } = await supabase.rpc('get_table_pk_column', { p_table: table });
  const pk = (pkCol as string | null) ?? `${logicalName}_id`;

  const meta = { table, pk, entityDefinitionId: data.entity_definition_id as string | undefined };
  dynamicEntityMetaCache.set(entity, meta);
  return meta;
}

export async function updateRowFields(
  entity: AppEntity,
  id: string,
  fields: Record<string, unknown>,
  userId: string
): Promise<void> {
  const { table, pk } = await resolveEntityMeta(entity);
  const tableCols = await getTableColumns(table);
  const payload: Record<string, unknown> = { ...fields };
  if (tableCols.has('modified_at')) payload.modified_at = new Date().toISOString();
  if (tableCols.has('modified_by')) payload.modified_by = userId;
  const { error } = await supabase
    .from(table)
    .update(payload)
    .eq(pk, id);
  if (error) throw error;
}

export async function fetchSavedFilters(entity: AppEntity): Promise<SavedFilter[]> {
  const { data, error } = await supabase
    .from('saved_filter')
    .select('id, name, entity, conditions')
    .eq('entity', entity)
    .order('name');
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    entity: r.entity,
    conditions: r.conditions as ActiveFilter[],
  }));
}

export async function saveFilter(
  entity: AppEntity,
  name: string,
  conditions: ActiveFilter[],
  userId: string,
  existingId?: string
): Promise<SavedFilter | null> {
  if (existingId) {
    const { data, error } = await supabase
      .from('saved_filter')
      .update({ name, conditions, updated_at: new Date().toISOString() })
      .eq('id', existingId)
      .select('id, name, entity, conditions')
      .maybeSingle();
    if (error) return null;
    return data ? { id: data.id, name: data.name, entity: data.entity, conditions: data.conditions as ActiveFilter[] } : null;
  }
  const { data, error } = await supabase
    .from('saved_filter')
    .insert({ entity, name, conditions, user_id: userId })
    .select('id, name, entity, conditions')
    .maybeSingle();
  if (error) return null;
  return data ? { id: data.id, name: data.name, entity: data.entity, conditions: data.conditions as ActiveFilter[] } : null;
}

export async function deleteSavedFilter(id: string): Promise<void> {
  await supabase.from('saved_filter').delete().eq('id', id);
}

export async function bulkUpdateRows(
  entity: AppEntity,
  ids: string[],
  fields: Record<string, unknown>,
  userId: string
): Promise<{ updated: number; errors: number }> {
  const { table, pk } = await resolveEntityMeta(entity);
  const tableCols = await getTableColumns(table);
  let updated = 0;
  let errors = 0;
  const payload: Record<string, unknown> = { ...fields };
  if (tableCols.has('modified_at')) payload.modified_at = new Date().toISOString();
  if (tableCols.has('modified_by')) payload.modified_by = userId;
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await supabase
      .from(table)
      .update(payload)
      .in(pk, chunk);
    if (error) errors += chunk.length;
    else updated += chunk.length;
  }
  return { updated, errors };
}

export async function bulkDeleteRows(
  entity: AppEntity,
  ids: string[],
  userId: string
): Promise<{ deleted: number; errors: number }> {
  return bulkUpdateRows(entity, ids, { is_deleted: true }, userId).then((r) => ({
    deleted: r.updated,
    errors: r.errors,
  }));
}

let crmUsersCache: { data: { id: string; email: string }[]; ts: number } | null = null;
const CRM_USERS_CACHE_TTL = 120_000;

export async function fetchCrmUsers(): Promise<{ id: string; email: string }[]> {
  if (crmUsersCache && Date.now() - crmUsersCache.ts < CRM_USERS_CACHE_TTL) return crmUsersCache.data;
  const { data, error } = await supabase.rpc('fn_list_active_crm_users');
  if (error) return [];
  const result = ((data ?? []) as { user_id: string; email: string }[]).map((u) => ({ id: u.user_id, email: u.email }));
  crmUsersCache = { data: result, ts: Date.now() };
  return result;
}
