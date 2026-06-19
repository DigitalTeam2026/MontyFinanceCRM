import type { DashboardVisual, FormatConfig, ThemeConfig, VisualType, LegendPosition } from '../types/dashboard';
import { formatLabel } from './formatValue';
import { pick, categoryColor, seriesColor } from './colorConfig';

type Row = Record<string, unknown>;

interface Built { categoryKey: string; valueKeys: string[]; legendKey?: string }

// Resolve which result keys are the category (group) and which are measures.
function resolveKeys(visual: DashboardVisual, rows: Row[]): Built {
  const q = visual.query_config;
  const groupKeys = (q.groupBy ?? []).map((g) => g.alias || g.field);
  const valueKeys = (q.aggregations ?? []).map((a) => a.alias);
  if (rows.length && (!groupKeys.length || !valueKeys.length)) {
    // Fallback: infer from first row — first text-ish key = category, numerics = values.
    const keys = Object.keys(rows[0]).filter((k) => k !== '__raw');
    const cat = groupKeys[0] ?? keys.find((k) => typeof rows[0][k] !== 'number') ?? keys[0];
    const vals = valueKeys.length ? valueKeys : keys.filter((k) => k !== cat && typeof rows[0][k] === 'number');
    return { categoryKey: cat, valueKeys: vals.length ? vals : [keys[1] ?? keys[0]], legendKey: groupKeys[1] };
  }
  return { categoryKey: groupKeys[0] ?? 'category', valueKeys: valueKeys.length ? valueKeys : ['count'], legendKey: groupKeys[1] };
}

// Axis cosmetics resolve from format_config first, then the theme.
const axisStyle = (t: ThemeConfig, fmt: FormatConfig) => ({
  axisLine: { lineStyle: { color: pick(fmt.axisLineColor, t.borderColor) } },
  axisLabel: { color: pick(fmt.axisTextColor, t.secondaryText), fontSize: 11 },
  splitLine: {
    show: fmt.showGridLines !== false,
    lineStyle: { color: pick(fmt.gridLineColor, t.gridLineColor) },
  },
});

// Resolve an ECharts legend block from the visual's legendPosition setting.
// 'none' (or the legacy showLegend === false) hides it; otherwise the chosen
// edge drives orient + placement. `fallback` is the chart's natural default.
function legendFor(fmt: FormatConfig, legendText: string, fallback: LegendPosition = 'bottom') {
  if (fmt.legendPosition === 'none' || fmt.showLegend === false) return { show: false } as const;
  const place = fmt.legendPosition ?? fallback;
  const base = { show: true, type: 'scroll' as const, textStyle: { color: legendText } };
  switch (place) {
    case 'top': return { ...base, top: 0, left: 'center', orient: 'horizontal' as const };
    case 'left': return { ...base, left: 0, top: 'middle', orient: 'vertical' as const };
    case 'right': return { ...base, right: 0, top: 'middle', orient: 'vertical' as const };
    case 'bottom':
    default: return { ...base, bottom: 0, left: 'center', orient: 'horizontal' as const };
  }
}

const tooltipStyle = (fmt: FormatConfig) => ({
  confine: true,
  ...(fmt.tooltipBg ? { backgroundColor: fmt.tooltipBg, borderColor: fmt.tooltipBg } : {}),
  ...(fmt.tooltipTextColor ? { textStyle: { color: fmt.tooltipTextColor } } : {}),
});

/** A reference/target line drawn at data_config.target (bar/line/combo). */
function targetMarkLine(visual: DashboardVisual, theme: ThemeConfig) {
  const fmt = visual.format_config;
  const raw = visual.data_config.target;
  const t = typeof raw === 'number' ? raw : Number(raw);
  if (raw == null || Number.isNaN(t)) return undefined;
  return {
    silent: true, symbol: 'none',
    lineStyle: { color: pick(fmt.targetColor, theme.warning), type: 'dashed' as const, width: 2 },
    label: { color: pick(fmt.targetColor, theme.warning), fontSize: 10 },
    data: [{ yAxis: t }],
  };
}

/**
 * Build an ECharts option for a data-driven chart visual. Returns null for
 * non-ECharts visuals (kpi/table/text/etc.) which are rendered as React.
 */
export function buildEChartsOption(
  visual: DashboardVisual, rows: Row[], theme: ThemeConfig, highlight?: Set<string>,
): Record<string, unknown> | null {
  const { categoryKey } = resolveKeys(visual, rows);
  return applyHighlight(buildBaseOption(visual, rows, theme), rows, categoryKey, theme, highlight);
}

// Emphasise selected category items and dim the rest (cross-filter highlight).
// Selection is by category, so each row maps to one data point per series. Uses a
// border + opacity (not colour alone) so the cue is accessible.
function applyHighlight(
  option: Record<string, unknown> | null, rows: Row[], categoryKey: string,
  theme: ThemeConfig, highlight?: Set<string>,
): Record<string, unknown> | null {
  if (!option || !highlight || !highlight.size) return option;
  const rawAt = (i: number) => String((rows[i]?.__raw as Record<string, unknown> | undefined)?.[categoryKey] ?? rows[i]?.[categoryKey] ?? '');
  const series = option.series as { data?: unknown[] }[] | undefined;
  if (!Array.isArray(series)) return option;
  for (const s of series) {
    if (!Array.isArray(s.data) || s.data.length !== rows.length) continue;   // skip helper series (e.g. waterfall assist)
    s.data = s.data.map((d, i) => {
      const item: Record<string, unknown> = (d && typeof d === 'object' && !Array.isArray(d)) ? { ...(d as Record<string, unknown>) } : { value: d };
      const on = highlight.has(rawAt(i));
      const prev = (item.itemStyle ?? {}) as Record<string, unknown>;
      item.itemStyle = {
        ...prev,
        opacity: on ? 1 : 0.25,
        ...(on ? { borderColor: theme.primaryText, borderWidth: 2 } : {}),
      };
      return item;
    });
  }
  return option;
}

function buildBaseOption(
  visual: DashboardVisual, rows: Row[], theme: ThemeConfig,
): Record<string, unknown> | null {
  const type = visual.visual_type as VisualType;
  const fmt = visual.format_config;
  const { categoryKey, valueKeys } = resolveKeys(visual, rows);
  const cats = rows.map((r) => formatLabel(r[categoryKey]));
  const palette = theme.chartPalette;
  const legendText = pick(fmt.legendTextColor, theme.secondaryText);
  const dataLabelColor = pick(fmt.dataLabelColor, theme.secondaryText);
  const legend = valueKeys.length > 1 || (fmt.legendPosition && fmt.legendPosition !== 'none')
    ? legendFor(fmt, legendText)
    : { show: false as const };
  const grid = { left: 48, right: 16, top: 24, bottom: valueKeys.length > 1 ? 36 : 28, containLabel: true };
  const tooltip = { trigger: 'item' as const, ...tooltipStyle(fmt) };

  // Per-bar / per-point colour for single-series charts: explicit positive /
  // negative override → category colour → series palette.
  const signColor = (v: number, fallback: string) => {
    if (v >= 0 && fmt.positiveColor) return fmt.positiveColor;
    if (v < 0 && fmt.negativeColor) return fmt.negativeColor;
    return fallback;
  };

  const seriesFor = (kind: 'bar' | 'line', stack?: string) =>
    valueKeys.map((k, i) => {
      const baseColor = seriesColor(fmt, i, palette);
      const single = valueKeys.length === 1;
      return {
        name: k, type: kind,
        stack, areaStyle: undefined as unknown,
        data: rows.map((r, ri) => {
          const v = Number(r[k] ?? 0);
          // Single series: allow per-category + positive/negative colouring.
          if (single) {
            const cat = categoryColor(fmt, formatLabel(r[categoryKey]), ri, palette);
            return { value: v, itemStyle: { color: signColor(v, cat), borderRadius: kind === 'bar' ? [3, 3, 0, 0] : 0 } };
          }
          return v;
        }),
        itemStyle: { color: baseColor, borderRadius: kind === 'bar' ? [3, 3, 0, 0] : 0 },
        label: { show: !!fmt.showDataLabels, color: dataLabelColor, fontSize: 10 },
        ...(kind === 'line' && i === 0 ? { markLine: targetMarkLine(visual, theme) } : {}),
        ...(kind === 'bar' && i === 0 ? { markLine: targetMarkLine(visual, theme) } : {}),
      };
    });

  switch (type) {
    case 'bar': {
      const horizontal = fmt.orientation === 'horizontal';
      const valAxis = { type: 'value' as const, ...axisStyle(theme, fmt) };
      const catAxis = { type: 'category' as const, data: cats, ...axisStyle(theme, fmt) };
      return {
        color: palette, tooltip: { ...tooltip, trigger: 'axis', ...tooltipStyle(fmt) }, legend, grid,
        xAxis: horizontal ? valAxis : catAxis,
        yAxis: horizontal ? catAxis : valAxis,
        series: seriesFor('bar', fmt.stacked ? 'total' : undefined),
      };
    }
    case 'line':
    case 'area': {
      const series = seriesFor('line', fmt.stacked ? 'total' : undefined).map((s, i) => ({
        ...s, smooth: true,
        areaStyle: type === 'area' ? { opacity: 0.18, color: seriesColor(fmt, i, palette) } : undefined,
      }));
      return {
        color: palette, tooltip: { ...tooltip, trigger: 'axis', ...tooltipStyle(fmt) }, legend, grid,
        xAxis: { type: 'category', boundaryGap: type !== 'area', data: cats, ...axisStyle(theme, fmt) },
        yAxis: { type: 'value', ...axisStyle(theme, fmt) },
        series,
      };
    }
    case 'combo': {
      const series = valueKeys.map((k, i) => ({
        name: k, type: i === 0 ? 'bar' : 'line',
        yAxisIndex: i === 0 ? 0 : 1,
        data: rows.map((r) => Number(r[k] ?? 0)),
        itemStyle: { color: seriesColor(fmt, i, palette) }, smooth: true,
        label: { show: !!fmt.showDataLabels, color: dataLabelColor, fontSize: 10 },
      }));
      return {
        color: palette, tooltip: { ...tooltip, trigger: 'axis', ...tooltipStyle(fmt) },
        legend: { show: true, bottom: 0, textStyle: { color: legendText } }, grid,
        xAxis: { type: 'category', data: cats, ...axisStyle(theme, fmt) },
        yAxis: [{ type: 'value', ...axisStyle(theme, fmt) }, { type: 'value', ...axisStyle(theme, fmt) }],
        series,
      };
    }
    case 'pie':
    case 'donut': {
      const vk = valueKeys[0];
      const pieLegend = legendFor(fmt, legendText, 'right');
      // Shift the pie toward the side opposite a vertical legend so they don't overlap.
      const pieCenter = (pieLegend as { orient?: string; left?: unknown; right?: unknown }).orient === 'vertical'
        ? ((pieLegend as { left?: unknown }).left != null ? ['62%', '50%'] : ['40%', '50%'])
        : ['50%', '50%'];
      return {
        color: palette, tooltip,
        legend: pieLegend,
        series: [{
          type: 'pie', radius: type === 'donut' ? ['45%', '72%'] : '72%', center: pieCenter,
          data: rows.map((r, i) => {
            const name = formatLabel(r[categoryKey]);
            return { name, value: Number(r[vk] ?? 0), itemStyle: { color: categoryColor(fmt, name, i, palette) } };
          }),
          label: { show: !!fmt.showDataLabels, color: pick(fmt.dataLabelColor, theme.secondaryText) },
        }],
      };
    }
    case 'funnel': {
      const vk = valueKeys[0];
      return {
        color: palette, tooltip,
        series: [{
          type: 'funnel', left: '10%', right: '10%', top: 10, bottom: 10, minSize: '20%',
          data: rows.map((r, i) => {
            const name = formatLabel(r[categoryKey]);
            return { name, value: Number(r[vk] ?? 0), itemStyle: { color: categoryColor(fmt, name, i, palette) } };
          }),
          label: { color: pick(fmt.dataLabelColor, theme.primaryText) },
        }],
      };
    }
    case 'scatter': {
      return {
        color: palette, tooltip, grid,
        xAxis: { type: 'value', ...axisStyle(theme, fmt) },
        yAxis: { type: 'value', ...axisStyle(theme, fmt) },
        series: [{
          type: 'scatter', symbolSize: 10,
          itemStyle: { color: seriesColor(fmt, 0, palette) },
          data: rows.map((r) => [Number(r[valueKeys[0]] ?? 0), Number(r[valueKeys[1] ?? valueKeys[0]] ?? 0)]),
        }],
      };
    }
    case 'waterfall': {
      const vk = valueKeys[0];
      let running = 0;
      const assist: number[] = [];
      const vis: { value: number; itemStyle: { color: string; borderRadius: number[] } }[] = [];
      rows.forEach((r, i) => {
        const v = Number(r[vk] ?? 0);
        assist.push(running);
        const cat = categoryColor(fmt, formatLabel(r[categoryKey]), i, palette);
        const color = v >= 0 ? pick(fmt.positiveColor, cat) : pick(fmt.negativeColor, theme.error);
        vis.push({ value: v, itemStyle: { color, borderRadius: [3, 3, 0, 0] } });
        running += v;
      });
      return {
        color: palette, tooltip: { trigger: 'axis', ...tooltipStyle(fmt) }, grid,
        xAxis: { type: 'category', data: cats, ...axisStyle(theme, fmt) },
        yAxis: { type: 'value', ...axisStyle(theme, fmt) },
        series: [
          { type: 'bar', stack: 'w', itemStyle: { color: 'transparent' }, data: assist },
          { type: 'bar', stack: 'w', data: vis,
            label: { show: !!fmt.showDataLabels, color: dataLabelColor, fontSize: 10 } },
        ],
      };
    }
    case 'treemap': {
      const vk = valueKeys[0];
      return {
        tooltip,
        series: [{
          type: 'treemap', roam: false, breadcrumb: { show: false },
          data: rows.map((r, i) => {
            const name = formatLabel(r[categoryKey]);
            return { name, value: Number(r[vk] ?? 0), itemStyle: { color: categoryColor(fmt, name, i, palette) } };
          }),
          label: { color: pick(fmt.dataLabelColor, '#fff') },
        }],
      };
    }
    case 'gauge': {
      const vk = valueKeys[0];
      const val = rows.length ? Number(rows[0][vk] ?? 0) : 0;
      const min = visual.data_config.min ?? 0;
      const max = visual.data_config.max ?? 100;
      const arc = pick(fmt.gaugeArcColor, theme.primaryAccent);
      const track = pick(fmt.gaugeTrackColor, theme.gridLineColor);
      // Threshold ranges paint the axis line in bands; else a single arc colour.
      const bands = (fmt.thresholds ?? []).length
        ? buildGaugeBands(fmt.thresholds!, min, max, track)
        : [[1, track]];
      const target = typeof visual.data_config.target === 'number' ? visual.data_config.target : undefined;
      return {
        series: [{
          type: 'gauge', min, max,
          startAngle: fmt.startAngle ?? 210, endAngle: fmt.endAngle ?? -30,
          progress: { show: true, width: 14, itemStyle: { color: arc } },
          axisLine: { lineStyle: { width: 14, color: bands } },
          pointer: { itemStyle: { color: arc } },
          axisTick: { show: false }, splitLine: { show: false },
          axisLabel: { color: pick(fmt.axisTextColor, theme.secondaryText), distance: 18, fontSize: 10 },
          detail: { valueAnimation: true, color: pick(fmt.valueColor, theme.primaryText), fontSize: 22, offsetCenter: [0, '40%'] },
          data: [{ value: val }],
          itemStyle: { color: arc },
          ...(target != null ? {
            markLine: { data: [{ value: target }], lineStyle: { color: pick(fmt.targetMarkerColor, theme.warning) } },
          } : {}),
        }],
      };
    }
    default:
      return null;
  }
}

// Convert threshold stops into ECharts gauge axisLine colour stops (0..1).
function buildGaugeBands(
  thresholds: { value: number; color: string }[], min: number, max: number, track: string,
): [number, string][] {
  const span = Math.max(1, max - min);
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);
  const stops: [number, string][] = [];
  let prev = 0;
  for (const t of sorted) {
    const pos = Math.max(0, Math.min(1, (t.value - min) / span));
    if (pos > prev) { stops.push([pos, t.color]); prev = pos; }
  }
  if (prev < 1) stops.push([1, track]);
  return stops.length ? stops : [[1, track]];
}
