import { useState, useEffect, useRef } from 'react';
import { Loader2, AlertTriangle, Lock } from 'lucide-react';
import type {
  DashboardVisual, ThemeConfig, VisualFilter, RelatedFilter, SemanticQueryFilter,
  ContentAlign, ChartPosition,
} from '../types/dashboard';
import { formatNumber } from './formatValue';
import { pick } from './colorConfig';
import { fetchDonutProgress, type DonutProgressResult } from './donutProgressQuery';
import { isAuthError } from '../../../lib/supabase';

interface Props {
  visual: DashboardVisual;
  theme: ThemeConfig;
  runtimeFilters?: VisualFilter[];
  runtimeRelatedFilters?: RelatedFilter[];
  runtimeSemanticFilters?: SemanticQueryFilter[];
  live?: boolean;
}

type State =
  | { kind: 'loading' } | { kind: 'empty' } | { kind: 'denied' }
  | { kind: 'error'; message: string } | { kind: 'ready'; data: DonutProgressResult };

// CSS fl-box mappings for the alignment settings (never hard-coded positions).
const alignItems = (a: ContentAlign): string =>
  a === 'left' ? 'flex-start' : a === 'right' ? 'flex-end' : 'center';
const justify = (p: ChartPosition): string =>
  p === 'left' ? 'flex-start' : p === 'right' ? 'flex-end' : 'center';
const textAlign = (a: ContentAlign): 'left' | 'center' | 'right' => a;

// Measure the available box so the donut can scale to fit.
function useBoxSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export default function DonutProgressVisual({
  visual, theme, runtimeFilters, runtimeRelatedFilters, runtimeSemanticFilters, live = true,
}: Props) {
  const cfg = visual.data_config.donutProgress ?? {};
  const fmt = visual.format_config;
  const entity = visual.query_config.entity;

  const baseFilters: VisualFilter[] = [...(visual.query_config.filters ?? []), ...(runtimeFilters ?? [])];
  const baseRelated: RelatedFilter[] = [...(visual.query_config.relatedFilters ?? []), ...(runtimeRelatedFilters ?? [])];
  const baseSemantic: SemanticQueryFilter[] = [...(visual.query_config.semanticFilters ?? []), ...(runtimeSemanticFilters ?? [])];

  const [state, setState] = useState<State>({ kind: 'loading' });
  const reqId = useRef(0);
  const depKey = JSON.stringify([entity, baseFilters, baseRelated, baseSemantic, cfg]);

  useEffect(() => {
    if (!live) { setState({ kind: 'ready', data: { percent: 0, rawPercent: 0, numerator: 0, denominator: 0, empty: true } }); return; }
    if (!entity) { setState({ kind: 'empty' }); return; }
    const id = ++reqId.current;
    setState({ kind: 'loading' });
    fetchDonutProgress({
      entity, cfg, baseFilters, relatedFilters: baseRelated, semanticFilters: baseSemantic,
      filterLogic: visual.query_config.filterLogic,
    }).then((data) => {
      if (id !== reqId.current) return;
      setState({ kind: 'ready', data });
    }).catch((e) => {
      if (id !== reqId.current) return;
      if (isAuthError(e)) { setState({ kind: 'denied' }); return; }
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Query failed' });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, live]);

  if (live) {
    if (state.kind === 'loading') return <Mini icon={<Loader2 className="animate-spin" size={15} />} text="Loading…" theme={theme} />;
    if (state.kind === 'denied') return <Mini icon={<Lock size={15} />} text="Permission denied" theme={theme} />;
    if (state.kind === 'error') return <Mini icon={<AlertTriangle size={15} />} text={state.message} theme={theme} tone="error" />;
    if (state.kind === 'empty') return <Mini icon={<AlertTriangle size={15} />} text={fmt.emptyMessage ?? 'Configure the metric'} theme={theme} color={fmt.emptyStateColor} />;
  }

  const data = state.kind === 'ready' ? state.data : { percent: 0, rawPercent: 0, numerator: 0, denominator: 0, empty: true };
  const contentAlign = fmt.cardContentAlign ?? 'center';
  const chartPos = fmt.chartPosition ?? 'center';
  const legendPos = fmt.legendPosition ?? 'bottom';

  const primary = pick(fmt.donutPrimaryColor, theme.primaryAccent);
  const secondary = pick(fmt.donutSecondaryColor, theme.warning);
  const track = pick(fmt.donutTrackColor, theme.gridLineColor);
  const remainingColor = fmt.donutRemainingAsTrack ? track : secondary;
  const valueColor = pick(fmt.valueColor, theme.primaryText);
  const secondaryText = pick(fmt.secondaryTextColor, theme.secondaryText);

  // Centre label text per mode. The percentage uses a clean number format (no
  // prefix/suffix bleed); the raw 'value' mode keeps the full format (currency,
  // prefix, etc.) since that's the measured quantity itself.
  const pctText = `${formatNumber(round(data.rawPercent, fmt.decimals ?? 0), { numberFormat: 'number', decimals: fmt.decimals ?? 0, thousands: fmt.thousands })}%`;
  const centerMode = cfg.centerLabelMode ?? 'percentage';
  const centerMain = centerMode === 'value' ? formatNumber(data.numerator, fmt) : pctText;
  const centerSub = centerMode === 'percentage_with_label' ? (cfg.centerLabelText || '') : '';

  const completedLabel = cfg.completedLabel || 'Completed';
  const remainingLabel = cfg.remainingLabel || 'Remaining';
  const remainingPct = clamp0(100 - data.percent);

  const legend = legendPos === 'none' ? null : (
    <Legend
      align={contentAlign}
      rows={[
        { color: primary, label: completedLabel, value: data.percent },
        { color: remainingColor, label: remainingLabel, value: remainingPct },
      ]}
      labelColor={secondaryText}
      valueColor={valueColor}
    />
  );

  const donut = (
    <DonutRing
      percent={data.percent}
      primary={primary}
      remaining={remainingColor}
      track={track}
      strokeWidth={fmt.donutStrokeWidth ?? 16}
      startAngle={fmt.donutStartAngle ?? -90}
      roundedEnds={fmt.donutRoundedEnds !== false}
      centerMain={centerMain}
      centerSub={centerSub}
      valueColor={valueColor}
      subColor={secondaryText}
      tooltip={data.rawPercent > 100 ? `${Math.round(data.rawPercent)}% achieved` : undefined}
    />
  );

  // Row layout for left/right legend; column layout for top/bottom/none.
  const horizontal = legendPos === 'left' || legendPos === 'right';
  const order = legendPos === 'left' || legendPos === 'top';

  return (
    <div
      className="h-full w-full flex flex-col px-3 py-2 overflow-hidden gap-1.5"
      style={{ alignItems: alignItems(contentAlign), textAlign: textAlign(contentAlign) }}
    >
      {fmt.subtitle && <p className="text-[11px] shrink-0" style={{ color: secondaryText }}>{fmt.subtitle}</p>}
      <div
        className="flex-1 min-h-0 w-full flex"
        style={{
          flexDirection: horizontal ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: justify(chartPos),
          gap: 12,
        }}
      >
        {order && legend}
        <div className="min-h-0 min-w-0 flex-1 flex items-center" style={{ justifyContent: justify(chartPos) }}>
          {donut}
        </div>
        {!order && legend}
      </div>
    </div>
  );
}

// ── Donut ring (SVG) ─────────────────────────────────────────────────────────
function DonutRing({
  percent, primary, remaining, track, strokeWidth, startAngle, roundedEnds,
  centerMain, centerSub, valueColor, subColor, tooltip,
}: {
  percent: number; primary: string; remaining: string; track: string;
  strokeWidth: number; startAngle: number; roundedEnds: boolean;
  centerMain: string; centerSub: string; valueColor: string; subColor: string; tooltip?: string;
}) {
  const [boxRef, size] = useBoxSize();
  // Square that fits the available box (leave a little breathing room).
  const px = Math.max(48, Math.min(size.w, size.h) - 4);
  const sw = Math.max(2, Math.min(40, strokeWidth));
  const r = 50 - sw / 2 - 1;                 // radius in a 100×100 viewBox
  const C = 2 * Math.PI * r;
  const frac = clamp0(percent) / 100;
  const dash = frac * C;
  const cap = roundedEnds ? 'round' : 'butt';

  return (
    <div ref={boxRef} className="w-full h-full flex items-center justify-center" title={tooltip}>
      <div className="relative" style={{ width: px, height: px }}>
        <svg viewBox="0 0 100 100" width={px} height={px} role="img" aria-label={centerMain}>
          {/* track */}
          <circle cx={50} cy={50} r={r} fill="none" stroke={track} strokeWidth={sw} />
          {/* remaining segment (full ring under the primary, hinting the secondary colour) */}
          {remaining !== track && (
            <circle cx={50} cy={50} r={r} fill="none" stroke={remaining} strokeWidth={sw} opacity={0.5} />
          )}
          {/* primary / completed arc */}
          <circle
            cx={50} cy={50} r={r} fill="none" stroke={primary} strokeWidth={sw}
            strokeLinecap={cap}
            strokeDasharray={`${dash} ${C - dash}`}
            transform={`rotate(${startAngle} 50 50)`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2 pointer-events-none">
          <span className="font-semibold leading-none" style={{ color: valueColor, fontSize: px * 0.22 }}>
            {centerMain}
          </span>
          {centerSub && (
            <span className="leading-tight mt-1" style={{ color: subColor, fontSize: px * 0.09 }}>
              {centerSub}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Legend ───────────────────────────────────────────────────────────────────
function Legend({ rows, labelColor, valueColor, align }: {
  rows: { color: string; label: string; value: number }[];
  labelColor: string; valueColor: string; align: ContentAlign;
}) {
  return (
    <div className="flex flex-col gap-1 shrink-0" style={{ alignItems: alignItems(align) }}>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[11px] whitespace-nowrap">
          <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />
          <span style={{ color: labelColor }}>{r.label}</span>
          <span className="font-medium" style={{ color: valueColor }}>{Math.round(r.value)}%</span>
        </div>
      ))}
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

function clamp0(n: number): number { return n < 0 ? 0 : n; }
function round(n: number, decimals: number): number {
  const f = Math.pow(10, Math.max(0, decimals));
  return Math.round(n * f) / f;
}
