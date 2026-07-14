import { useState, useEffect, useRef } from 'react';
import { Loader2, AlertTriangle, Inbox, ChevronRight, ChevronDown } from 'lucide-react';
import type {
  DashboardVisual, ThemeConfig, VisualFilter, RelatedFilter, SemanticQueryFilter, FunnelStage, AggFn, NumberFormat,
} from '../types/dashboard';
import { loadColumnMeta } from './labelResolver';
import { formatNumber } from './formatValue';
import { pick } from './colorConfig';
import { STAGE_ICONS } from './stageIcons';
import { fetchBreakdown, type BreakdownItem } from './breakdownQuery';
import BreakdownList from './BreakdownList';
import type { SelectionEmit } from './useCrossFilter';
import { isAuthError } from '../../../lib/supabase';

interface Props {
  visual: DashboardVisual;
  theme: ThemeConfig;
  runtimeFilters?: VisualFilter[];
  /** Global cross-entity filters — applied per stage whose entity matches. */
  runtimeRelatedFilters?: RelatedFilter[];
  runtimeSemanticFilters?: SemanticQueryFilter[];
  live?: boolean;
  /** Cross-filter selection emitted when a stage / breakdown row is clicked. */
  onSelect?: (emit: SelectionEmit) => void;
  /** Per-(entity, field) selected raws — each stage breaks down its own field. */
  getHighlight?: (entity: string, fieldId: string | undefined) => Set<string>;
  /** Interactive cross-filters for an arbitrary entity — resolved PER STAGE so a
   *  selection anywhere on the dashboard filters each stage by its own entity
   *  (the card's own query_config.entity is null, so this is the only path in). */
  crossFilterForEntity?: (entity: string) => { filters: VisualFilter[]; semanticFilters: SemanticQueryFilter[] };
  /** GLOBAL slicer filters (e.g. the timeline date slicer) resolved PER STAGE against
   *  each stage's own entity. The card's base entity is null, so dashboard-wide
   *  semantic filters can only reach a stage through this per-entity resolution. */
  semanticForEntity?: (entity: string) => { runtimeFilters: VisualFilter[]; semanticFilters: SemanticQueryFilter[] };
}

interface StageResult { total: number | null; breakdown: BreakdownItem[]; error?: boolean }
type State =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; results: StageResult[] };

/** Aggregations that don't need a measure field (count over rows). */
function measureToAgg(m: FunnelStage['measure']): AggFn {
  switch (m) {
    case 'count_distinct': return 'count_distinct';
    case 'sum': return 'sum';
    case 'avg': return 'avg';
    case 'min': return 'min';
    case 'max': return 'max';
    default: return 'count';
  }
}

/**
 * Remap dashboard-wide runtime filters onto a stage's own entity. A filter is
 * kept when (a) the stage declares a semantic mapping for its field, or (b) the
 * field physically exists on the stage entity. Anything else is dropped so the
 * query never references a column the stage's table lacks.
 */
function filtersForStage(
  stage: FunnelStage, runtime: VisualFilter[], stageColumns: Set<string> | null,
): VisualFilter[] {
  const out: VisualFilter[] = [...(stage.filters ?? [])];
  for (const f of runtime) {
    const mapped = stage.semanticMap?.find((m) => m.source === f.field);
    if (mapped) { out.push({ ...f, field: mapped.target }); continue; }
    if (stageColumns && stageColumns.has(f.field)) { out.push(f); continue; }
    // No mapping and column absent on this entity → skip (avoid "column not found").
  }
  return out;
}

/** Whether a stage shows a breakdown body (Total + Breakdown or Breakdown only). */
function hasBreakdownMode(s: FunnelStage): boolean {
  return (s.displayMode === 'breakdown' || s.displayMode === 'breakdown_only') && !!s.breakdownField;
}

export default function FunnelStageVisual({ visual, theme, runtimeFilters, runtimeRelatedFilters, runtimeSemanticFilters, crossFilterForEntity, semanticForEntity, live = true, onSelect, getHighlight }: Props) {
  const fmt = visual.format_config;
  const stages = visual.data_config.stages ?? [];
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const reqId = useRef(0);

  const runtime = runtimeFilters ?? [];
  // Path-based global filters are resolved for the visual's base entity, so they
  // only apply to stages that share that entity (per-stage path resolution n/a).
  const baseEntity = visual.query_config.entity;
  const related = runtimeRelatedFilters ?? [];
  const semantic = runtimeSemanticFilters ?? [];
  // Interactive cross-filters resolved against EACH stage's own entity — a click
  // anywhere (Product, a Lead status, another card) filters every stage it relates
  // to, in both directions (same-entity direct + cross-entity semantic path).
  const crossByStage = stages.map((s) => (s.entity ? crossFilterForEntity?.(s.entity) : undefined));
  // Dashboard-wide global filters (the date slicer) resolved against each stage's
  // OWN entity — the only way a global filter reaches a stage, since the card has
  // no single base entity to resolve against centrally.
  const globalByStage = stages.map((s) => (s.entity ? semanticForEntity?.(s.entity) : undefined));
  const depKey = JSON.stringify([stages, runtime, related, semantic, baseEntity, crossByStage, globalByStage, live]);

  useEffect(() => {
    if (!live) {
      // Designer (inert) — show each stage's design-time fallback value.
      setState({ kind: 'ready', results: stages.map((s) => ({ total: s.value ?? null, breakdown: [] })) });
      return;
    }
    if (!stages.length) { setState({ kind: 'ready', results: [] }); return; }
    const id = ++reqId.current;
    setState({ kind: 'loading' });

    (async () => {
      const results = await Promise.all(stages.map(async (s, i): Promise<StageResult> => {
        if (!s.entity) return { total: s.value ?? null, breakdown: [] };
        // Resolve which columns exist on this stage's entity so global filters
        // that don't apply are dropped rather than erroring.
        let cols: Set<string> | null = null;
        try {
          const meta = await loadColumnMeta(s.entity);
          if (meta) cols = new Set(meta.byColumn.keys());
        } catch { /* fall back to mapping-only filtering */ }

        const agg = measureToAgg(s.measure);
        const needsField = agg !== 'count' && agg !== 'count_distinct';
        // sum/avg/min/max require a field — bail to null if missing.
        if (needsField && !s.field) return { total: null, breakdown: [] };
        // Per-stage interactive cross-filters: same-entity selections become direct
        // filters; cross-entity selections become server-side semantic paths.
        const cross = crossByStage[i];
        // Dashboard-wide global filters (date slicer) resolved for THIS stage's entity:
        // direct mappings → runtime column filters, path mappings → semantic EXISTS.
        const global = globalByStage[i];
        const filters = [
          ...filtersForStage(s, [...runtime, ...(global?.runtimeFilters ?? [])], cols),
          ...(cross?.filters ?? []),
        ];
        // Global path/related filters only apply where the stage entity matches
        // the base entity they were resolved against.
        const sameEntity = baseEntity && s.entity === baseEntity;
        const stageSemantic = [...(sameEntity ? semantic : []), ...(global?.semanticFilters ?? []), ...(cross?.semanticFilters ?? [])];
        const data = await fetchBreakdown({
          entity: s.entity, agg, field: s.field,
          baseFilters: filters,
          relatedFilters: sameEntity ? related : undefined,
          semanticFilters: stageSemantic.length ? stageSemantic : undefined,
          filterLogic: s.filterLogic,
          includeBreakdown: hasBreakdownMode(s),
          breakdownField: s.breakdownField, breakdownLimit: s.breakdownLimit,
          breakdownSort: s.breakdownSort, breakdownValues: s.breakdownValues,
          showZeroValues: s.showZeroValues, showEmptyValues: s.showEmptyValues,
          customBreakdownItems: s.customBreakdownItems,
        });
        return { total: data.total, breakdown: data.breakdown };
      }));
      if (id !== reqId.current) return;
      setState({ kind: 'ready', results });
    })().catch((e) => {
      if (id !== reqId.current) return;
      if (isAuthError(e)) { setState({ kind: 'denied' }); return; }
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Query failed' });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  if (!stages.length) {
    return <Status icon={<Inbox size={16} />} text={fmt.emptyMessage ?? 'Add stages in the Data tab'} theme={theme} color={fmt.emptyStateColor} />;
  }
  if (live) {
    if (state.kind === 'loading') return <Status icon={<Loader2 className="animate-spin" size={16} />} text="Loading…" theme={theme} />;
    if (state.kind === 'denied') return <Status icon={<AlertTriangle size={16} />} text="Permission denied" theme={theme} />;
    if (state.kind === 'error') return <Status icon={<AlertTriangle size={16} />} text={state.message} theme={theme} tone="error" />;
  }
  const results = state.kind === 'ready' ? state.results : stages.map(() => ({ total: null as number | null, breakdown: [] as BreakdownItem[] }));

  // ── layout / chrome ─────────────────────────────────────────────────────────
  const vertical = fmt.funnelLayout === 'vertical';
  const compact = !!fmt.compactStages;
  const showArrows = fmt.showArrows !== false;
  const showConversion = fmt.showConversion !== false;
  const convDecimals = fmt.conversionDecimals ?? 0;
  const gap = fmt.stageGap ?? 8;
  const radius = fmt.borderRadius ?? theme.borderRadius ?? 10;
  const cardW = fmt.stageCardWidth;
  const cardH = fmt.stageCardHeight;
  const wrap = !!fmt.wrapStages;
  // Stretch stages to fill the card width (horizontal, non-wrapping) instead of
  // packing them left with dead space on the right.
  const fit = !!fmt.fitStages && !vertical && !wrap;
  const scroll = fmt.scrollStages !== false && !vertical && !wrap && !fit;

  const labelColor = pick(fmt.secondaryTextColor, theme.secondaryText);
  const valueColor = pick(fmt.valueColor, theme.primaryText);
  const subtitleColor = pick(fmt.subtitleColor ?? fmt.secondaryTextColor, theme.secondaryText);
  const totalLabelColor = pick(fmt.totalLabelColor ?? fmt.secondaryTextColor, theme.secondaryText);
  const bdLabelColor = pick(fmt.breakdownLabelColor ?? fmt.secondaryTextColor, theme.secondaryText);
  const bdValueColor = pick(fmt.breakdownValueColor, theme.primaryText);
  const arrowColor = pick(fmt.arrowColor ?? fmt.accentColor, theme.secondaryText);
  const arrowSize = fmt.arrowSize ?? 18;
  const cardBg = pick(fmt.background, theme.surfaceBackground);
  const cardBorder = pick(fmt.borderColor, theme.borderColor);

  const toggleSelect = (stage: FunnelStage, e: React.MouseEvent) => {
    const additive = e.ctrlKey || e.metaKey;
    setSelected((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      if (prev.has(stage.id) && (additive || prev.size === 1)) next.delete(stage.id);
      else next.add(stage.id);
      return next;
    });
    // Forward to the dashboard cross-filter bus when wired. Each stage filters by
    // its own measured field (or a stable stage marker when counting rows).
    const field = stage.field || stage.entity || '__stage__';
    onSelect?.({
      sourceVisualId: visual.dashboard_visual_id,
      entity: stage.entity || visual.query_config.entity || '',
      fieldId: field,
      value: { raw: stage.label, label: stage.label },
      modifiers: { ctrl: e.ctrlKey, shift: e.shiftKey, meta: e.metaKey },
    });
  };

  // Conversion shown on the connector AFTER stage i (the i → i+1 transition).
  // Preferred: the share of THIS stage's own records that advanced — the breakdown
  // rows whose value matches the stage's `conversionValue` (e.g. "Converted to
  // Lead", "Qualified") over the stage total. That is a real pipeline conversion
  // and is always ≤ 100%. When no conversionValue is configured it falls back to
  // the raw count ratio next/current (a subset funnel where each stage ⊆ the prior).
  const stageConversion = (i: number): number | null => {
    const r = results[i];
    const total = r?.total;
    if (total == null || total === 0) return null; // div-by-zero / no data
    const cv = stages[i]?.conversionValue;
    if (cv != null && cv !== '') {
      const want = String(cv);
      const advanced = (r?.breakdown ?? [])
        .filter((b) => String(b.raw) === want || b.label === want)
        .reduce((sum, b) => sum + (b.value ?? 0), 0);
      return (advanced / total) * 100;
    }
    const nxt = results[i + 1]?.total;
    if (nxt == null) return null;
    return (nxt / total) * 100;
  };

  const ArrowIcon = vertical ? ChevronDown : ChevronRight;

  return (
    <div
      className={`h-full w-full p-2 flex ${vertical ? 'flex-col' : 'flex-row'} ${wrap ? 'flex-wrap' : ''} ${scroll ? 'overflow-x-auto' : 'overflow-hidden'} ${vertical ? 'overflow-y-auto items-stretch' : 'items-stretch'}`}
      style={{ gap }}
    >
      {stages.map((s, i) => {
        const r = results[i];
        const accent = pick(s.color ?? fmt.accentColor, theme.primaryAccent);
        const isSel = selected.has(s.id);
        const conv = stageConversion(i);
        const breakdown = r?.breakdown ?? [];
        const stageHasBreakdown = hasBreakdownMode(s) && breakdown.length > 0;
        const breakdownOnly = s.displayMode === 'breakdown_only';
        // Card-level click filters only for simple stages; breakdown stages filter
        // through their rows (drill-through still uses the card click).
        const clickable = (s.interaction ?? 'filter') !== 'none'
          && (!stageHasBreakdown || s.interaction === 'drillthrough');
        const Icon = s.icon ? STAGE_ICONS[s.icon] : undefined;
        const stageFmt = { numberFormat: s.numberFormat ?? defaultFmtFor(s.measure, fmt.numberFormat), decimals: fmt.decimals, prefix: s.prefix, suffix: s.suffix };
        const detailed = (s.stageLayout ?? 'detailed') !== 'compact';
        const enableClick = s.enableClickFilter !== false;
        const stageHighlight = enableClick ? getHighlight?.(s.entity ?? '', s.breakdownField) : undefined;
        // When multi-select is off, collapse ctrl/shift so every click is a plain toggle.
        const rowSelect = !enableClick ? undefined
          : s.enableMultiSelect === false
            ? (emit: SelectionEmit) => onSelect?.({ ...emit, modifiers: { ctrl: false, shift: false, meta: false } })
            : onSelect;
        const minW = vertical ? undefined : (cardW ?? (stageHasBreakdown ? 200 : compact ? 96 : 120));
        return (
          <div key={s.id} className={`flex items-stretch ${vertical ? 'flex-col' : 'flex-row'} ${fit ? 'flex-1 min-w-0' : 'shrink-0'}`} style={{ gap }}>
            <div
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? (e) => toggleSelect(s, e) : undefined}
              className={`relative flex flex-col ${stageHasBreakdown ? 'justify-start' : 'justify-center'} ${compact ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5'} transition-shadow overflow-hidden ${clickable ? 'cursor-pointer' : ''}`}
              style={{
                background: cardBg,
                borderRadius: radius,
                border: `1px solid ${isSel ? accent : cardBorder}`,
                borderTop: `3px solid ${accent}`,
                boxShadow: isSel ? `0 0 0 2px ${accent}55` : undefined,
                minWidth: minW,
                width: vertical ? (cardW ?? (stageHasBreakdown ? 240 : undefined)) : undefined,
                minHeight: cardH ?? undefined,
                flex: vertical ? '0 0 auto' : (wrap || fit ? '1 1 auto' : '0 0 auto'),
              }}
            >
              <div className="flex items-center gap-1.5 shrink-0">
                {Icon && <Icon size={compact ? 12 : 14} style={{ color: pick(fmt.iconColor, accent) }} className="shrink-0" />}
                <p className={`uppercase tracking-wide truncate ${compact ? 'text-[9px]' : 'text-[10px]'}`} style={{ color: labelColor }} title={s.label}>
                  {s.label || '—'}
                </p>
              </div>
              {!breakdownOnly && (
                <p className={`font-semibold leading-tight shrink-0 ${compact ? 'text-[15px]' : 'text-[20px]'}`} style={{ color: valueColor }}>
                  {r?.total == null ? '—' : formatNumber(r.total, stageFmt)}
                </p>
              )}
              {s.totalLabel && !breakdownOnly && (
                <p className="text-[10px] -mt-0.5 shrink-0" style={{ color: totalLabelColor }} title={s.totalLabel}>{s.totalLabel}</p>
              )}
              {fmt.showStageSubtitle !== false && s.subtitle && (
                <p className={`truncate shrink-0 ${compact ? 'text-[9px]' : 'text-[10px]'} mt-0.5`} style={{ color: subtitleColor }} title={s.subtitle}>
                  {s.subtitle}
                </p>
              )}

              {/* Breakdown body — reuses the KPI card's renderer + selection logic. */}
              {stageHasBreakdown && (
                <div className="flex-1 min-h-0 overflow-y-auto mt-1.5">
                  <BreakdownList
                    items={breakdown} total={r?.total ?? 0} detailed={detailed && s.showProgressBars !== false}
                    showPercentages={s.showPercentages}
                    colors={{ accent, labelColor: bdLabelColor, valueColor: bdValueColor, trackColor: pick(fmt.breakdownTrackColor, theme.gridLineColor), colorByValue: s.colorByValue }}
                    numberFormat={stageFmt.numberFormat} decimals={fmt.decimals}
                    sourceVisualId={visual.dashboard_visual_id} entity={s.entity ?? ''}
                    fieldId={enableClick ? s.breakdownField : undefined}
                    onSelect={rowSelect} highlight={stageHighlight}
                  />
                </div>
              )}
            </div>

            {/* Connector to the next stage (arrow + optional conversion %). */}
            {i < stages.length - 1 && showArrows && (
              <div className={`flex ${vertical ? 'flex-row justify-center' : 'flex-col'} items-center justify-center shrink-0`} style={{ minWidth: vertical ? undefined : 24 }}>
                <ArrowIcon size={arrowSize} style={{ color: arrowColor }} />
                {showConversion && conv != null && (
                  <span className="text-[9px] font-medium tabular-nums leading-none" style={{ color: arrowColor }}>
                    {formatNumber(conv, { numberFormat: 'percentage', decimals: convDecimals })}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Counts render as plain numbers; value measures inherit the card's format. */
function defaultFmtFor(measure: FunnelStage['measure'], visualFmt?: NumberFormat): NumberFormat {
  if (measure === 'count' || measure === 'count_distinct' || !measure) {
    return visualFmt === 'compact' ? 'compact' : 'number';
  }
  return visualFmt ?? 'number';
}

function Status({ icon, text, theme, tone, color }: { icon: React.ReactNode; text: string; theme: ThemeConfig; tone?: 'error'; color?: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-1.5 text-center px-3"
      style={{ color: tone === 'error' ? theme.error : (color || theme.secondaryText) }}>
      {icon}<span className="text-[11px] leading-snug">{text}</span>
    </div>
  );
}
