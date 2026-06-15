// Data layer for the customizable Admin Dashboard.
//
// SAME DATA AS THE USER DASHBOARD: the chart/KPI widgets reuse the exact fetchers
// from src/app/pages/dashboard/data.ts. Those queries run through the authenticated
// Supabase session, so Row-Level Security decides what rows are visible. A system
// admin with organization-wide read access therefore sees ALL records, while the
// per-user dashboard sees only that user's scope — identical code, wider scope.
//
// This module adds two things the user dashboard doesn't cover yet — Contacts and
// Products/Services breakdowns — plus a small per-range request cache so multiple
// widgets that share a fetcher (e.g. several "Leads" charts) only hit the network
// once per date range. Backend tables and logic are untouched.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { batchResolveLookupLabels } from '../../app/services/displayResolver';
import type { Datum } from '../../app/pages/dashboard/charts';
import type { DateRange } from '../../app/pages/dashboard/theme';

// A wide-open range for catalog entities (Products/Services) whose charts are a
// snapshot of the whole catalog rather than a per-period slice. Used so a product
// drill-down shows every matching product regardless of the dashboard date range.
export const FULL_RANGE: DateRange = {
  from: '1970-01-01T00:00:00.000Z',
  to: '2999-01-01T00:00:00.000Z',
};

// ── Per-range request cache + hook ───────────────────────────────────────────
//
// Keyed by `gen | key | range.from | range.to`. The same loader+range returns the
// in-flight or resolved promise so sibling widgets dedupe. `refreshAdminData()`
// bumps the generation to force every widget to refetch (used by the Refresh
// button and on date-range change for stale safety).

const cache = new Map<string, Promise<unknown>>();
let generation = 0;

export function refreshAdminData(): void {
  cache.clear();
  generation += 1;
  bump.forEach((fn) => fn());
}

// Subscribers that want to re-render when the generation changes.
const bump = new Set<() => void>();

type Loader<T> = (current: DateRange, previous: DateRange) => Promise<T>;

/**
 * Load `loader(current, previous)` with caching keyed on the current range, and
 * report a `{ data, loading }` pair. Multiple widgets sharing the same `key` and
 * range share a single request.
 */
export function useRangedData<T>(
  key: string,
  loader: Loader<T>,
  current: DateRange,
  previous: DateRange,
): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  // Local tick lets refreshAdminData() force a re-run after it clears the cache.
  const [, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    bump.add(fn);
    return () => { bump.delete(fn); };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const ck = `${generation}|${key}|${current.from}|${current.to}`;
    let promise = cache.get(ck) as Promise<T> | undefined;
    if (!promise) {
      promise = loader(current, previous);
      cache.set(ck, promise);
    }
    promise
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData(null); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, current.from, current.to]);

  return { data, loading };
}

// ── Local aggregation helpers (small copies of data.ts internals) ─────────────

function bucketKeyed<T>(
  rows: T[],
  keyOf: (r: T) => { raw: string; label: string } | null,
): Map<string, { label: string; value: number }> {
  const m = new Map<string, { label: string; value: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k === null) continue;
    const cur = m.get(k.raw);
    if (cur) cur.value += 1;
    else m.set(k.raw, { label: k.label, value: 1 });
  }
  return m;
}

function toData(m: Map<string, { label: string; value: number }>, limit = 8): Datum[] {
  return [...m.entries()]
    .map(([raw, { label, value }]) => ({ raw, label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** "cold_call" → "Cold Call", "service" → "Service". */
function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ── Contacts ──────────────────────────────────────────────────────────────────
// Contact uses a TEXT status_code ('active'/'inactive') and is soft-deleted via
// is_deleted, which the RLS SELECT policy already filters — no extra filter here.

interface ContactRow {
  status_code: string | null;
  country_id: string | null;
}

export interface ContactsBreakdown {
  total: number;
  byStatus: Datum[];
  byCountry: Datum[];
}

export async function fetchContactsBreakdown(range: DateRange): Promise<ContactsBreakdown> {
  const { data, error } = await supabase
    .from('contact')
    .select('status_code, country_id')
    .gte('created_at', range.from).lt('created_at', range.to);
  if (error || !data) return { total: 0, byStatus: [], byCountry: [] };
  const rows = data as ContactRow[];

  const byStatus = toData(bucketKeyed(rows, (r) => {
    const raw = r.status_code || 'active';
    return { raw, label: titleCase(raw) };
  }));

  const countryIds = [...new Set(rows.map((r) => r.country_id).filter((x): x is string => !!x))];
  const countryLabels = countryIds.length ? await batchResolveLookupLabels('country', countryIds) : {};
  const byCountry = toData(bucketKeyed(rows, (r) =>
    r.country_id
      ? { raw: r.country_id, label: countryLabels[r.country_id] ?? r.country_id }
      : { raw: '__none', label: 'Unspecified' }));

  return { total: rows.length, byStatus, byCountry };
}

/** Server-side contact count over a created_at range (for the KPI delta). */
export async function countContacts(range: DateRange): Promise<number> {
  const { count } = await supabase
    .from('contact')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', range.from).lt('created_at', range.to);
  return count ?? 0;
}

export interface ContactsKpi { total: number; totalPrev: number }

export async function fetchContactsKpi(current: DateRange, previous: DateRange): Promise<ContactsKpi> {
  const [total, totalPrev] = await Promise.all([countContacts(current), countContacts(previous)]);
  return { total, totalPrev };
}

// ── Products / Services ───────────────────────────────────────────────────────
// Products are catalog/reference data, not period activity, so their charts are a
// whole-catalog snapshot (date range ignored). Soft-deleted via deleted_at.

interface ProductRow {
  product_type: string | null;
  family_id: string | null;
  is_active: boolean | null;
}

export interface ProductsBreakdown {
  total: number;
  active: number;
  byType: Datum[];
  byFamily: Datum[];
}

async function fetchProductFamilyNames(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await supabase.from('product_family').select('family_id, name').in('family_id', ids);
  const m: Record<string, string> = {};
  for (const r of (data ?? []) as { family_id: string; name: string }[]) m[r.family_id] = r.name;
  return m;
}

export async function fetchProductsBreakdown(): Promise<ProductsBreakdown> {
  const { data, error } = await supabase
    .from('product')
    .select('product_type, family_id, is_active')
    .is('deleted_at', null);
  if (error || !data) return { total: 0, active: 0, byType: [], byFamily: [] };
  const rows = data as ProductRow[];

  const byType = toData(bucketKeyed(rows, (r) => {
    const raw = r.product_type || 'standard';
    return { raw, label: titleCase(raw) };
  }));

  const famIds = [...new Set(rows.map((r) => r.family_id).filter((x): x is string => !!x))];
  const famLabels = await fetchProductFamilyNames(famIds);
  const byFamily = toData(bucketKeyed(rows, (r) =>
    r.family_id
      ? { raw: r.family_id, label: famLabels[r.family_id] ?? 'Unknown' }
      : { raw: '__none', label: 'Unassigned' }));

  const active = rows.filter((r) => r.is_active !== false).length;
  return { total: rows.length, active, byType, byFamily };
}
