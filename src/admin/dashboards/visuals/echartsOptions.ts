import type { DashboardVisual, ThemeConfig, VisualType } from '../types/dashboard';
import { formatLabel } from './formatValue';

type Row = Record<string, unknown>;

interface Built { categoryKey: string; valueKeys: string[]; legendKey?: string }

// Resolve which result keys are the category (group) and which are measures.
function resolveKeys(visual: DashboardVisual, rows: Row[]): Built {
  const q = visual.query_config;
  const groupKeys = (q.groupBy ?? []).map((g) => g.alias || g.field);
  const valueKeys = (q.aggregations ?? []).map((a) => a.alias);
  if (rows.length && (!groupKeys.length || !valueKeys.length)) {
    // Fallback: infer from first row — first text-ish key = category, numerics = values.
    const keys = Object.keys(rows[0]);
    const cat = groupKeys[0] ?? keys.find((k) => typeof rows[0][k] !== 'number') ?? keys[0];
    const vals = valueKeys.length ? valueKeys : keys.filter((k) => k !== cat && typeof rows[0][k] === 'number');
    return { categoryKey: cat, valueKeys: vals.length ? vals : [keys[1] ?? keys[0]], legendKey: groupKeys[1] };
  }
  return { categoryKey: groupKeys[0] ?? 'category', valueKeys: valueKeys.length ? valueKeys : ['count'], legendKey: groupKeys[1] };
}

const axisStyle = (t: ThemeConfig) => ({
  axisLine: { lineStyle: { color: t.borderColor } },
  axisLabel: { color: t.secondaryText, fontSize: 11 },
  splitLine: { lineStyle: { color: t.gridLineColor } },
});

/**
 * Build an ECharts option for a data-driven chart visual. Returns null for
 * non-ECharts visuals (kpi/table/text/etc.) which are rendered as React.
 */
export function buildEChartsOption(
  visual: DashboardVisual, rows: Row[], theme: ThemeConfig,
): Record<string, unknown> | null {
  const type = visual.visual_type as VisualType;
  const fmt = visual.format_config;
  const { categoryKey, valueKeys } = resolveKeys(visual, rows);
  const cats = rows.map((r) => formatLabel(r[categoryKey]));
  const palette = theme.chartPalette;
  const legend = fmt.showLegend !== false && valueKeys.length > 1
    ? { show: true, textStyle: { color: theme.secondaryText }, bottom: 0, type: 'scroll' as const }
    : { show: false };
  const grid = { left: 48, right: 16, top: 24, bottom: valueKeys.length > 1 ? 36 : 28, containLabel: true };
  const tooltip = { trigger: 'item' as const, confine: true };

  const seriesFor = (kind: 'bar' | 'line', stack?: string) =>
    valueKeys.map((k, i) => ({
      name: k, type: kind,
      stack, areaStyle: undefined as unknown,
      data: rows.map((r) => Number(r[k] ?? 0)),
      itemStyle: { color: palette[i % palette.length], borderRadius: kind === 'bar' ? [3, 3, 0, 0] : 0 },
      label: { show: !!fmt.showDataLabels, color: theme.secondaryText, fontSize: 10 },
    }));

  switch (type) {
    case 'bar': {
      const horizontal = fmt.orientation === 'horizontal';
      const valAxis = { type: 'value' as const, ...axisStyle(theme) };
      const catAxis = { type: 'category' as const, data: cats, ...axisStyle(theme) };
      return {
        color: palette, tooltip: { ...tooltip, trigger: 'axis' }, legend, grid,
        xAxis: horizontal ? valAxis : catAxis,
        yAxis: horizontal ? catAxis : valAxis,
        series: seriesFor('bar', fmt.stacked ? 'total' : undefined),
      };
    }
    case 'line':
    case 'area': {
      const series = seriesFor('line', fmt.stacked ? 'total' : undefined).map((s) => ({
        ...s, smooth: true, areaStyle: type === 'area' ? { opacity: 0.18 } : undefined,
      }));
      return {
        color: palette, tooltip: { ...tooltip, trigger: 'axis' }, legend, grid,
        xAxis: { type: 'category', boundaryGap: type !== 'area', data: cats, ...axisStyle(theme) },
        yAxis: { type: 'value', ...axisStyle(theme) },
        series,
      };
    }
    case 'combo': {
      const series = valueKeys.map((k, i) => ({
        name: k, type: i === 0 ? 'bar' : 'line',
        yAxisIndex: i === 0 ? 0 : 1,
        data: rows.map((r) => Number(r[k] ?? 0)),
        itemStyle: { color: palette[i % palette.length] }, smooth: true,
      }));
      return {
        color: palette, tooltip: { ...tooltip, trigger: 'axis' }, legend: { show: true, bottom: 0, textStyle: { color: theme.secondaryText } }, grid,
        xAxis: { type: 'category', data: cats, ...axisStyle(theme) },
        yAxis: [{ type: 'value', ...axisStyle(theme) }, { type: 'value', ...axisStyle(theme) }],
        series,
      };
    }
    case 'pie':
    case 'donut': {
      const vk = valueKeys[0];
      return {
        color: palette, tooltip, legend: { show: fmt.showLegend !== false, type: 'scroll', orient: 'vertical', right: 0, top: 'middle', textStyle: { color: theme.secondaryText } },
        series: [{
          type: 'pie', radius: type === 'donut' ? ['45%', '72%'] : '72%', center: ['40%', '50%'],
          data: rows.map((r, i) => ({ name: formatLabel(r[categoryKey]), value: Number(r[vk] ?? 0), itemStyle: { color: palette[i % palette.length] } })),
          label: { show: !!fmt.showDataLabels, color: theme.secondaryText },
        }],
      };
    }
    case 'funnel': {
      const vk = valueKeys[0];
      return {
        color: palette, tooltip,
        series: [{
          type: 'funnel', left: '10%', right: '10%', top: 10, bottom: 10, minSize: '20%',
          data: rows.map((r, i) => ({ name: formatLabel(r[categoryKey]), value: Number(r[vk] ?? 0), itemStyle: { color: palette[i % palette.length] } })),
          label: { color: theme.primaryText },
        }],
      };
    }
    case 'scatter': {
      return {
        color: palette, tooltip, grid,
        xAxis: { type: 'value', ...axisStyle(theme) },
        yAxis: { type: 'value', ...axisStyle(theme) },
        series: [{
          type: 'scatter', symbolSize: 10,
          data: rows.map((r) => [Number(r[valueKeys[0]] ?? 0), Number(r[valueKeys[1] ?? valueKeys[0]] ?? 0)]),
        }],
      };
    }
    case 'waterfall': {
      const vk = valueKeys[0];
      let running = 0;
      const assist: number[] = [];
      const vis: number[] = [];
      rows.forEach((r) => { const v = Number(r[vk] ?? 0); assist.push(running); vis.push(v); running += v; });
      return {
        color: palette, tooltip: { trigger: 'axis' }, grid,
        xAxis: { type: 'category', data: cats, ...axisStyle(theme) },
        yAxis: { type: 'value', ...axisStyle(theme) },
        series: [
          { type: 'bar', stack: 'w', itemStyle: { color: 'transparent' }, data: assist },
          { type: 'bar', stack: 'w', itemStyle: { color: palette[0], borderRadius: [3, 3, 0, 0] }, data: vis },
        ],
      };
    }
    case 'treemap': {
      const vk = valueKeys[0];
      return {
        tooltip,
        series: [{
          type: 'treemap', roam: false, breadcrumb: { show: false },
          data: rows.map((r, i) => ({ name: formatLabel(r[categoryKey]), value: Number(r[vk] ?? 0), itemStyle: { color: palette[i % palette.length] } })),
        }],
      };
    }
    case 'gauge': {
      const vk = valueKeys[0];
      const val = rows.length ? Number(rows[0][vk] ?? 0) : 0;
      const min = visual.data_config.min ?? 0;
      const max = visual.data_config.max ?? 100;
      return {
        series: [{
          type: 'gauge', min, max,
          startAngle: fmt.startAngle ?? 210, endAngle: fmt.endAngle ?? -30,
          progress: { show: true, width: 14 },
          axisLine: { lineStyle: { width: 14, color: [[1, theme.gridLineColor]] } },
          pointer: { itemStyle: { color: theme.primaryAccent } },
          axisTick: { show: false }, splitLine: { show: false },
          axisLabel: { color: theme.secondaryText, distance: 18, fontSize: 10 },
          detail: { valueAnimation: true, color: theme.primaryText, fontSize: 22, offsetCenter: [0, '40%'] },
          data: [{ value: val }],
          itemStyle: { color: theme.primaryAccent },
        }],
      };
    }
    default:
      return null;
  }
}
