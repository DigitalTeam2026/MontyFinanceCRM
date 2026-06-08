export type DashboardModule = 'sales' | 'marketing' | 'support' | 'all';
export type WidgetType = 'kpi' | 'chart' | 'table' | 'activity';
export type ChartType = 'bar' | 'line' | 'pie' | 'donut';

export interface Dashboard {
  dashboard_id: string;
  name: string;
  description: string | null;
  module: DashboardModule;
  is_system: boolean;
  is_deletable: boolean;
  is_default: boolean;
  is_active: boolean;
  layout_json: LayoutJson;
  created_by: string | null;
  created_at: string;
  modified_at: string;
  deleted_at: string | null;
}

export interface LayoutJson {
  columns?: number;
  row_height?: number;
}

export interface KpiConfig {
  entity: string;
  aggregation: string;
  field?: string;
  filter?: Record<string, unknown>;
  icon?: string;
  color?: string;
}

export interface ChartConfig {
  entity: string;
  chart_type: ChartType;
  group_by: string;
  field?: string;
  fields?: string[];
  metric?: string;
  title?: string;
  filter?: Record<string, unknown>;
}

export interface TableConfig {
  entity: string;
  columns: string[];
  limit?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  filter?: Record<string, unknown>;
}

export type WidgetConfig = KpiConfig | ChartConfig | TableConfig | Record<string, unknown>;

export interface DashboardWidget {
  widget_id: string;
  dashboard_id: string;
  widget_type: WidgetType;
  title: string;
  config_json: WidgetConfig;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  sort_order: number;
}

export type DashboardWidgetInput = Omit<DashboardWidget, 'widget_id'>;

export type DashboardInput = Omit<
  Dashboard,
  'dashboard_id' | 'created_at' | 'modified_at' | 'deleted_at' | 'created_by'
>;
