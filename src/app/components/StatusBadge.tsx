/**
 * Status chip families, all derived from theme tokens so they re-tint per theme
 * (spec §5: status colors must come from tokens, never fixed hexes). Each family
 * maps to one accent token; the chip background is that accent at low opacity.
 */
type Family = 'success' | 'info' | 'warn' | 'danger' | 'neutral';

const STATUS_FAMILY: Record<string, Family> = {
  active: 'success', qualified: 'success', won: 'success', resolved: 'success',

  new: 'info', open: 'info', qualify: 'info', develop: 'info', in_progress: 'info',

  contacted: 'warn', warm: 'warn', pending: 'warn', propose: 'warn', close: 'warn', high: 'warn',

  hot: 'danger', lost: 'danger', disqualified: 'danger', urgent: 'danger',

  inactive: 'neutral', cancelled: 'neutral', cold: 'neutral', closed: 'neutral',
  low: 'neutral', normal: 'neutral',
};

const FAMILY_STYLE: Record<Family, { bg: string; fg: string; dot: string }> = {
  success: { bg: 'color-mix(in srgb, var(--success) 14%, transparent)', fg: 'var(--success)', dot: 'var(--success)' },
  info:    { bg: 'color-mix(in srgb, var(--link) 13%, transparent)',    fg: 'var(--link)',    dot: 'var(--link)' },
  warn:    { bg: 'var(--warn-bg)',                                       fg: 'var(--warn-text)', dot: 'var(--warn-text)' },
  danger:  { bg: 'color-mix(in srgb, var(--danger) 14%, transparent)',  fg: 'var(--danger)',  dot: 'var(--danger)' },
  neutral: { bg: 'color-mix(in srgb, var(--muted) 16%, transparent)',   fg: 'var(--muted)',   dot: 'var(--muted)' },
};

const DEFAULT_FAMILY: Family = 'neutral';

interface StatusBadgeProps {
  value: string;
}

export default function StatusBadge({ value }: StatusBadgeProps) {
  if (!value || value === '—') return <span className="text-[var(--muted)] text-[12px]">—</span>;
  const family = STATUS_FAMILY[value] ?? STATUS_FAMILY[value.toLowerCase()] ?? DEFAULT_FAMILY;
  const style = FAMILY_STYLE[family];
  const label = value.replace(/_/g, ' ');
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 rounded-sm text-[11px] font-semibold capitalize whitespace-nowrap"
      style={{ height: 20, background: style.bg, color: style.fg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: style.dot }}
      />
      {label}
    </span>
  );
}
