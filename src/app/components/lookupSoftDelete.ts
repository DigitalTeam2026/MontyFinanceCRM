// Shared soft-delete handling for lookup queries.
//
// Lookup target tables don't all share the same soft-delete shape: some use a
// `deleted_at` timestamp, some an `is_deleted` boolean, some an `is_active`
// boolean, and a few have none at all. Hardcoding one predicate makes PostgREST
// 400 ("column ... does not exist") on the others. Callers probe the candidate
// modes in order and cache the one that works per physical table, so a table is
// only mis-guessed once — across every component that imports this module.

export type SoftDeleteMode = 'is_deleted' | 'deleted_at' | 'is_active' | 'none';

const DELETED_AT_TABLES = new Set([
  'business_unit', 'country', 'crm_user', 'industry', 'line_of_business',
  'product', 'product_family', 'security_role', 'team',
]);
const NO_SOFT_DELETE_TABLES = new Set(['currency', 'organization']);

// Order to probe when the configured/guessed soft-delete column doesn't exist.
export const SOFT_DELETE_FALLBACK_ORDER: SoftDeleteMode[] = ['is_deleted', 'deleted_at', 'is_active', 'none'];

// Caches the soft-delete column that actually exists per physical table, learned
// at query time. This lets brand-new lookup entities (whose soft-delete shape we
// don't know up front) self-heal after the first open instead of 400-ing forever.
const softDeleteModeCache = new Map<string, SoftDeleteMode>();

// PostgREST reports an unknown column with code 42703 ("column ... does not exist").
export function isMissingColumnError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string; message?: string };
  return e.code === '42703' || /does not exist/i.test(e.message ?? '');
}

// Best guess for a table's soft-delete mode before any probe has run.
export function resolveSoftDeleteMode(table: string): SoftDeleteMode {
  const cached = softDeleteModeCache.get(table);
  if (cached) return cached;
  if (DELETED_AT_TABLES.has(table)) return 'deleted_at';
  if (NO_SOFT_DELETE_TABLES.has(table)) return 'is_active';
  return 'is_deleted';
}

// Remember the mode that actually worked so future queries skip the probing.
export function rememberSoftDeleteMode(table: string, mode: SoftDeleteMode): void {
  softDeleteModeCache.set(table, mode);
}

// The resolved mode first, then the remaining fallbacks (ending with 'none').
export function candidateSoftDeleteModes(table: string): SoftDeleteMode[] {
  const first = resolveSoftDeleteMode(table);
  return [first, ...SOFT_DELETE_FALLBACK_ORDER.filter((m) => m !== first)];
}

// Apply the soft-delete predicate for `mode` to a PostgREST query builder.
export function applySoftDeleteFilter<T>(query: T, mode: SoftDeleteMode): T {
  const q = query as any;
  if (mode === 'is_deleted') return q.eq('is_deleted', false);
  if (mode === 'deleted_at') return q.is('deleted_at', null);
  if (mode === 'is_active') return q.eq('is_active', true);
  return query; // 'none' → no soft-delete predicate
}
