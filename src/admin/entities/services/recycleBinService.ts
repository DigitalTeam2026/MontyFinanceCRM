import { supabase } from '../../../lib/supabase';
import type { EntityDefinition } from '../../../types/entity';
import { getTableColumns } from '../../../app/services/recordService';

/**
 * Per-table Recycle Bin data access.
 *
 * Soft-delete is heterogeneous across the CRM schema: a few tables use a
 * standard `deleted_at timestamptz` marker, most use a legacy `is_deleted`
 * boolean. This service resolves whichever marker a table actually has from the
 * live schema (cached via getTableColumns) so the Recycle Bin works on any
 * entity-backed table without hard-coding table names.
 */

const PK_OVERRIDES: Record<string, string> = {
  crm_user: 'user_id',
  security_role: 'role_id',
  product_family: 'family_id',
  line_of_business: 'lob_id',
  crm_source: 'source_id',
  marketing_email: 'email_id',
};

/** Resolve the physical primary-key column for an entity's physical table. */
export function resolvePrimaryKey(entity: EntityDefinition): string {
  const t = entity.physical_table_name;
  if (PK_OVERRIDES[t]) return PK_OVERRIDES[t];
  // Custom entities are created with a `<logical_name>_id` PK (see the
  // create_crm_entity RPC), which can differ from the physical table name.
  if (entity.is_custom) return `${entity.logical_name}_id`;
  return `${t}_id`;
}

export interface SoftDeleteMeta {
  /** Whether this table supports soft-delete (and therefore a recycle bin). */
  supported: boolean;
  /** The marker column that flags a row as deleted. */
  markerCol: 'deleted_at' | 'is_deleted' | null;
  hasDeletedAt: boolean;
  hasIsDeleted: boolean;
  hasDeletedBy: boolean;
  hasOwnerId: boolean;
  hasModifiedAt: boolean;
  hasModifiedBy: boolean;
  /** Timestamp column used for the "Deleted on" value + date filter/sort. */
  deletedAtCol: string | null;
  /** User column used for the "Deleted by" value. */
  deletedByCol: string | null;
  /** Lifecycle-state column, if any ('state_code' / 'statecode'). */
  statusCol: string | null;
}

/** Resolve the soft-delete capability + relevant system columns for a table. */
export async function getSoftDeleteMeta(table: string): Promise<SoftDeleteMeta> {
  const cols = await getTableColumns(table);
  const hasDeletedAt = cols.has('deleted_at');
  const hasIsDeleted = cols.has('is_deleted');
  const hasDeletedBy = cols.has('deleted_by');
  const hasModifiedAt = cols.has('modified_at');
  const hasModifiedBy = cols.has('modified_by');
  // Prefer deleted_at as the marker (matches the data-grid soft-delete path) so a
  // record deleted from the grid shows up here regardless of which column is set.
  const markerCol: SoftDeleteMeta['markerCol'] = hasDeletedAt ? 'deleted_at' : hasIsDeleted ? 'is_deleted' : null;
  const statusCol = cols.has('state_code') ? 'state_code' : cols.has('statecode') ? 'statecode' : null;
  return {
    supported: markerCol !== null,
    markerCol,
    hasDeletedAt,
    hasIsDeleted,
    hasDeletedBy,
    hasOwnerId: cols.has('owner_id'),
    hasModifiedAt,
    hasModifiedBy,
    deletedAtCol: hasDeletedAt ? 'deleted_at' : hasModifiedAt ? 'modified_at' : null,
    deletedByCol: hasDeletedBy ? 'deleted_by' : hasModifiedBy ? 'modified_by' : null,
    statusCol,
  };
}

/** Apply the "this row is soft-deleted" predicate to a query. */
function applyDeletedFilter<T>(q: T, meta: SoftDeleteMeta): T {
  const query = q as { not: (...a: unknown[]) => T; eq: (...a: unknown[]) => T };
  if (meta.markerCol === 'deleted_at') return query.not('deleted_at', 'is', null);
  if (meta.markerCol === 'is_deleted') return query.eq('is_deleted', true);
  return q;
}

/** Count soft-deleted rows in a table. Returns 0 if soft-delete is unsupported. */
export async function countDeletedRecords(table: string, meta: SoftDeleteMeta): Promise<number> {
  if (!meta.supported) return 0;
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  q = applyDeletedFilter(q, meta);
  const { count } = await q;
  return count ?? 0;
}

export type DeletedDatePreset = 'all' | 'today' | '7d' | '30d';

export interface DeletedRecordsParams {
  table: string;
  pk: string;
  nameCol: string | null;
  meta: SoftDeleteMeta;
  page: number;
  pageSize: number;
  search: string;
  sortCol: string | null;
  sortDir: 'asc' | 'desc';
  datePreset: DeletedDatePreset;
  /** Filter to a single user id on the "Deleted by" column. */
  deletedByUserId: string | null;
}

export interface DeletedRecordsResult {
  rows: Record<string, unknown>[];
  total: number;
}

function presetCutoffIso(preset: DeletedDatePreset): string | null {
  const now = new Date();
  if (preset === 'today') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return d.toISOString();
  }
  if (preset === '7d') return new Date(now.getTime() - 7 * 86400000).toISOString();
  if (preset === '30d') return new Date(now.getTime() - 30 * 86400000).toISOString();
  return null;
}

/** Fetch a page of soft-deleted rows with search / sort / filters applied. */
export async function fetchDeletedRecords(p: DeletedRecordsParams): Promise<DeletedRecordsResult> {
  if (!p.meta.supported) return { rows: [], total: 0 };

  const buildBase = <T,>(q: T): T => {
    let query = applyDeletedFilter(q, p.meta) as any;
    if (p.search && p.nameCol) query = query.ilike(p.nameCol, `%${p.search}%`);
    const cutoff = presetCutoffIso(p.datePreset);
    if (cutoff && p.meta.deletedAtCol) query = query.gte(p.meta.deletedAtCol, cutoff);
    if (p.deletedByUserId && p.meta.deletedByCol) query = query.eq(p.meta.deletedByCol, p.deletedByUserId);
    return query as T;
  };

  // Count
  let countQuery = supabase.from(p.table).select('*', { count: 'exact', head: true });
  countQuery = buildBase(countQuery);
  const { count } = await countQuery;

  // Page
  let dataQuery = supabase.from(p.table).select('*').range(p.page * p.pageSize, (p.page + 1) * p.pageSize - 1);
  dataQuery = buildBase(dataQuery);
  const sortCol = p.sortCol ?? p.meta.deletedAtCol ?? p.pk;
  dataQuery = dataQuery.order(sortCol, { ascending: p.sortDir === 'asc', nullsFirst: false });
  const { data, error } = await dataQuery;
  if (error) throw error;
  return { rows: (data ?? []) as Record<string, unknown>[], total: count ?? 0 };
}

/** Is this a "RPC not deployed yet" error (vs a real failure we must surface)? */
function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202') return true; // PostgREST: function not found
  const m = (error.message ?? '').toLowerCase();
  return m.includes('could not find the function') || m.includes('does not exist');
}

/** Build a readable message from a PostgREST/Postgres error (message + details + hint). */
function describeError(error: { message?: string; details?: string; hint?: string; code?: string } | null): string {
  if (!error) return 'Unknown error';
  const parts = [error.message, error.details, error.hint].filter((s) => s && String(s).trim());
  const text = parts.join(' — ');
  return error.code ? `${text} [${error.code}]` : text || 'Request failed';
}

const PERMISSION_HINT =
  'You may not have permission to do this — sign in as a system administrator and try again.';

/**
 * Restore soft-deleted rows so they return to the table's normal views.
 *
 * Prefers the admin RPC (bypasses per-record RLS scope, enforces system-admin +
 * the deleted predicate). Falls back to a direct UPDATE when the RPC is not
 * deployed yet, detecting the "0 rows changed, no error" RLS signature and
 * raising it instead of silently succeeding.
 */
export async function restoreRecords(
  table: string,
  pk: string,
  ids: string[],
  meta: SoftDeleteMeta,
): Promise<number> {
  if (ids.length === 0 || !meta.supported) return 0;

  const rpc = await supabase.rpc('admin_recycle_bin_action', {
    p_table: table, p_pk: pk, p_ids: ids, p_action: 'restore',
  });
  if (!rpc.error) return (rpc.data as number) ?? 0;
  if (!isMissingRpc(rpc.error)) throw new Error(describeError(rpc.error));

  // Fallback: direct update + affected-row detection.
  const { data: { user } } = await supabase.auth.getUser();
  const patch: Record<string, unknown> = {};
  if (meta.hasIsDeleted) patch.is_deleted = false;
  if (meta.hasDeletedAt) patch.deleted_at = null;
  if (meta.hasDeletedBy) patch.deleted_by = null;
  if (meta.hasModifiedAt) patch.modified_at = new Date().toISOString();
  if (user && meta.hasModifiedBy) patch.modified_by = user.id;

  let q = supabase.from(table).update(patch).in(pk, ids).select(pk) as any;
  q = applyDeletedFilter(q, meta);
  const { data, error } = await q;
  if (error) throw error;
  const count = (data ?? []).length;
  if (count === 0) throw new Error(`No records were restored. ${PERMISSION_HINT}`);
  return count;
}

/**
 * Permanently delete rows from the physical table. The deleted predicate is
 * re-asserted in every path so a row that is NOT soft-deleted can never be
 * physically removed through the recycle bin (guard against purging live data).
 *
 * Prefers the admin RPC; falls back to a direct DELETE and raises the silent
 * "0 rows deleted" RLS case as an explicit error.
 */
export async function purgeRecords(
  table: string,
  pk: string,
  ids: string[],
  meta: SoftDeleteMeta,
): Promise<number> {
  if (ids.length === 0) return 0;

  const rpc = await supabase.rpc('admin_recycle_bin_action', {
    p_table: table, p_pk: pk, p_ids: ids, p_action: 'purge',
  });
  if (!rpc.error) return (rpc.data as number) ?? 0;
  if (!isMissingRpc(rpc.error)) throw new Error(describeError(rpc.error));

  // Fallback: direct delete + affected-row detection.
  let q = supabase.from(table).delete().in(pk, ids).select(pk) as any;
  q = applyDeletedFilter(q, meta);
  const { data, error } = await q;
  if (error) throw error;
  const count = (data ?? []).length;
  if (count === 0) throw new Error(`No records were permanently deleted. ${PERMISSION_HINT}`);
  return count;
}

export interface DependentGroup {
  table: string;
  column: string;
  constraint: string;
  count: number;
}

/**
 * Preview the immediate child rows that reference the given records via a foreign
 * key (one level), grouped by referencing table + column. Used to warn the admin
 * before a cascade permanent-delete. Returns [] when nothing references them or
 * when the dependents RPC is not deployed.
 */
export async function fetchDependents(table: string, ids: string[]): Promise<DependentGroup[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc('admin_recycle_bin_dependents', {
    p_table: table, p_ids: ids,
  });
  if (error) {
    if (isMissingRpc(error)) return [];
    throw new Error(describeError(error));
  }
  return (data as DependentGroup[]) ?? [];
}

/**
 * Cascade permanent-delete: recursively remove every descendant that references
 * these records, then delete the records themselves. Returns the total number of
 * rows removed (descendants + the records).
 */
export async function purgeRecordsCascade(
  table: string,
  pk: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await supabase.rpc('admin_recycle_bin_action', {
    p_table: table, p_pk: pk, p_ids: ids, p_action: 'purge_cascade',
  });
  if (error) throw new Error(describeError(error));
  return (data as number) ?? 0;
}

/** Resolve crm_user ids to display names for "Owner" / "Deleted by" columns. */
export async function resolveUserNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data } = await supabase
    .from('crm_user')
    .select('user_id, full_name, email')
    .in('user_id', unique);
  for (const u of (data ?? []) as { user_id: string; full_name: string | null; email: string | null }[]) {
    out.set(u.user_id, u.full_name || u.email || u.user_id);
  }
  return out;
}

/** The distinct users who have deleted rows in this table (for the filter). */
export async function fetchDeletedByOptions(
  table: string,
  meta: SoftDeleteMeta,
): Promise<{ id: string; name: string }[]> {
  if (!meta.supported || !meta.deletedByCol) return [];
  let q = supabase.from(table).select(meta.deletedByCol).limit(1000) as any;
  q = applyDeletedFilter(q, meta);
  const { data } = await q;
  const ids = [...new Set((data ?? []).map((r: Record<string, unknown>) => r[meta.deletedByCol!]).filter(Boolean) as string[])];
  const names = await resolveUserNames(ids);
  return ids.map((id) => ({ id, name: names.get(id) ?? id })).sort((a, b) => a.name.localeCompare(b.name));
}
