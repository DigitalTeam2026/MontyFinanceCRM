import { supabase } from '../../lib/supabase';
import type { AppEntity } from '../types';

export interface CurrencyRecord {
  currency_id: string;
  code: string;
  name: string;
  symbol: string;
  exchange_rate: number;
  is_base: boolean;
  is_active: boolean;
}

let currencyCache: CurrencyRecord[] | null = null;
let baseCurrencyCache: CurrencyRecord | null = null;

export function invalidateCurrencyCache(): void {
  currencyCache = null;
  baseCurrencyCache = null;
}

export async function fetchCurrencies(): Promise<CurrencyRecord[]> {
  if (currencyCache) return currencyCache;
  const { data, error } = await supabase
    .from('currency')
    .select('*')
    .eq('is_active', true)
    .order('is_base', { ascending: false })
    .order('code');
  if (error) throw error;
  currencyCache = (data ?? []) as CurrencyRecord[];
  return currencyCache;
}

export async function fetchBaseCurrency(): Promise<CurrencyRecord | null> {
  if (baseCurrencyCache) return baseCurrencyCache;
  const currencies = await fetchCurrencies();
  baseCurrencyCache = currencies.find((c) => c.is_base) ?? currencies[0] ?? null;
  return baseCurrencyCache;
}

export function getCurrencyById(currencies: CurrencyRecord[], currencyId: string | null | undefined): CurrencyRecord | undefined {
  if (!currencyId) return undefined;
  return currencies.find((c) => c.currency_id === currencyId);
}

export function formatCurrencyValue(
  val: unknown,
  currency: CurrencyRecord | undefined,
  opts: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {}
): string {
  if (val == null || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  const code = currency?.code ?? 'USD';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: opts.minimumFractionDigits ?? 0,
    maximumFractionDigits: opts.maximumFractionDigits ?? 0,
  }).format(num);
}

const ENTITY_TABLE_MAP: Partial<Record<AppEntity, string>> = {
  accounts: 'account',
  leads: 'lead',
  opportunities: 'opportunity',
};

const ENTITY_PK_MAP: Partial<Record<AppEntity, string>> = {
  accounts: 'account_id',
  leads: 'lead_id',
  opportunities: 'opportunity_id',
};

export const MONETARY_FIELDS: Partial<Record<AppEntity, string[]>> = {
  accounts: ['annual_revenue'],
  leads: ['estimated_value'],
  opportunities: ['estimated_value', 'actual_value'],
};

export type CurrencyLockReason = 'value_saved' | 'status_threshold' | 'admin_override';

export type CurrencyChangeSource =
  | 'system_save'
  | 'controlled_currency_change'
  | 'workflow'
  | 'import'
  | 'status_lock';

const STATUS_LOCK_THRESHOLDS: Partial<Record<AppEntity, Set<string>>> = {
  leads: new Set(['2', '3']),
  opportunities: new Set(['2', '3']),
  accounts: new Set(['1']),
};

export function isStatusLocked(entity: AppEntity, statusCode: string | null | undefined): boolean {
  if (!statusCode) return false;
  return STATUS_LOCK_THRESHOLDS[entity]?.has(statusCode) ?? false;
}

export function hasCurrencyLock(entity: AppEntity): boolean {
  return entity in ENTITY_TABLE_MAP;
}

export function hasNonNullMonetaryValue(
  entity: AppEntity,
  values: Record<string, unknown>
): boolean {
  const fields = MONETARY_FIELDS[entity] ?? [];
  return fields.some((f) => {
    const v = values[f];
    return v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
  });
}

export async function lockRecordCurrency(
  entity: AppEntity,
  recordId: string,
  reason: CurrencyLockReason
): Promise<void> {
  const table = ENTITY_TABLE_MAP[entity];
  const pk = ENTITY_PK_MAP[entity];
  if (!table || !pk) return;
  await supabase
    .from(table)
    .update({ currency_locked: true, currency_lock_reason: reason })
    .eq(pk, recordId);
}

export interface CurrencyAuditEntry {
  entityName: string;
  recordId: string;
  fieldName: string;
  oldAmount: number | null;
  newAmount: number | null;
  oldCurrency: CurrencyRecord | undefined;
  newCurrency: CurrencyRecord | undefined;
  changeSource: CurrencyChangeSource;
  reason?: string;
  changedBy: string;
}

export async function writeCurrencyAuditLog(entry: CurrencyAuditEntry): Promise<void> {
  const conversionOccurred =
    !!entry.oldCurrency &&
    !!entry.newCurrency &&
    entry.oldCurrency.currency_id !== entry.newCurrency.currency_id;

  let exchangeRateSnapshot: number | null = null;
  if (conversionOccurred && entry.newCurrency) {
    exchangeRateSnapshot = entry.newCurrency.exchange_rate ?? null;
  }

  await supabase.from('currency_audit_log').insert({
    entity_name: entry.entityName,
    record_id: entry.recordId,
    field_name: entry.fieldName,
    old_amount: entry.oldAmount,
    new_amount: entry.newAmount,
    old_currency_id: entry.oldCurrency?.currency_id ?? null,
    new_currency_id: entry.newCurrency?.currency_id ?? null,
    old_currency_code: entry.oldCurrency?.code ?? null,
    new_currency_code: entry.newCurrency?.code ?? null,
    old_currency_symbol: entry.oldCurrency?.symbol ?? null,
    new_currency_symbol: entry.newCurrency?.symbol ?? null,
    exchange_rate_snapshot: exchangeRateSnapshot,
    conversion_occurred: conversionOccurred,
    change_source: entry.changeSource,
    reason: entry.reason ?? null,
    changed_by: entry.changedBy,
  });
}

export async function writeMonetaryFieldAudit(
  entityName: string,
  recordId: string,
  changedBy: string,
  prevValues: Record<string, unknown>,
  nextValues: Record<string, unknown>,
  currencies: CurrencyRecord[],
  source: CurrencyChangeSource = 'system_save'
): Promise<void> {
  const prevCurrency = getCurrencyById(currencies, prevValues['currency_id'] as string | undefined);
  const nextCurrency = getCurrencyById(currencies, nextValues['currency_id'] as string | undefined);

  const currencyChanged =
    prevCurrency?.currency_id !== nextCurrency?.currency_id &&
    !!(prevCurrency || nextCurrency);

  const tasks: Promise<void>[] = [];

  const entityKey = (Object.entries(ENTITY_TABLE_MAP).find(([, v]) => v === entityName)?.[0] ?? null) as AppEntity | null;
  const monetaryFields = entityKey ? (MONETARY_FIELDS[entityKey] ?? []) : [];

  for (const field of monetaryFields) {
    const oldRaw = prevValues[field];
    const newRaw = nextValues[field];
    const oldAmount = oldRaw != null && oldRaw !== '' ? Number(oldRaw) : null;
    const newAmount = newRaw != null && newRaw !== '' ? Number(newRaw) : null;

    const amountChanged = oldAmount !== newAmount;

    if (!amountChanged && !currencyChanged) continue;

    tasks.push(
      writeCurrencyAuditLog({
        entityName,
        recordId,
        fieldName: field,
        oldAmount: isNaN(oldAmount as number) ? null : oldAmount,
        newAmount: isNaN(newAmount as number) ? null : newAmount,
        oldCurrency: prevCurrency,
        newCurrency: nextCurrency ?? prevCurrency,
        changeSource: source,
        changedBy,
      }).catch(() => {})
    );
  }

  if (currencyChanged && monetaryFields.length === 0) {
    tasks.push(
      writeCurrencyAuditLog({
        entityName,
        recordId,
        fieldName: '__currency__',
        oldAmount: null,
        newAmount: null,
        oldCurrency: prevCurrency,
        newCurrency: nextCurrency,
        changeSource: source,
        changedBy,
      }).catch(() => {})
    );
  }

  await Promise.all(tasks);
}

export interface CurrencyAuditLogRow {
  log_id: string;
  entity_name: string;
  record_id: string;
  field_name: string;
  old_amount: number | null;
  new_amount: number | null;
  old_currency_id: string | null;
  new_currency_id: string | null;
  old_currency_code: string | null;
  new_currency_code: string | null;
  old_currency_symbol: string | null;
  new_currency_symbol: string | null;
  exchange_rate_snapshot: number | null;
  conversion_occurred: boolean;
  change_source: string;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

export async function fetchCurrencyAuditLog(
  entityName: string,
  recordId: string
): Promise<CurrencyAuditLogRow[]> {
  const { data, error } = await supabase
    .from('currency_audit_log')
    .select('*')
    .eq('entity_name', entityName)
    .eq('record_id', recordId)
    .order('changed_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as CurrencyAuditLogRow[];
}

export interface CurrencyChangeOptions {
  entity: AppEntity;
  recordId: string;
  newCurrencyId: string;
  changedBy: string;
  reason: string;
  clearedFields: string[];
  previousCurrencyId: string | null;
  currencies: CurrencyRecord[];
}

export async function executeControlledCurrencyChange(
  opts: CurrencyChangeOptions
): Promise<void> {
  const table = ENTITY_TABLE_MAP[opts.entity];
  const pk = ENTITY_PK_MAP[opts.entity];
  if (!table || !pk) throw new Error('Entity does not support currency locking');

  const oldCurrency = getCurrencyById(opts.currencies, opts.previousCurrencyId ?? undefined);
  const newCurrency = getCurrencyById(opts.currencies, opts.newCurrencyId);

  const cleared: Record<string, null> = {};
  for (const field of opts.clearedFields) {
    cleared[field] = null;
  }

  const { error } = await supabase
    .from(table)
    .update({
      currency_id: opts.newCurrencyId,
      currency_locked: false,
      currency_lock_reason: null,
      ...cleared,
      modified_at: new Date().toISOString(),
      modified_by: opts.changedBy,
    })
    .eq(pk, opts.recordId);

  if (error) throw error;

  const changedAt = new Date().toISOString();

  const genericLogs = [
    {
      entity_name: table,
      record_id: opts.recordId,
      changed_by: opts.changedBy,
      changed_at: changedAt,
      field_name: 'currency_id',
      old_value: opts.previousCurrencyId ?? null,
      new_value: opts.newCurrencyId,
    },
    {
      entity_name: table,
      record_id: opts.recordId,
      changed_by: opts.changedBy,
      changed_at: changedAt,
      field_name: '__currency_change_reason__',
      old_value: null,
      new_value: opts.reason,
    },
    ...opts.clearedFields.map((field) => ({
      entity_name: table,
      record_id: opts.recordId,
      changed_by: opts.changedBy,
      changed_at: changedAt,
      field_name: field,
      old_value: '__cleared_by_currency_change__',
      new_value: null,
    })),
  ];

  await supabase.from('field_change_log').insert(genericLogs);

  const auditTasks: Promise<void>[] = [
    writeCurrencyAuditLog({
      entityName: table,
      recordId: opts.recordId,
      fieldName: '__currency__',
      oldAmount: null,
      newAmount: null,
      oldCurrency,
      newCurrency,
      changeSource: 'controlled_currency_change',
      reason: opts.reason,
      changedBy: opts.changedBy,
    }).catch(() => {}),
  ];

  for (const field of opts.clearedFields) {
    auditTasks.push(
      writeCurrencyAuditLog({
        entityName: table,
        recordId: opts.recordId,
        fieldName: field,
        oldAmount: null,
        newAmount: null,
        oldCurrency,
        newCurrency,
        changeSource: 'controlled_currency_change',
        reason: opts.reason,
        changedBy: opts.changedBy,
      }).catch(() => {})
    );
  }

  await Promise.all(auditTasks);
}
