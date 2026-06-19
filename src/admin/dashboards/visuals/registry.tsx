import type { ReactNode } from 'react';
import {
  Gauge, Table2, BarChart3, LineChart, AreaChart, PieChart, CircleDot,
  TrendingUp, Filter, Type, Image as ImageIcon, Square, MousePointerClick,
  ListOrdered, Grid3x3, Hash, Activity, GitMerge, Calendar, Code2, Boxes, FileText, ListFilter,
  Target,
} from 'lucide-react';
import type { VisualType, DashboardVisual } from '../types/dashboard';

export type DataMode = 'aggregate' | 'record' | 'none';
export type VisualCategory = 'kpi' | 'chart' | 'table' | 'filter' | 'content';

export interface VisualMeta {
  type: VisualType;
  label: string;
  icon: ReactNode;
  category: VisualCategory;
  dataMode: DataMode;
  defaultSize: { width: number; height: number };
  defaultConfig: () => Partial<DashboardVisual>;
}

const base = (over: Partial<DashboardVisual>): Partial<DashboardVisual> => ({
  query_config: {}, data_config: {}, interaction_config: {},
  filter_config: {}, format_config: { showHeader: true, emptyMessage: 'No data' },
  ...over,
});

export const VISUAL_REGISTRY: Record<VisualType, VisualMeta> = {
  kpi: {
    type: 'kpi', label: 'KPI Card', icon: <Hash size={15} />, category: 'kpi',
    dataMode: 'aggregate', defaultSize: { width: 6, height: 6 },
    defaultConfig: () => base({
      data_config: { kpiMode: 'simple', mainAgg: 'count', breakdownLimit: 10, kpiLayout: 'detailed' },
      format_config: { showHeader: false, numberFormat: 'number', emptyMessage: 'No data' },
    }),
  },
  funnel_stage: {
    type: 'funnel_stage', label: 'Funnel Stage Card', icon: <GitMerge size={15} />, category: 'kpi',
    dataMode: 'none', defaultSize: { width: 24, height: 6 },
    defaultConfig: () => base({
      data_config: { stages: [] },
      format_config: {
        showHeader: true, emptyMessage: 'Add stages in the Data tab',
        funnelLayout: 'horizontal', showArrows: true, showConversion: true,
        conversionDecimals: 0, showStageSubtitle: true, scrollStages: true,
        stageGap: 8, numberFormat: 'compact',
      },
    }),
  },
  donut_progress: {
    type: 'donut_progress', label: 'Donut Progress Gauge', icon: <Target size={15} />, category: 'kpi',
    dataMode: 'aggregate', defaultSize: { width: 6, height: 7 },
    defaultConfig: () => base({
      data_config: {
        donutProgress: { calcMode: 'count_percentage', centerLabelMode: 'percentage' },
      },
      format_config: {
        showHeader: true, emptyMessage: 'Configure the metric', numberFormat: 'number', decimals: 0,
        cardContentAlign: 'center', chartPosition: 'center', legendPosition: 'bottom', valuePosition: 'center',
        donutPrimaryColor: '#0B2E4A', donutSecondaryColor: '#F5A400', donutTrackColor: '#E5E7EB',
        donutStrokeWidth: 16, donutStartAngle: -90, donutRoundedEnds: true,
      },
    }),
  },
  table: {
    type: 'table', label: 'Table', icon: <Table2 size={15} />, category: 'table',
    dataMode: 'record', defaultSize: { width: 12, height: 8 },
    defaultConfig: () => base({ query_config: { pageSize: 25 } }),
  },
  matrix: {
    type: 'matrix', label: 'Matrix / Pivot', icon: <Grid3x3 size={15} />, category: 'table',
    dataMode: 'aggregate', defaultSize: { width: 12, height: 8 }, defaultConfig: () => base({}),
  },
  bar: {
    type: 'bar', label: 'Bar Chart', icon: <BarChart3 size={15} />, category: 'chart',
    dataMode: 'aggregate', defaultSize: { width: 8, height: 6 },
    defaultConfig: () => base({ format_config: { showHeader: true, showLegend: true, orientation: 'vertical', emptyMessage: 'No data' } }),
  },
  line: {
    type: 'line', label: 'Line Chart', icon: <LineChart size={15} />, category: 'chart',
    dataMode: 'aggregate', defaultSize: { width: 8, height: 6 },
    defaultConfig: () => base({ format_config: { showHeader: true, showLegend: true, emptyMessage: 'No data' } }),
  },
  area: {
    type: 'area', label: 'Area Chart', icon: <AreaChart size={15} />, category: 'chart',
    dataMode: 'aggregate', defaultSize: { width: 8, height: 6 }, defaultConfig: () => base({}),
  },
  pie: {
    type: 'pie', label: 'Pie Chart', icon: <PieChart size={15} />, category: 'chart',
    dataMode: 'aggregate', defaultSize: { width: 6, height: 6 }, defaultConfig: () => base({}),
  },
  donut: {
    type: 'donut', label: 'Donut Chart', icon: <CircleDot size={15} />, category: 'chart',
    dataMode: 'aggregate', defaultSize: { width: 6, height: 6 }, defaultConfig: () => base({}),
  },
  combo: {
    type: 'combo', label: 'Combo Chart', icon: <TrendingUp size={15} />, category: 'chart',
    dataMode: 'aggregate', defaultSize: { width: 8, height: 6 }, defaultConfig: () => base({}),
  },
  gauge: {
    type: 'gauge', label: 'Gauge', icon: <Gauge size={15} />, category: 'chart',
    dataMode: 'aggregate', defaultSize: { width: 5, height: 5 },
    defaultConfig: () => base({ data_config: { min: 0, max: 100 }, format_config: { showHeader: true, emptyMessage: 'No data' } }),
  },
  funnel: {
    type: 'funnel', label: 'Funnel Chart', icon: <Filter size={15} />, category: 'chart',
    dataMode: 'aggregate', defaultSize: { width: 6, height: 6 }, defaultConfig: () => base({}),
  },
  scatter: {
    type: 'scatter', label: 'Scatter Chart', icon: <Activity size={15} />, category: 'chart',
    dataMode: 'aggregate', defaultSize: { width: 8, height: 6 }, defaultConfig: () => base({}),
  },
  waterfall: {
    type: 'waterfall', label: 'Waterfall', icon: <BarChart3 size={15} />, category: 'chart',
    dataMode: 'aggregate', defaultSize: { width: 8, height: 6 }, defaultConfig: () => base({}),
  },
  treemap: {
    type: 'treemap', label: 'Treemap', icon: <Boxes size={15} />, category: 'chart',
    dataMode: 'aggregate', defaultSize: { width: 8, height: 6 }, defaultConfig: () => base({}),
  },
  timeline: {
    type: 'timeline', label: 'Timeline / Date Slicer', icon: <Calendar size={15} />, category: 'filter',
    dataMode: 'none', defaultSize: { width: 24, height: 4 },
    defaultConfig: () => base({
      data_config: {
        dateSlicer: {
          filterMode: 'between', defaultRange: 'this_year', granularity: 'month',
          applyTo: 'dashboard', filterScope: 'dashboard', style: 'timeline', orientation: 'horizontal',
          showClearButton: true, showTodayButton: true, showPresetRanges: true, showYearLabels: true,
          autoApply: true,
        },
      },
      format_config: { showHeader: true, emptyMessage: 'Select a date field' },
    }),
  },
  slicer: {
    type: 'slicer', label: 'Value Slicer', icon: <ListFilter size={15} />, category: 'filter',
    dataMode: 'none', defaultSize: { width: 5, height: 8 },
    defaultConfig: () => base({
      data_config: {
        valueSlicer: {
          style: 'list', multiSelect: true, searchable: true,
          showSelectAll: true, showClearButton: true,
        },
      },
      format_config: { showHeader: true, emptyMessage: 'Bind to a global filter' },
    }),
  },
  text: {
    type: 'text', label: 'Text Box', icon: <Type size={15} />, category: 'content',
    dataMode: 'none', defaultSize: { width: 6, height: 3 },
    defaultConfig: () => base({ format_config: { content: 'Text', fontSize: 14, showHeader: false } }),
  },
  image: {
    type: 'image', label: 'Image', icon: <ImageIcon size={15} />, category: 'content',
    dataMode: 'none', defaultSize: { width: 5, height: 5 }, defaultConfig: () => base({ format_config: { imageUrl: '', showHeader: false } }),
  },
  shape: {
    type: 'shape', label: 'Shape', icon: <Square size={15} />, category: 'content',
    dataMode: 'none', defaultSize: { width: 5, height: 3 }, defaultConfig: () => base({ format_config: { shape: 'rectangle', showHeader: false } }),
  },
  button: {
    type: 'button', label: 'Button', icon: <MousePointerClick size={15} />, category: 'content',
    dataMode: 'none', defaultSize: { width: 4, height: 2 },
    defaultConfig: () => base({ format_config: { content: 'Button', showHeader: false, buttonAction: { type: 'refresh' } } }),
  },
  record_list: {
    type: 'record_list', label: 'Embedded Record List', icon: <ListOrdered size={15} />, category: 'table',
    dataMode: 'record', defaultSize: { width: 12, height: 8 }, defaultConfig: () => base({ query_config: { pageSize: 10 } }),
  },
  html: {
    type: 'html', label: 'HTML', icon: <Code2 size={15} />, category: 'content',
    dataMode: 'none', defaultSize: { width: 6, height: 4 }, defaultConfig: () => base({ format_config: { content: '<div>HTML</div>', showHeader: false } }),
  },
};

export const VISUAL_GROUPS: { category: VisualCategory; label: string; icon: ReactNode }[] = [
  { category: 'kpi', label: 'Cards', icon: <Hash size={13} /> },
  { category: 'chart', label: 'Charts', icon: <BarChart3 size={13} /> },
  { category: 'table', label: 'Tables', icon: <Table2 size={13} /> },
  { category: 'filter', label: 'Filters', icon: <Filter size={13} /> },
  { category: 'content', label: 'Content', icon: <FileText size={13} /> },
];

export function visualsByCategory(cat: VisualCategory): VisualMeta[] {
  return Object.values(VISUAL_REGISTRY).filter((v) => v.category === cat);
}
