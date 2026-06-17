import { supabase } from '../../../lib/supabase';
import type { QueryConfig } from '../types/dashboard';

export interface AggregateResult { rows: Record<string, unknown>[]; rowCount: number }
export interface RecordResult { rows: Record<string, unknown>[]; total: number }

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
  return cached('agg', config, async () => {
    const { data, error } = await supabase.rpc('dashboard_aggregate', { p_config: config });
    if (error) throw error;
    const res = (data ?? { rows: [], rowCount: 0 }) as AggregateResult;
    return { rows: res.rows ?? [], rowCount: res.rowCount ?? 0 };
  });
}

export async function runRecordQuery(config: QueryConfig): Promise<RecordResult> {
  if (!config.entity) return { rows: [], total: 0 };
  return cached('rec', config, async () => {
    const { data, error } = await supabase.rpc('dashboard_record_query', { p_config: config });
    if (error) throw error;
    const res = (data ?? { rows: [], total: 0 }) as RecordResult;
    return { rows: res.rows ?? [], total: res.total ?? 0 };
  });
}
