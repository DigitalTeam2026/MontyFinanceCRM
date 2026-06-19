// Colour resolution helpers shared by every visual renderer + the format panel.
//
// Golden rule: a visual NEVER hard-codes a colour. It either uses a colour the
// user configured in format_config, or it falls back to the active dashboard
// theme. `pick()` and `categoryColor()` encode exactly that fallback chain.

import type { AggFn, DashboardVisual, FormatConfig, GroupBySpec, ThemeConfig } from '../types/dashboard';
import { runAggregate } from '../services/queryEngine';
import { resolveAggregateLabels } from './labelResolver';
import { formatLabel } from './formatValue';

/** A configured colour, or the theme fallback when unset / empty. */
export function pick(custom: string | undefined | null, fallback: string): string {
  return custom != null && custom !== '' ? custom : fallback;
}

/**
 * Resolve the colour for one category / breakdown value.
 *  1. explicit per-value colour (format_config.colorByValue[key]) — survives sort/count changes
 *  2. per-series override (format_config.seriesColors[index])
 *  3. the theme chart palette (wrapped by index)
 */
export function categoryColor(
  fmt: FormatConfig, key: string, index: number, palette: string[],
): string {
  const byVal = fmt.colorByValue?.[key];
  if (byVal) return byVal;
  const series = fmt.seriesColors;
  if (series && series[index]) return series[index];
  return palette.length ? palette[index % palette.length] : '#4f8cff';
}

/** Resolve the colour for one series (multi-measure charts): per-series → palette. */
export function seriesColor(fmt: FormatConfig, index: number, palette: string[]): string {
  const series = fmt.seriesColors;
  if (series && series[index]) return series[index];
  return palette.length ? palette[index % palette.length] : '#4f8cff';
}

/** The dashboard theme exposed as named swatches for the colour picker. */
export function themeSwatches(theme: ThemeConfig): { label: string; value: string }[] {
  return [
    { label: 'Primary accent', value: theme.primaryAccent },
    { label: 'Secondary accent', value: theme.secondaryAccent },
    { label: 'Success', value: theme.success },
    { label: 'Warning', value: theme.warning },
    { label: 'Error', value: theme.error },
    { label: 'Primary text', value: theme.primaryText },
    { label: 'Secondary text', value: theme.secondaryText },
    { label: 'Border', value: theme.borderColor },
    { label: 'Surface', value: theme.surfaceBackground },
    { label: 'Card', value: theme.cardBackground },
    ...theme.chartPalette.map((c, i) => ({ label: `Palette ${i + 1}`, value: c })),
  ];
}

// ── Dynamic colour keys (for the "Color by value" / "Category colors" panel) ──
export interface ColorKey { key: string; label: string }

/**
 * Returns the live set of value-keys a visual can be coloured by, so the format
 * panel can show one colour picker per real category. KPI breakdowns are keyed
 * by the RAW option/status value (stable across relabelling); chart categories
 * are keyed by their display label (stable across re-sort / count changes).
 */
export async function fetchColorKeys(visual: DashboardVisual): Promise<ColorKey[]> {
  const entity = visual.query_config.entity;
  if (!entity) return [];

  if (visual.visual_type === 'kpi') {
    const d = visual.data_config;
    const out: ColorKey[] = [];
    const mainAgg: AggFn = d.mainAgg ?? 'count';
    const measure = { fn: mainAgg, field: mainAgg === 'count' ? '*' : (d.mainField || '*'), alias: 'v' as const };
    if (d.kpiMode === 'breakdown' && d.breakdownField) {
      const gb: GroupBySpec[] = [{ field: d.breakdownField, alias: 'k' }];
      const res = await runAggregate({
        entity, filters: visual.query_config.filters ?? [],
        groupBy: gb, aggregations: [measure], limit: d.breakdownLimit ?? 50,
      });
      const labeled = await resolveAggregateLabels(entity, res.rows, gb);
      res.rows.forEach((raw, i) => {
        const key = String(raw.k ?? '—');
        if (d.breakdownValues?.length && !d.breakdownValues.includes(String(labeled[i].k ?? '—'))) return;
        out.push({ key, label: String(labeled[i].k ?? '—') });
      });
    }
    for (const item of d.customBreakdownItems ?? []) {
      out.push({ key: customKey(item), label: item.label || '(custom)' });
    }
    return dedupe(out);
  }

  // Chart-style visuals — list the category groupBy values.
  const cat = visual.query_config.groupBy?.[0];
  if (!cat) return [];
  const aggs = visual.query_config.aggregations?.length
    ? visual.query_config.aggregations
    : [{ fn: 'count' as AggFn, field: '*', alias: 'count' }];
  const res = await runAggregate({
    entity, filters: visual.query_config.filters ?? [],
    groupBy: [cat], aggregations: aggs, limit: 50,
  });
  const labeled = await resolveAggregateLabels(entity, res.rows, [cat]);
  const key = cat.alias || cat.field;
  return dedupe(labeled.map((r) => {
    const lbl = formatLabel(r[key]);
    return { key: lbl, label: lbl };
  }));
}

/** Stable colour key for a KPI custom breakdown row. */
export function customKey(item: { id?: string; label: string }): string {
  return `custom:${item.id ?? item.label}`;
}

function dedupe(keys: ColorKey[]): ColorKey[] {
  const seen = new Set<string>();
  const out: ColorKey[] = [];
  for (const k of keys) { if (seen.has(k.key)) continue; seen.add(k.key); out.push(k); }
  return out;
}
