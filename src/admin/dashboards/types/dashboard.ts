// Shared dashboard-definition types — used by the designer (Admin Studio) and
// the runtime viewer (CRM). The three layers are decoupled: this file is the
// definition layer's contract; queryEngine consumes QueryConfig; the visual
// registry consumes VisualType + the *_config blobs.

export type DashboardType = 'system' | 'personal' | 'team' | 'role' | 'business_unit';
export type DashboardStatus = 'draft' | 'published';
export type RefreshInterval = 'manual' | '1m' | '5m' | '15m' | '30m' | '1h' | 'disabled';

export type DefaultDateRange =
  | 'today' | 'yesterday' | 'this_week' | 'last_7_days' | 'this_month' | 'last_month'
  | 'this_quarter' | 'this_year' | 'last_12_months' | 'custom' | 'all_time';

export interface Dashboard {
  dashboard_id: string;
  name: string;
  description: string;
  dashboard_type: DashboardType;
  primary_entity_id: string | null;
  default_date_field_id: string | null;
  default_date_range: DefaultDateRange;
  theme_id: string | null;
  refresh_interval: RefreshInterval;
  owner_id: string | null;
  business_unit_id: string | null;
  status: DashboardStatus;
  /** When true, this is the org-wide default surfaced on every user's Sales Dashboard. */
  is_default: boolean;
  published_version_id: string | null;
  created_by: string | null;
  modified_by: string | null;
  created_at: string;
  modified_at: string;
  deleted_at: string | null;
}

export interface DashboardPage {
  dashboard_page_id: string;
  dashboard_id: string;
  name: string;
  display_name: string;
  page_order: number;
  icon: string | null;
  is_default: boolean;
  is_hidden: boolean;
  background_config: BackgroundConfig;
  canvas_config: CanvasConfig;
}

export interface BackgroundConfig {
  color?: string;
  image?: string;
}

export interface CanvasConfig {
  /** Grid columns (12 or 24). */
  columns?: number;
  /** Row height in px for one grid unit. */
  rowHeight?: number;
  gap?: number;
  width?: number;  // logical canvas width in px (desktop)
}

// ── Visual types (mapped to renderers by the visual registry) ────────────────
export type VisualType =
  | 'kpi' | 'funnel_stage'
  | 'table' | 'matrix'
  | 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'combo'
  | 'gauge' | 'funnel' | 'scatter' | 'waterfall' | 'treemap'
  | 'timeline' | 'slicer'
  | 'text' | 'image' | 'shape' | 'button'
  | 'record_list' | 'html';

export interface DashboardVisual {
  dashboard_visual_id: string;
  dashboard_page_id: string;
  dashboard_id: string;
  visual_type: VisualType;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  min_width: number;
  min_height: number;
  z_index: number;
  is_visible: boolean;
  is_locked: boolean;
  query_config: QueryConfig;
  data_config: DataConfig;
  format_config: FormatConfig;
  interaction_config: InteractionConfig;
  filter_config: { filters?: VisualFilter[]; logic?: 'and' | 'or' };
}

// ── Query engine config (validated frontend + backend) ───────────────────────
export type AggFn = 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max';
export type DateGrain = 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour';

export interface GroupBySpec { field: string; dateGrain?: DateGrain | null; alias?: string }
export interface AggSpec { field: string; fn: AggFn; alias: string }
export interface OrderBySpec { key: string; dir: 'asc' | 'desc' }

export type FilterOp =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'on' | 'before' | 'after' | 'between'
  | 'contains' | 'not_contains' | 'starts_with' | 'ends_with'
  | 'is_empty' | 'is_not_empty' | 'in' | 'not_in';

export interface VisualFilter {
  field: string;
  op: FilterOp;
  value?: unknown;
  value2?: unknown;
}

export interface QueryConfig {
  entity?: string;             // logical or physical entity name
  groupBy?: GroupBySpec[];
  aggregations?: AggSpec[];
  filters?: VisualFilter[];
  filterLogic?: 'and' | 'or';
  orderBy?: OrderBySpec[];
  limit?: number;
  topN?: number;
  includeDeleted?: boolean;
  // record-query mode (table/matrix/record_list)
  columns?: string[];
  page?: number;
  pageSize?: number;
}

// ── Data wells (how dragged fields map into the query) ───────────────────────
export interface DataConfig {
  // Visual-specific bindings; filled by the properties panel.
  category?: string;        // primary dimension
  legend?: string;          // secondary dimension
  values?: AggSpec[];       // measures
  target?: number | string;
  min?: number;
  max?: number;
  // KPI specifics
  valueField?: string;
  valueAgg?: AggFn;
  // matrix
  rowGroups?: string[];
  colGroups?: string[];
  // funnel-stage card
  stages?: { label: string; field?: string; agg?: AggFn; value?: number }[];
  [k: string]: unknown;
}

// ── Formatting ───────────────────────────────────────────────────────────────
export type NumberFormat = 'number' | 'percentage' | 'currency' | 'compact';

export interface ConditionalRule {
  op: FilterOp | 'increase' | 'decrease';
  value?: number | string;
  value2?: number | string;
  backgroundColor?: string;
  textColor?: string;
  icon?: string;
  badge?: string;
  borderColor?: string;
  dataBar?: boolean;
}

export interface FormatConfig {
  showHeader?: boolean;
  subtitle?: string;
  description?: string;
  tooltip?: string;
  background?: string;
  border?: string;
  borderRadius?: number;
  shadow?: string;
  padding?: number;
  opacity?: number;
  accentColor?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  textColor?: string;
  // chart
  showLegend?: boolean;
  showDataLabels?: boolean;
  showGridLines?: boolean;
  axisTitleX?: string;
  axisTitleY?: string;
  stacked?: boolean;
  stackMode?: 'normal' | 'percent';
  orientation?: 'vertical' | 'horizontal';
  // number
  numberFormat?: NumberFormat;
  decimals?: number;
  thousands?: boolean;
  prefix?: string;
  suffix?: string;
  // empty state
  emptyMessage?: string;
  // gauge bands
  thresholds?: { value: number; color: string }[];
  startAngle?: number;
  endAngle?: number;
  // kpi extras
  icon?: string;
  // text / html / image / shape / button
  content?: string;
  imageUrl?: string;
  shape?: 'rectangle' | 'rounded' | 'line' | 'arrow' | 'divider';
  buttonAction?: ButtonAction;
  // conditional formatting
  conditional?: ConditionalRule[];
  [k: string]: unknown;
}

export interface ButtonAction {
  type: 'navigate_page' | 'open_record' | 'open_url' | 'apply_filter' | 'clear_filters'
      | 'refresh' | 'export' | 'create_record';
  target?: string;          // page id / url / entity
  payload?: Record<string, unknown>;
  label?: string;
}

// ── Interactions ─────────────────────────────────────────────────────────────
export type InteractionMode = 'filter' | 'highlight' | 'navigate' | 'drillthrough' | 'none';
export interface InteractionConfig {
  /** Per target-visual interaction when this visual is the source. */
  targets?: Record<string, InteractionMode>;
  drillThrough?: {
    type: 'page' | 'entity_list' | 'record';
    target?: string;
  };
  drillDownHierarchy?: string[]; // ordered field names
  crossFilterField?: string;     // field this visual emits when clicked
}

// ── Filters / measures / themes / permissions ────────────────────────────────
export type FilterLevel = 'global' | 'page' | 'visual' | 'drillthrough';

export interface DashboardFilter {
  dashboard_filter_id: string;
  dashboard_id: string;
  dashboard_page_id: string | null;
  dashboard_visual_id: string | null;
  filter_level: FilterLevel;
  entity_id: string | null;
  field_id: string | null;
  operator: FilterOp;
  value_config: { value?: unknown; value2?: unknown; field?: string };
  filter_group: number;
  logical_operator: 'and' | 'or';
}

export interface MeasureNode {
  kind: 'op' | 'fn' | 'field' | 'measure' | 'literal';
  op?: '+' | '-' | '*' | '/' | '%';
  fn?: AggFn;
  field?: string;
  ref?: string;        // measure name
  value?: number;
  left?: MeasureNode;
  right?: MeasureNode;
  arg?: MeasureNode;
}

export interface DashboardMeasure {
  dashboard_measure_id: string;
  dashboard_id: string;
  name: string;
  display_name: string;
  data_type: 'number' | 'percentage' | 'currency';
  expression_config: { ast: MeasureNode | null };
  format_config: FormatConfig;
}

export interface DashboardTheme {
  theme_id: string;
  name: string;
  is_system: boolean;
  theme_config: ThemeConfig;
}

export interface ThemeConfig {
  pageBackground: string;
  surfaceBackground: string;
  cardBackground: string;
  primaryText: string;
  secondaryText: string;
  borderColor: string;
  gridLineColor: string;
  primaryAccent: string;
  secondaryAccent: string;
  success: string;
  warning: string;
  error: string;
  chartPalette: string[];
  fontFamily: string;
  borderRadius: number;
  shadow: string;
}

export interface DashboardPermission {
  dashboard_permission_id: string;
  dashboard_id: string;
  principal_type: 'user' | 'team' | 'role' | 'business_unit';
  principal_id: string;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
  can_publish: boolean;
  can_share: boolean;
  can_export: boolean;
}

// Full definition (used for export/import + version snapshots + runtime).
export interface DashboardDefinition {
  dashboard: Dashboard;
  pages: DashboardPage[];
  visuals: DashboardVisual[];
  filters: DashboardFilter[];
  measures: DashboardMeasure[];
}

export interface DashboardListRow extends Dashboard {
  primary_entity_name?: string | null;
  owner_name?: string | null;
}

export const DEFAULT_DATE_RANGES: { value: DefaultDateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_12_months', label: 'Last 12 Months' },
  { value: 'custom', label: 'Custom' },
  { value: 'all_time', label: 'All Time' },
];

export const DASHBOARD_TYPES: { value: DashboardType; label: string }[] = [
  { value: 'system', label: 'System Dashboard' },
  { value: 'personal', label: 'Personal Dashboard' },
  { value: 'team', label: 'Team Dashboard' },
  { value: 'role', label: 'Role Dashboard' },
  { value: 'business_unit', label: 'Business Unit Dashboard' },
];

export const REFRESH_INTERVALS: { value: RefreshInterval; label: string }[] = [
  { value: 'manual', label: 'Manual refresh' },
  { value: '1m', label: 'Every 1 minute' },
  { value: '5m', label: 'Every 5 minutes' },
  { value: '15m', label: 'Every 15 minutes' },
  { value: '30m', label: 'Every 30 minutes' },
  { value: '1h', label: 'Every hour' },
  { value: 'disabled', label: 'Disabled' },
];
