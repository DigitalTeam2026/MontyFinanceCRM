// Inline-SVG chart primitives for the analytics dashboard. No chart library —
// these are lightweight, theme-token-coloured, and every segment/bar/point is
// clickable so the dashboard can drill into a filtered list.
//
// All colours come from theme tokens (var(--…)) or the categorical palette in
// ./theme; nothing here uses a raw hex literal.

import { labelColor, formatCount } from './theme';

export interface Datum {
  label: string;
  value: number;
  /** Optional explicit colour; defaults to the semantic/positional palette. */
  color?: string;
  /** Optional secondary measure shown as an inset bar (e.g. converted count). */
  secondary?: number;
  /** Raw value to pass to onClick (e.g. the underlying status code). */
  raw?: string;
}

// ── Donut ────────────────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  const a = (angle - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
  // Guard full circles (an exact 360° arc collapses to a point).
  const sweep = end - start;
  const e = sweep >= 360 ? start + 359.999 : end;
  const [ox1, oy1] = polar(cx, cy, rOuter, start);
  const [ox2, oy2] = polar(cx, cy, rOuter, e);
  const [ix2, iy2] = polar(cx, cy, rInner, e);
  const [ix1, iy1] = polar(cx, cy, rInner, start);
  const large = sweep > 180 ? 1 : 0;
  return [
    `M ${ox1} ${oy1}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${ix1} ${iy1}`,
    'Z',
  ].join(' ');
}

/** Key used to match a datum against the active drill-down selection. */
function datumKey(d: Datum): string {
  return d.raw ?? d.label;
}

/** Opacity for a datum given the current selection (non-selected dim to ~30%). */
function dimOpacity(d: Datum, selectedKey?: string | null): number {
  if (selectedKey == null) return 1;
  return datumKey(d) === selectedKey ? 1 : 0.3;
}

interface DonutProps {
  data: Datum[];
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
  onSliceClick?: (d: Datum) => void;
  /** When set, the matching slice stays opaque and siblings dim. */
  selectedKey?: string | null;
}

export function Donut({ data, size = 160, thickness = 26, centerValue, centerLabel, onSliceClick, selectedKey }: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2;
  const rInner = rOuter - thickness;

  let angle = 0;
  const slices = data.map((d, i) => {
    const frac = total > 0 ? d.value / total : 0;
    const start = angle;
    const end = angle + frac * 360;
    angle = end;
    return { d, i, start, end, color: d.color ?? labelColor(d.label, i) };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Donut chart">
      {total === 0 ? (
        <circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} fill="none" stroke="var(--border)" strokeWidth={thickness} />
      ) : (
        slices.map(({ d, i, start, end, color }) => (
          <path
            key={i}
            d={arcPath(cx, cy, rOuter, rInner, start, end)}
            fill={color}
            stroke="var(--surface)"
            strokeWidth={1.5}
            opacity={dimOpacity(d, selectedKey)}
            style={{ cursor: onSliceClick ? 'pointer' : 'default', transition: 'opacity .15s ease' }}
            onClick={onSliceClick ? () => onSliceClick(d) : undefined}
            onMouseEnter={(e) => { (e.currentTarget as SVGPathElement).style.opacity = '0.82'; }}
            onMouseLeave={(e) => { (e.currentTarget as SVGPathElement).style.opacity = String(dimOpacity(d, selectedKey)); }}
          >
            <title>{`${d.label}: ${formatCount(d.value)}`}</title>
          </path>
        ))
      )}
      {(centerValue !== undefined || centerLabel) && (
        <>
          <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: 24, fontWeight: 700, fill: 'var(--text)' }}>
            {centerValue}
          </text>
          {centerLabel && (
            <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: 11, fill: 'var(--muted)' }}>
              {centerLabel}
            </text>
          )}
        </>
      )}
    </svg>
  );
}

interface LegendProps {
  data: Datum[];
  onItemClick?: (d: Datum) => void;
  selectedKey?: string | null;
}

/** Vertical legend with value (and right-aligned counts), used beside a Donut. */
export function Legend({ data, onItemClick, selectedKey }: LegendProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
      {data.map((d, i) => (
        <button
          key={i}
          onClick={onItemClick ? () => onItemClick(d) : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
            padding: 0, cursor: onItemClick ? 'pointer' : 'default', width: '100%', textAlign: 'left',
            opacity: dimOpacity(d, selectedKey), transition: 'opacity .15s ease',
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color ?? labelColor(d.label, i), flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.label}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{formatCount(d.value)}</span>
        </button>
      ))}
    </div>
  );
}

// ── Horizontal bars ──────────────────────────────────────────────────────────

interface HBarsProps {
  data: Datum[];
  /** Label for the secondary inset measure, shown in a small caption if present. */
  secondaryLabel?: string;
  onBarClick?: (d: Datum) => void;
  selectedKey?: string | null;
}

export function HBars({ data, secondaryLabel, onBarClick, selectedKey }: HBarsProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const hasSecondary = data.some((d) => d.secondary !== undefined);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {hasSecondary && secondaryLabel && (
        <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--success)' }} />
          {secondaryLabel}
        </div>
      )}
      {data.map((d, i) => {
        const color = d.color ?? labelColor(d.label, i);
        const w = (d.value / max) * 100;
        const sw = d.secondary !== undefined ? (d.secondary / max) * 100 : 0;
        return (
          <button
            key={i}
            onClick={onBarClick ? () => onBarClick(d) : undefined}
            style={{
              display: 'block', width: '100%', background: 'none', border: 'none', padding: 0,
              cursor: onBarClick ? 'pointer' : 'default', textAlign: 'left',
              opacity: dimOpacity(d, selectedKey), transition: 'opacity .15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                {d.label}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
                {formatCount(d.value)}
                {d.secondary !== undefined && (
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>{`  ·  ${formatCount(d.secondary)}`}</span>
                )}
              </span>
            </div>
            <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${w}%`, background: color, borderRadius: 4, transition: 'width .3s ease' }} />
              {d.secondary !== undefined && (
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${sw}%`, background: 'var(--success)', borderRadius: 4, transition: 'width .3s ease' }} />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Line chart ───────────────────────────────────────────────────────────────

interface LinePoint {
  label: string;
  value: number;
}

interface LineChartProps {
  points: LinePoint[];
  height?: number;
  onPointClick?: (p: LinePoint, index: number) => void;
}

export function LineChart({ points, height = 180, onPointClick }: LineChartProps) {
  const width = 560;
  const padX = 28;
  const padY = 22;
  const max = Math.max(1, ...points.map((p) => p.value));
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const xy = points.map((p, i) => {
    const x = padX + stepX * i;
    const y = padY + innerH - (p.value / max) * innerH;
    return [x, y] as [number, number];
  });
  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const area = `${line} L ${padX + innerW} ${padY + innerH} L ${padX} ${padY + innerH} Z`;
  const gridLines = 3;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart" preserveAspectRatio="xMidYMid meet">
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const y = padY + (innerH / gridLines) * i;
        const val = Math.round(max - (max / gridLines) * i);
        return (
          <g key={i}>
            <line x1={padX} y1={y} x2={padX + innerW} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text x={padX - 6} y={y + 3} textAnchor="end" style={{ fontSize: 9, fill: 'var(--muted)' }}>{val}</text>
          </g>
        );
      })}
      <path d={area} fill="color-mix(in srgb, var(--link) 14%, transparent)" stroke="none" />
      <path d={line} fill="none" stroke="var(--link)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {xy.map(([x, y], i) => (
        <g key={i}>
          <circle
            cx={x} cy={y} r={4} fill="var(--surface)" stroke="var(--link)" strokeWidth={2}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }}
            onClick={onPointClick ? () => onPointClick(points[i], i) : undefined}
          >
            <title>{`${points[i].label}: ${formatCount(points[i].value)}`}</title>
          </circle>
          <text x={x} y={height - 6} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--muted)' }}>{points[i].label}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Funnel ───────────────────────────────────────────────────────────────────

export interface FunnelStage {
  label: string;
  value: number;
  raw?: string;
  entity?: string;
}

interface FunnelProps {
  stages: FunnelStage[];
  onStageClick?: (s: FunnelStage, index: number) => void;
  selectedKey?: string | null;
}

export function Funnel({ stages, onStageClick, selectedKey }: FunnelProps) {
  const top = Math.max(1, stages[0]?.value ?? 1);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', width: '100%', overflowX: 'auto' }}>
      {stages.map((s, i) => {
        const heightPct = Math.max(8, (s.value / top) * 100);
        const convPct = i > 0 && stages[i - 1].value > 0 ? (s.value / stages[i - 1].value) * 100 : null;
        const color = labelColor(s.label, i);
        const stageOpacity = selectedKey == null || (s.raw ?? s.label) === selectedKey ? 1 : 0.3;
        return (
          <div key={i} style={{ flex: 1, minWidth: 96, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: stageOpacity, transition: 'opacity .15s ease' }}>
            {convPct !== null && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                {`${convPct.toFixed(0)}%`}
              </div>
            )}
            {convPct === null && <div style={{ height: 19 }} />}
            <button
              onClick={onStageClick ? () => onStageClick(s, i) : undefined}
              title={`${s.label}: ${formatCount(s.value)}`}
              style={{
                width: '100%', height: 120, display: 'flex', alignItems: 'flex-end',
                background: 'none', border: 'none', padding: 0, cursor: onStageClick ? 'pointer' : 'default',
              }}
            >
              <div style={{
                width: '100%', height: `${heightPct}%`, background: color, borderRadius: '6px 6px 0 0',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 6,
                color: 'var(--primary-text)', fontSize: 16, fontWeight: 700, transition: 'height .3s ease',
              }}>
                {formatCount(s.value)}
              </div>
            </button>
            <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 6, textAlign: 'center', fontWeight: 500 }}>
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
