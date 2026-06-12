// Presentational shells for dashboard cards: the card frame, KPI tile with
// period-over-period delta, skeleton loader, and per-card empty state.
// Theme tokens only.

import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { formatPercent } from './theme';

// ── Card frame ───────────────────────────────────────────────────────────────

interface CardProps {
  title?: string;
  subtitle?: string;
  /** Optional element rendered top-right (e.g. a toggle). */
  action?: ReactNode;
  children: ReactNode;
}

export function Card({ title, subtitle, action, children }: CardProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 18,
        boxShadow: 'var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      {(title || action) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            {title && <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h3>}
            {subtitle && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0 0' }}>{subtitle}</p>}
          </div>
          {action && <div style={{ flexShrink: 0 }}>{action}</div>}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

// ── KPI tile ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  icon?: ReactNode;
  /** Period-over-period delta in %, or null to omit. */
  delta?: number | null;
  /** When true, a positive delta is bad (e.g. lost deals) and shown red. */
  invertDelta?: boolean;
  loading?: boolean;
  onClick?: () => void;
}

export function KpiCard({ label, value, icon, delta, invertDelta, loading, onClick }: KpiCardProps) {
  const up = delta !== null && delta !== undefined && delta >= 0;
  const good = invertDelta ? !up : up;
  const deltaColor = good ? 'var(--success)' : 'var(--danger)';

  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 16,
        boxShadow: 'var(--shadow)',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {icon && (
          <span style={{
            width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'color-mix(in srgb, var(--link) 12%, transparent)', color: 'var(--link)', flexShrink: 0,
          }}>
            {icon}
          </span>
        )}
      </div>
      <div>
        {loading ? (
          <SkeletonLine width={70} height={26} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{value}</span>
            {delta !== null && delta !== undefined && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 600, color: deltaColor }}>
                {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                {formatPercent(Math.abs(delta))}
              </span>
            )}
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0 0' }}>{label}</p>
      </div>
    </button>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

export function SkeletonLine({ width = 100, height = 12 }: { width?: number | string; height?: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: typeof width === 'number' ? `${width}px` : width,
        height,
        borderRadius: 4,
        background: 'linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%)',
        backgroundSize: '200% 100%',
        animation: 'dash-shimmer 1.4s ease infinite',
      }}
    />
  );
}

/** Generic block skeleton used inside a card body while a widget loads. */
export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <SkeletonLine width={`${55 + (i % 3) * 12}%`} />
          <SkeletonLine width={28} />
        </div>
      ))}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%', margin: '0 auto 10px',
        background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 18, color: 'var(--muted)' }}>—</span>
      </div>
      <p style={{ fontSize: 12, margin: 0 }}>{message}</p>
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────

export function SectionHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 14px 0' }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {title}
      </h2>
      {badge && (
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--link)', padding: '2px 8px', borderRadius: 10,
          background: 'color-mix(in srgb, var(--link) 12%, transparent)',
        }}>
          {badge}
        </span>
      )}
    </div>
  );
}
