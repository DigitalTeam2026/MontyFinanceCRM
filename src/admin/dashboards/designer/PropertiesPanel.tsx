import { useState, useEffect, useRef, useCallback } from 'react';
import { Database, Palette, Settings2, Plus, Trash2 } from 'lucide-react';
import type {
  DashboardVisual, DashboardDefinition, AggFn, DateGrain, FilterOp, NumberFormat, ThemeConfig,
  DateSlicerConfig, DateFilterMode, SlicerDateRange, ApplyFilterTo, SlicerStyle,
  ValueSlicerConfig, ValueSlicerStyle,
  DonutProgressConfig, DonutCalcMode, DonutCenterLabelMode,
  ContentAlign, ChartPosition, LegendPosition, FormatConfig,
} from '../types/dashboard';
import {
  DATE_FILTER_MODES, SLICER_DATE_RANGES, SLICER_GRANULARITIES, APPLY_FILTER_TO, SLICER_STYLES,
  CONTENT_ALIGNMENTS, CHART_POSITIONS, LEGEND_POSITIONS, DONUT_CALC_MODES, DONUT_CENTER_LABEL_MODES,
} from '../types/dashboard';
import type { EntityDefinition } from '../../../types/entity';
import type { FieldDefinition } from '../../../types/field';
import { loadEntityColumns } from '../../../services/fieldService';
import { VISUAL_REGISTRY } from '../visuals/registry';
import { getFilterFieldInfo, clearLabelResolverCache, type FilterFieldInfo } from '../visuals/labelResolver';
import FilterSelect from '../../../app/components/FilterSelect';
import FormatColorPanel, { Section, ColorRow } from './FormatColorPanel';
import { FunnelStageData, FunnelStageFormat } from './FunnelStagePanel';
import {
  PropertyField, PropertyToggle, PropertySelect, FieldSelect, PropertySection,
  MEASURE_TYPES, allowedMeasureFields, measureFieldHint, measureFieldError,
  propControlCls,
} from './PropertyControls';
import TableColumnsPanel from './TableColumnsPanel';
import { effectiveColumns, queryColumnsFor } from '../visuals/tableColumns';

// Persisted, user-resizable width of the right properties panel.
const PANEL_WIDTH_KEY = 'dashDesigner.propPanelWidth';
const PANEL_MIN = 320, PANEL_MAX = 600, PANEL_DEFAULT = 360, TWO_COL_AT = 380;

// The date slicer must only bind to Date / DateTime fields — never text, number,
// lookup, choice, or boolean columns.
const DATE_FIELD_TYPES = new Set(['date', 'datetime']);
const isDateField = (f: FieldDefinition) => DATE_FIELD_TYPES.has(f.field_type?.name ?? '');

interface Props {
  visual: DashboardVisual;
  entities: EntityDefinition[];
  /** Active dashboard theme — colour pickers fall back to it and offer it as swatches. */
  theme: ThemeConfig;
  /** Other visuals on the dashboard — used by the slicer's "Selected Visuals" target picker. */
  siblings?: DashboardVisual[];
  /** Full definition — exposes global semantic filters the date slicer can drive. */
  definition?: DashboardDefinition;
  /** Create (or reuse) a dashboard date semantic filter, auto-map it, bind this slicer. */
  onCreateGlobalDateFilter?: () => void;
  /** Open the Global filters mapping editor. */
  onManageGlobalFilters?: () => void;
  onChange: (patch: Partial<DashboardVisual>) => void;
}

const GRAINS: (DateGrain | '')[] = ['', 'year', 'quarter', 'month', 'week', 'day', 'hour'];
const OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'starts_with', 'is_empty', 'is_not_empty', 'in'];

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]/, '_');

export default function PropertiesPanel({ visual, entities, theme, siblings, definition, onCreateGlobalDateFilter, onManageGlobalFilters, onChange }: Props) {
  const [tab, setTab] = useState<'data' | 'format' | 'advanced'>('data');
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const meta = VISUAL_REGISTRY[visual.visual_type];
  const q = visual.query_config;
  const fmt = visual.format_config;

  const entity = entities.find((e) =>
    e.logical_name === q.entity || e.physical_table_name === q.entity);

  // Load the entity's columns for the field pickers. We go through loadEntityColumns
  // (not the raw field_definition read) so the live physical schema is reconciled into
  // metadata first — otherwise physical columns added by a migration without a
  // field_definition row (e.g. extra currency columns) would be invisible here even
  // though they exist on the table. Reconcile is best-effort and skipped for non-admins.
  useEffect(() => {
    if (!entity) { setFields([]); return; }
    let cancelled = false;
    loadEntityColumns(entity.entity_definition_id)
      .then((r) => {
        if (cancelled) return;
        setFields(r.fields);
        // New metadata rows were created — drop the runtime label cache so the
        // newly visible columns resolve labels correctly on the next render.
        if (r.reconcile?.created.length) clearLabelResolverCache();
      })
      .catch(() => { if (!cancelled) setFields([]); });
    return () => { cancelled = true; };
  }, [entity]);

  const setQuery = (patch: Partial<typeof q>) => onChange({ query_config: { ...q, ...patch } });
  const setFmt = (patch: Partial<typeof fmt>) => onChange({ format_config: { ...fmt, ...patch } });
  const setData = (patch: Partial<typeof visual.data_config>) => onChange({ data_config: { ...visual.data_config, ...patch } });

  // ── date slicer (timeline) ─────────────────────────────────────────────────
  const isTimeline = visual.visual_type === 'timeline';
  const isFunnel = visual.visual_type === 'funnel_stage';
  const isValueSlicer = visual.visual_type === 'slicer';
  const isDonutProgress = visual.visual_type === 'donut_progress';
  // Layout/alignment controls apply to data-bearing card + chart + slicer visuals.
  const showAlignment = !isTimeline && (meta?.category === 'kpi' || meta?.category === 'chart' || isValueSlicer);
  const ds: DateSlicerConfig = visual.data_config.dateSlicer ?? {};
  const setSlicer = (patch: Partial<DateSlicerConfig>) => setData({ dateSlicer: { ...ds, ...patch } });
  const vs: ValueSlicerConfig = visual.data_config.valueSlicer ?? {};
  const setValueSlicer = (patch: Partial<ValueSlicerConfig>) => setData({ valueSlicer: { ...vs, ...patch } });

  // Friendly single category + single measure model (covers most chart/kpi cases).
  const category = q.groupBy?.[0];
  const measure = q.aggregations?.[0];

  const setCategory = (field: string, grain: DateGrain | '') => {
    if (!field) { setQuery({ groupBy: [] }); return; }
    setQuery({ groupBy: [{ field, dateGrain: grain || null, alias: sanitize(field) }] });
  };
  const setMeasure = (fn: AggFn, field: string) => {
    const alias = fn === 'count' ? 'count' : sanitize(`${fn}_${field || 'value'}`);
    setQuery({ aggregations: [{ fn, field: fn === 'count' ? '*' : field, alias }] });
  };

  // Friendly entity label used as the "Entity · Type" subtitle on field options.
  const entityLabel = entity?.display_name;

  // ── resizable panel width (persisted) ──────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    return saved >= PANEL_MIN && saved <= PANEL_MAX ? saved : PANEL_DEFAULT;
  });
  useEffect(() => { localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth)); }, [panelWidth]);
  const dragState = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startW: panelWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      // Handle sits on the panel's LEFT edge, so dragging left widens it.
      const next = dragState.current.startW + (dragState.current.startX - ev.clientX);
      setPanelWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, next)));
    };
    const onUp = () => {
      dragState.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelWidth]);
  // Above this width the panel may pack small numeric fields two-per-row.
  const twoCol = panelWidth >= TWO_COL_AT;

  return (
    <div className="relative shrink-0 flex flex-col border-l border-slate-700 bg-slate-800 text-slate-200"
      style={{ width: panelWidth }}>
      {/* Drag handle — resize the panel horizontally. */}
      <div onMouseDown={onResizeDown} title="Drag to resize panel"
        className="absolute left-0 top-0 h-full w-1.5 -ml-0.5 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 z-20" />
      <div className="flex border-b border-slate-700">
        {([['data', Database, 'Data'], ['format', Palette, 'Format'], ['advanced', Settings2, 'Advanced']] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium ${tab === id ? 'text-white border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200'}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-[12px]">
        <Row label="Title">
          <input value={visual.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </Row>

        {tab === 'data' && isTimeline && (
          <>
            <DateSlicerGlobalBinding ds={ds} definition={definition} setSlicer={setSlicer}
              onCreateGlobalDateFilter={onCreateGlobalDateFilter} onManageGlobalFilters={onManageGlobalFilters} />
            <DateSlicerData q={q} ds={ds} fields={fields} setQuery={setQuery} setSlicer={setSlicer} entities={entities} />
          </>
        )}

        {tab === 'data' && isFunnel && (
          <FunnelStageData visual={visual} entities={entities} theme={theme} siblings={siblings} setData={setData} />
        )}

        {tab === 'data' && isValueSlicer && (
          <ValueSlicerData vs={vs} definition={definition} setValueSlicer={setValueSlicer}
            onManageGlobalFilters={onManageGlobalFilters} />
        )}

        {tab === 'data' && !isTimeline && meta?.dataMode !== 'none' && (
          <>
            <Row label="Entity" help="The records this visual queries.">
              <FilterSelect value={q.entity ?? ''} onChange={(e) => setQuery({ entity: e.target.value || undefined })} className={inputCls} placeholder="Select an entity">
                <option value="">Select an entity</option>
                {entities.map((en) => <option key={en.entity_definition_id} value={en.logical_name}>{en.display_name}</option>)}
              </FilterSelect>
            </Row>

            {visual.visual_type === 'kpi' && (
              <KpiDataControls visual={visual} fields={fields} entityName={q.entity} setData={setData} ops={OPS} />
            )}

            {isDonutProgress && (
              <DonutProgressData visual={visual} fields={fields} entityName={q.entity} setData={setData} ops={OPS} />
            )}

            {meta?.dataMode === 'aggregate' && visual.visual_type !== 'kpi' && !isDonutProgress && (() => {
              // Friendly single-category / single-measure model used by charts + matrix.
              const categoryField = fields.find((f) => f.physical_column_name === category?.field);
              const categoryIsDate = !!categoryField && isDateField(categoryField);
              const fn = (measure?.fn ?? 'count') as AggFn;
              const measureField = measure?.field === '*' ? '' : measure?.field ?? '';
              const needsCategory = meta?.category === 'chart' || visual.visual_type === 'matrix';
              const measureError = measureFieldError(fn, measureField, fields);
              return (
                <>
                  {/* Category — one full-width field per row. */}
                  <PropertyField
                    label="Category field"
                    help="Groups records into chart categories."
                    error={needsCategory && !category ? 'Category field is required for this chart.' : undefined}
                  >
                    <FieldSelect fields={fields} value={category?.field} entityLabel={entityLabel}
                      includeNone invalid={needsCategory && !category}
                      onChange={(col) => setCategory(col, (category?.dateGrain ?? '') as DateGrain | '')} />
                  </PropertyField>

                  {/* Date grain only applies when the category is a date/datetime field. */}
                  {categoryIsDate && (
                    <PropertyField label="Date grain"
                      help="Groups the date field by year, quarter, month, week or day.">
                      <PropertySelect value={category?.dateGrain ?? ''}
                        onChange={(e) => setCategory(category!.field, e.target.value as DateGrain | '')}>
                        {GRAINS.map((g) => <option key={g} value={g}>{g ? g[0].toUpperCase() + g.slice(1) : 'None'}</option>)}
                      </PropertySelect>
                    </PropertyField>
                  )}

                  {/* Measure type — always full width, one per row. */}
                  <PropertyField label="Measure type"
                    help="Choose how the visual calculates its value.">
                    <PropertySelect value={fn}
                      onChange={(e) => setMeasure(e.target.value as AggFn, measureField)}>
                      {MEASURE_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </PropertySelect>
                  </PropertyField>

                  {/* Measure field — hidden entirely for Count; full width otherwise. */}
                  {fn !== 'count' && (
                    <PropertyField label="Measure field"
                      help={measureFieldHint(fn)} error={measureError ?? undefined}>
                      <FieldSelect fields={allowedMeasureFields(fn, fields)} value={measureField}
                        entityLabel={entityLabel} invalid={!!measureError}
                        onChange={(col) => setMeasure(fn, col)} />
                    </PropertyField>
                  )}
                </>
              );
            })()}

            {meta?.dataMode === 'record' && (
              <PropertySection title="Columns">
                <TableColumnsPanel
                  columns={effectiveColumns(visual, fields)}
                  fields={fields}
                  entityLabel={entityLabel}
                  onChange={(cols) => onChange({
                    data_config: { ...visual.data_config, tableColumns: cols },
                    query_config: { ...q, columns: queryColumnsFor(cols) },
                  })}
                />
              </PropertySection>
            )}

            <FilterEditor visual={visual} fields={fields} onChange={setQuery} ops={OPS} entityName={q.entity} />
          </>
        )}

        {tab === 'data' && meta?.dataMode === 'none' && visual.visual_type === 'text' && (
          <Row label="Content"><textarea value={fmt.content ?? ''} onChange={(e) => setFmt({ content: e.target.value })} rows={4} className={inputCls} /></Row>
        )}
        {tab === 'data' && visual.visual_type === 'image' && (
          <Row label="Image URL"><input value={fmt.imageUrl ?? ''} onChange={(e) => setFmt({ imageUrl: e.target.value })} className={inputCls} /></Row>
        )}
        {tab === 'data' && visual.visual_type === 'html' && (
          <Row label="HTML (sanitized)"><textarea value={fmt.content ?? ''} onChange={(e) => setFmt({ content: e.target.value })} rows={5} className={inputCls} /></Row>
        )}

        {tab === 'format' && showAlignment && (
          <AlignmentControls fmt={fmt} setFmt={setFmt} />
        )}

        {tab === 'format' && isDonutProgress && (
          <DonutProgressFormat fmt={fmt} setFmt={setFmt} />
        )}

        {tab === 'format' && isTimeline && (
          <DateSlicerFormat fmt={fmt} ds={ds} theme={theme} setFmt={setFmt} setSlicer={setSlicer} />
        )}

        {tab === 'format' && isFunnel && (
          <FunnelStageFormat visual={visual} theme={theme} setFmt={setFmt} />
        )}

        {tab === 'format' && !isTimeline && !isFunnel && (
          <>
            <Toggle label="Show header" checked={fmt.showHeader !== false} onChange={(v) => setFmt({ showHeader: v })} />
            {meta?.category === 'chart' && <Toggle label="Show legend" checked={fmt.showLegend !== false} onChange={(v) => setFmt({ showLegend: v })} />}
            {meta?.category === 'chart' && <Toggle label="Data labels" checked={!!fmt.showDataLabels} onChange={(v) => setFmt({ showDataLabels: v })} />}
            {meta?.category === 'chart' && <Toggle label="Grid lines" checked={fmt.showGridLines !== false} onChange={(v) => setFmt({ showGridLines: v })} />}
            {visual.visual_type === 'bar' && <Toggle label="Horizontal" checked={fmt.orientation === 'horizontal'} onChange={(v) => setFmt({ orientation: v ? 'horizontal' : 'vertical' })} />}
            {(visual.visual_type === 'bar' || visual.visual_type === 'line' || visual.visual_type === 'area') &&
              <Toggle label="Stacked" checked={!!fmt.stacked} onChange={(v) => setFmt({ stacked: v })} />}
            <Row label="Number format">
              <FilterSelect value={fmt.numberFormat ?? 'number'} onChange={(e) => setFmt({ numberFormat: e.target.value as NumberFormat })} className={inputCls}>
                {(['number', 'currency', 'percentage', 'compact'] as NumberFormat[]).map((n) => <option key={n} value={n}>{n}</option>)}
              </FilterSelect>
            </Row>
            <Row label="Decimals">
              <input type="number" min={0} max={6} value={fmt.decimals ?? 0} onChange={(e) => setFmt({ decimals: Number(e.target.value) })} className={inputCls} />
            </Row>
            <Row label="Empty message">
              <input value={fmt.emptyMessage ?? 'No data'} onChange={(e) => setFmt({ emptyMessage: e.target.value })} className={inputCls} />
            </Row>

            {/* Full colour customization — falls back to the dashboard theme when unset. */}
            <div className="border-t border-slate-700/60 pt-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Colours</p>
              <FormatColorPanel visual={visual} theme={theme} setFmt={setFmt} />
            </div>
          </>
        )}

        {tab === 'advanced' && isTimeline && (
          <DateSlicerAdvanced ds={ds} setSlicer={setSlicer} siblings={siblings} selfId={visual.dashboard_visual_id}
            definition={definition} entities={entities} />
        )}

        {tab === 'advanced' && (
          <div className={`grid ${twoCol ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
            {([['x', 'X'], ['y', 'Y'], ['width', 'Width'], ['height', 'Height']] as const).map(([k, lbl]) => (
              <Row key={k} label={lbl}>
                <input type="number" value={visual[k]} onChange={(e) => onChange({ [k]: Number(e.target.value) } as Partial<DashboardVisual>)} className={inputCls} />
              </Row>
            ))}
            <Row label="Z-index"><input type="number" value={visual.z_index} onChange={(e) => onChange({ z_index: Number(e.target.value) })} className={inputCls} /></Row>
            <div className={`${twoCol ? 'col-span-2' : ''} space-y-1.5`}>
              <Toggle label="Visible" checked={visual.is_visible} onChange={(v) => onChange({ is_visible: v })} />
              <Toggle label="Locked" checked={visual.is_locked} onChange={(v) => onChange({ is_locked: v })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterEditor({ visual, fields, onChange, ops, entityName }: {
  visual: DashboardVisual; fields: FieldDefinition[];
  onChange: (patch: Partial<DashboardVisual['query_config']>) => void; ops: FilterOp[];
  entityName?: string;
}) {
  const filters = visual.query_config.filters ?? [];
  const [info, setInfo] = useState<Record<string, FilterFieldInfo>>({});

  // Lazily load label-driven value options for the fields used in filters.
  useEffect(() => {
    if (!entityName) return;
    const needed = [...new Set(filters.map((f) => f.field).filter((c) => c && !(c in info)))];
    if (!needed.length) return;
    let cancelled = false;
    Promise.all(needed.map((c) => getFilterFieldInfo(entityName, c).then((fi) => [c, fi] as const).catch(() => [c, { kind: 'text', options: [] } as FilterFieldInfo] as const)))
      .then((pairs) => { if (!cancelled) setInfo((prev) => ({ ...prev, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityName, filters.map((f) => f.field).join(',')]);

  const update = (i: number, patch: Partial<typeof filters[number]>) => {
    const n = [...filters]; n[i] = { ...filters[i], ...patch }; onChange({ filters: n });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-slate-400 text-[11px] font-medium">Filters</span>
        <button onClick={() => onChange({ filters: [...filters, { field: fields[0]?.physical_column_name ?? '', op: 'eq', value: '' }] })}
          className="text-blue-400 hover:text-blue-300"><Plus size={13} /></button>
      </div>
      <div className="space-y-1.5">
        {filters.map((f, i) => {
          const fi = info[f.field];
          const hasOptions = fi && fi.kind !== 'text' && fi.options.length > 0;
          const needsValue = !['is_empty', 'is_not_empty'].includes(f.op);
          return (
            <div key={i} className="flex gap-1 items-center">
              <FilterSelect value={f.field} onChange={(e) => update(i, { field: e.target.value, value: '' })} className={inputCls}>
                {fields.map((fd) => <option key={fd.field_definition_id} value={fd.physical_column_name}>{fd.display_name}</option>)}
              </FilterSelect>
              <FilterSelect value={f.op} onChange={(e) => update(i, { op: e.target.value as FilterOp })} className="w-20 px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200">
                {ops.map((op) => <option key={op} value={op}>{op}</option>)}
              </FilterSelect>
              {needsValue && (hasOptions ? (
                // Label-driven picker: show names, store the underlying raw value.
                <FilterSelect value={String(f.value ?? '')} onChange={(e) => update(i, { value: e.target.value })}
                  className="w-24 px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200">
                  <option value="">—</option>
                  {fi!.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </FilterSelect>
              ) : (
                <input value={String(f.value ?? '')} onChange={(e) => update(i, { value: e.target.value })} className="w-24 px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200" />
              ))}
              <button onClick={() => onChange({ filters: filters.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Date slicer (timeline) controls ─────────────────────────────────────────────
// Bind the date slicer to a GLOBAL semantic filter so one selection filters
// every mapped entity. When bound, the Entity / Date field below only set the
// slider's bounds source; the actual filtering flows through the mappings.
function DateSlicerGlobalBinding({ ds, definition, setSlicer, onCreateGlobalDateFilter, onManageGlobalFilters }: {
  ds: DateSlicerConfig; definition?: DashboardDefinition;
  setSlicer: (patch: Partial<DateSlicerConfig>) => void;
  onCreateGlobalDateFilter?: () => void;
  onManageGlobalFilters?: () => void;
}) {
  const dateFilters = (definition?.semanticFilters ?? []).filter((s) => s.data_type === 'date');
  const boundId = ds.semanticFilterId ?? '';
  const mappings = boundId
    ? (definition?.filterMappings ?? []).filter((m) => m.semantic_filter_id === boundId && m.is_active)
    : [];
  const mapCount = mappings.length;
  const validCount = mappings.filter((m) => m.target_entity_id && m.target_field_id).length;
  return (
    <div className="rounded border border-slate-700 p-2 space-y-1.5 bg-slate-900/40">
      <Row label="Global filter (drives many entities)">
        <FilterSelect value={boundId} onChange={(e) => setSlicer({ semanticFilterId: e.target.value || undefined })} className={inputCls}>
          <option value="">— This visual only —</option>
          {dateFilters.map((s) => <option key={s.dashboard_semantic_filter_id} value={s.dashboard_semantic_filter_id}>{s.label || s.key}</option>)}
        </FilterSelect>
      </Row>
      {boundId ? (
        <>
          <p className={`text-[10px] ${mapCount ? 'text-emerald-400' : 'text-amber-400'}`}>
            {mapCount
              ? `Drives ${mapCount} mapped entit${mapCount === 1 ? 'y' : 'ies'}${validCount < mapCount ? ` (${mapCount - validCount} incomplete)` : ''}.`
              : 'No entity mappings yet — the slicer will not filter until you add one.'}
          </p>
          {onManageGlobalFilters && (
            <button onClick={onManageGlobalFilters}
              className="w-full text-[11px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100">
              Manage mappings…
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-[10px] text-slate-500">Bind this slicer to a global date filter so one selection filters Prospect, Lead, Opportunity and every other mapped entity — each through its own date field.</p>
          {onCreateGlobalDateFilter && (
            <button onClick={onCreateGlobalDateFilter}
              className="w-full text-[11px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium">
              + Create global date filter
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Value (lookup / choice) slicer controls ──────────────────────────────────
// Bind the slicer to a NON-date global filter (e.g. Industry). At runtime it
// renders only the values actually referenced by accessible records across the
// mapped entities and filters every related visual through its discovered path.
function ValueSlicerData({ vs, definition, setValueSlicer, onManageGlobalFilters }: {
  vs: ValueSlicerConfig; definition?: DashboardDefinition;
  setValueSlicer: (patch: Partial<ValueSlicerConfig>) => void;
  onManageGlobalFilters?: () => void;
}) {
  const lookupFilters = (definition?.semanticFilters ?? []).filter((s) => s.data_type !== 'date');
  const boundId = vs.semanticFilterId ?? '';
  const mappings = boundId
    ? (definition?.filterMappings ?? []).filter((m) => m.semantic_filter_id === boundId && m.is_active)
    : [];
  const mapCount = mappings.length;
  return (
    <>
      <div className="rounded border border-slate-700 p-2 space-y-1.5 bg-slate-900/40">
        <Row label="Global filter this slicer drives">
          <FilterSelect value={boundId} onChange={(e) => setValueSlicer({ semanticFilterId: e.target.value || undefined })} className={inputCls}>
            <option value="">— Select a global filter —</option>
            {lookupFilters.map((s) => <option key={s.dashboard_semantic_filter_id} value={s.dashboard_semantic_filter_id}>{s.label || s.key}</option>)}
          </FilterSelect>
        </Row>
        {boundId ? (
          <p className={`text-[10px] ${mapCount ? 'text-emerald-400' : 'text-amber-400'}`}>
            {mapCount
              ? `Shows only values used across ${mapCount} mapped entit${mapCount === 1 ? 'y' : 'ies'} and filters them all.`
              : 'No entity mappings yet — open Manage mappings to discover them.'}
          </p>
        ) : (
          <p className="text-[10px] text-slate-500">Bind this slicer to a global lookup/choice filter (e.g. Industry). It surfaces only the values actually used by the dashboard's records and filters every related visual through its own field or relationship path.</p>
        )}
        {!lookupFilters.length && (
          <p className="text-[10px] text-amber-400">No lookup/choice global filters exist yet. Create one in Manage mappings.</p>
        )}
        {onManageGlobalFilters && (
          <button onClick={onManageGlobalFilters}
            className="w-full text-[11px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100">
            Manage mappings…
          </button>
        )}
      </div>

      <Row label="Style">
        <FilterSelect value={vs.style ?? 'list'} onChange={(e) => setValueSlicer({ style: e.target.value as ValueSlicerStyle })} className={inputCls}>
          <option value="list">List (checkboxes)</option>
          <option value="dropdown">Dropdown</option>
          <option value="chips">Chips</option>
          <option value="buttons">Buttons</option>
        </FilterSelect>
      </Row>
      <Toggle label="Multi-select" checked={vs.multiSelect !== false} onChange={(v) => setValueSlicer({ multiSelect: v })} />
      <Toggle label="Searchable" checked={vs.searchable !== false} onChange={(v) => setValueSlicer({ searchable: v })} />
      <Toggle label="Select all / Clear buttons" checked={vs.showSelectAll !== false} onChange={(v) => setValueSlicer({ showSelectAll: v, showClearButton: v })} />
    </>
  );
}

function DateSlicerData({ q, ds, fields, setQuery, setSlicer, entities }: {
  q: DashboardVisual['query_config']; ds: DateSlicerConfig; fields: FieldDefinition[];
  setQuery: (patch: Partial<DashboardVisual['query_config']>) => void;
  setSlicer: (patch: Partial<DateSlicerConfig>) => void; entities: EntityDefinition[];
}) {
  const dateFields = fields.filter(isDateField);
  const semantic = !!ds.semanticFilterId;
  const selectDateField = (col: string) => {
    const f = fields.find((x) => x.physical_column_name === col);
    setSlicer({ dateField: col || undefined, dateFieldIsDateTime: f?.field_type?.name === 'datetime' });
  };
  return (
    <>
      {/* In global mode the Entity / Date field are OPTIONAL — they only override
          the timeline's MIN/MAX bounds source. Filtering flows through mappings. */}
      <Row label={semantic ? 'Bounds entity (optional)' : 'Entity'}>
        <FilterSelect value={q.entity ?? ''} onChange={(e) => { setQuery({ entity: e.target.value || undefined }); setSlicer({ dateField: undefined }); }} className={inputCls}>
          <option value="">{semantic ? '— Use primary mapping —' : '— Select —'}</option>
          {entities.map((en) => <option key={en.entity_definition_id} value={en.logical_name}>{en.display_name}</option>)}
        </FilterSelect>
      </Row>

      <Row label={semantic ? 'Bounds date field (optional)' : 'Date field (Date / DateTime only)'}>
        <FilterSelect value={ds.dateField ?? ''} onChange={(e) => selectDateField(e.target.value)} className={inputCls}>
          <option value="">{semantic ? '— Use primary mapping —' : '— Select —'}</option>
          {dateFields.map((f) => <option key={f.field_definition_id} value={f.physical_column_name}>{f.display_name}</option>)}
        </FilterSelect>
        {semantic
          ? <p className="text-slate-500 text-[10px] mt-1">Optional. Leave blank to size the timeline from the primary entity mapping. Filtering itself uses the per-entity mappings, not this field.</p>
          : (q.entity && !dateFields.length && <p className="text-slate-500 text-[10px] mt-1">No Date/DateTime fields on this entity.</p>)}
      </Row>

      <Row label="Date filter mode">
        <FilterSelect value={ds.filterMode ?? 'between'} onChange={(e) => setSlicer({ filterMode: e.target.value as DateFilterMode })} className={inputCls}>
          {DATE_FILTER_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </FilterSelect>
      </Row>

      <Row label="Default date range">
        <FilterSelect value={ds.defaultRange ?? 'all_time'} onChange={(e) => setSlicer({ defaultRange: e.target.value as SlicerDateRange })} className={inputCls}>
          {SLICER_DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </FilterSelect>
      </Row>

      {ds.defaultRange === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <Row label="Start date"><input type="date" value={ds.startDate ?? ''} onChange={(e) => setSlicer({ startDate: e.target.value })} className={inputCls} /></Row>
          <Row label="End date"><input type="date" value={ds.endDate ?? ''} onChange={(e) => setSlicer({ endDate: e.target.value })} className={inputCls} /></Row>
        </div>
      )}

      <Row label="Date granularity">
        <FilterSelect value={ds.granularity ?? 'month'} onChange={(e) => setSlicer({ granularity: e.target.value as DateGrain })} className={inputCls}>
          {SLICER_GRANULARITIES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </FilterSelect>
      </Row>

      <Row label="Apply filter to">
        <FilterSelect value={ds.applyTo ?? 'dashboard'} onChange={(e) => setSlicer({ applyTo: e.target.value as ApplyFilterTo, filterScope: e.target.value as ApplyFilterTo })} className={inputCls} disabled={semantic}>
          {APPLY_FILTER_TO.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </FilterSelect>
        {semantic && <p className="text-slate-500 text-[10px] mt-1">In global mode the reach is governed by the global filter’s Scope (set in Manage mappings), so every mapped visual updates together.</p>}
      </Row>

      <Toggle label="Include empty dates" checked={!!ds.includeEmptyDates} onChange={(v) => setSlicer({ includeEmptyDates: v })} />
      {ds.dateFieldIsDateTime && (
        <Toggle label="Show time" checked={!!ds.showTime} onChange={(v) => setSlicer({ showTime: v })} />
      )}
    </>
  );
}

function DateSlicerFormat({ fmt, ds, theme, setFmt, setSlicer }: {
  fmt: DashboardVisual['format_config']; ds: DateSlicerConfig; theme: ThemeConfig;
  setFmt: (patch: Partial<DashboardVisual['format_config']>) => void;
  setSlicer: (patch: Partial<DateSlicerConfig>) => void;
}) {
  return (
    <>
      <Toggle label="Show title" checked={fmt.showHeader !== false} onChange={(v) => setFmt({ showHeader: v })} />
      <Row label="Orientation">
        <FilterSelect value={ds.orientation ?? 'horizontal'} onChange={(e) => setSlicer({ orientation: e.target.value as 'horizontal' | 'vertical' })} className={inputCls}>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </FilterSelect>
      </Row>
      <Row label="Slicer style">
        <FilterSelect value={ds.style ?? 'timeline'} onChange={(e) => setSlicer({ style: e.target.value as SlicerStyle })} className={inputCls}>
          {SLICER_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </FilterSelect>
      </Row>

      {ds.style === 'timeline_card' && (
        <div className="border-t border-slate-700/60 pt-2 space-y-1.5">
          <p className="text-[10px] text-slate-400">Combined Timeline / Date Filter card. Map a global date filter to the dashboard's entities under <span className="font-medium">Global filters</span>; those entities appear here as chips.</p>
          <Toggle label="Show entity selector" checked={ds.showEntitySelector !== false} onChange={(v) => setSlicer({ showEntitySelector: v })} />
          <Toggle label="Show field mapping row" checked={ds.showFieldMapping !== false} onChange={(v) => setSlicer({ showFieldMapping: v })} />
          <Toggle label="Show active filter chips" checked={ds.showActiveChips !== false} onChange={(v) => setSlicer({ showActiveChips: v })} />
        </div>
      )}

      <div className="border-t border-slate-700/60 pt-2 space-y-1.5">
        <Toggle label="Show start date input" checked={ds.showStartInput !== false} onChange={(v) => setSlicer({ showStartInput: v })} />
        <Toggle label="Show end date input" checked={ds.showEndInput !== false} onChange={(v) => setSlicer({ showEndInput: v })} />
        <Toggle label="Show clear button" checked={ds.showClearButton !== false} onChange={(v) => setSlicer({ showClearButton: v })} />
        <Toggle label="Show today button" checked={ds.showTodayButton !== false} onChange={(v) => setSlicer({ showTodayButton: v })} />
        <Toggle label="Show preset ranges" checked={ds.showPresetRanges !== false} onChange={(v) => setSlicer({ showPresetRanges: v })} />
        <Toggle label="Show year labels" checked={ds.showYearLabels !== false} onChange={(v) => setSlicer({ showYearLabels: v })} />
        <Toggle label="Show month labels" checked={!!ds.showMonthLabels} onChange={(v) => setSlicer({ showMonthLabels: v })} />
        <Toggle label="Show quarter labels" checked={!!ds.showQuarterLabels} onChange={(v) => setSlicer({ showQuarterLabels: v })} />
        <Toggle label="Compact mode" checked={!!ds.compact} onChange={(v) => setSlicer({ compact: v })} />
      </div>

      <div className="border-t border-slate-700/60 pt-2 space-y-2">
        <Row label="Border radius"><input type="number" min={0} max={32} value={fmt.borderRadius ?? 12} onChange={(e) => setFmt({ borderRadius: Number(e.target.value) })} className={inputCls} /></Row>
        <Row label="Text size"><input type="number" min={8} max={24} value={fmt.fontSize ?? 12} onChange={(e) => setFmt({ fontSize: Number(e.target.value) })} className={inputCls} /></Row>
        <Row label="Handle style">
          <FilterSelect value={ds.handleStyle ?? 'circle'} onChange={(e) => setSlicer({ handleStyle: e.target.value as 'circle' | 'square' | 'bar' })} className={inputCls}>
            <option value="circle">Circle</option>
            <option value="square">Square</option>
            <option value="bar">Bar</option>
          </FilterSelect>
        </Row>
      </div>

      <Section title="Timeline colours" defaultOpen>
        <ColorRow label="Background" value={fmt.background} onChange={(v) => setFmt({ background: v })} theme={theme} />
        <ColorRow label="Track color" value={ds.trackColor} onChange={(v) => setSlicer({ trackColor: v })} theme={theme} />
        <ColorRow label="Selected range color" value={ds.selectedRangeColor} onChange={(v) => setSlicer({ selectedRangeColor: v })} theme={theme} />
        <ColorRow label="Handle color" value={ds.handleColor} onChange={(v) => setSlicer({ handleColor: v })} theme={theme} />
        <ColorRow label="Date label color" value={ds.dateLabelColor} onChange={(v) => setSlicer({ dateLabelColor: v })} theme={theme} />
        <ColorRow label="Preset button color" value={ds.presetButtonColor} onChange={(v) => setSlicer({ presetButtonColor: v })} theme={theme} />
        <ColorRow label="Preset button text" value={ds.presetButtonTextColor} onChange={(v) => setSlicer({ presetButtonTextColor: v })} theme={theme} />
        <ColorRow label="Active preset color" value={ds.activePresetColor} onChange={(v) => setSlicer({ activePresetColor: v })} theme={theme} />
        <ColorRow label="Active preset text" value={ds.activePresetTextColor} onChange={(v) => setSlicer({ activePresetTextColor: v })} theme={theme} />
      </Section>
    </>
  );
}

function DateSlicerAdvanced({ ds, setSlicer, siblings, selfId, definition, entities }: {
  ds: DateSlicerConfig; setSlicer: (patch: Partial<DateSlicerConfig>) => void;
  siblings?: DashboardVisual[]; selfId: string;
  definition?: DashboardDefinition; entities: EntityDefinition[];
}) {
  const scope = ds.filterScope ?? ds.applyTo ?? 'dashboard';
  const targets = ds.connectedVisuals ?? [];
  const others = (siblings ?? []).filter((v) => v.dashboard_visual_id !== selfId);
  return (
    <div className="space-y-3 border-b border-slate-700/60 pb-3 mb-3">
      <Row label="Filter scope">
        <FilterSelect value={scope} onChange={(e) => setSlicer({ filterScope: e.target.value as ApplyFilterTo, applyTo: e.target.value as ApplyFilterTo })} className={inputCls}>
          {APPLY_FILTER_TO.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </FilterSelect>
      </Row>

      {scope === 'selected' && (
        <Row label="Connected visuals">
          <div className="max-h-40 overflow-auto rounded border border-slate-700 p-1.5 space-y-0.5">
            {others.map((v) => {
              const on = targets.includes(v.dashboard_visual_id);
              return (
                <label key={v.dashboard_visual_id} className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-700/40 rounded cursor-pointer">
                  <input type="checkbox" checked={on}
                    onChange={() => setSlicer({ connectedVisuals: on
                      ? targets.filter((id) => id !== v.dashboard_visual_id)
                      : [...targets, v.dashboard_visual_id] })} />
                  <span className="truncate">{v.title || v.visual_type}</span>
                </label>
              );
            })}
            {!others.length && <p className="text-slate-500 px-1 text-[11px]">No other visuals on this dashboard.</p>}
          </div>
        </Row>
      )}

      <Toggle label="Sync across pages" checked={!!ds.syncAcrossPages} onChange={(v) => setSlicer({ syncAcrossPages: v })} />
      <Toggle label="Persist user selection" checked={!!ds.persistSelection} onChange={(v) => setSlicer({ persistSelection: v })} />
      <Toggle label="Use dashboard default date field" checked={!!ds.useDashboardDefaultField} onChange={(v) => setSlicer({ useDashboardDefaultField: v })} />
      <Toggle label="Require selection" checked={!!ds.requireSelection} onChange={(v) => setSlicer({ requireSelection: v })} />
      <Toggle label="Auto-apply" checked={ds.autoApply !== false} onChange={(v) => setSlicer({ autoApply: v })} />
      <Row label="Debounce (ms)"><input type="number" min={0} max={5000} step={50} value={ds.debounceMs ?? 0} onChange={(e) => setSlicer({ debounceMs: Number(e.target.value) })} className={inputCls} /></Row>
      <Row label="Time zone handling">
        <FilterSelect value={ds.timeZoneHandling ?? 'local'} onChange={(e) => setSlicer({ timeZoneHandling: e.target.value as 'local' | 'utc' })} className={inputCls}>
          <option value="local">Local time</option>
          <option value="utc">UTC</option>
        </FilterSelect>
      </Row>

      <DateSlicerDiagnostics ds={ds} definition={definition} entities={entities} selfId={selfId} />
    </div>
  );
}

// ── Date filter diagnostics (spec §12) ───────────────────────────────────────
// Read-only readout that makes it obvious why filtering does (or doesn't) reach
// each visual: mode, the bound semantic filter, mapping validity, and a per-
// visual "affected? / reason" table built from the SAME mapping data the runtime
// uses (semanticRuntime.mappingForEntity).
function DateSlicerDiagnostics({ ds, definition, entities, selfId }: {
  ds: DateSlicerConfig; definition?: DashboardDefinition; entities: EntityDefinition[];
  selfId: string;
}) {
  const semantic = !!ds.semanticFilterId;
  const sf = (definition?.semanticFilters ?? []).find((s) => s.dashboard_semantic_filter_id === ds.semanticFilterId);
  const mappings = (definition?.filterMappings ?? []).filter((m) => m.semantic_filter_id === ds.semanticFilterId && m.is_active);
  const validMappings = mappings.filter((m) => m.target_entity_id && m.target_field_id);
  const entById = new Map(entities.map((e) => [e.entity_definition_id, e]));
  const entByName = (name?: string) => entities.find((e) => e.logical_name === name || e.physical_table_name === name);

  // Every other live visual on the dashboard + whether the date filter reaches it.
  const others = (definition?.visuals ?? []).filter((v) => v.dashboard_visual_id !== selfId && v.query_config.entity);
  const rows = others.map((v) => {
    const ent = entByName(v.query_config.entity);
    const m = ent ? mappings.find((x) => x.target_entity_id === ent.entity_definition_id) : undefined;
    const affected = !!m && !!(m.target_field_id);
    const reason = !semantic ? 'global mode off'
      : !ent ? 'entity not resolved'
      : !m ? 'no mapping for this entity'
      : !m.target_field_id ? 'mapping has no date field'
      : '';
    const fieldLabel = m && entById.has(m.target_entity_id ?? '')
      ? (Array.isArray((m.relationship_path as { steps?: unknown[] })?.steps) && ((m.relationship_path as { steps?: unknown[] }).steps?.length ?? 0) > 0 ? 'via path' : 'direct')
      : '—';
    return { id: v.dashboard_visual_id, title: v.title || v.visual_type, entity: v.query_config.entity, affected, reason, fieldLabel };
  });

  return (
    <Section title="Date filter diagnostics">
      <div className="text-[11px] text-slate-300 space-y-1">
        <Diag k="Mode" v={semantic ? 'global semantic' : 'direct (this visual only)'} />
        <Diag k="Semantic filter" v={semantic ? (sf ? `${sf.label || sf.key}` : '⚠ bound id not found') : '—'} />
        <Diag k="Scope" v={semantic ? (sf?.scope ?? 'dashboard') : (ds.filterScope ?? ds.applyTo ?? 'dashboard')} />
        <Diag k="Mappings" v={`${validMappings.length} valid / ${mappings.length} active`} />
        <Diag k="Default range" v={ds.defaultRange ?? 'all_time'} />
        <Diag k="Granularity" v={ds.granularity ?? 'month'} />
        <Diag k="Affected visuals" v={`${rows.filter((r) => r.affected).length} / ${rows.length}`} />
      </div>
      {semantic && (
        <div className="mt-2 rounded border border-slate-700 overflow-hidden">
          {rows.length === 0 && <p className="text-[10px] text-slate-500 px-2 py-1.5">No other visuals to evaluate.</p>}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-2 py-1 text-[10px] border-b border-slate-700/60 last:border-0">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.affected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              <span className="flex-1 truncate text-slate-200">{r.title}</span>
              <span className="text-slate-500 truncate max-w-[80px]">{r.entity}</span>
              <span className={r.affected ? 'text-emerald-400' : 'text-amber-400'}>{r.affected ? r.fieldLabel : (r.reason || 'not affected')}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Diag({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{k}</span>
      <span className="text-slate-200 truncate text-right">{v}</span>
    </div>
  );
}

// Shared full-width, 36px-tall control styling (re-exported for legacy call sites).
const inputCls = propControlCls;

// Thin wrappers so every existing call site inherits the upgraded design:
// labels above inputs, help text + validation support, aligned toggles.
function Row({ label, help, error, children }: {
  label: string; help?: React.ReactNode; error?: React.ReactNode; children: React.ReactNode;
}) {
  return <PropertyField label={label} help={help} error={error}>{children}</PropertyField>;
}

function Toggle({ label, checked, onChange, help }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; help?: React.ReactNode;
}) {
  return <PropertyToggle label={label} checked={checked} onChange={onChange} help={help} />;
}

// ── KPI "Total + Breakdown" data controls ────────────────────────────────────────
function KpiDataControls({ visual, fields, entityName, setData, ops }: {
  visual: DashboardVisual; fields: FieldDefinition[]; entityName?: string;
  setData: (patch: Partial<DashboardVisual['data_config']>) => void; ops: FilterOp[];
}) {
  const d = visual.data_config;
  const mode = (d.kpiMode as 'simple' | 'breakdown') ?? 'simple';
  const mainAgg = (d.mainAgg as AggFn) ?? 'count';
  return (
    <div className="space-y-3 border-t border-slate-700/60 pt-3">
      <Row label="Card mode">
        <FilterSelect value={mode} onChange={(e) => setData({ kpiMode: e.target.value as 'simple' | 'breakdown' })} className={inputCls}>
          <option value="simple">Simple KPI</option>
          <option value="breakdown">KPI with Breakdown</option>
        </FilterSelect>
      </Row>
      <PropertyField label="Measure type" help="Choose how the card calculates its total.">
        <PropertySelect value={mainAgg} onChange={(e) => setData({ mainAgg: e.target.value as AggFn })}>
          {MEASURE_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </PropertySelect>
      </PropertyField>
      {mainAgg !== 'count' && (() => {
        const mfield = (d.mainField as string) ?? '';
        const err = measureFieldError(mainAgg, mfield, fields);
        return (
          <PropertyField label="Measure field" help={measureFieldHint(mainAgg)} error={err ?? undefined}>
            <FieldSelect fields={allowedMeasureFields(mainAgg, fields)} value={mfield}
              invalid={!!err} onChange={(col) => setData({ mainField: col })} />
          </PropertyField>
        );
      })()}
      <Row label="Total label">
        <input value={(d.totalLabel as string) ?? ''} onChange={(e) => setData({ totalLabel: e.target.value })} placeholder="e.g. Total Prospects" className={inputCls} />
      </Row>

      {mode === 'breakdown' && (
        <>
          <PropertyField label="Breakdown field" help="Segments the total into rows (e.g. by status or owner).">
            <FieldSelect fields={fields} value={(d.breakdownField as string) ?? ''} includeNone
              onChange={(col) => setData({ breakdownField: col || undefined })} />
          </PropertyField>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Max rows"><input type="number" min={1} max={50} value={(d.breakdownLimit as number) ?? 10} onChange={(e) => setData({ breakdownLimit: Number(e.target.value) })} className={inputCls} /></Row>
            <Row label="Sort">
              <FilterSelect value={(d.breakdownSort as string) ?? 'value_desc'} onChange={(e) => setData({ breakdownSort: e.target.value as 'value_desc' | 'value_asc' | 'label' })} className={inputCls}>
                <option value="value_desc">Value ↓</option>
                <option value="value_asc">Value ↑</option>
                <option value="label">Label</option>
              </FilterSelect>
            </Row>
          </div>
          <Row label="Layout">
            <FilterSelect value={(d.kpiLayout as string) ?? 'detailed'} onChange={(e) => setData({ kpiLayout: e.target.value as 'compact' | 'detailed' })} className={inputCls}>
              <option value="detailed">Detailed (bars)</option>
              <option value="compact">Compact</option>
            </FilterSelect>
          </Row>
          <Toggle label="Show percentages" checked={!!d.showPercentages} onChange={(v) => setData({ showPercentages: v })} />
          <Toggle label="Show zero values" checked={!!d.showZeroValues} onChange={(v) => setData({ showZeroValues: v })} />
          <Toggle label="Include empty / unassigned" checked={!!d.showEmptyValues} onChange={(v) => setData({ showEmptyValues: v })} />
          <KpiCustomItems visual={visual} fields={fields} entityName={entityName} setData={setData} ops={ops} />
        </>
      )}
    </div>
  );
}

// Custom filtered breakdown rows (e.g. "Converted to Lead" = status_reason eq X).
function KpiCustomItems({ visual, fields, entityName, setData, ops }: {
  visual: DashboardVisual; fields: FieldDefinition[]; entityName?: string;
  setData: (patch: Partial<DashboardVisual['data_config']>) => void; ops: FilterOp[];
}) {
  const items = visual.data_config.customBreakdownItems ?? [];
  const [info, setInfo] = useState<Record<string, FilterFieldInfo>>({});
  const usedFields = items.map((it) => it.filters?.[0]?.field).filter(Boolean) as string[];

  useEffect(() => {
    if (!entityName) return;
    const needed = [...new Set(usedFields.filter((c) => c && !(c in info)))];
    if (!needed.length) return;
    let cancelled = false;
    Promise.all(needed.map((c) => getFilterFieldInfo(entityName, c).then((fi) => [c, fi] as const).catch(() => [c, { kind: 'text', options: [] } as FilterFieldInfo] as const)))
      .then((pairs) => { if (!cancelled) setInfo((p) => ({ ...p, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityName, usedFields.join(',')]);

  const update = (i: number, patch: Partial<typeof items[number]>) => {
    const n = [...items]; n[i] = { ...items[i], ...patch }; setData({ customBreakdownItems: n });
  };
  const updateFilter = (i: number, fpatch: Partial<{ field: string; op: FilterOp; value: unknown }>) => {
    const cur = items[i].filters?.[0] ?? { field: fields[0]?.physical_column_name ?? '', op: 'eq' as FilterOp, value: '' };
    update(i, { filters: [{ ...cur, ...fpatch }] });
  };

  return (
    <div className="border-t border-slate-700/60 pt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-slate-400 text-[11px] font-medium">Custom rows</span>
        <button onClick={() => setData({ customBreakdownItems: [...items, { id: crypto.randomUUID(), label: '', filters: [{ field: fields[0]?.physical_column_name ?? '', op: 'eq', value: '' }] }] })}
          className="text-blue-400 hover:text-blue-300"><Plus size={13} /></button>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => {
          const f = it.filters?.[0] ?? { field: '', op: 'eq' as FilterOp, value: '' };
          const fi = info[f.field];
          const hasOpts = fi && fi.kind !== 'text' && fi.options.length > 0;
          return (
            <div key={i} className="rounded border border-slate-700 p-1.5 space-y-1">
              <div className="flex gap-1 items-center">
                <input value={it.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Row label (e.g. Converted to Lead)" className={inputCls} />
                <button onClick={() => setData({ customBreakdownItems: items.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
              </div>
              <div className="flex gap-1 items-center">
                <FilterSelect value={f.field} onChange={(e) => updateFilter(i, { field: e.target.value, value: '' })} className={inputCls}>
                  {fields.map((fd) => <option key={fd.field_definition_id} value={fd.physical_column_name}>{fd.display_name}</option>)}
                </FilterSelect>
                <FilterSelect value={f.op} onChange={(e) => updateFilter(i, { op: e.target.value as FilterOp })} className="w-16 px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200">
                  {ops.map((op) => <option key={op} value={op}>{op}</option>)}
                </FilterSelect>
                {hasOpts ? (
                  <FilterSelect value={String(f.value ?? '')} onChange={(e) => updateFilter(i, { value: e.target.value })} className="w-24 px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200">
                    <option value="">—</option>
                    {fi!.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </FilterSelect>
                ) : (
                  <input value={String(f.value ?? '')} onChange={(e) => updateFilter(i, { value: e.target.value })} className="w-24 px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Layout & alignment controls (shared by KPI / funnel / charts / donut / slicer) ──
function AlignmentControls({ fmt, setFmt }: {
  fmt: FormatConfig; setFmt: (patch: Partial<FormatConfig>) => void;
}) {
  return (
    <PropertySection title="Layout & alignment" divider={false}>
      <Row label="Content alignment" help="Title and text alignment within the card.">
        <FilterSelect value={fmt.cardContentAlign ?? 'left'} onChange={(e) => setFmt({ cardContentAlign: e.target.value as ContentAlign })} className={inputCls}>
          {CONTENT_ALIGNMENTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </FilterSelect>
      </Row>
      <Row label="Chart position" help="Where the chart / donut sits horizontally.">
        <FilterSelect value={fmt.chartPosition ?? 'center'} onChange={(e) => setFmt({ chartPosition: e.target.value as ChartPosition })} className={inputCls}>
          {CHART_POSITIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </FilterSelect>
      </Row>
      <Row label="Legend position">
        <FilterSelect value={fmt.legendPosition ?? 'bottom'} onChange={(e) => setFmt({ legendPosition: e.target.value as LegendPosition })} className={inputCls}>
          {LEGEND_POSITIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </FilterSelect>
      </Row>
    </PropertySection>
  );
}

// ── Donut Progress Gauge — Format-tab styling (colours live in FormatColorPanel) ──
function DonutProgressFormat({ fmt, setFmt }: {
  fmt: FormatConfig; setFmt: (patch: Partial<FormatConfig>) => void;
}) {
  return (
    <PropertySection title="Donut style">
      <Row label="Thickness (stroke width)" help="Arc thickness — default 16.">
        <input type="number" min={2} max={40} value={fmt.donutStrokeWidth ?? 16} onChange={(e) => setFmt({ donutStrokeWidth: Number(e.target.value) })} className={inputCls} />
      </Row>
      <Row label="Start angle (degrees)" help="-90 starts the arc at the top (12 o'clock).">
        <input type="number" min={-180} max={180} value={fmt.donutStartAngle ?? -90} onChange={(e) => setFmt({ donutStartAngle: Number(e.target.value) })} className={inputCls} />
      </Row>
      <Toggle label="Rounded arc ends" checked={fmt.donutRoundedEnds !== false} onChange={(v) => setFmt({ donutRoundedEnds: v })} />
      <Toggle label="Remaining slice uses track colour" checked={!!fmt.donutRemainingAsTrack} onChange={(v) => setFmt({ donutRemainingAsTrack: v })}
        help="Off shows the remainder in the secondary colour; on hides it as the plain track." />
    </PropertySection>
  );
}

// ── Donut Progress Gauge — Data-tab controls ──────────────────────────────────
function DonutProgressData({ visual, fields, entityName, setData, ops }: {
  visual: DashboardVisual; fields: FieldDefinition[]; entityName?: string;
  setData: (patch: Partial<DashboardVisual['data_config']>) => void; ops: FilterOp[];
}) {
  const cfg: DonutProgressConfig = visual.data_config.donutProgress ?? {};
  const setCfg = (patch: Partial<DonutProgressConfig>) => setData({ donutProgress: { ...cfg, ...patch } });
  const mode = cfg.calcMode ?? 'count_percentage';
  const numAgg: AggFn = cfg.numeratorAgg ?? 'sum';
  const valAgg: AggFn = cfg.valueFieldAgg ?? 'avg';
  const centerMode = cfg.centerLabelMode ?? 'percentage';

  return (
    <div className="space-y-3 border-t border-slate-700/60 pt-3">
      <PropertyField label="Calculation mode" help="How the gauge derives its percentage.">
        <PropertySelect value={mode} onChange={(e) => setCfg({ calcMode: e.target.value as DonutCalcMode })}>
          {DONUT_CALC_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </PropertySelect>
      </PropertyField>

      {mode === 'count_percentage' && (
        <>
          <p className="text-[10px] leading-snug text-slate-500">
            Denominator = all records matching the card’s filters. Numerator = those records that also match the rule(s) below.
          </p>
          <DonutNumeratorFilters cfg={cfg} fields={fields} entityName={entityName} setCfg={setCfg} ops={ops} />
        </>
      )}

      {mode === 'sum_percentage' && (
        <>
          <PropertyField label="Numerator aggregation">
            <PropertySelect value={numAgg} onChange={(e) => setCfg({ numeratorAgg: e.target.value as AggFn })}>
              {MEASURE_TYPES.filter((m) => m.value !== 'count').map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </PropertySelect>
          </PropertyField>
          <PropertyField label="Numerator field" help={measureFieldHint(numAgg)} error={measureFieldError(numAgg, cfg.numeratorField, fields) ?? undefined}>
            <FieldSelect fields={allowedMeasureFields(numAgg, fields)} value={cfg.numeratorField}
              invalid={!!measureFieldError(numAgg, cfg.numeratorField, fields)} onChange={(col) => setCfg({ numeratorField: col })} />
          </PropertyField>
          <Row label="Target value (denominator)" help="Manual target the numerator is measured against.">
            <input type="number" value={cfg.targetValue ?? 0} onChange={(e) => setCfg({ targetValue: Number(e.target.value) })} className={inputCls} />
          </Row>
        </>
      )}

      {mode === 'field_percentage' && (
        <>
          <PropertyField label="Aggregation" help="Aggregates the percentage field across matching records.">
            <PropertySelect value={valAgg} onChange={(e) => setCfg({ valueFieldAgg: e.target.value as AggFn })}>
              {MEASURE_TYPES.filter((m) => m.value !== 'count' && m.value !== 'count_distinct').map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </PropertySelect>
          </PropertyField>
          <PropertyField label="Percentage field" help="A numeric field that already holds a 0–100 percentage.">
            <FieldSelect fields={allowedMeasureFields(valAgg, fields)} value={cfg.valueField}
              onChange={(col) => setCfg({ valueField: col })} />
          </PropertyField>
        </>
      )}

      <div className="border-t border-slate-700/60 pt-2 space-y-3">
        <PropertyField label="Center label">
          <PropertySelect value={centerMode} onChange={(e) => setCfg({ centerLabelMode: e.target.value as DonutCenterLabelMode })}>
            {DONUT_CENTER_LABEL_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </PropertySelect>
        </PropertyField>
        {centerMode === 'percentage_with_label' && (
          <Row label="Center caption">
            <input value={cfg.centerLabelText ?? ''} onChange={(e) => setCfg({ centerLabelText: e.target.value })} placeholder="e.g. Complete" className={inputCls} />
          </Row>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Row label="Completed label"><input value={cfg.completedLabel ?? ''} onChange={(e) => setCfg({ completedLabel: e.target.value })} placeholder="Completed" className={inputCls} /></Row>
          <Row label="Remaining label"><input value={cfg.remainingLabel ?? ''} onChange={(e) => setCfg({ remainingLabel: e.target.value })} placeholder="Remaining" className={inputCls} /></Row>
        </div>
      </div>
    </div>
  );
}

// Numerator rule editor for the count-percentage mode (records matching these
// AND the base filters form the numerator). Mirrors the KPI custom-row editor.
function DonutNumeratorFilters({ cfg, fields, entityName, setCfg, ops }: {
  cfg: DonutProgressConfig; fields: FieldDefinition[]; entityName?: string;
  setCfg: (patch: Partial<DonutProgressConfig>) => void; ops: FilterOp[];
}) {
  const filters = cfg.numeratorFilters ?? [];
  const [info, setInfo] = useState<Record<string, FilterFieldInfo>>({});

  useEffect(() => {
    if (!entityName) return;
    const needed = [...new Set(filters.map((f) => f.field).filter((c) => c && !(c in info)))];
    if (!needed.length) return;
    let cancelled = false;
    Promise.all(needed.map((c) => getFilterFieldInfo(entityName, c).then((fi) => [c, fi] as const).catch(() => [c, { kind: 'text', options: [] } as FilterFieldInfo] as const)))
      .then((pairs) => { if (!cancelled) setInfo((p) => ({ ...p, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityName, filters.map((f) => f.field).join(',')]);

  const update = (i: number, patch: Partial<typeof filters[number]>) => {
    const n = [...filters]; n[i] = { ...filters[i], ...patch }; setCfg({ numeratorFilters: n });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-slate-400 text-[11px] font-medium">Numerator rules</span>
        <button onClick={() => setCfg({ numeratorFilters: [...filters, { field: fields[0]?.physical_column_name ?? '', op: 'eq', value: '' }] })}
          className="text-blue-400 hover:text-blue-300"><Plus size={13} /></button>
      </div>
      <div className="space-y-1.5">
        {filters.map((f, i) => {
          const fi = info[f.field];
          const hasOptions = fi && fi.kind !== 'text' && fi.options.length > 0;
          const needsValue = !['is_empty', 'is_not_empty'].includes(f.op);
          return (
            <div key={i} className="flex gap-1 items-center">
              <FilterSelect value={f.field} onChange={(e) => update(i, { field: e.target.value, value: '' })} className={inputCls}>
                {fields.map((fd) => <option key={fd.field_definition_id} value={fd.physical_column_name}>{fd.display_name}</option>)}
              </FilterSelect>
              <FilterSelect value={f.op} onChange={(e) => update(i, { op: e.target.value as FilterOp })} className="w-20 px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200">
                {ops.map((op) => <option key={op} value={op}>{op}</option>)}
              </FilterSelect>
              {needsValue && (hasOptions ? (
                <FilterSelect value={String(f.value ?? '')} onChange={(e) => update(i, { value: e.target.value })}
                  className="w-24 px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200">
                  <option value="">—</option>
                  {fi!.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </FilterSelect>
              ) : (
                <input value={String(f.value ?? '')} onChange={(e) => update(i, { value: e.target.value })} className="w-24 px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200" />
              ))}
              <button onClick={() => setCfg({ numeratorFilters: filters.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          );
        })}
        {!filters.length && <p className="text-[10px] text-slate-500">Add at least one rule — without it the numerator equals the denominator (100%).</p>}
      </div>
    </div>
  );
}
