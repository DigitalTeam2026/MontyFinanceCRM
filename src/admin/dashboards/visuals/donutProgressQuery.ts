// Data fetch + percentage maths for the Donut Progress Gauge. Kept separate from
// the renderer so the (pure) clamping / ratio logic is unit-testable and the
// component stays presentational. Every mode runs through the SAME base filters
// the rest of the dashboard uses (visual filters + cross-filter + slicers +
// semantic filters), so a filtered-to-empty result is a real 0% — the gauge
// never silently falls back to all data.

import type {
  AggFn, DonutProgressConfig, VisualFilter, RelatedFilter, SemanticQueryFilter,
} from '../types/dashboard';
import { runAggregate } from '../services/queryEngine';

export interface DonutProgressResult {
  /** 0–100, clamped for the arc. */
  percent: number;
  /** The real (unclamped) percentage — drives the tooltip (e.g. 124% achieved). */
  rawPercent: number;
  numerator: number;
  denominator: number;
  /** True when the denominator was zero (→ shown as 0%, never "all data"). */
  empty: boolean;
}

/** Clamp a percentage to the 0–100 the donut arc can draw. */
export function clampPercent(p: number): number {
  if (!Number.isFinite(p) || p < 0) return 0;
  if (p > 100) return 100;
  return p;
}

/** Pure ratio → result (no I/O). Exposed for testing + reuse. */
export function toResult(numerator: number, denominator: number): DonutProgressResult {
  const raw = denominator !== 0 ? (numerator / denominator) * 100 : 0;
  return {
    percent: clampPercent(raw),
    rawPercent: Number.isFinite(raw) ? raw : 0,
    numerator,
    denominator,
    empty: denominator === 0,
  };
}

export interface DonutProgressSpec {
  entity: string;
  cfg: DonutProgressConfig;
  baseFilters?: VisualFilter[];
  relatedFilters?: RelatedFilter[];
  semanticFilters?: SemanticQueryFilter[];
  filterLogic?: 'and' | 'or';
}

/** Run the queries for a donut progress gauge and return the resolved percentage. */
export async function fetchDonutProgress(spec: DonutProgressSpec): Promise<DonutProgressResult> {
  const { entity, cfg } = spec;
  const baseFilters = spec.baseFilters ?? [];
  const relatedFilters = spec.relatedFilters;
  const semanticFilters = spec.semanticFilters;
  const mode = cfg.calcMode ?? 'count_percentage';

  const aggregate = async (fn: AggFn, field: string | undefined, extra: VisualFilter[] = []) => {
    const res = await runAggregate({
      entity,
      filters: [...baseFilters, ...extra],
      relatedFilters,
      semanticFilters,
      filterLogic: spec.filterLogic,
      aggregations: [{ fn, field: fn === 'count' ? '*' : (field || '*'), alias: 'v' }],
    });
    return Number(res.rows[0]?.v ?? 0);
  };

  if (mode === 'sum_percentage') {
    const numerator = await aggregate(cfg.numeratorAgg ?? 'sum', cfg.numeratorField);
    const denominator = Number(cfg.targetValue ?? 0);
    return toResult(numerator, denominator);
  }

  if (mode === 'field_percentage') {
    // The field already holds a percentage; aggregate it (default average) and
    // present it directly out of 100.
    const value = await aggregate(cfg.valueFieldAgg ?? 'avg', cfg.valueField);
    return toResult(value, 100);
  }

  // count_percentage — numerator records / denominator records.
  const denominator = await aggregate('count', undefined);
  const numerator = await aggregate('count', undefined, cfg.numeratorFilters ?? []);
  return toResult(numerator, denominator);
}
