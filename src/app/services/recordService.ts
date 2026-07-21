import { supabase } from '../../lib/supabase';
import type { AppEntity } from '../types';
import { ENTITY_DEFINITION_ID } from '../types';
import type { FormDefinition } from '../../types/form';
import type { BusinessRule } from '../../types/businessRule';
import { createNotification } from './notificationService';
import { dispatchAutomationForEvent } from './automation/dispatch';
import { provisionRecordStorage } from '../../services/documentService';
import { logProvisionFailure } from '../../services/documentProvisionRepairService';
import {
  hasNonNullMonetaryValue,
  hasCurrencyLock,
  isStatusLocked,
  writeMonetaryFieldAudit,
  fetchCurrencies,
} from './currencyService';
import { getTable, getSnapshotVersion } from './metadata/metadataStore';

export type RecordData = Record<string, unknown>;

/** Dev-only diagnostic (stripped in production builds). */
function devWarn(...args: unknown[]): void {
  if (import.meta.env?.DEV) console.warn('[recordService]', ...args);
}

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

const dynamicEntityMetaCache = new Map<string, { table: string; pk: string; entityDefinitionId?: string }>();

async function resolveEntityMeta(entity: AppEntity): Promise<{ table: string; pk: string; entityDefinitionId?: string }> {
  if (ENTITY_TABLE[entity] && ENTITY_PK[entity]) {
    return { table: ENTITY_TABLE[entity], pk: ENTITY_PK[entity], entityDefinitionId: ENTITY_DEFINITION_ID[entity] };
  }
  const cached = dynamicEntityMetaCache.get(entity);
  if (cached) return cached;

  const { data } = await supabase
    .from('entity_definition')
    .select('physical_table_name, entity_definition_id')
    .eq('logical_name', entity)
    .maybeSingle();

  if (!data?.physical_table_name) throw new Error(`Unknown entity: ${entity}`);

  const table = data.physical_table_name;
  // Use the DB to find the real PK — avoids wrong guesses when the table name
  // has a prefix (e.g. crm_partners → partners_id, not crm_partners_id).
  // Fallback uses logical_name (not physical table name) because the PK is always logical_name + '_id'.
  const { data: pkCol } = await supabase.rpc('get_table_pk_column', { p_table: table });
  const pk = (pkCol as string | null) ?? `${entity}_id`;
  // Resolve the entity_definition_id here too so custom entities get their
  // default statecode (Active) on insert — the hardcoded ENTITY_DEFINITION_ID
  // map only covers system entities, so custom entities were inserted with a
  // NULL state_code and then hidden by any "Active" (state_code = 1) view filter.
  const meta = { table, pk, entityDefinitionId: data.entity_definition_id as string | undefined };
  dynamicEntityMetaCache.set(entity, meta);
  return meta;
}

export async function getEntityTable(entity: AppEntity): Promise<string> {
  const { table } = await resolveEntityMeta(entity);
  return table;
}
/** Resolve the entity_definition_id for an AppEntity slug (handles plural slugs and
 *  custom entities via resolveEntityMeta). Distinct from getEntityDefinitionId, which
 *  takes a logical name. */
export async function getAppEntityDefinitionId(entity: AppEntity): Promise<string | undefined> {
  const { entityDefinitionId } = await resolveEntityMeta(entity);
  return entityDefinitionId;
}
export async function getEntityPK(entity: AppEntity): Promise<string> {
  const { pk } = await resolveEntityMeta(entity);
  return pk;
}

// Physical column sets are cached with a short TTL so that a column added from
// Admin Studio (ALTER TABLE) becomes visible to saves without a full page reload.
// Callers that just performed/observed DDL can force a fresh read.
const tableColumnsCache = new Map<string, { cols: Set<string>; ts: number; epoch: number | null }>();
const TABLE_COLUMNS_TTL = 60_000;

/**
 * Published-metadata epoch guard. Any per-entity/table metadata cached below is
 * stamped with the snapshot version it was built against; when a newer version is
 * published the stamp no longer matches and the entry is treated as stale, so a
 * field/column added through the builder becomes visible immediately after publish
 * without waiting out the TTL. (`resetMetadataCaches` still clears everything on the
 * publish event; this guard also covers callers that read between the event and a
 * reset, and the null-vs-number transition on first hydrate.)
 */
function metadataEpoch(): number | null {
  return getSnapshotVersion();
}

/** Drop the cached physical-column set for one table, or all tables. */
export function clearTableColumnsCache(table?: string): void {
  if (table) tableColumnsCache.delete(table);
  else tableColumnsCache.clear();
}

export async function getTableColumns(
  table: string,
  opts: { force?: boolean } = {},
): Promise<Set<string>> {
  const epoch = metadataEpoch();
  const cached = tableColumnsCache.get(table);
  const fresh = cached && cached.epoch === epoch && Date.now() - cached.ts < TABLE_COLUMNS_TTL;
  if (!opts.force && fresh) return cached!.cols;
  const { data } = await supabase.rpc('get_table_columns', { p_table: table });
  if (data && Array.isArray((data as { cols: string[] }).cols)) {
    const cols = new Set<string>((data as { cols: string[] }).cols);
    tableColumnsCache.set(table, { cols, ts: Date.now(), epoch });
    return cols;
  }
  // Keep a stale-but-usable set rather than caching an empty one on a transient RPC
  // failure (an empty set disables the column filter, which is the safer fallback).
  if (cached) return cached.cols;
  const empty = new Set<string>();
  tableColumnsCache.set(table, { cols: empty, ts: Date.now(), epoch });
  return empty;
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
): Promise<{ stateValue: number; reasonValue: number | null } | null> {
  const { data: sc } = await supabase
    .from('statecode_definition')
    .select('statecode_id')
    .eq('entity_definition_id', entityDefId)
    .eq('state_value', stateValue)
    .maybeSingle();
  if (!sc) return null;
  // Prefer the flagged default reason, then fall back to the lowest-valued one.
  // Do NOT filter on is_active here: some entities seed status_reason_definition
  // rows with is_active = null (see [[filter-condition-label-resolution]] gotcha #1),
  // and over-filtering them out used to make this whole function return null —
  // leaving state_code NULL and the record hidden by any "Active" view filter.
  const { data: sr } = await supabase
    .from('status_reason_definition')
    .select('reason_value')
    .eq('entity_definition_id', entityDefId)
    .eq('statecode_id', sc.statecode_id)
    .eq('is_default', true)
    .maybeSingle();
  if (sr) return { stateValue, reasonValue: sr.reason_value };
  const { data: first } = await supabase
    .from('status_reason_definition')
    .select('reason_value')
    .eq('entity_definition_id', entityDefId)
    .eq('statecode_id', sc.statecode_id)
    .order('reason_value')
    .limit(1)
    .maybeSingle();
  // Always set the state even when no reason row exists — the statecode is what
  // the "Active" filter matches on; a missing status_reason must not block it.
  return { stateValue, reasonValue: first ? first.reason_value : null };
}

export interface FieldMapping {
  logicalToPhysical: Record<string, string>;
  physicalToLogical: Record<string, string>;
}

/**
 * Merge an authoritative mapping (typically the one the open form already built
 * from its live `field_definition` load) over a base/cached mapping. The override
 * wins so a field added moments ago is honored even when the shared, TTL-cached
 * {@link getFieldMapping} hasn't picked it up yet. This is what lets ANY field
 * placed on a form load and save without per-field code. A no-op when `override`
 * is undefined, so every existing caller (bulk edit, inline grid edit) is unchanged.
 */
export function mergeFieldMapping(base: FieldMapping, override?: FieldMapping | null): FieldMapping {
  if (!override) return base;
  return {
    logicalToPhysical: { ...base.logicalToPhysical, ...override.logicalToPhysical },
    physicalToLogical: { ...base.physicalToLogical, ...override.physicalToLogical },
  };
}

const fieldMappingCache: Partial<Record<AppEntity, { mapping: FieldMapping; ts: number; epoch: number | null }>> = {};
const FIELD_MAPPING_TTL = 60_000;

export function clearFieldMappingCache(entity?: AppEntity) {
  if (entity) delete fieldMappingCache[entity];
  else for (const k of Object.keys(fieldMappingCache)) delete fieldMappingCache[k as AppEntity];
}

/**
 * Drop ALL metadata-derived caches in this service. Called after a new
 * customization version is published so the next reads rebuild from the
 * fresh snapshot. (See src/app/services/metadata/cacheBus.ts.)
 */
export function resetMetadataCaches(): void {
  clearFieldMappingCache();
  dynamicEntityMetaCache.clear();
  tableColumnsCache.clear();
  entityDefIdCache.clear();
  defaultFormCache.clear();
  entityRulesCache.clear();
}

async function getFieldMapping(entity: AppEntity, opts: { force?: boolean } = {}): Promise<FieldMapping> {
  const epoch = metadataEpoch();
  const cached = fieldMappingCache[entity];
  if (!opts.force && cached && cached.epoch === epoch && Date.now() - cached.ts < FIELD_MAPPING_TTL) {
    return cached.mapping;
  }

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
  fieldMappingCache[entity] = { mapping, ts: Date.now(), epoch };
  return mapping;
}

/**
 * Translate UI/logical values into a physical-column write payload for an entity,
 * dropping anything that isn't a real, writable column. This is the single shared
 * builder used by record save, bulk edit, and inline grid edit so they all agree on
 * what is writable and self-heal against a stale column cache.
 *
 * `missingColumns` lists metadata fields that map to a physical column the table does
 * not actually have (genuine metadata/DB drift) — callers should surface these loudly
 * instead of silently dropping the value. The column cache is force-refreshed once
 * before deciding, so a column added moments ago (ALTER TABLE) is picked up rather
 * than reported as missing.
 */
export async function toWritablePhysicalPayload(
  entity: AppEntity,
  values: RecordData,
  mappingOverride?: FieldMapping | null,
): Promise<{ payload: RecordData; missingColumns: string[] }> {
  const { table } = await resolveEntityMeta(entity);
  const mapping = mergeFieldMapping(await getFieldMapping(entity), mappingOverride);
  const physical = translateToPhysical(values, mapping, table);
  const intended = Object.keys(physical);

  let cols = await getTableColumns(table);
  // Self-heal: an intended column missing from the cache may have just been added.
  if (cols.size > 0 && intended.some((k) => !cols.has(k))) {
    cols = await getTableColumns(table, { force: true });
  }
  const missingColumns = cols.size > 0 ? intended.filter((k) => !cols.has(k)) : [];
  const payload = filterToExistingColumns(physical, cols);

  // Surface SILENT drops (req. #9): a value the form supplied that maps to no
  // physical column at all — neither via the field mapping nor as a direct
  // physical write — and isn't a recognized system/form-internal key. These never
  // reach `intended`/`missingColumns`, so without this they vanish with no trace.
  if (import.meta.env?.DEV) {
    const knownPhysical = new Set(Object.values(mapping.logicalToPhysical));
    for (const [key, val] of Object.entries(values)) {
      if (val === undefined) continue;
      if (mapping.logicalToPhysical[key] || knownPhysical.has(key)) continue;
      if (SYSTEM_FIELDS.has(key) || FORM_INTERNAL_KEYS.has(key)) continue;
      devWarn(
        `Form field "${key}" on "${String(entity)}" was dropped from the save payload: ` +
        `no field_definition maps it to a physical column, and it is not itself a known ` +
        `column. Add/publish the field in Admin Studio, or check the control's logical name.`,
      );
    }
  }

  return { payload, missingColumns };
}

/**
 * Translate the KEYS of a value object from logical names to physical column names,
 * passing through any key that has no mapping (so direct system-column writes like
 * `is_deleted`, `state_code`, `owner_id` survive). Unlike {@link toWritablePhysicalPayload}
 * this does NOT drop unmapped keys — it is for bulk/system writes where the caller
 * supplies physical columns directly. Values are not type-converted.
 */
export async function translateKeysToPhysical(
  entity: AppEntity,
  values: RecordData,
): Promise<RecordData> {
  const mapping = await getFieldMapping(entity);
  const out: RecordData = {};
  for (const [k, v] of Object.entries(values)) {
    const phys = mapping.logicalToPhysical[k] ?? k;
    if (!(phys in out)) out[phys] = v;
  }
  return out;
}

/** Message shown when a save/bulk-edit maps fields to columns the table lacks. */
export function missingColumnsError(entity: string, missing: string[]): Error {
  return new Error(
    `Cannot save ${entity}: no database column exists for field(s) ${missing.join(', ')}. ` +
    `The database schema is out of sync with the metadata — open Admin Studio → System Health ` +
    `and click "Reload schema cache", then try again.`,
  );
}

export function translateToLogical(record: RecordData, mapping: FieldMapping): RecordData {
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

export function translateToPhysical(values: RecordData, mapping: FieldMapping, table: string): RecordData {
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

export async function fetchRecord(
  entity: AppEntity,
  id: string,
  mappingOverride?: FieldMapping | null,
): Promise<RecordData> {
  const { table, pk } = await resolveEntityMeta(entity);

  let q = supabase.from(table).select('*').eq(pk, id);
  q = applySoftDeleteFilter(q, table);

  const [{ data, error }, baseMapping] = await Promise.all([
    q.maybeSingle(),
    getFieldMapping(entity),
  ]);

  if (error) throw error;
  if (!data) throw new Error('Record not found');
  // The form's own field map (when supplied) wins so a just-added column's value is
  // exposed under its logical name even if the shared TTL cache hasn't caught up.
  return translateToLogical(data as RecordData, mergeFieldMapping(baseMapping, mappingOverride));
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

/**
 * Keys the form state carries that are intentionally NOT persisted as ordinary
 * columns (BPF flow state, transient UI flags). Excluded from the dev "dropped
 * field" warning so it only fires on genuine metadata gaps, not by-design keys.
 */
const FORM_INTERNAL_KEYS = new Set([
  'bpf_is_finished', 'completed_stage_ids', 'active_process_stage_id',
  'active_process_flow_id', 'stage', 'stagecode',
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

// Product access is enforced server-side by the BEFORE INSERT/UPDATE trigger
// `fn_validate_product_access_on_save` on lead/opportunity, which raises an
// `insufficient_privilege` (SQLSTATE 42501) error when the user may not assign
// the product. The underlying `fn_check_product_access` function is intentionally
// revoked from `authenticated` (it's called only from triggers/policies), so the
// frontend can no longer pre-check it directly. Instead we translate the trigger's
// error into a friendly message after the save attempt.
function rethrowProductAccessError(entity: AppEntity, error: { code?: string; message?: string }): never {
  const isProductAccessDenial =
    PRODUCT_FIELD_ENTITIES.has(entity) &&
    (error.code === '42501' || /product access denied/i.test(error.message ?? ''));
  if (isProductAccessDenial) {
    throw new Error('You do not have permission to assign this product. Contact your administrator to request access.');
  }
  throw error;
}

export async function saveRecord(
  entity: AppEntity,
  id: string | null,
  values: RecordData,
  userId: string,
  mappingOverride?: FieldMapping | null,
): Promise<RecordData> {
  const { table, pk, entityDefinitionId } = await resolveEntityMeta(entity);
  const entitySlug = table;
  const mapping = mergeFieldMapping(await getFieldMapping(entity), mappingOverride);
  // Build the writable payload through the shared helper so a just-added column is
  // picked up (self-heal) and genuine metadata/DB drift is surfaced loudly instead
  // of silently dropping the user's value. The form's authoritative map (when passed)
  // guarantees every field it rendered maps to its column even if the cache is stale.
  const { payload: physicalValues, missingColumns } = await toWritablePhysicalPayload(entity, values, mappingOverride);
  if (missingColumns.length > 0) throw missingColumnsError(String(entity), missingColumns);
  const tableCols = await getTableColumns(table);

  // Custom entities (not in static ENTITY_TABLE) always have created_by/owner_id/modified_by
  // columns from _crm_entity_create_table_ddl. Inject unconditionally so RLS passes even when
  // getTableColumns returns empty (auth.uid() null inside its SECURITY DEFINER context).
  const isCustomEntity = !(ENTITY_TABLE[entity] && ENTITY_PK[entity]);

  if (id) {
    const prevRecord = await fetchRecord(entity, id, mappingOverride).catch(() => null);

    const updatePayload: Record<string, unknown> = { ...physicalValues };
    if (isCustomEntity || tableCols.has('modified_at')) updatePayload.modified_at = new Date().toISOString();
    if (isCustomEntity || tableCols.has('modified_by')) updatePayload.modified_by = userId;
    // Strip keys with no matching column (no-op when tableCols is empty). See insert path below.
    const finalUpdate = filterToExistingColumns(updatePayload, tableCols);
    const { data, error } = await supabase
      .from(table)
      .update(finalUpdate)
      .eq(pk, id)
      .select()
      .maybeSingle();
    if (error) rethrowProductAccessError(entity, error);
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

    // Power Automation: detect matching rules and enqueue durable jobs (the
    // server worker executes the actions). Best-effort; never blocks the save.
    dispatchAutomationForEvent(entitySlug, 'update', id, saved, prevRecord, userId);

    return saved;
  } else {
    const insertPayload: Record<string, unknown> = { ...physicalValues };
    if (isCustomEntity || tableCols.has('created_by')) insertPayload.created_by = userId;
    // Default owner to the current user, but honor an explicit owner picked on the form
    // (owner is now an editable lookup) so "create record with owner" persists correctly.
    if (isCustomEntity || tableCols.has('owner_id')) {
      if (insertPayload.owner_id == null) insertPayload.owner_id = userId;
    }
    if (isCustomEntity || tableCols.has('owner_type')) insertPayload.owner_type = 'user';
    if ((isCustomEntity || tableCols.has('state_code')) && insertPayload.state_code == null) {
      const defId = entityDefinitionId ?? ENTITY_DEFINITION_ID[entity];
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
    // Drop any keys that don't map to a real column. The isCustomEntity heuristic
    // force-injects created_by/owner_id/owner_type, but hand-built reference tables
    // (crm_source, country, currency, industry) lack owner_type and would 400.
    // No-op when tableCols is empty, preserving the custom-entity injection fallback.
    const finalInsert = filterToExistingColumns(insertPayload, tableCols);
    const { data, error } = await supabase
      .from(table)
      .insert(finalInsert)
      .select()
      .maybeSingle();
    if (error) rethrowProductAccessError(entity, error);
    if (!data) {
      // The INSERT committed but the new row is not readable under RLS — e.g. a
      // create-only user (can_create without can_read). Ownership does not grant
      // read, by design, so RETURNING yields no row. Return the submitted values
      // (no server-generated id) so the caller can finish gracefully; downstream
      // steps that need the new PK are skipped.
      return translateToLogical(finalInsert as RecordData, mapping);
    }
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

    // Power Automation: detect + enqueue on create (before = null).
    dispatchAutomationForEvent(entitySlug, 'create', created[pk] as string, created, null, userId);

    // Eagerly provision the record's storage folder (best-effort; no-op when the
    // entity has no Document Location configured or the file server is offline).
    // Seeds document_path with the record folder when the column exists and is empty.
    //
    // A failure here used to be swallowed entirely, leaving the record with no
    // folder and no trace. Now it's queued in document_provision_failure so
    // Admin Studio → Document Location can list it and re-run it ("Repair
    // folders"). Logging is itself best-effort — it must never break the create.
    provisionRecordStorage(entitySlug, created[pk] as string)
      .then(async (prov) => {
        if (prov?.relativePath && tableCols.has('document_path')) {
          await supabase.from(table)
            .update({ document_path: prov.relativePath })
            .eq(pk, created[pk] as string)
            .is('document_path', null);
        }
      })
      .catch((err) =>
        logProvisionFailure(
          entitySlug,
          created[pk] as string,
          err,
          getRecordLabel(entity, created)
        ).catch(() => {})
      );

    return created;
  }
}

function getRecordLabel(entity: AppEntity, record: RecordData): string {
  if (entity === 'accounts')      return (record.name ?? record.account_name) as string ?? '';
  if (entity === 'contacts')      return `${record.firstname ?? record.first_name ?? ''} ${record.lastname ?? record.last_name ?? ''}`.trim();
  if (entity === 'leads')         return (`${record.firstname ?? record.first_name ?? ''} ${record.lastname ?? record.last_name ?? ''}`.trim()) || ((record.companyname ?? record.company_name) as string ?? '');
  if (entity === 'opportunities') return (record.name ?? record.topic) as string ?? '';
  if (entity === 'tickets')       return (record.title as string) ?? '';
  // Generic fallback for custom entities: use the common primary-name columns so
  // assignment notifications etc. show a meaningful label instead of being blank.
  return (record.name ?? record.full_name ?? record.title ?? record.topic ?? '') as string;
}

const entityDefIdCache = new Map<string, { id: string; ts: number }>();
const ENTITY_DEF_CACHE_TTL = 300_000;

export async function getEntityDefinitionId(logicalName: string): Promise<string | null> {
  const cached = entityDefIdCache.get(logicalName);
  if (cached && Date.now() - cached.ts < ENTITY_DEF_CACHE_TTL) return cached.id;

  const snap = getTable<{ entity_definition_id: string; logical_name: string }>('entity_definition');
  if (snap !== null) {
    const ent = snap.find((e) => e.logical_name === logicalName);
    if (!ent) return null;
    entityDefIdCache.set(logicalName, { id: ent.entity_definition_id, ts: Date.now() });
    return ent.entity_definition_id;
  }

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

  const snap = getTable<FormDefinition & { deleted_at: string | null }>('form_definition');
  if (snap !== null) {
    const fd = snap.find((f) =>
      f.entity_definition_id === entityDefId &&
      f.form_type === 'main' &&
      f.is_default === true &&
      f.deleted_at == null) ?? null;
    defaultFormCache.set(cacheKey, { data: fd, ts: Date.now() });
    return fd;
  }

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
  const snap = getTable<FormDefinition & { deleted_at: string | null }>('form_definition');
  if (snap !== null) {
    return snap.find((f) => f.form_id === formId && f.deleted_at == null) ?? null;
  }
  const { data, error } = await supabase
    .from('form_definition')
    .select('*')
    .eq('form_id', formId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data as FormDefinition | null;
}

export interface SelectableForm {
  form_id: string;
  name: string;
  is_default: boolean;
}

/**
 * Lists the selectable MAIN forms for an entity (the ones a user picks between
 * when creating/opening a record). Snapshot-first like fetchDefaultForm, so it
 * reads the published metadata in the Sales app and falls back to a live query
 * in Admin Studio. The default form sorts first. Generic — works for any entity.
 */
export async function fetchSelectableMainForms(entity: AppEntity): Promise<SelectableForm[]> {
  const logicalName = ENTITY_FORM_LOGICAL[entity] ?? entity;
  const entityDefId = await getEntityDefinitionId(logicalName);
  if (!entityDefId) return [];

  const toSelectable = (rows: { form_id: string; name: string; is_default: boolean }[]): SelectableForm[] =>
    rows
      .map((f) => ({ form_id: f.form_id, name: f.name, is_default: f.is_default === true }))
      .sort((a, b) =>
        a.is_default === b.is_default ? a.name.localeCompare(b.name) : a.is_default ? -1 : 1);

  const snap = getTable<FormDefinition & { deleted_at: string | null }>('form_definition');
  if (snap !== null) {
    return toSelectable(
      snap.filter((f) =>
        f.entity_definition_id === entityDefId &&
        f.form_type === 'main' &&
        f.deleted_at == null)
    );
  }

  const { data, error } = await supabase
    .from('form_definition')
    .select('form_id, name, is_default')
    .eq('entity_definition_id', entityDefId)
    .eq('form_type', 'main')
    .eq('is_active', true)
    .is('deleted_at', null);
  if (error) throw error;
  return toSelectable((data ?? []) as { form_id: string; name: string; is_default: boolean }[]);
}

const entityRulesCache = new Map<string, { data: BusinessRule[]; ts: number }>();
const RULES_CACHE_TTL = 120_000;

export async function fetchEntityRules(entity: AppEntity): Promise<BusinessRule[]> {
  const logicalName = ENTITY_FORM_LOGICAL[entity] ?? entity;
  const cached = entityRulesCache.get(logicalName);
  if (cached && Date.now() - cached.ts < RULES_CACHE_TTL) return cached.data;

  const entityDefId = await getEntityDefinitionId(logicalName);
  if (!entityDefId) return [];

  const snap = getTable<BusinessRule & { deleted_at: string | null; run_order: number }>('business_rule');
  if (snap !== null) {
    const rules = snap
      .filter((r) => r.entity_definition_id === entityDefId && r.is_active === true && r.deleted_at == null)
      .sort((a, b) => (a.run_order ?? 0) - (b.run_order ?? 0));
    entityRulesCache.set(logicalName, { data: rules, ts: Date.now() });
    return rules;
  }

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

  const r = record as unknown as Record<string, unknown>;
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
