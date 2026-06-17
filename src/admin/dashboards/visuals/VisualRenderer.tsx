import { useState, useEffect, useRef, Component, type ReactNode } from 'react';
import ReactECharts from 'echarts-for-react';
import DOMPurify from 'dompurify';
import { Loader2, AlertTriangle, Inbox, Lock } from 'lucide-react';
import type { DashboardVisual, ThemeConfig, VisualFilter } from '../types/dashboard';
import { VISUAL_REGISTRY } from './registry';
import { buildEChartsOption } from './echartsOptions';
import { formatNumber, formatLabel } from './formatValue';
import { runAggregate, runRecordQuery } from '../services/queryEngine';
import { resolveAggregateLabels, resolveRecordLabels } from './labelResolver';
import { isAuthError } from '../../../lib/supabase';

interface Props {
  visual: DashboardVisual;
  theme: ThemeConfig;
  /** Extra runtime filters merged into the visual query (cross-filter / global). */
  runtimeFilters?: VisualFilter[];
  /** Click handler for cross-filtering / drill (runtime). */
  onInteract?: (field: string, value: unknown) => void;
  /** When true the visual fetches live data; false keeps it inert (designer add). */
  live?: boolean;
}

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'denied' }
  | { kind: 'ready'; rows: Record<string, unknown>[]; total?: number };

export default function VisualRenderer({ visual, theme, runtimeFilters, onInteract, live = true }: Props) {
  const meta = VISUAL_REGISTRY[visual.visual_type];
  const [state, setState] = useState<State>({ kind: 'loading' });
  const reqId = useRef(0);

  const needsData = meta?.dataMode !== 'none';
  const cfgKey = JSON.stringify([visual.query_config, runtimeFilters]);

  useEffect(() => {
    if (!needsData || !live) { setState({ kind: 'ready', rows: [] }); return; }
    if (!visual.query_config.entity) { setState({ kind: 'empty' }); return; }

    const id = ++reqId.current;
    setState({ kind: 'loading' });
    const merged = {
      ...visual.query_config,
      filters: [...(visual.query_config.filters ?? []), ...(runtimeFilters ?? [])],
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

  // ── status states ───────────────────────────────────────────────────────────
  if (needsData && live) {
    if (state.kind === 'loading') return <Status icon={<Loader2 className="animate-spin" size={16} />} text="Loading…" theme={theme} />;
    if (state.kind === 'denied') return <Status icon={<Lock size={16} />} text="Permission denied" theme={theme} />;
    if (state.kind === 'error') return <Status icon={<AlertTriangle size={16} />} text={state.message} theme={theme} tone="error" />;
    if (state.kind === 'empty') return <Status icon={<Inbox size={16} />} text={empty} theme={theme} />;
  }
  const rows = state.kind === 'ready' ? state.rows : [];
  const total = state.kind === 'ready' ? state.total : undefined;

  return <VisualBody visual={visual} theme={theme} rows={rows} total={total} onInteract={onInteract} />;
}

// ── per-type body ──────────────────────────────────────────────────────────────
function VisualBody({ visual, theme, rows, total, onInteract }: {
  visual: DashboardVisual; theme: ThemeConfig; rows: Record<string, unknown>[];
  total?: number; onInteract?: (field: string, value: unknown) => void;
}) {
  const t = visual.visual_type;
  const fmt = visual.format_config;

  // ECharts-backed visuals
  const option = buildEChartsOption(visual, rows, theme);
  if (option) {
    const catKey = (visual.query_config.groupBy ?? [])[0]?.alias
      ?? (visual.query_config.groupBy ?? [])[0]?.field;
    return (
      <ReactECharts
        option={option} style={{ height: '100%', width: '100%' }} notMerge lazyUpdate
        onEvents={onInteract && catKey ? {
          click: (p: { name?: string }) => { if (p?.name != null) onInteract(catKey, p.name); },
        } : undefined}
      />
    );
  }

  switch (t) {
    case 'kpi': return <KpiCard visual={visual} theme={theme} rows={rows} />;
    case 'funnel_stage': return <FunnelStageCard visual={visual} theme={theme} />;
    case 'table':
    case 'record_list':
    case 'matrix': return <DataTable visual={visual} theme={theme} rows={rows} total={total} onInteract={onInteract} />;
    case 'text': return <RichText content={fmt.content ?? ''} theme={theme} fmt={fmt} />;
    case 'html': return <SafeHtml content={fmt.content ?? ''} />;
    case 'image': return fmt.imageUrl
      ? <img src={fmt.imageUrl} alt={visual.title} className="w-full h-full object-contain" />
      : <Status icon={<Inbox size={16} />} text="No image" theme={theme} />;
    case 'shape': return <ShapeBox fmt={fmt} theme={theme} />;
    case 'button': return <ButtonVisual visual={visual} theme={theme} onInteract={onInteract} />;
    case 'slicer':
    case 'timeline': return <SlicerStub visual={visual} theme={theme} rows={rows} onInteract={onInteract} />;
    default: return <Status icon={<AlertTriangle size={16} />} text={`Unsupported: ${t}`} theme={theme} />;
  }
}

// ── building blocks ─────────────────────────────────────────────────────────────
function KpiCard({ visual, theme, rows }: { visual: DashboardVisual; theme: ThemeConfig; rows: Record<string, unknown>[] }) {
  const valueKey = visual.query_config.aggregations?.[0]?.alias ?? Object.keys(rows[0] ?? {})[0];
  const raw = rows[0]?.[valueKey];
  const value = raw ?? (visual.query_config.aggregations?.[0] ? 0 : null);
  const accent = visual.format_config.accentColor ?? theme.primaryAccent;
  return (
    <div className="h-full w-full flex flex-col justify-center px-4 py-3" style={{ borderTop: `3px solid ${accent}` }}>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: theme.secondaryText }}>{visual.title}</p>
      <p className="text-[28px] font-semibold leading-tight mt-1" style={{ color: theme.primaryText }}>
        {value == null ? (visual.format_config.emptyMessage ?? 'No data') : formatNumber(value, visual.format_config)}
      </p>
      {visual.format_config.subtitle && (
        <p className="text-[11px] mt-0.5" style={{ color: theme.secondaryText }}>{visual.format_config.subtitle}</p>
      )}
    </div>
  );
}

function FunnelStageCard({ visual, theme }: { visual: DashboardVisual; theme: ThemeConfig }) {
  const stages = visual.data_config.stages ?? [];
  if (!stages.length) return <Status icon={<Inbox size={16} />} text="Add stages in properties" theme={theme} />;
  return (
    <div className="h-full w-full flex items-center gap-1 px-2 overflow-x-auto">
      {stages.map((s, i) => (
        <div key={i} className="flex items-center">
          <div className="px-3 py-2 rounded-lg min-w-[110px]" style={{ background: theme.surfaceBackground, border: `1px solid ${theme.borderColor}` }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: theme.secondaryText }}>{s.label}</p>
            <p className="text-[18px] font-semibold" style={{ color: theme.primaryText }}>{formatNumber(s.value ?? 0, visual.format_config)}</p>
          </div>
          {i < stages.length - 1 && <span style={{ color: theme.secondaryText }} className="px-1">→</span>}
        </div>
      ))}
    </div>
  );
}

function DataTable({ visual, theme, rows, total, onInteract }: {
  visual: DashboardVisual; theme: ThemeConfig; rows: Record<string, unknown>[];
  total?: number; onInteract?: (field: string, value: unknown) => void;
}) {
  if (!rows.length) return <Status icon={<Inbox size={16} />} text={visual.format_config.emptyMessage ?? 'No data'} theme={theme} />;
  const cols = visual.query_config.columns?.length ? visual.query_config.columns : Object.keys(rows[0]);
  return (
    <div className="h-full w-full overflow-auto text-[12px]">
      <table className="w-full">
        <thead className="sticky top-0" style={{ background: theme.surfaceBackground }}>
          <tr>{cols.map((c) => (
            <th key={c} className="text-left font-medium px-3 py-1.5 whitespace-nowrap" style={{ color: theme.secondaryText, borderBottom: `1px solid ${theme.borderColor}` }}>{c}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-black/5 cursor-default"
              onClick={() => onInteract?.(cols[0], r[cols[0]])}>
              {cols.map((c) => (
                <td key={c} className="px-3 py-1.5 whitespace-nowrap" style={{ color: theme.primaryText, borderBottom: `1px solid ${theme.gridLineColor}` }}>
                  {formatLabel(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total != null && total > rows.length && (
        <p className="px-3 py-1.5 text-[11px]" style={{ color: theme.secondaryText }}>{rows.length} of {total}</p>
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
    return <div className="w-full h-full flex items-center"><div className="w-full" style={{ height: 2, background: fmt.accentColor ?? theme.borderColor }} /></div>;
  }
  return <div className="w-full h-full" style={{
    background: fmt.background ?? theme.surfaceBackground,
    border: `1px solid ${fmt.accentColor ?? theme.borderColor}`,
    borderRadius: shape === 'rounded' ? 12 : 2,
  }} />;
}

function ButtonVisual({ visual, theme, onInteract }: { visual: DashboardVisual; theme: ThemeConfig; onInteract?: (f: string, v: unknown) => void }) {
  const label = visual.format_config.content ?? 'Button';
  return (
    <div className="h-full w-full flex items-center justify-center p-2">
      <button
        onClick={() => onInteract?.('__action__', visual.format_config.buttonAction)}
        className="px-4 py-1.5 rounded-lg text-[13px] font-medium"
        style={{ background: visual.format_config.accentColor ?? theme.primaryAccent, color: '#fff' }}>
        {label}
      </button>
    </div>
  );
}

function SlicerStub({ visual, theme, rows, onInteract }: {
  visual: DashboardVisual; theme: ThemeConfig; rows: Record<string, unknown>[];
  onInteract?: (f: string, v: unknown) => void;
}) {
  const field = visual.query_config.groupBy?.[0]?.field ?? '';
  const catKey = visual.query_config.groupBy?.[0]?.alias ?? field;
  return (
    <div className="h-full w-full p-2 overflow-auto">
      <p className="text-[11px] mb-1.5" style={{ color: theme.secondaryText }}>{visual.title || 'Filter'}</p>
      <div className="flex flex-wrap gap-1.5">
        {rows.slice(0, 30).map((r, i) => (
          <button key={i} onClick={() => onInteract?.(field, r[catKey])}
            className="px-2 py-1 rounded text-[11px]"
            style={{ background: theme.surfaceBackground, border: `1px solid ${theme.borderColor}`, color: theme.primaryText }}>
            {formatLabel(r[catKey])}
          </button>
        ))}
        {!rows.length && <span className="text-[11px]" style={{ color: theme.secondaryText }}>No values</span>}
      </div>
    </div>
  );
}

function Status({ icon, text, theme, tone }: { icon: ReactNode; text: string; theme: ThemeConfig; tone?: 'error' }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-1.5 text-center px-3"
      style={{ color: tone === 'error' ? theme.error : theme.secondaryText }}>
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
