const BADGE_STYLES: Record<string, { bg: string; fg: string; dot: string }> = {
  active:        { bg: '#dff5e6', fg: '#176e34', dot: '#22c55e' },
  qualified:     { bg: '#dff5e6', fg: '#176e34', dot: '#22c55e' },
  won:           { bg: '#dff5e6', fg: '#176e34', dot: '#22c55e' },
  resolved:      { bg: '#dff5e6', fg: '#176e34', dot: '#22c55e' },

  new:           { bg: '#e5efff', fg: '#1d4079', dot: '#3b82f6' },
  open:          { bg: '#e5efff', fg: '#1d4079', dot: '#3b82f6' },
  qualify:       { bg: '#e5efff', fg: '#1d4079', dot: '#3b82f6' },
  develop:       { bg: '#e5efff', fg: '#1d4079', dot: '#3b82f6' },
  in_progress:   { bg: '#e5efff', fg: '#1d4079', dot: '#3b82f6' },

  contacted:     { bg: '#fff4d6', fg: '#7a5a00', dot: '#f59e0b' },
  warm:          { bg: '#fff4d6', fg: '#7a5a00', dot: '#f59e0b' },
  pending:       { bg: '#fff4d6', fg: '#7a5a00', dot: '#f59e0b' },
  propose:       { bg: '#fff4d6', fg: '#7a5a00', dot: '#f59e0b' },
  close:         { bg: '#fff4d6', fg: '#7a5a00', dot: '#f59e0b' },
  high:          { bg: '#fff4d6', fg: '#7a5a00', dot: '#f59e0b' },

  hot:           { bg: '#fde7e9', fg: '#c0392b', dot: '#ef4444' },
  lost:          { bg: '#fde7e9', fg: '#c0392b', dot: '#ef4444' },
  disqualified:  { bg: '#fde7e9', fg: '#c0392b', dot: '#ef4444' },
  urgent:        { bg: '#fde7e9', fg: '#c0392b', dot: '#ef4444' },

  inactive:      { bg: '#eef0f3', fg: '#4e5663', dot: '#a4abb6' },
  cancelled:     { bg: '#eef0f3', fg: '#4e5663', dot: '#a4abb6' },
  cold:          { bg: '#eef0f3', fg: '#4e5663', dot: '#a4abb6' },
  closed:        { bg: '#eef0f3', fg: '#4e5663', dot: '#a4abb6' },
  low:           { bg: '#eef0f3', fg: '#4e5663', dot: '#a4abb6' },
  normal:        { bg: '#eef0f3', fg: '#4e5663', dot: '#a4abb6' },
};

const DEFAULT_STYLE = { bg: '#eef0f3', fg: '#4e5663', dot: '#a4abb6' };

interface StatusBadgeProps {
  value: string;
}

export default function StatusBadge({ value }: StatusBadgeProps) {
  if (!value || value === '—') return <span className="text-[var(--ink-300)] text-[12px]">—</span>;
  const style = BADGE_STYLES[value] ?? BADGE_STYLES[value.toLowerCase()] ?? DEFAULT_STYLE;
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
