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
  // v2 (added by 20260616090000_dashboard_v2_schema.sql) — optional for back-compat
  owner_id?: string | null;
  is_published?: boolean;
  published_at?: string | null;
  default_page_id?: string | null;
  thumbnail?: string | null;
}

export interface DashboardPage {
  page_id: string;
  dashboard_id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
  is_hidden: boolean;
  filter_config: Record<string, unknown>;
}

/** A status/condition constraint stored on a widget (e.g. Opportunity = Lost). */
export interface WidgetStatusFilter { field: string; value: string; label: string }

/** Canonical config used by the runtime engine, persisted across the v2 columns. */
export interface WidgetQueryDefinition {
  /** Curated renderer key when data_source_type='preset', e.g. 'funnel', 'kpi.leads'. */
  preset?: string;
  entity?: string;
  measure?: 'count' | 'sum' | 'avg' | 'min' | 'max';
  field?: string;
  dimension?: string;
  status?: WidgetStatusFilter;
  /** Section/group header this widget renders under (null/absent = top KPI row). */
  section?: string;
}

export interface WidgetVisualConfig {
  chartType?: 'donut' | 'bars' | 'line' | 'kpi';
  title?: string;
  subtitle?: string;
  icon?: string;
  centerLabel?: string;
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
  // v2 columns (optional for back-compat with rows created before the migration)
  dashboard_page_id?: string | null;
  subtitle?: string | null;
  data_source_type?: 'entity' | 'preset' | 'sql' | 'aggregate';
  entity_name?: string | null;
  query_definition?: WidgetQueryDefinition;
  sql_query_id?: string | null;
  visual_config?: WidgetVisualConfig;
  filter_config?: Record<string, unknown>;
  interaction_config?: Record<string, unknown>;
  layout_config?: Record<string, unknown>;
  refresh_interval?: number | null;
  is_visible?: boolean;
}

export type DashboardWidgetInput = Omit<DashboardWidget, 'widget_id'>;

export type DashboardInput = Omit<
  Dashboard,
  'dashboard_id' | 'created_at' | 'modified_at' | 'deleted_at' | 'created_by'
>;
