import { useState, useEffect, useRef } from 'react';
import { Loader2, AlertTriangle, Inbox, Lock } from 'lucide-react';
import type { DashboardVisual, ThemeConfig, VisualFilter, RelatedFilter, SemanticQueryFilter, AggFn } from '../types/dashboard';
import { formatNumber } from './formatValue';
import { pick } from './colorConfig';
import type { SelectionEmit } from './useCrossFilter';
import { fetchBreakdown, type BreakdownData } from './breakdownQuery';
import BreakdownList from './BreakdownList';
import { isAuthError } from '../../../lib/supabase';

interface Props {
  visual: DashboardVisual;
  theme: ThemeConfig;
  runtimeFilters?: VisualFilter[];
  runtimeRelatedFilters?: RelatedFilter[];
  runtimeSemanticFilters?: SemanticQueryFilter[];
  live?: boolean;
  /** Cross-filter selection (click / ctrl / shift) on a breakdown row. */
  onSelect?: (emit: SelectionEmit) => void;
  /** Raw breakdown values currently selected — emphasised, others dimmed. */
  highlight?: Set<string>;
}

type Data = BreakdownData;
type State =
  | { kind: 'loading' } | { kind: 'empty' } | { kind: 'denied' }
  | { kind: 'error'; message: string } | { kind: 'ready'; data: Data };

export default function KpiVisual({ visual, theme, runtimeFilters, runtimeRelatedFilters, runtimeSemanticFilters, live = true, onSelect, highlight }: Props) {
  const d = visual.data_config;
  const fmt = visual.format_config;
  const entity = visual.query_config.entity;
  const mode = d.kpiMode ?? 'simple';
  const mainAgg: AggFn = d.mainAgg ?? visual.query_config.aggregations?.[0]?.fn ?? 'count';
  const mainField = d.mainField ?? (visual.query_config.aggregations?.[0]?.field !== '*' ? visual.query_config.aggregations?.[0]?.field : undefined);
  const accent = fmt.accentColor ?? theme.primaryAccent;

  const [state, setState] = useState<State>({ kind: 'loading' });
  const reqId = useRef(0);

  const baseFilters: VisualFilter[] = [...(visual.query_config.filters ?? []), ...(runtimeFilters ?? [])];
  const baseRelated: RelatedFilter[] = [...(visual.query_config.relatedFilters ?? []), ...(runtimeRelatedFilters ?? [])];
  const baseSemantic: SemanticQueryFilter[] = [...(visual.query_config.semanticFilters ?? []), ...(runtimeSemanticFilters ?? [])];
  const depKey = JSON.stringify([entity, baseFilters, baseRelated, baseSemantic, d.kpiMode, mainAgg, mainField, d.breakdownField,
    d.breakdownLimit, d.breakdownSort, d.breakdownValues, d.showZeroValues, d.showEmptyValues, d.customBreakdownItems]);

  useEffect(() => {
    if (!live) { setState({ kind: 'ready', data: { total: 0, breakdown: [] } }); return; }
    if (!entity) { setState({ kind: 'empty' }); return; }
    const id = ++reqId.current;
    setState({ kind: 'loading' });

    (async () => {
      const data = await fetchBreakdown({
        entity, agg: mainAgg, field: mainField,
        baseFilters, relatedFilters: baseRelated, semanticFilters: baseSemantic,
        includeBreakdown: mode === 'breakdown',
        breakdownField: d.breakdownField, breakdownLimit: d.breakdownLimit,
        breakdownSort: d.breakdownSort, breakdownValues: d.breakdownValues,
        showZeroValues: d.showZeroValues, showEmptyValues: d.showEmptyValues,
        customBreakdownItems: d.customBreakdownItems,
      });
      if (id !== reqId.current) return;
      setState({ kind: 'ready', data });
    })().catch((e) => {
      if (id !== reqId.current) return;
      if (isAuthError(e)) { setState({ kind: 'denied' }); return; }
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Query failed' });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, live]);

  // ── states ────────────────────────────────────────────────────────────────
  if (live) {
    if (state.kind === 'loading') return <Mini icon={<Loader2 className="animate-spin" size={15} />} text="Loading…" theme={theme} />;
    if (state.kind === 'denied') return <Mini icon={<Lock size={15} />} text="Permission denied" theme={theme} />;
    if (state.kind === 'error') return <Mini icon={<AlertTriangle size={15} />} text={state.message} theme={theme} tone="error" />;
    if (state.kind === 'empty') return <Mini icon={<Inbox size={15} />} text={fmt.emptyMessage ?? 'No data'} theme={theme} color={fmt.emptyStateColor} />;
  }

  const data = state.kind === 'ready' ? state.data : { total: 0, breakdown: [] };
  const detailed = (d.kpiLayout ?? 'detailed') === 'detailed';

  // Per-visual colours fall back to the theme when unset.
  const titleColor = pick(fmt.titleColor ?? fmt.secondaryTextColor, theme.secondaryText);
  const valueColor = pick(fmt.valueColor, theme.primaryText);
  const totalLabelColor = pick(fmt.totalLabelColor ?? fmt.secondaryTextColor, theme.secondaryText);
  const bdLabelColor = pick(fmt.breakdownLabelColor ?? fmt.secondaryTextColor, theme.secondaryText);
  const bdValueColor = pick(fmt.breakdownValueColor, theme.primaryText);
  const trackColor = pick(fmt.breakdownTrackColor, theme.gridLineColor);

  return (
    <div className="h-full w-full flex flex-col px-4 py-3 overflow-hidden" style={{ borderTop: `3px solid ${accent}` }}>
      <p className="text-[11px] font-medium uppercase tracking-wide shrink-0" style={{ color: titleColor }}>{visual.title}</p>
      <p className="text-[30px] font-semibold leading-tight shrink-0" style={{ color: valueColor }}>
        {formatNumber(data.total, fmt)}
      </p>
      {d.totalLabel && <p className="text-[11px] -mt-0.5 mb-1 shrink-0" style={{ color: totalLabelColor }}>{d.totalLabel}</p>}

      {mode === 'breakdown' && data.breakdown.length === 0 && (
        <p className="text-[11px] mt-1 shrink-0" style={{ color: pick(fmt.emptyStateColor, theme.secondaryText) }}>
          {fmt.emptyMessage ?? 'No data'}
        </p>
      )}

      {data.breakdown.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto mt-1.5">
          <BreakdownList
            items={data.breakdown} total={data.total} detailed={detailed}
            showPercentages={d.showPercentages}
            colors={{ accent, labelColor: bdLabelColor, valueColor: bdValueColor, trackColor, colorByValue: fmt.colorByValue }}
            numberFormat={fmt.numberFormat} decimals={fmt.decimals}
            sourceVisualId={visual.dashboard_visual_id} entity={entity ?? ''}
            fieldId={d.breakdownField} onSelect={onSelect} highlight={highlight}
          />
        </div>
      )}
    </div>
  );
}

function Mini({ icon, text, theme, tone, color }: { icon: React.ReactNode; text: string; theme: ThemeConfig; tone?: 'error'; color?: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-1 text-center px-3"
      style={{ color: tone === 'error' ? theme.error : (color || theme.secondaryText) }}>
      {icon}<span className="text-[11px] leading-snug">{text}</span>
    </div>
  );
}
