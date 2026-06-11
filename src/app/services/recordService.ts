import { supabase } from '../../lib/supabase';
import type { AppEntity } from '../types';
import { ENTITY_DEFINITION_ID } from '../types';
import type { FormDefinition } from '../../types/form';
import type { BusinessRule } from '../../types/businessRule';
import { createNotification } from './notificationService';
import { runWorkflowsForEvent } from './workflowEngine';
import {
  hasNonNullMonetaryValue,
  hasCurrencyLock,
  isStatusLocked,
  writeMonetaryFieldAudit,
  fetchCurrencies,
} from './currencyService';

export type RecordData = Record<string, unknown>;

const ENTITY_TABLE: Record<string, string> = {
  accounts:       'account',
  contacts:       'contact',
  leads:          'lead',
  opportunities:  'opportunity',
  tickets:        'ticket',
  product_family: 'product_family',
  product:        'product',
};

const ENTITY_PK: Record<string, string> = {
  accounts:       'account_id',
  contacts:       'contact_id',
  leads:          'lead_id',
  opportunities:  'opportunity_id',
  tickets:        'ticket_id',
  product_family: 'family_id',
  product:        'product_id',
};

const ENTITY_FORM_LOGICAL: Record<string, string> = {
  accounts:       'account',
  contacts:       'contact',
  leads:          'lead',
  opportunities:  'opportunity',
  tickets:        'ticket',
  product_family: 'product_family',
  product:        'product',
};

const dynamicEntityMetaCache = new Map<string, { table: string; pk: string }>();

async function resolveEntityMeta(entity: AppEntity): Promise<{ table: string; pk: string }> {
  if (ENTITY_TABLE[entity] && ENTITY_PK[entity]) {
    return { table: ENTITY_TABLE[entity], pk: ENTITY_PK[entity] };
  }
  const cached = dynamicEntityMetaCache.get(entity);
  if (cached) return cached;

  const { data } = await supabase
    .from('entity_definition')
    .select('physical_table_name')
    .eq('logical_name', entity)
    .maybeSingle();

  if (!data?.physical_table_name) throw new Error(`Unknown entity: ${entity}`);

  const table = data.physical_table_name;
  // Use the DB to find the real PK — avoids wrong guesses when the table name
  // has a prefix (e.g. crm_partners → partners_id, not crm_partners_id).
  // Fallback uses logical_name (not physical table name) because the PK is always logical_name + '_id'.
  const { data: pkCol } = await supabase.rpc('get_table_pk_column', { p_table: table });
  const pk = (pkCol as string | null) ?? `${entity}_id`;
  const meta = { table, pk };
  dynamicEntityMetaCache.set(entity, meta);
  return meta;
}

export async function getEntityTable(entity: AppEntity): Promise<string> {
  const { table } = await resolveEntityMeta(entity);
  return table;
}
export async function getEntityPK(entity: AppEntity): Promise<string> {
  const { pk } = await resolveEntityMeta(entity);
  return pk;
}

const tableColumnsCache = new Map<string, Set<string>>();

export async function getTableColumns(table: string): Promise<Set<string>> {
  const cached = tableColumnsCache.get(table);
  if (cached) return cached;
  const { data } = await supabase.rpc('get_table_columns', { p_table: table });
  if (data && Array.isArray((data as { cols: string[] }).cols)) {
    const cols = new Set<string>((data as { cols: string[] }).cols);
    tableColumnsCache.set(table, cols);
    return cols;
  }
  tableColumnsCache.set(table, new Set());
  return tableColumnsCache.get(table)!;
}

export function filterToExistingColumns(
  payload: Record<string, unknown>,
  columns: Set<string>,
): Record<string, unknown> {
  if (columns.size === 0) return payload;
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (columns.has(k)) filtered[k] = v;
  }
  return filtered;
}

export async function getDefaultStatusForState(
  entityDefId: string,
  stateValue: number,
): Promise<{ stateValue: number; reasonValue: number } | null> {
  const { data: sc } = await supabase
    .from('statecode_definition')
    .select('statecode_id')
    .eq('entity_definition_id', entityDefId)
    .eq('state_value', stateValue)
    .maybeSingle();
  if (!sc) return null;
  const { data: sr } = await supabase
    .from('status_reason_definition')
    .select('reason_value')
    .eq('entity_definition_id', entityDefId)
    .eq('statecode_id', sc.statecode_id)
    .eq('is_active', true)
    .eq('is_default', true)
    .maybeSingle();
  if (sr) return { stateValue, reasonValue: sr.reason_value };
  const { data: first } = await supabase
    .from('status_reason_definition')
    .select('reason_value')
    .eq('entity_definition_id', entityDefId)
    .eq('statecode_id', sc.statecode_id)
    .eq('is_active', true)
    .order('reason_value')
    .limit(1)
    .maybeSingle();
  if (first) return { stateValue, reasonValue: first.reason_value };
  return null;
}

interface FieldMapping {
  logicalToPhysical: Record<string, string>;
  physicalToLogical: Record<string, string>;
}

const fieldMappingCache: Partial<Record<AppEntity, FieldMapping>> = {};

export function clearFieldMappingCache(entity?: AppEntity) {
  if (entity) delete fieldMappingCache[entity];
  else for (const k of Object.keys(fieldMappingCache)) delete fieldMappingCache[k as AppEntity];
}

async function getFieldMapping(entity: AppEntity): Promise<FieldMapping> {
  if (fieldMappingCache[entity]) return fieldMappingCache[entity]!;

  const entityLogical = ENTITY_FORM_LOGICAL[entity] ?? entity;

  const { data: entityDef } = await supabase
    .from('entity_definition')
    .select('entity_definition_id')
    .eq('logical_name', entityLogical)
    .maybeSingle();

  const logicalToPhysical: Record<string, string> = {};
  const physicalToLogical: Record<string, string> = {};

  if (entityDef) {
    const { data } = await supabase
      .from('field_definition')
      .select('logical_name, physical_column_name')
      .eq('entity_definition_id', entityDef.entity_definition_id)
      .eq('is_active', true);

    for (const row of (data ?? []) as { logical_name: string; physical_column_name: string }[]) {
      if (!row.physical_column_name || row.physical_column_name.startsWith('custom_fields')) continue;
      logicalToPhysical[row.logical_name] = row.physical_column_name;
      if (!physicalToLogical[row.physical_column_name]) {
        physicalToLogical[row.physical_column_name] = row.logical_name;
      }
    }
  }

  const mapping = { logicalToPhysical, physicalToLogical };
  fieldMappingCache[entity] = mapping;
  return mapping;
}

function translateToLogical(record: RecordData, mapping: FieldMapping): RecordData {
  const result: RecordData = {};
  const mappedLogical = new Set<string>();

  // First pass: map physical columns that have an explicit mapping (e.g. industry_id -> industry)
  for (const [physCol, val] of Object.entries(record)) {
    if (physCol === 'custom_fields') continue;
    const logicalName = mapping.physicalToLogical[physCol];
    if (logicalName) {
      result[logicalName] = val;
      result[physCol] = val;
      mappedLogical.add(logicalName);
    }
  }

  // Second pass: carry over unmapped physical columns, but never overwrite a mapped logical name
  for (const [physCol, val] of Object.entries(record)) {
    if (physCol === 'custom_fields') continue;
    if (mapping.physicalToLogical[physCol]) continue; // already handled
    if (!mappedLogical.has(physCol)) {
      result[physCol] = val;
    }
  }

  return result;
}

function translateToPhysical(values: RecordData, mapping: FieldMapping, table: string): RecordData {
  const result: RecordData = {};
  const usedPhysical = new Set<string>();
  const dbManaged = DB_MANAGED_PHYSICAL_COLUMNS[table] ?? new Set<string>();
  const knownPhysical = new Set(Object.values(mapping.logicalToPhysical));

  const entries = Object.entries(values);

  // Pass 1: logical name → physical column via field mapping
  for (const [key, val] of entries) {
    if (!mapping.logicalToPhysical[key]) continue;
    const physCol = mapping.logicalToPhysical[key];
    if (dbManaged.has(physCol)) continue;
    if (!usedPhysical.has(physCol)) {
      result[physCol] = val;
      usedPhysical.add(physCol);
    }
  }

  // Pass 2: direct physical column writes (values already using physical column names)
  for (const [key, val] of entries) {
    if (mapping.logicalToPhysical[key]) continue;
    if (!knownPhysical.has(key)) continue;
    if (dbManaged.has(key) || usedPhysical.has(key)) continue;
    result[key] = val;
    usedPhysical.add(key);
  }

  return result;
}

const DELETED_AT_TABLES = new Set([
  'business_unit', 'country', 'crm_user', 'industry',
  'product', 'product_family', 'security_role', 'team',
]);
const NO_SOFT_DELETE_TABLES = new Set(['currency', 'organization']);

function applySoftDeleteFilter(q: any, table: string): any {
  if (NO_SOFT_DELETE_TABLES.has(table)) return q;
  if (DELETED_AT_TABLES.has(table)) return q.is('deleted_at', null);
  return q.eq('is_deleted', false);
}

export async function fetchRecord(entity: AppEntity, id: string): Promise<RecordData> {
  const { table, pk } = await resolveEntityMeta(entity);

  let q = supabase.from(table).select('*').eq(pk, id);
  q = applySoftDeleteFilter(q, table);

  const [{ data, error }, mapping] = await Promise.all([
    q.maybeSingle(),
    getFieldMapping(entity),
  ]);

  if (error) throw error;
  if (!data) throw new Error('Record not found');
  return translateToLogical(data as RecordData, mapping);
}

const SYSTEM_FIELDS = new Set([
  'created_at', 'created_by', 'modified_at', 'modified_by',
  'owner_id', 'owner_type', 'is_deleted', 'deleted_at',
  'modifiedon', 'createdon',
  'currency_locked', 'currency_lock_reason',
  // internal form state / generated columns
  'full_name', 'state_code', 'statecode', 'status_reason', 'statusreason',
  'stage', 'stagecode', 'active_process_flow_id', 'active_process_stage_id',
  'version_no', 'business_unit_id',
  'disqualified_at', 'disqualified_by', 'disqualify_reason', 'reopen_reason',
  'is_qualified', 'originating_lead_id',
  'account_number', 'ticket_number',
]);

const DB_MANAGED_PHYSICAL_COLUMNS: Record<string, Set<string>> = {
  account: new Set(['account_number', 'account_id', 'version_no']),
  contact: new Set(['contact_id', 'version_no', 'full_name']),
  lead:    new Set(['lead_id', 'version_no', 'full_name']),
  opportunity: new Set(['opportunity_id', 'version_no']),
  ticket:  new Set(['ticket_id', 'ticket_number', 'version_no']),
  product_family: new Set(['family_id']),
  product: new Set(['product_id']),
  industry: new Set(['industry_id']),
  currency: new Set(['currency_id']),
  country: new Set(['country_id']),
  crm_source: new Set(['source_id']),
};

function serializeValue(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

async function writeFieldChanges(
  entityName: string,
  recordId: string,
  userId: string,
  prev: RecordData,
  next: RecordData,
  mapping: FieldMapping
) {
  const rows: {
    entity_name: string;
    record_id: string;
    changed_by: string;
    changed_at: string;
    field_name: string;
    old_value: string | null;
    new_value: string | null;
  }[] = [];

  const changedAt = new Date().toISOString();
  const physicalColumnsWithAlias = new Set(
    Object.entries(mapping.physicalToLogical)
      .filter(([phys, logical]) => phys !== logical)
      .map(([phys]) => phys)
  );

  for (const key of Object.keys(next)) {
    if (SYSTEM_FIELDS.has(key)) continue;
    if (physicalColumnsWithAlias.has(key)) continue;
    const oldVal = serializeValue(prev[key]);
    const newVal = serializeValue(next[key]);
    if (oldVal === newVal) continue;
    rows.push({
      entity_name: entityName,
      record_id: recordId,
      changed_by: userId,
      changed_at: changedAt,
      field_name: key,
      old_value: oldVal,
      new_value: newVal,
    });
  }

  if (rows.length === 0) return;
  await supabase.from('field_change_log').insert(rows);
}

const PRODUCT_FIELD_ENTITIES = new Set<AppEntity>(['leads', 'opportunities']);

async function assertProductAccess(entity: AppEntity, values: RecordData): Promise<void> {
  if (!PRODUCT_FIELD_ENTITIES.has(entity)) return;
  const productId = (values['product_id'] ?? values['productid']) as string | null | undefined;
  if (!productId) return;

  const { data, error } = await supabase
    .rpc('fn_check_product_access', { p_product_id: productId, p_access_mode: 'read', p_user_id: (await supabase.auth.getUser()).data.user?.id });

  // Fail closed: if the access check itself errors, deny the assignment rather
  // than silently proceeding (previously `if (error) return;` failed open).
  if (error) {
    throw new Error('Unable to verify product access. Please try again or contact your administrator.');
  }
  if (data === false) {
    throw new Error('You do not have permission to assign this product. Contact your administrator to request access.');
  }
}

export async function saveRecord(
  entity: AppEntity,
  id: string | null,
  values: RecordData,
  userId: string
): Promise<RecordData> {
  const { table, pk } = await resolveEntityMeta(entity);
  const entitySlug = table;
  const mapping = await getFieldMapping(entity);
  const physicalValues = translateToPhysical(values, mapping, table);
  const tableCols = await getTableColumns(table);

  await assertProductAccess(entity, values);

  // Custom entities (not in static ENTITY_TABLE) always have created_by/owner_id/modified_by
  // columns from _crm_entity_create_table_ddl. Inject unconditionally so RLS passes even when
  // getTableColumns returns empty (auth.uid() null inside its SECURITY DEFINER context).
  const isCustomEntity = !(ENTITY_TABLE[entity] && ENTITY_PK[entity]);

  if (id) {
    const prevRecord = await fetchRecord(entity, id).catch(() => null);

    const updatePayload: Record<string, unknown> = { ...physicalValues };
    if (isCustomEntity || tableCols.has('modified_at')) updatePayload.modified_at = new Date().toISOString();
    if (isCustomEntity || tableCols.has('modified_by')) updatePayload.modified_by = userId;
    const { data, error } = await supabase
      .from(table)
      .update(updatePayload)
      .eq(pk, id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Update returned no data for ${table} id=${id}`);
    const saved = translateToLogical(data as RecordData, mapping);

    if (prevRecord) {
      writeFieldChanges(entitySlug, id, userId, prevRecord, saved, mapping).catch(() => {});
    }

    if (hasCurrencyLock(entity) && (prevRecord || saved)) {
      const prevStatus = String(prevRecord?.state_code ?? prevRecord?.statecode ?? '');
      const nextStatus = String(saved.state_code ?? saved.statecode ?? '');
      const statusJustLocked = !isStatusLocked(entity, prevStatus) && isStatusLocked(entity, nextStatus);
      const wasAlreadyLocked = !!prevRecord?.currency_locked;

      if (!wasAlreadyLocked && saved.currency_id) {
        if (statusJustLocked) {
          supabase.from(table).update({
            currency_locked: true,
            currency_lock_reason: 'status_threshold',
          }).eq(pk, id).then(() => {});
        } else if (hasNonNullMonetaryValue(entity, saved)) {
          supabase.from(table).update({
            currency_locked: true,
            currency_lock_reason: 'value_saved',
          }).eq(pk, id).then(() => {});
        }
      }

      if (prevRecord) {
        fetchCurrencies().then((currencies) => {
          writeMonetaryFieldAudit(
            entitySlug, id, userId, prevRecord, saved, currencies, 'system_save'
          ).catch(() => {});
        }).catch(() => {});
      }
    }

    const newOwnerId = (saved.owner_id ?? saved.ownerid) as string | null;
    const prevOwnerId = (prevRecord?.owner_id ?? prevRecord?.ownerid) as string | null;
    if (
      newOwnerId &&
      newOwnerId !== userId &&
      newOwnerId !== prevOwnerId
    ) {
      createNotification({
        recipient_id: newOwnerId,
        sender_id: userId,
        type: 'assignment',
        title: `A ${entitySlug} record was assigned to you`,
        body: getRecordLabel(entity, saved),
        entity_name: entitySlug,
        record_id: id,
      }).catch(() => {});
    }

    runWorkflowsForEvent(entitySlug, 'on_update', id, saved, userId).catch(() => {});

    return saved;
  } else {
    const insertPayload: Record<string, unknown> = { ...physicalValues };
    if (isCustomEntity || tableCols.has('created_by')) insertPayload.created_by = userId;
    if (isCustomEntity || tableCols.has('owner_id'))   insertPayload.owner_id = userId;
    if (isCustomEntity || tableCols.has('owner_type')) insertPayload.owner_type = 'user';
    if ((isCustomEntity || tableCols.has('state_code')) && insertPayload.state_code == null) {
      const defId = ENTITY_DEFINITION_ID[entity];
      if (defId) {
        const defaults = await getDefaultStatusForState(defId, 1);
        if (defaults) {
          insertPayload.state_code = defaults.stateValue;
          if (tableCols.has('status_reason') && insertPayload.status_reason == null) {
            insertPayload.status_reason = defaults.reasonValue;
          }
        }
      }
    }
    const { data, error } = await supabase
      .from(table)
      .insert(insertPayload)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Insert returned no data for ${table}`);
    const created = translateToLogical(data as RecordData, mapping);

    if (hasCurrencyLock(entity) && created.currency_id) {
      const newStatus = String(created.state_code ?? created.statecode ?? '');
      const shouldLock =
        hasNonNullMonetaryValue(entity, created) || isStatusLocked(entity, newStatus);

      if (shouldLock) {
        const reason = isStatusLocked(entity, newStatus) ? 'status_threshold' : 'value_saved';
        supabase.from(table).update({
          currency_locked: true,
          currency_lock_reason: reason,
        }).eq(pk, created[pk] as string).then(() => {});
      }
    }

    runWorkflowsForEvent(entitySlug, 'on_create', created[pk] as string, created, userId).catch(() => {});

    return created;
  }
}

function getRecordLabel(entity: AppEntity, record: RecordData): string {
  if (entity === 'accounts')      return (record.name ?? record.account_name) as string ?? '';
  if (entity === 'contacts')      return `${record.firstname ?? record.first_name ?? ''} ${record.lastname ?? record.last_name ?? ''}`.trim();
  if (entity === 'leads')         return (`${record.firstname ?? record.first_name ?? ''} ${record.lastname ?? record.last_name ?? ''}`.trim()) || ((record.companyname ?? record.company_name) as string ?? '');
  if (entity === 'opportunities') return (record.name ?? record.topic) as string ?? '';
  if (entity === 'tickets')       return (record.title as string) ?? '';
  return '';
}

const entityDefIdCache = new Map<string, { id: string; ts: number }>();
const ENTITY_DEF_CACHE_TTL = 300_000;

export async function getEntityDefinitionId(logicalName: string): Promise<string | null> {
  const cached = entityDefIdCache.get(logicalName);
  if (cached && Date.now() - cached.ts < ENTITY_DEF_CACHE_TTL) return cached.id;

  const { data } = await supabase
    .from('entity_definition')
    .select('entity_definition_id')
    .eq('logical_name', logicalName)
    .maybeSingle();

  if (!data) return null;
  entityDefIdCache.set(logicalName, { id: data.entity_definition_id, ts: Date.now() });
  return data.entity_definition_id;
}

const defaultFormCache = new Map<string, { data: FormDefinition | null; ts: number }>();
const FORM_CACHE_TTL = 120_000;

export async function fetchDefaultForm(entity: AppEntity): Promise<FormDefinition | null> {
  const logicalName = ENTITY_FORM_LOGICAL[entity] ?? entity;
  const cacheKey = logicalName;
  const cached = defaultFormCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < FORM_CACHE_TTL) return cached.data;

  const entityDefId = await getEntityDefinitionId(logicalName);
  if (!entityDefId) return null;

  const { data, error } = await supabase
    .from('form_definition')
    .select('form_id, entity_definition_id, name, form_type, is_default, layout_json, is_active, is_system, created_at, modified_at, deleted_at')
    .eq('entity_definition_id', entityDefId)
    .eq('form_type', 'main')
    .eq('is_default', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;

  const fd = data as FormDefinition | null;
  defaultFormCache.set(cacheKey, { data: fd, ts: Date.now() });
  return fd;
}

export async function fetchFormById(formId: string): Promise<FormDefinition | null> {
  const { data, error } = await supabase
    .from('form_definition')
    .select('*')
    .eq('form_id', formId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data as FormDefinition | null;
}

const entityRulesCache = new Map<string, { data: BusinessRule[]; ts: number }>();
const RULES_CACHE_TTL = 120_000;

export async function fetchEntityRules(entity: AppEntity): Promise<BusinessRule[]> {
  const logicalName = ENTITY_FORM_LOGICAL[entity] ?? entity;
  const cached = entityRulesCache.get(logicalName);
  if (cached && Date.now() - cached.ts < RULES_CACHE_TTL) return cached.data;

  const entityDefId = await getEntityDefinitionId(logicalName);
  if (!entityDefId) return [];

  const { data, error } = await supabase
    .from('business_rule')
    .select('business_rule_id, entity_definition_id, name, description, trigger_json, action_json, run_order, is_active, is_system, is_deletable, scope, target_form_id, target_process_flow_id, target_process_stage_id, created_at, modified_at, deleted_at, created_by')
    .eq('entity_definition_id', entityDefId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('run_order');

  if (error) throw error;
  const rules = (data ?? []) as BusinessRule[];
  entityRulesCache.set(logicalName, { data: rules, ts: Date.now() });
  return rules;
}

export async function fetchTimelineItems(entity: AppEntity, recordId: string): Promise<TimelineItem[]> {
  const { table, pk } = await resolveEntityMeta(entity);
  const tableCols = await getTableColumns(table);

  const selectFields: string[] = [];
  if (tableCols.has('created_at')) selectFields.push('created_at');
  if (tableCols.has('created_by')) selectFields.push('created_by');
  if (tableCols.has('modified_at')) selectFields.push('modified_at');
  if (tableCols.has('modified_by')) selectFields.push('modified_by');

  if (selectFields.length === 0) return [];

  const { data: record } = await supabase
    .from(table)
    .select(selectFields.join(', '))
    .eq(pk, recordId)
    .maybeSingle();

  if (!record) return [];

  const r = record as Record<string, unknown>;
  const items: TimelineItem[] = [];

  if (r.created_at) {
    items.push({
      id: 'created',
      type: 'system',
      action: 'Record Created',
      timestamp: r.created_at as string,
      userId: (r.created_by as string) ?? null,
    });
  }

  if (r.modified_at && r.modified_at !== r.created_at) {
    items.push({
      id: 'modified',
      type: 'system',
      action: 'Record Modified',
      timestamp: r.modified_at as string,
      userId: (r.modified_by as string) ?? null,
    });
  }

  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export interface TimelineItem {
  id: string;
  type: 'note' | 'system' | 'activity';
  action: string;
  body?: string;
  timestamp: string;
  userId: string | null;
}

export interface FieldChangeEntry {
  log_id: string;
  entity_name: string;
  record_id: string;
  changed_by: string | null;
  changed_at: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
}

export async function fetchFieldHistory(
  entity: AppEntity,
  recordId: string
): Promise<FieldChangeEntry[]> {
  const { table: entitySlug } = await resolveEntityMeta(entity);
  const { data, error } = await supabase
    .from('field_change_log')
    .select('*')
    .eq('entity_name', entitySlug)
    .eq('record_id', recordId)
    .order('changed_at', { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as FieldChangeEntry[];
}
