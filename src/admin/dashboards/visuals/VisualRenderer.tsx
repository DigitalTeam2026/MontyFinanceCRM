import { useState, useEffect, useRef, Component, type ReactNode } from 'react';
import ReactECharts from 'echarts-for-react';
import DOMPurify from 'dompurify';
import { Loader2, AlertTriangle, Inbox, Lock, Check } from 'lucide-react';
import type { DashboardVisual, DashboardDefinition, ThemeConfig, VisualFilter, RelatedFilter, SemanticQueryFilter, ButtonAction, OrderBySpec, SlicerBroadcastOpts } from '../types/dashboard';
import { VISUAL_REGISTRY } from './registry';
import TableVisual from './TableVisual';
import { buildEChartsOption } from './echartsOptions';
import { formatLabel } from './formatValue';
import { pick } from './colorConfig';
import { runAggregate, runRecordQuery } from '../services/queryEngine';
import { resolveAggregateLabels, resolveRecordLabels } from './labelResolver';
import type { SelectionEmit, RawValue } from './useCrossFilter';
import KpiVisual from './KpiVisual';
import FunnelStageVisual from './FunnelStageVisual';
import DonutProgressVisual from './DonutProgressVisual';
import DateSlicerVisual from './DateSlicerVisual';
import ValueSlicerVisual from './ValueSlicerVisual';
import type { SlicerSelection } from './slicerValues';
import { isAuthError } from '../../../lib/supabase';

interface Props {
  visual: DashboardVisual;
  theme: ThemeConfig;
  /** Same-entity runtime filters merged into the visual query (cross-filter / slicer / global). */
  runtimeFilters?: VisualFilter[];
  /** Cross-entity runtime filters reached through relationship paths (cross-filter). */
  runtimeRelatedFilters?: RelatedFilter[];
  /** Global semantic filters resolved to this visual (path mappings → server EXISTS). */
  runtimeSemanticFilters?: SemanticQueryFilter[];
  /** Interactive cross-filter selection (click / ctrl / shift). */
  onSelect?: (emit: SelectionEmit) => void;
  /** Raw values currently selected for THIS visual's field — emphasised, others dimmed. */
  highlight?: Set<string>;
  /** Per-(entity, field) selected raws — for multi-field visuals (funnel stage cards). */
  getHighlight?: (entity: string, fieldId: string | undefined) => Set<string>;
  /** Per-stage cross-filters for a multi-entity visual (funnel stage card): given a
   *  stage's entity, returns the same-entity + cross-entity filters to apply. */
  crossFilterForEntity?: (entity: string) => { filters: VisualFilter[]; semanticFilters: SemanticQueryFilter[] };
  /** Button action handler. */
  onAction?: (action: ButtonAction | undefined) => void;
  /** Date-slicer broadcast — the timeline visual emits its range filters here. */
  onFilterChange?: (filters: VisualFilter[], opts?: SlicerBroadcastOpts) => void;
  /** Full dashboard definition — a GLOBAL date slicer resolves its mappings/bounds from it. */
  definition?: DashboardDefinition;
  /** Current semantic selections — a lookup slicer uses them to stay contextual (§7). */
  semanticSelections?: Record<string, SlicerSelection>;
  /** When true the visual fetches live data; false keeps it inert (designer add). */
  live?: boolean;
}

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'denied' }
  | { kind: 'ready'; rows: Record<string, unknown>[]; total?: number };

const rawOf = (r: Record<string, unknown>, key: string) =>
  (r.__raw as Record<string, unknown> | undefined)?.[key] ?? r[key];

export default function VisualRenderer({ visual, theme, runtimeFilters, runtimeRelatedFilters, runtimeSemanticFilters, onSelect, highlight, getHighlight, crossFilterForEntity, onAction, onFilterChange, definition, semanticSelections, live = true }: Props) {
  const meta = VISUAL_REGISTRY[visual.visual_type];
  const [state, setState] = useState<State>({ kind: 'loading' });
  const reqId = useRef(0);

  // KPI, funnel-stage, donut-progress, timeline + slicer manage their own
  // fetching — skip the generic aggregate/record query.
  const needsData = meta?.dataMode !== 'none'
    && visual.visual_type !== 'kpi' && visual.visual_type !== 'funnel_stage'
    && visual.visual_type !== 'donut_progress' && visual.visual_type !== 'slicer';

  // Interactive table state — header filters + single-column sort. These re-query
  // the server (merged into the query below), so pagination stays correct. Reset
  // when the visual identity changes.
  const [tableFilters, setTableFilters] = useState<VisualFilter[]>([]);
  const [tableSort, setTableSort] = useState<OrderBySpec | undefined>(undefined);
  useEffect(() => { setTableFilters([]); setTableSort(undefined); }, [visual.dashboard_visual_id]);

  const cfgKey = JSON.stringify([visual.query_config, runtimeFilters, runtimeRelatedFilters, runtimeSemanticFilters, tableFilters, tableSort]);

  useEffect(() => {
    if (!needsData || !live) { setState({ kind: 'ready', rows: [] }); return; }
    if (!visual.query_config.entity) { setState({ kind: 'empty' }); return; }

    const id = ++reqId.current;
    setState({ kind: 'loading' });
    const merged = {
      ...visual.query_config,
      filters: [...(visual.query_config.filters ?? []), ...(runtimeFilters ?? []), ...tableFilters],
      relatedFilters: [...(visual.query_config.relatedFilters ?? []), ...(runtimeRelatedFilters ?? [])],
      semanticFilters: [...(visual.query_config.semanticFilters ?? []), ...(runtimeSemanticFilters ?? [])],
      orderBy: tableSort ? [tableSort] : visual.query_config.orderBy,
    };
    const run = meta.dataMode === 'record' ? runRecordQuery(merged) : runAggregate(merged);
    run.then(async (res) => {
      if (id !== reqId.current) return;             // stale → ignore
      let rows = res.rows ?? [];
      if (!rows.length) { setState({ kind: 'empty' }); return; }
      // Resolve raw physical values (lookup ids, choice codes, status, etc.) to labels.
      try {
        rows = meta.dataMode === 'record'
          ? await resolveRecordLabels(merged.entity, rows, merged.columns ?? [])
          : await resolveAggregateLabels(merged.entity, rows, merged.groupBy ?? []);
      } catch { /* fall back to raw values on resolver failure */ }
      if (id !== reqId.current) return;
      setState({ kind: 'ready', rows, total: (res as { total?: number }).total });
    }).catch((e) => {
      if (id !== reqId.current) return;
      if (isAuthError(e)) { setState({ kind: 'denied' }); return; }
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Query failed' });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey, needsData, live]);

  const fmt = visual.format_config;
  const empty = fmt.emptyMessage ?? 'No data';

  // A filtered table with zero matches must still render its header + filter chips
  // so the user can clear the filter — don't collapse it to the empty state.
  const isTable = visual.visual_type === 'table' || visual.visual_type === 'record_list';
  const keepTableShell = isTable && (tableFilters.length > 0 || !!tableSort);

  // ── status states ───────────────────────────────────────────────────────────
  if (needsData && live) {
    if (state.kind === 'loading') return <Status icon={<Loader2 className="animate-spin" size={16} />} text="Loading…" theme={theme} />;
    if (state.kind === 'denied') return <Status icon={<Lock size={16} />} text="Permission denied" theme={theme} />;
    if (state.kind === 'error') return <Status icon={<AlertTriangle size={16} />} text={state.message} theme={theme} tone="error" />;
    if (state.kind === 'empty' && !keepTableShell) return <Status icon={<Inbox size={16} />} text={empty} theme={theme} color={fmt.emptyStateColor} />;
  }
  const rows = state.kind === 'ready' ? state.rows : [];
  const total = state.kind === 'ready' ? state.total : undefined;

  return <VisualBody visual={visual} theme={theme} rows={rows} total={total} onSelect={onSelect} highlight={highlight} getHighlight={getHighlight} crossFilterForEntity={crossFilterForEntity} onAction={onAction} onFilterChange={onFilterChange} definition={definition} semanticSelections={semanticSelections} live={live} runtimeFilters={runtimeFilters} runtimeRelatedFilters={runtimeRelatedFilters} runtimeSemanticFilters={runtimeSemanticFilters}
    tableFilters={tableFilters} onTableFiltersChange={setTableFilters} tableSort={tableSort} onTableSortChange={setTableSort} />;
}

// ── per-type body ──────────────────────────────────────────────────────────────
function VisualBody({ visual, theme, rows, total, onSelect, highlight, getHighlight, crossFilterForEntity, onAction, onFilterChange, definition, semanticSelections, live, runtimeFilters, runtimeRelatedFilters, runtimeSemanticFilters, tableFilters, onTableFiltersChange, tableSort, onTableSortChange }: {
  visual: DashboardVisual; theme: ThemeConfig; rows: Record<string, unknown>[];
  total?: number; onSelect?: (emit: SelectionEmit) => void; highlight?: Set<string>;
  getHighlight?: (entity: string, fieldId: string | undefined) => Set<string>;
  crossFilterForEntity?: (entity: string) => { filters: VisualFilter[]; semanticFilters: SemanticQueryFilter[] };
  onAction?: (action: ButtonAction | undefined) => void;
  onFilterChange?: (filters: VisualFilter[], opts?: SlicerBroadcastOpts) => void;
  definition?: DashboardDefinition;
  semanticSelections?: Record<string, SlicerSelection>;
  live?: boolean; runtimeFilters?: VisualFilter[];
  runtimeRelatedFilters?: RelatedFilter[]; runtimeSemanticFilters?: SemanticQueryFilter[];
  tableFilters?: VisualFilter[]; onTableFiltersChange?: (f: VisualFilter[]) => void;
  tableSort?: OrderBySpec; onTableSortChange?: (s: OrderBySpec | undefined) => void;
}) {
  const t = visual.visual_type;
  const fmt = visual.format_config;
  const entity = visual.query_config.entity ?? '';

  // Build a selection emit from a click on this visual (the cross-filter bus).
  const emit = (fieldId: string | undefined, value: RawValue, native?: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean }, ordered?: RawValue[]) => {
    if (!onSelect || !fieldId) return;
    onSelect({
      sourceVisualId: visual.dashboard_visual_id, entity, fieldId, value,
      modifiers: { ctrl: !!native?.ctrlKey, shift: !!native?.shiftKey, meta: !!native?.metaKey },
      ordered,
    });
  };

  // ECharts-backed visuals
  const option = buildEChartsOption(visual, rows, theme, highlight);
  if (option) {
    const catField = (visual.query_config.groupBy ?? [])[0]?.field;
    const catKey = (visual.query_config.groupBy ?? [])[0]?.alias ?? catField;
    const ordered: RawValue[] | undefined = catKey
      ? rows.map((r) => ({ raw: rawOf(r, catKey), label: formatLabel(r[catKey]) }))
      : undefined;
    return (
      <ReactECharts
        option={option} style={{ height: '100%', width: '100%' }} notMerge lazyUpdate
        onEvents={onSelect && catKey && catField ? {
          click: (p: { name?: string; dataIndex?: number; event?: { event?: MouseEvent } }) => {
            const native = p?.event?.event;
            const r = p?.dataIndex != null ? rows[p.dataIndex] : undefined;
            const raw = r ? rawOf(r, catKey) : p?.name;
            emit(catField, { raw, label: String(p?.name ?? raw ?? '') }, native, ordered);
          },
        } : undefined}
      />
    );
  }

  switch (t) {
    case 'kpi': return <KpiVisual visual={visual} theme={theme} live={live} runtimeFilters={runtimeFilters} runtimeRelatedFilters={runtimeRelatedFilters} runtimeSemanticFilters={runtimeSemanticFilters} onSelect={onSelect} highlight={highlight} />;
    case 'funnel_stage': return <FunnelStageVisual visual={visual} theme={theme} live={live} runtimeFilters={runtimeFilters} runtimeRelatedFilters={runtimeRelatedFilters} runtimeSemanticFilters={runtimeSemanticFilters} crossFilterForEntity={crossFilterForEntity} onSelect={onSelect} getHighlight={getHighlight} />;
    case 'donut_progress': return <DonutProgressVisual visual={visual} theme={theme} live={live} runtimeFilters={runtimeFilters} runtimeRelatedFilters={runtimeRelatedFilters} runtimeSemanticFilters={runtimeSemanticFilters} />;
    case 'table':
    case 'record_list':
      return <TableVisual visual={visual} theme={theme} rows={rows} total={total} emit={emit} highlight={highlight}
        columnFilters={tableFilters ?? []} onColumnFiltersChange={onTableFiltersChange ?? (() => {})}
        sort={tableSort} onSortChange={onTableSortChange ?? (() => {})} />;
    case 'matrix': return <DataTable visual={visual} theme={theme} rows={rows} total={total} emit={emit} highlight={highlight} />;
    case 'text': return <RichText content={fmt.content ?? ''} theme={theme} fmt={fmt} />;
    case 'html': return <SafeHtml content={fmt.content ?? ''} />;
    case 'image': return fmt.imageUrl
      ? <img src={fmt.imageUrl} alt={visual.title} className="w-full h-full object-contain" />
      : <Status icon={<Inbox size={16} />} text="No image" theme={theme} />;
    case 'shape': return <ShapeBox fmt={fmt} theme={theme} />;
    case 'button': return <ButtonVisual visual={visual} theme={theme} onAction={onAction} />;
    case 'timeline': return <DateSlicerVisual visual={visual} theme={theme} live={live} definition={definition} onFilterChange={onFilterChange} />;
    case 'slicer': return <ValueSlicerVisual visual={visual} theme={theme} live={live} definition={definition} semanticSelections={semanticSelections} onFilterChange={onFilterChange} />;
    default: return <Status icon={<AlertTriangle size={16} />} text={`Unsupported: ${t}`} theme={theme} />;
  }
}

// ── building blocks ─────────────────────────────────────────────────────────────
function DataTable({ visual, theme, rows, total, emit, highlight }: {
  visual: DashboardVisual; theme: ThemeConfig; rows: Record<string, unknown>[]; total?: number;
  emit: (fieldId: string | undefined, value: RawValue, native?: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean }, ordered?: RawValue[]) => void;
  highlight?: Set<string>;
}) {
  const fmt = visual.format_config;
  if (!rows.length) return <Status icon={<Inbox size={16} />} text={fmt.emptyMessage ?? 'No data'} theme={theme} color={fmt.emptyStateColor} />;
  const cols = visual.query_config.columns?.length
    ? visual.query_config.columns
    : Object.keys(rows[0]).filter((k) => k !== '__raw');
  const keyCol = cols[0];
  // Header / row / cell colours fall back to the theme when unset.
  const headerBg = pick(fmt.headerBg, theme.surfaceBackground);
  const headerText = pick(fmt.headerTextColor, theme.secondaryText);
  const rowBg = fmt.rowBg;                         // undefined → inherit card background
  const altRowBg = fmt.altRowBg;
  const cellText = pick(fmt.cellTextColor, theme.primaryText);
  const totalBg = pick(fmt.totalRowBg, theme.surfaceBackground);
  const totalText = pick(fmt.totalRowTextColor, theme.secondaryText);
  const selBg = pick(fmt.selectedRowColor ?? fmt.selectedColor, theme.primaryAccent);
  const accent = pick(fmt.selectedColor, theme.primaryAccent);
  const ordered: RawValue[] = rows.map((r) => ({ raw: rawOf(r, keyCol), label: formatLabel(r[keyCol]) }));
  return (
    <div className="h-full w-full overflow-auto text-[12px]">
      <table className="w-full">
        <thead className="sticky top-0" style={{ background: headerBg }}>
          <tr>{cols.map((c) => (
            <th key={c} className="text-left font-medium px-3 py-1.5 whitespace-nowrap" style={{ color: headerText, borderBottom: `1px solid ${pick(fmt.borderColor, theme.borderColor)}` }}>{c}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const raw = rawOf(r, keyCol);
            const selected = !!highlight?.has(String(raw));
            const baseBg = i % 2 === 1 ? (altRowBg ?? rowBg) : rowBg;
            const dim = highlight && highlight.size > 0 && !selected;
            return (
              <tr key={i} className="cursor-pointer transition-colors"
                style={{ background: selected ? selBg : baseBg, opacity: dim ? 0.45 : 1, boxShadow: selected ? `inset 3px 0 0 ${accent}` : undefined }}
                onMouseEnter={(e) => { if (!selected && fmt.hoverColor) e.currentTarget.style.background = fmt.hoverColor; }}
                onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = baseBg ?? ''; }}
                onClick={(e) => emit(keyCol, { raw, label: formatLabel(r[keyCol]) }, e, ordered)}>
                {cols.map((c, ci) => (
                  <td key={c} className="px-3 py-1.5 whitespace-nowrap" style={{ color: cellText, borderBottom: `1px solid ${pick(fmt.gridLineColor, theme.gridLineColor)}` }}>
                    {ci === 0 && selected && <Check size={11} className="inline mr-1 -mt-0.5" />}
                    {formatLabel(r[c])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {total != null && total > rows.length && (
        <p className="px-3 py-1.5 text-[11px]" style={{ color: totalText, background: totalBg }}>{rows.length} of {total}</p>
      )}
    </div>
  );
}

function RichText({ content, theme, fmt }: { content: string; theme: ThemeConfig; fmt: DashboardVisual['format_config'] }) {
  return (
    <div className="h-full w-full px-3 py-2 flex items-center" style={{
      color: fmt.textColor ?? theme.primaryText, fontSize: fmt.fontSize ?? 14,
      fontWeight: fmt.fontWeight, textAlign: fmt.textAlign,
    }}>
      {content}
    </div>
  );
}

function SafeHtml({ content }: { content: string }) {
  const clean = DOMPurify.sanitize(content, { USE_PROFILES: { html: true } });
  return <div className="h-full w-full overflow-auto p-2" dangerouslySetInnerHTML={{ __html: clean }} />;
}

function ShapeBox({ fmt, theme }: { fmt: DashboardVisual['format_config']; theme: ThemeConfig }) {
  const shape = fmt.shape ?? 'rectangle';
  if (shape === 'line' || shape === 'divider') {
    return <div className="w-full h-full flex items-center"><div className="w-full" style={{ height: 2, background: pick(fmt.lineColor ?? fmt.accentColor, theme.borderColor) }} /></div>;
  }
  return <div className="w-full h-full" style={{
    background: pick(fmt.fillColor ?? fmt.background, theme.surfaceBackground),
    border: `${fmt.borderWidth ?? 1}px solid ${pick(fmt.borderColor ?? fmt.accentColor, theme.borderColor)}`,
    borderRadius: shape === 'rounded' ? 12 : 2,
  }} />;
}

function ButtonVisual({ visual, theme, onAction }: { visual: DashboardVisual; theme: ThemeConfig; onAction?: (a: ButtonAction | undefined) => void }) {
  const fmt = visual.format_config;
  const label = fmt.content ?? 'Button';
  const bg = pick(fmt.buttonBg ?? fmt.accentColor, theme.primaryAccent);
  const text = pick(fmt.buttonTextColor, '#ffffff');
  return (
    <div className="h-full w-full flex items-center justify-center p-2">
      <button
        onClick={() => onAction?.(fmt.buttonAction)}
        className="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors inline-flex items-center gap-1.5"
        style={{ background: bg, color: text }}
        onMouseEnter={(e) => { e.currentTarget.style.background = pick(fmt.buttonHoverBg, bg); e.currentTarget.style.color = pick(fmt.buttonHoverTextColor, text); }}
        onMouseLeave={(e) => { e.currentTarget.style.background = bg; e.currentTarget.style.color = text; }}>
        {label}
      </button>
    </div>
  );
}

function Status({ icon, text, theme, tone, color }: { icon: ReactNode; text: string; theme: ThemeConfig; tone?: 'error'; color?: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-1.5 text-center px-3"
      style={{ color: tone === 'error' ? theme.error : (color || theme.secondaryText) }}>
      {icon}
      <span className="text-[11px] leading-snug">{text}</span>
    </div>
  );
}

// ── error boundary (wrap each visual so one failure can't break the page) ────────
export class VisualErrorBoundary extends Component<{ children: ReactNode; theme: ThemeConfig }, { error: boolean }> {
  constructor(props: { children: ReactNode; theme: ThemeConfig }) { super(props); this.state = { error: false }; }
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) {
      return <Status icon={<AlertTriangle size={16} />} text="Visual failed to render" theme={this.props.theme} tone="error" />;
    }
    return this.props.children;
  }
}
