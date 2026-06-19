import { supabase } from '../../../lib/supabase';
import type { QueryConfig, VisualFilter, FilterOp } from '../types/dashboard';

export interface AggregateResult { rows: Record<string, unknown>[]; rowCount: number }
export interface RecordResult { rows: Record<string, unknown>[]; total: number }

// ── Defensive RPC envelope ────────────────────────────────────────────────────
// The dashboard_* RPCs return { ok, rows, … } and never raise on a
// filter/relation that does not apply to a card (see migration
// 20260618180000): a compatibility mismatch comes back as ok:true +
// no_relation:true with empty rows (card renders "No data"), while only a genuine
// backend fault comes back as ok:false. We throw ONLY on ok:false so one
// inapplicable cross-filter can never red-flag a card.
interface RpcEnvelope { ok?: boolean; no_relation?: boolean; message?: string; error?: string; code?: string }

class DashboardQueryError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.name = 'DashboardQueryError'; this.code = code; }
}

// Filter ops that carry their own emptiness check and need no value.
const NO_VALUE_OPS = new Set<FilterOp>(['is_empty', 'is_not_empty']);
// Ops that accept a list value (kept even when the array is empty — the backend
// renders an explicit false/true for an empty IN/NOT IN).
const LIST_OPS = new Set<FilterOp>(['in', 'not_in']);

const isBlank = (v: unknown): boolean => v === undefined || v === null || v === '';

/** Drop filters whose value is missing — never send `field op null` (spec §7). */
function sanitizeFilters<T extends VisualFilter>(filters: T[] | undefined): T[] | undefined {
  if (!filters?.length) return filters;
  const kept = filters.filter((f) => {
    if (!f || !f.field) return false;
    if (NO_VALUE_OPS.has(f.op)) return true;
    if (LIST_OPS.has(f.op)) return Array.isArray(f.value);   // empty list is meaningful
    if (f.op === 'between') return !isBlank(f.value) && !isBlank(f.value2);
    return !isBlank(f.value);
  });
  return kept.length === filters.length ? filters : kept;
}

/** Strip blank-valued filters from every filter bucket of a query config. */
function sanitizeConfig(config: QueryConfig): QueryConfig {
  const out: QueryConfig = { ...config };
  if (config.filters) out.filters = sanitizeFilters(config.filters);
  if (config.relatedFilters) out.relatedFilters = config.relatedFilters.filter((rf) => rf && rf.field && rf.path?.length);
  if (config.semanticFilters) {
    out.semanticFilters = config.semanticFilters
      .map((sf) => ({ ...sf, filters: sanitizeFilters(sf.filters) ?? [] }))
      .filter((sf) => sf.path?.steps?.length && sf.filters.length);
  }
  return out;
}

function logRpcError(rpc: string, config: unknown, error: { message?: string; details?: string; hint?: string; code?: string }): void {
  if (!import.meta.env?.DEV) return;
  console.error(`${rpc} failed`, {
    config,
    error: { message: error?.message, details: error?.details, hint: error?.hint, code: error?.code },
  });
}

/** Read a defensive RPC envelope: throw only on a genuine backend fault (ok:false). */
function unwrap(rpc: string, config: unknown, data: unknown, transportError: unknown): RpcEnvelope {
  if (transportError) {
    logRpcError(rpc, config, transportError as { message?: string });
    throw transportError;
  }
  const env = (data ?? {}) as RpcEnvelope;
  if (env.ok === false) {
    logRpcError(rpc, config, { message: env.error, code: env.code });
    throw new DashboardQueryError(env.error ?? 'Query failed', env.code);
  }
  return env;
}

// ── Secure query cache ────────────────────────────────────────────────────────
// Keyed by the full config (which already embeds entity + filters). The backend
// RPC is SECURITY INVOKER so results are inherently scoped to the calling user —
// but we still scope the cache key to the authenticated user id so a different
// session in the same tab can never read another user's cached rows.
let cacheUserId: string | null = null;
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const TTL_MS = 60_000;

async function userScope(): Promise<string> {
  if (cacheUserId) return cacheUserId;
  const { data } = await supabase.auth.getUser();
  cacheUserId = data.user?.id ?? 'anon';
  return cacheUserId;
}

function keyFor(uid: string, kind: string, config: unknown): string {
  return `${uid}::${kind}::${JSON.stringify(config)}`;
}

export function clearQueryCache(): void {
  cache.clear();
  inflight.clear();
}

async function cached<T>(kind: string, config: unknown, run: () => Promise<T>): Promise<T> {
  const uid = await userScope();
  const k = keyFor(uid, kind, config);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  if (inflight.has(k)) return inflight.get(k) as Promise<T>;
  const p = run().then((data) => {
    cache.set(k, { at: Date.now(), data });
    inflight.delete(k);
    return data;
  }).catch((e) => { inflight.delete(k); throw e; });
  inflight.set(k, p);
  return p;
}

export async function runAggregate(config: QueryConfig): Promise<AggregateResult> {
  if (!config.entity) return { rows: [], rowCount: 0 };
  const clean = sanitizeConfig(config);
  return cached('agg', clean, async () => {
    const { data, error } = await supabase.rpc('dashboard_aggregate', { p_config: clean });
    const res = unwrap('dashboard_aggregate', clean, data, error) as RpcEnvelope & Partial<AggregateResult>;
    return { rows: res.rows ?? [], rowCount: res.rowCount ?? 0 };
  });
}

// ── Distinct USED values for a lookup/choice slicer (spec §6/§7) ──────────────
// Each "source" describes one dashboard entity + how it reaches the target field
// (direct column or relationship path) + the OTHER active filters already
// translated for that entity. The RPC unions the distinct target ids referenced
// by accessible records and de-duplicates — never the whole master table.
export interface DistinctSource {
  entity: string;
  field?: string;                         // direct: physical column on the base entity
  path?: { steps: { lookupFieldId: string; direction: 'forward' | 'reverse' }[]; targetFieldId: string };
  filters?: unknown[];
  semanticFilters?: unknown[];
  relatedFilters?: unknown[];
  filterLogic?: 'and' | 'or';
  includeDeleted?: boolean;
}

export interface DistinctValuesResult {
  values: string[];                       // de-duplicated target ids in use
  options: { id: string; label: string }[]; // id+label when labelEntity supplied (RLS-checked)
}

export interface DistinctValuesConfig {
  sources: DistinctSource[];
  limit?: number;
  /** Target entity (logical/physical) to resolve display labels from. */
  labelEntity?: string;
  /** Physical display column on the target entity (defaults to its primary key). */
  labelField?: string;
  includeDeleted?: boolean;
}

export async function runDistinctValues(config: DistinctValuesConfig): Promise<DistinctValuesResult> {
  if (!config.sources.length) return { values: [], options: [] };
  const payload = { limit: 2000, ...config };
  return cached('distinct', payload, async () => {
    const { data, error } = await supabase.rpc('dashboard_distinct_values', { p_config: payload });
    if (error) throw error;
    const res = (data ?? { values: [], options: [] }) as Partial<DistinctValuesResult>;
    return { values: res.values ?? [], options: res.options ?? [] };
  });
}

export async function runRecordQuery(config: QueryConfig): Promise<RecordResult> {
  if (!config.entity) return { rows: [], total: 0 };
  const clean = sanitizeConfig(config);
  return cached('rec', clean, async () => {
    const { data, error } = await supabase.rpc('dashboard_record_query', { p_config: clean });
    const res = unwrap('dashboard_record_query', clean, data, error) as RpcEnvelope & Partial<RecordResult>;
    return { rows: res.rows ?? [], total: res.total ?? 0 };
  });
}
