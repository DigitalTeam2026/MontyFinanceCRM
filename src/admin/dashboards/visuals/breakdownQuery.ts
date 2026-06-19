// Shared "Total + Breakdown" data fetch — the single source of truth behind both
// the KPI card and each Funnel Stage card. Given a measure + a base filter set, it
// returns the TOTAL plus an optional grouped breakdown (and any custom filtered
// rows). Keeping this in one place guarantees a stage breaks down exactly the way
// a KPI does, so the two visuals can never drift apart.
//
// ── Counting policy (why the headline is NOT always the base entity count) ──────
// A breakdown card groups by a field (lookup / choice / status / text / …). When
// that field is NULL on a record, the record belongs to no real category. Counting
// those nulls in the headline made every lookup card read the base entity total
// (e.g. "Leads = 8" so "Source = 8") even when only 2 records had a real value.
//
// So for a GROUPED card the headline total counts only records whose breakdown
// field has a REAL value:
//   • NULL / empty values are excluded by default (the "—" / Unassigned group).
//   • Broken lookup references (a non-null id pointing at a missing related record)
//     are excluded too — they resolve to no label, so they're treated as orphans.
//   • `showEmptyValues` opts a single card back into counting (and showing) the
//     unassigned + orphan rows.
// Percentages then divide by this valid total, so a card's rows sum to 100%.
//
// This policy lives here (not in the SQL RPC) because orphan detection needs the
// frontend label resolver, and the same rule must apply to both card types.

import type {
  AggFn, AggSpec, QueryConfig, VisualFilter, RelatedFilter, SemanticQueryFilter,
} from '../types/dashboard';
import { runAggregate } from '../services/queryEngine';
import { resolveAggregateLabels, loadColumnMeta } from './labelResolver';
import { customKey } from './colorConfig';

// `raw` is the breakdown field's physical value (drives cross-filtering);
// `selectable` is false for custom-filtered rows + the inert unassigned/orphan rows.
export interface BreakdownItem { id: string; label: string; value: number; raw?: unknown; selectable?: boolean }
export interface BreakdownData { total: number; breakdown: BreakdownItem[] }

export interface BreakdownSpec {
  entity: string;
  /** Measure for both the total and the breakdown (alias is forced to 'v'). */
  agg: AggFn;
  /** Field for sum/avg/min/max (ignored for count). */
  field?: string;
  baseFilters?: VisualFilter[];
  relatedFilters?: RelatedFilter[];
  semanticFilters?: SemanticQueryFilter[];
  filterLogic?: 'and' | 'or';
  /** When false, only the total is computed (Simple mode). */
  includeBreakdown: boolean;
  breakdownField?: string;
  breakdownLimit?: number;
  breakdownSort?: 'value_desc' | 'value_asc' | 'label';
  breakdownValues?: string[];
  showZeroValues?: boolean;
  /**
   * Include records whose breakdown value is NULL/empty (the "Unassigned" group)
   * and broken-reference (orphan) rows — both in the rows AND the headline total.
   * Default false: those records are excluded from the total and hidden.
   */
  showEmptyValues?: boolean;
  customBreakdownItems?: { id?: string; label: string; filters: VisualFilter[] }[];
}

const EMPTY_LABEL = '—';

// One grouped breakdown row, classified by whether it carries a real category.
//   • valid  — a real, resolved value (a category the user can click to filter).
//   • empty  — NULL / '' breakdown value (the Unassigned group).
//   • orphan — a non-null lookup id with no matching related record (broken FK).
export type BreakdownRowKind = 'valid' | 'empty' | 'orphan';
export interface ClassifiedRow { kind: BreakdownRowKind; raw: unknown; label: string; value: number }

export interface AssembleInput {
  rows: ClassifiedRow[];
  /** Ungrouped total over the base filters — counts every record (incl. null/orphan). */
  baseTotal: number;
  /** Ungrouped total restricted to records with a non-empty value; null when it
   *  wasn't computed (OR base logic — see fetchBreakdown). */
  nonEmptyTotal: number | null;
  /** Measure is additive across groups (count|sum) so orphan rows can be subtracted. */
  additive: boolean;
  showEmptyValues: boolean;
  emptyLabel: string;
  /** Optional whitelist of resolved labels to keep. */
  breakdownValues?: string[];
}

/**
 * Pure counting policy — turn classified grouped rows + the ungrouped totals into
 * the headline total and the displayed rows. Kept side-effect-free so the rules
 * (null exclusion, orphan handling, showEmptyValues, whitelist) are unit-testable
 * without a database. Zero-value filtering is applied by the caller afterwards so
 * it covers custom rows too.
 */
export function assembleBreakdown(i: AssembleInput): { total: number; breakdown: BreakdownItem[] } {
  const keep = (label: string) => !i.breakdownValues?.length || i.breakdownValues.includes(label);
  const valid = i.rows.filter((r) => r.kind === 'valid');
  const orphan = i.rows.filter((r) => r.kind === 'orphan');
  const empty = i.rows.filter((r) => r.kind === 'empty');

  // ── Headline total ──────────────────────────────────────────────────────────
  let total: number;
  if (i.showEmptyValues) {
    total = i.baseTotal;                                   // count everything, incl. null + orphan
  } else if (i.nonEmptyTotal != null) {
    total = i.nonEmptyTotal;                               // only records with a non-empty value
    if (i.additive) {
      const orphanSum = orphan.reduce((s, r) => s + r.value, 0);
      total = Math.max(0, total - orphanSum);              // drop broken-reference records
    }
  } else {
    total = i.baseTotal;                                   // OR-logic fallback (can't safely guard)
  }

  // ── Rows ────────────────────────────────────────────────────────────────────
  // Valid rows first (already query-sorted); the inert unassigned + orphan rows
  // come last and only when explicitly opted in.
  const breakdown: BreakdownItem[] = [];
  for (const r of valid) {
    if (!keep(r.label)) continue;
    breakdown.push({ id: String(r.raw), label: r.label, value: r.value, raw: r.raw, selectable: true });
  }
  if (i.showEmptyValues) {
    for (const r of [...orphan, ...empty]) {
      if (!keep(r.label)) continue;
      breakdown.push({
        id: r.kind === 'empty' ? '__empty__' : String(r.raw),
        label: r.kind === 'empty' ? i.emptyLabel : r.label,
        value: r.value, raw: null, selectable: false,
      });
    }
  }
  return { total, breakdown };
}

/**
 * Run the total + breakdown queries. For a GROUPED card the total counts only
 * records whose breakdown field holds a real value (see the counting-policy note
 * above); a Simple card's total is the plain base aggregate. Custom rows are each
 * their own filtered aggregate.
 */
export async function fetchBreakdown(spec: BreakdownSpec): Promise<BreakdownData> {
  const measure: AggSpec = { fn: spec.agg, field: spec.agg === 'count' ? '*' : (spec.field || '*'), alias: 'v' };
  const baseFilters = spec.baseFilters ?? [];
  const relatedFilters = spec.relatedFilters;
  const semanticFilters = spec.semanticFilters;
  const includeBd = spec.includeBreakdown && !!spec.breakdownField;
  const showEmpty = spec.showEmptyValues ?? false;

  const aggregate = (filters: VisualFilter[]) => runAggregate({
    entity: spec.entity, filters, relatedFilters, semanticFilters,
    filterLogic: spec.filterLogic, aggregations: [measure],
  });

  const breakdown: BreakdownItem[] = [];
  let total: number;

  if (includeBd) {
    const field = spec.breakdownField!;
    const sort = spec.breakdownSort ?? 'value_desc';

    // 1) Grouped rows over the same measure + filters.
    const cfg: QueryConfig = {
      entity: spec.entity, filters: baseFilters, relatedFilters, semanticFilters, filterLogic: spec.filterLogic,
      groupBy: [{ field, alias: 'k' }],
      aggregations: [measure],
      orderBy: sort === 'label' ? [{ key: 'k', dir: 'asc' }] : [{ key: 'v', dir: sort === 'value_asc' ? 'asc' : 'desc' }],
      limit: spec.breakdownLimit ?? 50,
    };
    const res = await runAggregate(cfg);
    const labeled = await resolveAggregateLabels(spec.entity, res.rows, [{ field, alias: 'k' }]);

    // Is the breakdown field a lookup (FK to another table / user)? Only lookups can
    // have broken references — an unresolved label on one means a missing record.
    let isLookup = false;
    try {
      const meta = await loadColumnMeta(spec.entity);
      const cm = meta?.byColumn.get(field);
      isLookup = !!cm && (!!cm.lookupTable || cm.isUser);
    } catch { /* metadata unavailable → treat as non-lookup (no orphan detection) */ }

    const classified: ClassifiedRow[] = labeled.map((r, idx) => {
      const raw = res.rows[idx]?.k;
      const isEmpty = raw == null || raw === '';
      const label = isEmpty ? EMPTY_LABEL : String(r.k ?? EMPTY_LABEL);
      // Orphan: a lookup id whose label never resolved (stayed equal to the raw id).
      const isOrphan = !isEmpty && isLookup && String(r.k) === String(raw);
      const kind: BreakdownRowKind = isEmpty ? 'empty' : isOrphan ? 'orphan' : 'valid';
      return { kind, raw, label, value: Number(r.v ?? 0) };
    });

    // 2) Headline totals. Restricting the total to non-empty values needs an extra
    // AND predicate; the RPC ANDs/ORs all predicates with one logic, so we can only
    // safely add the guard under AND logic. Under OR we fall back to the base total.
    const andLogic = (spec.filterLogic ?? 'and') !== 'or';
    let baseTotal = 0;
    let nonEmptyTotal: number | null = null;
    if (showEmpty || !andLogic) {
      const r = await aggregate(baseFilters);
      baseTotal = Number(r.rows[0]?.v ?? 0);
    }
    if (!showEmpty && andLogic) {
      const r = await aggregate([...baseFilters, { field, op: 'is_not_empty' }]);
      nonEmptyTotal = Number(r.rows[0]?.v ?? 0);
    }

    const additive = spec.agg === 'count' || spec.agg === 'sum';
    const assembled = assembleBreakdown({
      rows: classified, baseTotal, nonEmptyTotal, additive,
      showEmptyValues: showEmpty, emptyLabel: EMPTY_LABEL, breakdownValues: spec.breakdownValues,
    });
    total = assembled.total;
    breakdown.push(...assembled.breakdown);
  } else {
    // Simple card — the total is the plain base aggregate.
    const r = await aggregate(baseFilters);
    total = Number(r.rows[0]?.v ?? 0);
  }

  // 3) CUSTOM filtered rows (e.g. "Converted to Lead") — each its own aggregate.
  for (const item of spec.customBreakdownItems ?? []) {
    const r = await aggregate([...baseFilters, ...(item.filters ?? [])]);
    breakdown.push({ id: customKey(item), label: item.label, value: Number(r.rows[0]?.v ?? 0) });
  }

  const filtered = spec.showZeroValues ? breakdown : breakdown.filter((b) => b.value !== 0);
  return { total, breakdown: filtered };
}
