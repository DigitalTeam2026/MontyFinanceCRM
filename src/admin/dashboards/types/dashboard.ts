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
  /**
   * Direction newly-added cards flow on the canvas. 'left-to-right' (default)
   * anchors new cards to the left edge; 'right-to-left' anchors them to the
   * right edge. Affects PLACEMENT of new cards (their x), not just text align.
   */
  dashboardLayoutDirection?: DashboardLayoutDirection;
  /**
   * How the canvas height is determined.
   *   • 'auto' (default) — the canvas grows to fit the lowest card (plus drag
   *     padding in the designer) so the page scrolls vertically without limit.
   *   • 'fixed' — the canvas is exactly `canvasHeight` px tall; it still scrolls
   *     when that exceeds the viewport.
   * In neither mode are users forced to create a second page — one page is an
   * unbounded vertical canvas.
   */
  heightMode?: CanvasHeightMode;
  /** Fixed canvas height in px (only used when heightMode === 'fixed'). */
  canvasHeight?: number;
}

export type CanvasHeightMode = 'auto' | 'fixed';

export type DashboardLayoutDirection = 'left-to-right' | 'right-to-left';

// ── Visual types (mapped to renderers by the visual registry) ────────────────
export type VisualType =
  | 'kpi' | 'funnel_stage' | 'donut_progress'
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

/**
 * A filter that reaches the queried entity through a relationship chain — used by
 * cross-entity cross-filtering (e.g. filter a Lead visual by Account.industry_id
 * via the lead→account lookup). `path` is the ordered list of foreign-key columns
 * to traverse from the base entity; an empty path means the field lives directly
 * on the base entity (equivalent to a plain VisualFilter). The backend applies
 * each as an EXISTS subquery and resolves every identifier against entity/field
 * metadata, so RLS on each joined table still governs visibility.
 */
export interface RelatedFilter {
  /** Foreign-key columns to traverse, base-entity first (e.g. ['lead_id','account_id']). */
  path: { fk: string; entity: string }[];
  /** Physical column on the terminal entity to compare. */
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
  /** Cross-entity filters reached through relationship chains (cross-filtering). */
  relatedFilters?: RelatedFilter[];
  /** Global semantic filters resolved through a relationship path (server-side). */
  semanticFilters?: SemanticQueryFilter[];
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
  // KPI "Total + Breakdown" card
  kpiMode?: 'simple' | 'breakdown';
  mainAgg?: AggFn;                 // measure for the big total (default 'count')
  mainField?: string;             // field for sum/avg/min/max (ignored for count)
  totalLabel?: string;            // caption under/above the big number
  breakdownField?: string;        // physical column to segment by (status/status_reason/…)
  breakdownLimit?: number;        // max breakdown rows
  breakdownSort?: 'value_desc' | 'value_asc' | 'label';
  breakdownValues?: string[];     // optional whitelist of raw values to show
  showPercentages?: boolean;
  showZeroValues?: boolean;
  /**
   * Include records whose breakdown value is empty/unassigned (the "—" group) and
   * broken-reference rows — both in the breakdown rows AND the headline total.
   * Default false: a lookup/group card's total counts only records that have a
   * real related value, so it is NOT just the base entity count.
   */
  showEmptyValues?: boolean;
  kpiLayout?: 'compact' | 'detailed';
  // custom filtered rows (e.g. "Converted to Lead" = status_reason eq X)
  // `id` is a stable key (independent of label) used to bind a custom breakdown
  // colour in format_config.colorByValue.
  customBreakdownItems?: { id?: string; label: string; filters: VisualFilter[] }[];
  // matrix
  rowGroups?: string[];
  colGroups?: string[];
  // table — per-column configuration (display label, width, format, filters, …).
  // The query still uses each column's physical `field`; only what the user SEES
  // is governed here (see TableColumnConfig). When absent the table falls back to
  // query_config.columns (legacy) with metadata display names as headers.
  tableColumns?: TableColumnConfig[];
  // funnel-stage card — each stage is an independent KPI that may target a
  // DIFFERENT entity/measure (see FunnelStage). Conversion between adjacent
  // stages is computed at render time.
  stages?: FunnelStage[];
  // timeline / date slicer (see DateSlicerConfig)
  dateSlicer?: DateSlicerConfig;
  // value (lookup / choice) slicer (see ValueSlicerConfig)
  valueSlicer?: ValueSlicerConfig;
  // donut progress gauge (see DonutProgressConfig)
  donutProgress?: DonutProgressConfig;
  [k: string]: unknown;
}

// ── Donut Progress Gauge ─────────────────────────────────────────────────────
// A circular percentage KPI: a primary arc fills to `percent` of 100, a large
// value sits in the centre. Three calculation modes cover the common cases
// (count ratio, sum-vs-target, an already-percentage field). The arc is always
// clamped to 0–100 for display, but the REAL value is preserved for the tooltip
// (e.g. "124% achieved"). All modes honour the visual's base + runtime filters,
// so an empty filtered result yields 0% — never a fall-back to all data.
export type DonutCalcMode = 'count_percentage' | 'sum_percentage' | 'field_percentage';
export type DonutCenterLabelMode = 'percentage' | 'value' | 'percentage_with_label';

export interface DonutProgressConfig {
  /** How the percentage is computed. Default 'count_percentage'. */
  calcMode?: DonutCalcMode;

  // ── Mode 1: count percentage (numerator records / denominator records × 100) ──
  /** Numerator = records matching these filters AND the base filters. */
  numeratorFilters?: VisualFilter[];
  numeratorFilterLogic?: 'and' | 'or';

  // ── Mode 2: sum percentage (aggregate(field) / targetValue × 100) ──
  /** Field aggregated for the numerator (sum/avg/min/max). */
  numeratorField?: string;
  /** Aggregation used for the numerator. Default 'sum'. */
  numeratorAgg?: AggFn;
  /** Manual constant denominator (the target). */
  targetValue?: number;

  // ── Mode 3: field value percentage (a field already holding a percentage) ──
  /** Physical column whose aggregated value IS the percentage. */
  valueField?: string;
  /** Aggregation applied to the value field. Default 'avg'. */
  valueFieldAgg?: AggFn;

  // ── Centre label ──
  centerLabelMode?: DonutCenterLabelMode;
  /** Caption appended in 'percentage_with_label' mode (e.g. "Complete", "Total"). */
  centerLabelText?: string;
  /** Override the legend's primary/secondary row labels. */
  completedLabel?: string;
  remainingLabel?: string;
}

// ── Funnel-stage card ────────────────────────────────────────────────────────
// A horizontal/vertical chain of KPI cards. Unlike a chart series, every stage
// is queried independently and MAY use a different entity (e.g. Campaign budget
// → Lead count → Opportunity count → Invoice revenue). Conversion between two
// adjacent stages = next.value / current.value * 100.
export type StageMeasure = 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max' | 'custom';
export type StageInteraction = 'filter' | 'drillthrough' | 'none';
/** How a single funnel stage presents its measure (mirrors the KPI card). */
export type StageDisplayMode = 'simple' | 'breakdown' | 'breakdown_only';
/** Per-stage layout density for the breakdown body. */
export type StageLayout = 'compact' | 'detailed' | 'auto';

/**
 * Maps a global/slicer field onto THIS stage's own column so dashboard-wide
 * filters (e.g. a date slicer bound to crm_lead.created_at) reach a stage that
 * lives on a different entity (e.g. crm_campaign.created_on). `source` is the
 * incoming filter's field; `target` is the physical column on the stage entity.
 */
export interface StageSemanticMap {
  source: string;
  target: string;
}

export interface FunnelStage {
  id: string;
  label: string;
  /** Logical entity for this stage — independent of every other stage. */
  entity?: string;
  measure?: StageMeasure;
  /** Physical column the measure aggregates (required for sum/avg/min/max). */
  field?: string;
  /** Per-stage value format override (e.g. currency for Budget, number for Leads). */
  numberFormat?: NumberFormat;
  prefix?: string;
  suffix?: string;
  /** Dashboard measure name when measure === 'custom'. */
  customMeasure?: string;
  /** Stage-local filters (always applied). */
  filters?: VisualFilter[];
  filterLogic?: 'and' | 'or';
  /** Global→stage filter remaps so dashboard filters reach a differing entity. */
  semanticMap?: StageSemanticMap[];
  /** Optional relationship chain to reach the measured entity (forward-compat). */
  relationshipPath?: { fk: string; entity: string }[];
  sort?: 'asc' | 'desc' | 'none';
  /** Per-stage accent colour (top border + arrow tint). Falls back to theme. */
  color?: string;
  /** Optional lucide icon name (e.g. 'Wallet'). */
  icon?: string;
  subtitle?: string;
  interaction?: StageInteraction;
  drillThrough?: { type: 'entity_list' | 'record' | 'page'; target?: string };
  /** Design-time / fallback value used when no entity is configured. */
  value?: number;

  // ── Total + Breakdown (mirrors the KPI card) ────────────────────────────────
  /** Presentation mode — defaults to 'simple' (total only). */
  displayMode?: StageDisplayMode;
  /** Caption under the big total (e.g. "Total Prospects"). */
  totalLabel?: string;
  /** Physical column to segment the total by (status / status_reason / owner …). */
  breakdownField?: string;
  /** Max breakdown rows returned. */
  breakdownLimit?: number;
  breakdownSort?: 'value_desc' | 'value_asc' | 'label';
  /** Optional whitelist of resolved labels to show. */
  breakdownValues?: string[];
  showPercentages?: boolean;
  showProgressBars?: boolean;
  showZeroValues?: boolean;
  /** Include the empty/unassigned + orphan rows and count them in the total (default false). */
  showEmptyValues?: boolean;
  /** Custom filtered breakdown rows (e.g. "Converted to Lead" = status_reason eq X). */
  customBreakdownItems?: { id?: string; label: string; filters: VisualFilter[] }[];
  /** Per-breakdown-value colours, keyed by the STABLE raw value (survives relabelling). */
  colorByValue?: Record<string, string>;
  /** Click a breakdown row to cross-filter the dashboard (default true). */
  enableClickFilter?: boolean;
  /** Ctrl/Cmd-click selects multiple values (default true). */
  enableMultiSelect?: boolean;
  /** Body density for the breakdown rows. */
  stageLayout?: StageLayout;
}

// ── Timeline / Date slicer ───────────────────────────────────────────────────
// The timeline visual is NOT a chart: it binds directly to a date/datetime field
// and broadcasts a date-range filter to the other visuals. None of the chart
// wells (category/legend/measure) apply.
export type DateFilterMode =
  | 'between' | 'before' | 'after' | 'on'
  | 'relative_date' | 'relative_period' | 'timeline';

export type SlicerDateRange =
  | 'all_time' | 'today' | 'yesterday' | 'this_week' | 'last_week'
  | 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month'
  | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year' | 'custom';

export type SlicerStyle = 'date_inputs' | 'range_slider' | 'timeline' | 'dropdown_preset' | 'button_presets';
export type ApplyFilterTo = 'dashboard' | 'page' | 'selected';
export type SlicerOrientation = 'horizontal' | 'vertical';
export type SlicerHandleStyle = 'circle' | 'square' | 'bar';
export type TimeZoneHandling = 'local' | 'utc';

export interface DateSlicerConfig {
  // ── Data ──────────────────────────────────────────────────────────────────
  /**
   * When set, the slicer is a GLOBAL filter: it drives a dashboard semantic
   * filter (see DashboardSemanticFilter) which maps to every compatible entity.
   * `dateField`/`entity` below then act only as the slider's bounds source.
   * When unset, the slicer keeps its legacy single-entity behaviour.
   */
  semanticFilterId?: string;
  /** Physical date/datetime column on the slicer's entity (query_config.entity). */
  dateField?: string;
  /** Is the bound field a DateTime (true) or a Date (false)? Drives Show time. */
  dateFieldIsDateTime?: boolean;
  filterMode?: DateFilterMode;
  defaultRange?: SlicerDateRange;
  granularity?: DateGrain;            // year | quarter | month | week | day
  applyTo?: ApplyFilterTo;
  includeEmptyDates?: boolean;
  showTime?: boolean;                 // only meaningful for DateTime fields
  startDate?: string;                 // custom range bounds (ISO date)
  endDate?: string;
  // ── Format ────────────────────────────────────────────────────────────────
  style?: SlicerStyle;
  orientation?: SlicerOrientation;
  showStartInput?: boolean;
  showEndInput?: boolean;
  showClearButton?: boolean;
  showTodayButton?: boolean;
  showPresetRanges?: boolean;
  showYearLabels?: boolean;
  showMonthLabels?: boolean;
  showQuarterLabels?: boolean;
  selectedRangeColor?: string;
  trackColor?: string;
  handleColor?: string;          // slider thumb colour
  dateLabelColor?: string;       // tick / date labels
  presetButtonColor?: string;    // preset chip background
  presetButtonTextColor?: string;
  activePresetColor?: string;    // selected preset chip background
  activePresetTextColor?: string;
  handleStyle?: SlicerHandleStyle;
  compact?: boolean;
  // ── Advanced ──────────────────────────────────────────────────────────────
  /** Mirror of applyTo, kept for the Advanced "Filter scope" control. */
  filterScope?: ApplyFilterTo;
  connectedVisuals?: string[];        // target visual ids when scope = 'selected'
  syncAcrossPages?: boolean;
  persistSelection?: boolean;
  useDashboardDefaultField?: boolean;
  requireSelection?: boolean;
  autoApply?: boolean;                // default true; false = apply only on button
  debounceMs?: number;
  timeZoneHandling?: TimeZoneHandling;
}

// ── Value (lookup / choice) slicer ───────────────────────────────────────────
// A slicer that drives a NON-date semantic filter (e.g. Industry). It renders the
// distinct values ACTUALLY referenced by accessible records across every mapped
// dashboard entity (never the whole master table), and broadcasts an `in`
// selection that each visual translates to its own field / relationship path.
export type ValueSlicerStyle = 'list' | 'dropdown' | 'chips' | 'buttons';

export interface ValueSlicerConfig {
  /** The dashboard semantic filter this slicer drives (data_type lookup/choice/text). */
  semanticFilterId?: string;
  style?: ValueSlicerStyle;
  multiSelect?: boolean;             // default true
  searchable?: boolean;              // show a search box (list/dropdown)
  showCounts?: boolean;              // show per-value record counts
  showSelectAll?: boolean;
  showClearButton?: boolean;
  /** When true, include records whose value is NULL as an "(empty)" option. */
  includeEmpty?: boolean;
  orientation?: SlicerOrientation;
  defaultValues?: string[];          // pre-selected ids
  selectedColor?: string;
  textColor?: string;
}

// ── Global semantic filters ──────────────────────────────────────────────────
// One logical filter defined per dashboard (e.g. business_date, country) that
// maps to MANY entities — directly to a field, or through a relationship path of
// lookup fields. A slicer drives a semantic filter; each visual translates the
// selected value into its own entity's query (direct field → VisualFilter; path
// → a SemanticQueryFilter resolved server-side). Mirrors the DB tables added in
// 20260617150000_dashboard_semantic_filters.sql.

export type SemanticDataType = 'date' | 'choice' | 'lookup' | 'text' | 'number' | 'boolean';
export type SemanticScope = 'dashboard' | 'page' | 'selected';
export type MappingJoinMode = 'auto' | 'inner' | 'left' | 'exists';
export type MappingNullBehavior = 'exclude' | 'include';
export type BindingBehavior = 'direct' | 'related' | 'dashboard' | 'page' | 'selected' | 'ignore';

/** One hop of a relationship path, stored as a lookup field id + direction. */
export interface RelationshipStep {
  /** field_definition_id of a lookup field. */
  lookupFieldId: string;
  direction: 'forward' | 'reverse';
  joinType?: 'auto' | 'inner' | 'left';
}

/** A relationship path from a base entity to the field that holds the filter value. */
export interface RelationshipPath {
  sourceEntityId: string;           // base entity the path starts from
  steps: RelationshipStep[];        // [] = direct (field on the base entity)
  targetFieldId: string;            // field_definition_id of the leaf field
}

/**
 * Status of a dashboard entity's relationship to a semantic filter's target.
 * Surfaced in the designer so an admin sees, at a glance, how (or whether) each
 * visual's entity is reachable. Derived from discovery + the saved mapping.
 *   • direct        — entity has the target field itself (no hops)
 *   • auto_mapped   — a relationship path was discovered automatically
 *   • manual        — an administrator overrode / hand-picked the mapping
 *   • ambiguous     — several equally-good paths exist; needs a human choice
 *   • no_relationship — no path to the target within the depth limit
 *   • invalid       — a saved mapping references metadata that no longer resolves
 *   • unauthorized  — the user cannot read an entity along the path
 */
export type MappingStatus =
  | 'direct' | 'auto_mapped' | 'manual' | 'ambiguous'
  | 'no_relationship' | 'invalid' | 'unauthorized';

/**
 * One discovered relationship path from a base entity to a target entity, with
 * the deterministic score used to rank it (lower hops, forward lookups, required
 * relationships and already-configured mappings score higher). `steps` empty ⇒ a
 * DIRECT field on the base entity.
 */
export interface PathCandidate {
  steps: RelationshipStep[];
  targetFieldId: string;            // leaf lookup field (points at the target entity)
  leafEntityId: string;             // entity that holds the leaf field
  hops: number;                     // steps.length (0 = direct)
  hasReverse: boolean;              // path includes a reverse (child→parent) hop
  score: number;                    // higher is better (deterministic)
}

export interface PathDiscoveryResult {
  candidates: PathCandidate[];      // ranked best-first
  best: PathCandidate | null;       // candidates[0] or null
  ambiguous: boolean;               // ≥2 candidates share the top score
}

/**
 * Per-semantic-filter discovery settings, persisted inside
 * DashboardSemanticFilter.config. `origin`/`candidates` are keyed by
 * entity_definition_id so the designer can show status and offer ambiguity
 * resolution / overrides without re-scanning.
 */
export interface SemanticDiscoveryConfig {
  /** 'automatic' = paths are discovered from metadata; 'manual' = admin-curated. */
  mode?: 'automatic' | 'manual';
  /** Max relationship hops to search (1–5, default 3). */
  maxDepth?: number;
  /** entity_definition_id → how its mapping was produced. */
  origin?: Record<string, 'auto' | 'manual'>;
  /** entity_definition_id → discovered candidate paths (for ambiguity review). */
  candidates?: Record<string, PathCandidate[]>;
  /** entity_definition_ids that produced no path on the last scan. */
  unmapped?: string[];
}

export interface DashboardSemanticFilter {
  dashboard_semantic_filter_id: string;
  dashboard_id: string;
  key: string;                      // stable machine key (e.g. business_date)
  label: string;                    // display label (e.g. Date)
  data_type: SemanticDataType;
  scope: SemanticScope;
  default_value: Record<string, unknown>;
  config: Record<string, unknown>;
}

export interface DashboardFilterMapping {
  dashboard_filter_mapping_id: string;
  dashboard_id: string;
  semantic_filter_id: string;
  target_entity_id: string | null;  // entity_definition_id
  target_field_id: string | null;   // field_definition_id (direct leaf)
  relationship_path: RelationshipPath | Record<string, never>;  // {} = direct
  join_mode: MappingJoinMode;
  null_behavior: MappingNullBehavior;
  priority: number;
  is_active: boolean;
}

export interface DashboardVisualFilterBinding {
  dashboard_visual_filter_binding_id: string;
  dashboard_id: string;
  visual_id: string;
  semantic_filter_id: string;
  behavior: BindingBehavior;
  relationship_path_override: RelationshipPath | Record<string, never>;
  is_enabled: boolean;
}

/**
 * A per-visual resolved semantic filter sent to the query engine. PATH entries
 * carry metadata ids only (resolved server-side into nested EXISTS); the leaf
 * `filters` hold the entity-agnostic conditions (e.g. gte/lte for a date range).
 * Direct mappings never become SemanticQueryFilters — they become plain filters.
 */
export interface SemanticQueryFilter {
  path: { steps: RelationshipStep[]; targetFieldId: string };
  filters: VisualFilter[];
  joinMode?: MappingJoinMode;
  nullBehavior?: MappingNullBehavior;
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

// ── Table column configuration (per-selected-column settings) ─────────────────
// One entry per column the table shows. The custom `displayLabel` changes ONLY
// the rendered header — the query, filters and relationship mapping always use
// the physical `field` (and `fieldId` metadata id). Lookup columns are rendered
// as the related record's display name (never the raw GUID) by the label
// resolver. Persisted inside data_config.tableColumns, so it survives save,
// publish, duplicate and export/import for free.
export type ColumnAlignment = 'left' | 'center' | 'right';
export type ColumnTextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';
export type ColumnDateFormat = 'short' | 'medium' | 'long' | 'iso' | 'relative';

export interface TableColumnFormat {
  /** Text transform for text columns. */
  text?: ColumnTextTransform;
  /** Number / currency / percentage formatting (overrides the visual default). */
  number?: NumberFormat;
  decimals?: number;
  thousands?: boolean;
  prefix?: string;
  suffix?: string;
  /** ISO 4217 code for currency columns (e.g. USD, AED). */
  currencyCode?: string;
  /** Date rendering for date / datetime columns. */
  dateFormat?: ColumnDateFormat;
  /** Custom Yes/No labels for boolean columns. */
  booleanTrue?: string;
  booleanFalse?: string;
  /** Text rendered for empty / null cells (default '—'). */
  emptyText?: string;
}

export interface TableColumnConfig {
  /** Stable id (independent of field/label) — keys reorder, edit, colour, etc. */
  id: string;
  /** field_definition_id of the source field (metadata id — §7). */
  fieldId?: string;
  /** entity_definition_id of the source entity the field belongs to. */
  sourceEntityId?: string;
  /** Physical column used by the query, sort and filter (NEVER renamed). */
  field: string;
  /** Custom header label. Falls back to the field's metadata display name. */
  displayLabel?: string;
  /** Tooltip shown on header hover. */
  description?: string;
  /** Normalized field type (text | number | currency | date | boolean | lookup | choice | …). */
  dataType?: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  alignment?: ColumnAlignment;
  /** Freeze the column to the left edge. */
  pinned?: 'left' | null;
  visible?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  reorderable?: boolean;
  searchable?: boolean;
  format?: TableColumnFormat;
  /** Per-cell conditional formatting (reuses the shared ConditionalRule shape). */
  conditional?: ConditionalRule[];
  /**
   * Relationship path to a related-entity field (e.g. Lead → Product → Name).
   * Empty / absent = the field lives directly on the base entity. Direct lookup
   * columns already resolve to the related record's NAME via the label resolver,
   * so most "related display" needs are met without a path.
   */
  relationshipPath?: RelationshipStep[];
  /** When true, label the column with the related entity's name instead of the field's. */
  useRelatedLabel?: boolean;
}

// ── Visual layout / alignment ────────────────────────────────────────────────
// Applies to every card-style visual (KPI, funnel, lookup/group, charts, donut
// progress, progress). Never hard-code a position — read these instead and fall
// back to the documented defaults.
export type ContentAlign = 'left' | 'center' | 'right';
export type ChartPosition = 'left' | 'center' | 'right';
export type LegendPosition = 'left' | 'right' | 'top' | 'bottom' | 'none';
export type ValuePosition = 'center' | 'left' | 'right';

export interface FormatConfig {
  showHeader?: boolean;
  subtitle?: string;
  // ── Layout & alignment (see ContentAlign / ChartPosition / LegendPosition) ──
  /** Title + text content alignment within the card. Default 'left'. */
  cardContentAlign?: ContentAlign;
  /** Where the chart / donut sits horizontally. Default 'center'. */
  chartPosition?: ChartPosition;
  /** Legend placement (or 'none' to hide). Default per visual. */
  legendPosition?: LegendPosition;
  /** Main value alignment (donut centre / KPI total). Default 'center'. */
  valuePosition?: ValuePosition;
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
  // funnel-stage card (layout + chrome; colours below reuse accentColor/valueColor/etc.)
  funnelLayout?: 'horizontal' | 'vertical';
  stageCardWidth?: number;       // px (min width per card)
  stageCardHeight?: number;      // px (min height per card)
  stageGap?: number;             // px gap between cards
  arrowColor?: string;           // connector arrow tint
  arrowSize?: number;            // connector arrow size in px
  showArrows?: boolean;          // default true
  showConversion?: boolean;      // show conversion % on the connector
  conversionDecimals?: number;   // decimals for the conversion %
  showStageSubtitle?: boolean;   // render each stage's subtitle line
  compactStages?: boolean;       // denser padding / smaller value text
  wrapStages?: boolean;          // allow cards to wrap to the next row
  scrollStages?: boolean;        // horizontal scroll when cards exceed width (default true)
  // text / html / image / shape / button
  content?: string;
  imageUrl?: string;
  shape?: 'rectangle' | 'rounded' | 'line' | 'arrow' | 'divider';
  buttonAction?: ButtonAction;
  // conditional formatting
  conditional?: ConditionalRule[];

  // ── Colour customization ───────────────────────────────────────────────────
  // Every field below is OPTIONAL. When unset, the visual falls back to the
  // active dashboard theme. Colours accept hex (#rrggbb), rgb()/rgba() or the
  // literal 'transparent'. Per-value colours live in `colorByValue`, keyed by a
  // STABLE id (KPI: the raw option/status value; charts: the category label) so
  // a colour survives re-sorting and count changes.
  // General (all visuals)
  borderColor?: string;          // card border colour (distinct from the legacy `border` shorthand)
  borderWidth?: number;          // card border width in px
  titleColor?: string;           // header / title text
  subtitleColor?: string;        // subtitle text
  valueColor?: string;           // main value (KPI total, gauge centre)
  secondaryTextColor?: string;   // muted / secondary labels
  iconColor?: string;            // status / decorative icons
  hoverColor?: string;           // hover highlight
  selectedColor?: string;        // active / selected highlight
  emptyStateColor?: string;      // empty / no-data message colour
  // Per-value colours (stable-id keyed) — KPI breakdown + chart categories
  colorByValue?: Record<string, string>;
  // Charts
  seriesColors?: string[];       // multi-series palette (per series index)
  legendTextColor?: string;
  axisTextColor?: string;
  axisLineColor?: string;
  gridLineColor?: string;
  dataLabelColor?: string;
  tooltipBg?: string;
  tooltipTextColor?: string;
  positiveColor?: string;        // bar/line/waterfall positive values
  negativeColor?: string;        // bar/line/waterfall negative values
  targetColor?: string;          // target / reference line
  // KPI card
  totalLabelColor?: string;
  breakdownLabelColor?: string;
  breakdownValueColor?: string;
  breakdownTrackColor?: string;  // breakdown bar background
  // Gauge
  gaugeTrackColor?: string;
  gaugeArcColor?: string;        // value arc
  targetMarkerColor?: string;
  // Donut Progress Gauge
  donutPrimaryColor?: string;    // completed / primary arc (default navy #0B2E4A)
  donutSecondaryColor?: string;  // remaining / secondary arc (default amber #F5A400)
  donutTrackColor?: string;      // unfilled track behind the arcs (default #E5E7EB)
  donutStrokeWidth?: number;     // arc thickness in viewBox units (default 16)
  donutStartAngle?: number;      // degrees; -90 starts the arc at 12 o'clock (default)
  donutRoundedEnds?: boolean;    // round the arc caps (default true)
  /** When true the remaining slice uses the track colour instead of the secondary colour. */
  donutRemainingAsTrack?: boolean;
  // Table / Matrix
  headerBg?: string;
  headerTextColor?: string;
  rowBg?: string;
  altRowBg?: string;
  cellTextColor?: string;
  totalRowBg?: string;
  totalRowTextColor?: string;
  selectedRowColor?: string;
  // Button
  buttonBg?: string;
  buttonTextColor?: string;
  buttonIconColor?: string;
  buttonHoverBg?: string;
  buttonHoverTextColor?: string;
  buttonDisabledBg?: string;
  buttonDisabledTextColor?: string;
  // Shape
  fillColor?: string;
  lineColor?: string;
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
  /** Global semantic filters + their per-entity mappings + per-visual bindings. */
  semanticFilters?: DashboardSemanticFilter[];
  filterMappings?: DashboardFilterMapping[];
  visualBindings?: DashboardVisualFilterBinding[];
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

// ── Date slicer option lists (used by the properties panel dropdowns) ─────────
export const DATE_FILTER_MODES: { value: DateFilterMode; label: string }[] = [
  { value: 'between', label: 'Between' },
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
  { value: 'on', label: 'On Date' },
  { value: 'relative_date', label: 'Relative Date' },
  { value: 'relative_period', label: 'Relative Period' },
  { value: 'timeline', label: 'Timeline' },
];

export const SLICER_DATE_RANGES: { value: SlicerDateRange; label: string }[] = [
  { value: 'all_time', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'custom', label: 'Custom' },
];

export const SLICER_GRANULARITIES: { value: DateGrain; label: string }[] = [
  { value: 'year', label: 'Year' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];

export const APPLY_FILTER_TO: { value: ApplyFilterTo; label: string }[] = [
  { value: 'dashboard', label: 'Entire Dashboard' },
  { value: 'page', label: 'Current Page' },
  { value: 'selected', label: 'Selected Visuals' },
];

export const SLICER_STYLES: { value: SlicerStyle; label: string }[] = [
  { value: 'date_inputs', label: 'Date inputs' },
  { value: 'range_slider', label: 'Range slider' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'dropdown_preset', label: 'Dropdown preset' },
  { value: 'button_presets', label: 'Button presets' },
];

// ── Layout / alignment option lists (used by the properties panel) ────────────
export const CONTENT_ALIGNMENTS: { value: ContentAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export const CHART_POSITIONS: { value: ChartPosition; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export const LEGEND_POSITIONS: { value: LegendPosition; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'none', label: 'Hidden' },
];

// Aliased display names for the Donut Progress Gauge (all map to 'donut_progress').
export const DONUT_PROGRESS_ALIASES = [
  'Donut Progress Gauge', 'Circular KPI Gauge', 'Donut Progress Card', 'Radial Progress KPI',
];

export const DONUT_CALC_MODES: { value: DonutCalcMode; label: string }[] = [
  { value: 'count_percentage', label: 'Count percentage (records / records)' },
  { value: 'sum_percentage', label: 'Sum percentage (total / target)' },
  { value: 'field_percentage', label: 'Field value (a field already a %)' },
];

export const DONUT_CENTER_LABEL_MODES: { value: DonutCenterLabelMode; label: string }[] = [
  { value: 'percentage', label: 'Percentage (e.g. 45%)' },
  { value: 'value', label: 'Raw value' },
  { value: 'percentage_with_label', label: 'Percentage + label (e.g. 45% Complete)' },
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
