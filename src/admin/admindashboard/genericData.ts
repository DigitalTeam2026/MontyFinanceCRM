// Generic aggregation engine for configurable widgets.
//
// Given an EntityMeta + a dimension / measure + an optional status condition, it
// runs the SAME kind of RLS-scoped Supabase query the curated dashboard uses and
// buckets the result in JS. This is what lets an admin repoint a card at a
// different entity, group-by, or status without any new backend code.

import { supabase } from '../../lib/supabase';
import { batchResolveLookupLabels } from '../../app/services/displayResolver';
import type { Datum } from '../../app/pages/dashboard/charts';
import type { DateRange } from '../../app/pages/dashboard/theme';
import type { DimOption, EntityMeta, StatusFilter } from './entityMeta';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Stage/condition keys must never surface as a lifecycle status (mirrors data.ts).
const STAGE_KEY_RE = /^(stage|condition)_/i;

function titleCase(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

// ── State / reason label definitions (cached per logical entity) ─────────────

interface Defs {
  /** state_value-as-string AND lowercased label → display label. */
  stateByCode: Record<string, string>;
  reasonByCode: Record<string, string>;
}

const defsCache = new Map<string, Defs | null>();

async function loadDefs(logical: string): Promise<Defs | null> {
  if (defsCache.has(logical)) return defsCache.get(logical)!;
  const { data: ed } = await supabase
    .from('entity_definition').select('entity_definition_id').eq('logical_name', logical).maybeSingle();
  if (!ed) { defsCache.set(logical, null); return null; }
  const id = (ed as { entity_definition_id: string }).entity_definition_id;

  const [{ data: states }, { data: reasons }] = await Promise.all([
    supabase.from('statecode_definition').select('state_value, display_label').eq('entity_definition_id', id),
    supabase.from('status_reason_definition').select('reason_value, display_label').eq('entity_definition_id', id).eq('is_active', true),
  ]);

  const stateByCode: Record<string, string> = {};
  for (const r of (states ?? []) as { state_value: number; display_label: string }[]) {
    stateByCode[String(r.state_value)] = r.display_label;
    stateByCode[r.display_label.toLowerCase()] = r.display_label; // prospect stores the label text
  }
  const reasonByCode: Record<string, string> = {};
  for (const r of (reasons ?? []) as { reason_value: number; display_label: string }[]) {
    reasonByCode[String(r.reason_value)] = r.display_label;
  }
  const defs: Defs = { stateByCode, reasonByCode };
  defsCache.set(logical, defs);
  return defs;
}

export function clearGenericDefsCache(): void {
  defsCache.clear();
}

// ── Query builders ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyScope(q: any, meta: EntityMeta, range: DateRange, status?: StatusFilter) {
  if (!meta.catalog) q = q.gte(meta.dateField, range.from).lt(meta.dateField, range.to);
  if (meta.table === 'product') q = q.is('deleted_at', null);
  if (status) q = q.eq(status.field, status.value);
  return q;
}

// ── Grouped data (for charts) ────────────────────────────────────────────────

function normalizeRaw(value: unknown, kind: DimOption['kind']): string | null {
  if (value == null) return kind === 'fk' ? null : '__none';
  const s = String(value);
  if ((kind === 'state' || kind === 'reason') && STAGE_KEY_RE.test(s)) return '1';
  return s;
}

export async function fetchGroupedGeneric(
  meta: EntityMeta, dim: DimOption, status: StatusFilter | undefined, range: DateRange,
): Promise<Datum[]> {
  const cols = new Set<string>([dim.key]);
  if (status) cols.add(status.field);
  let q = supabase.from(meta.table).select([...cols].join(', '));
  q = applyScope(q, meta, range, status);
  const { data, error } = await q;
  if (error || !data) return [];
  const rows = data as unknown as Record<string, unknown>[];

  // Resolve labels per kind.
  let fkLabels: Record<string, string> = {};
  let defs: Defs | null = null;
  if (dim.kind === 'fk' && dim.fk) {
    const ids = [...new Set(rows.map((r) => r[dim.key]).filter((v): v is string => typeof v === 'string' && UUID_RE.test(v)))];
    fkLabels = ids.length ? await batchResolveLookupLabels(dim.fk, ids) : {};
  } else if (dim.kind === 'state' || dim.kind === 'reason') {
    defs = await loadDefs(meta.logical);
  }

  const labelFor = (raw: string): string => {
    if (raw === '__none') return dim.kind === 'fk' ? 'Unspecified' : 'Other';
    switch (dim.kind) {
      case 'fk': return fkLabels[raw] ?? raw;
      case 'state': return defs?.stateByCode[raw] ?? defs?.stateByCode[raw.toLowerCase()] ?? titleCase(raw);
      case 'reason': return defs?.reasonByCode[raw] ?? titleCase(raw);
      case 'text': return dim.textMap?.[raw] ?? titleCase(raw);
    }
  };

  const buckets = new Map<string, { label: string; value: number }>();
  for (const r of rows) {
    const raw = normalizeRaw(r[dim.key], dim.kind);
    if (raw === null) { // fk null → group as Unspecified
      const cur = buckets.get('__none');
      if (cur) cur.value += 1; else buckets.set('__none', { label: 'Unspecified', value: 1 });
      continue;
    }
    const cur = buckets.get(raw);
    if (cur) cur.value += 1;
    else buckets.set(raw, { label: labelFor(raw), value: 1 });
  }

  return [...buckets.entries()]
    .map(([raw, { label, value }]) => ({ raw, label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

// ── Measures (for KPIs) ──────────────────────────────────────────────────────

export interface MeasurePair { cur: number; prev: number }

async function measureOnce(
  meta: EntityMeta, measure: 'count' | 'sum', field: string | undefined, status: StatusFilter | undefined, range: DateRange,
): Promise<number> {
  if (measure === 'sum' && field) {
    let q = supabase.from(meta.table).select(field);
    q = applyScope(q, meta, range, status);
    const { data, error } = await q;
    if (error || !data) return 0;
    return (data as unknown as Record<string, unknown>[]).reduce((s, r) => s + (Number(r[field]) || 0), 0);
  }
  let q = supabase.from(meta.table).select('*', { count: 'exact', head: true });
  q = applyScope(q, meta, range, status);
  const { count } = await q;
  return count ?? 0;
}

/** Current + previous-period value for a KPI (previous skipped for catalog entities). */
export async function fetchMeasureGeneric(
  meta: EntityMeta, measure: 'count' | 'sum', field: string | undefined, status: StatusFilter | undefined,
  current: DateRange, previous: DateRange,
): Promise<MeasurePair> {
  const [cur, prev] = await Promise.all([
    measureOnce(meta, measure, field, status, current),
    meta.catalog ? Promise.resolve(0) : measureOnce(meta, measure, field, status, previous),
  ]);
  return { cur, prev };
}

// ── Status/condition options (for the config UI) ─────────────────────────────

const statusOptsCache = new Map<string, StatusFilter[]>();

/**
 * The list of selectable conditions for an entity. Values are the ACTUAL stored
 * representation (numeric code, lowercased label, or boolean) so the resulting
 * `.eq(field, value)` filter matches real rows regardless of how the table stores
 * its status.
 */
export async function fetchStatusOptions(meta: EntityMeta): Promise<StatusFilter[]> {
  if (statusOptsCache.has(meta.entity)) return statusOptsCache.get(meta.entity)!;
  if (!meta.statusField) { statusOptsCache.set(meta.entity, []); return []; }

  let opts: StatusFilter[];
  if (meta.table === 'product') {
    opts = [
      { field: 'is_active', value: 'true', label: 'Active' },
      { field: 'is_active', value: 'false', label: 'Inactive' },
    ];
  } else {
    // Distinct stored values for the status column → resolve a human label.
    const { data } = await supabase.from(meta.table).select(meta.statusField);
    const defs = await loadDefs(meta.logical);
    const seen = new Map<string, string>();
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      const v = r[meta.statusField];
      if (v == null) continue;
      const raw = String(v);
      if (STAGE_KEY_RE.test(raw) || seen.has(raw)) continue;
      const label = defs?.stateByCode[raw] ?? defs?.stateByCode[raw.toLowerCase()] ?? titleCase(raw);
      seen.set(raw, label);
    }
    opts = [...seen.entries()].map(([value, label]) => ({ field: meta.statusField!, value, label }));
    opts.sort((a, b) => a.label.localeCompare(b.label));
  }
  statusOptsCache.set(meta.entity, opts);
  return opts;
}
