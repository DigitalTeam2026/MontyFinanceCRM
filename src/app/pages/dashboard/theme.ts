// Dashboard theme helpers — palette, formatters, and date-range math.
//
// COLOUR RULE: every colour returned here is a CSS `var(--token)` or a
// `color-mix(...)` over tokens defined in src/index.css. No raw hex literals,
// so the no-restricted-syntax ESLint guard passes and the charts re-tint in all
// six themes (light + dark) automatically.

/**
 * Categorical palette for charts (donut segments, multi-bar groups). Built only
 * from theme tokens so it follows the active theme. Six base hues, each with a
 * lighter color-mix variant appended, giving 12 distinguishable swatches before
 * it cycles. Order is chosen so the first few segments read as distinct.
 */
const BASE_TOKENS = [
  'var(--link)',
  'var(--success)',
  'var(--warn-text)',
  'var(--danger)',
  'var(--primary)',
  'var(--muted)',
] as const;

export const CATEGORICAL: string[] = [
  ...BASE_TOKENS,
  ...BASE_TOKENS.map((t) => `color-mix(in srgb, ${t} 55%, var(--surface))`),
];

/** Stable colour for the Nth category (cycles through the palette). */
export function categoryColor(index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length];
}

/**
 * Map a set of well-known status/stage labels to a semantic token so e.g. "Won"
 * is always green and "Lost" always red, regardless of segment order. Falls back
 * to null so the caller uses the positional categorical colour.
 */
const SEMANTIC_LABELS: Record<string, string> = {
  won: 'var(--success)',
  qualified: 'var(--success)',
  active: 'var(--success)',
  open: 'var(--link)',
  new: 'var(--link)',
  contacted: 'var(--warn-text)',
  pending: 'var(--warn-text)',
  'in progress': 'var(--warn-text)',
  lost: 'var(--danger)',
  disqualified: 'var(--danger)',
  rejected: 'var(--danger)',
  cancelled: 'var(--danger)',
  inactive: 'var(--muted)',
};

export function semanticColor(label: string): string | null {
  return SEMANTIC_LABELS[label.trim().toLowerCase()] ?? null;
}

/** Colour for a labelled segment: semantic if known, else positional. */
export function labelColor(label: string, index: number): string {
  return semanticColor(label) ?? categoryColor(index);
}

// ── Number / money formatting ────────────────────────────────────────────────

/** Compact money: 48500 → "$48.5K", 1250000 → "$1.3M". */
export function formatMoneyCompact(value: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString()}`;
  }
}

/** Full money: 48500 → "$48,500". */
export function formatMoney(value: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString()}`;
  }
}

export function formatCount(value: number): string {
  return value.toLocaleString();
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

/** Safe ratio → percentage; returns 0 when the denominator is 0. */
export function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

/**
 * Percentage delta between a current and previous value. Returns null when there
 * is no previous baseline (so the UI can omit the delta rather than show ∞/NaN).
 */
export function deltaPercent(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

// ── Date-range presets ───────────────────────────────────────────────────────

export type RangeKey = 'week' | 'month' | 'quarter' | 'year';

export interface DateRange {
  /** Inclusive ISO start (UTC midnight). */
  from: string;
  /** Exclusive ISO end (UTC midnight of the day after the range). */
  to: string;
}

export interface RangePair {
  current: DateRange;
  previous: DateRange;
  label: string;
}

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
];

function iso(d: Date): string {
  return d.toISOString();
}

/**
 * Resolve a range preset into the current period plus the immediately preceding
 * equivalent period (for delta comparisons). `now` is injectable for testing.
 */
export function resolveRange(key: RangeKey, now: Date = new Date()): RangePair {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  let curFrom: Date;
  let curTo: Date;
  let prevFrom: Date;
  let prevTo: Date;
  let label: string;

  switch (key) {
    case 'week': {
      // Week starts Monday (UTC).
      const dow = (now.getUTCDay() + 6) % 7; // 0 = Monday
      curFrom = new Date(Date.UTC(y, m, d - dow));
      curTo = new Date(Date.UTC(y, m, d - dow + 7));
      prevFrom = new Date(Date.UTC(y, m, d - dow - 7));
      prevTo = curFrom;
      label = 'This week';
      break;
    }
    case 'quarter': {
      const q = Math.floor(m / 3);
      curFrom = new Date(Date.UTC(y, q * 3, 1));
      curTo = new Date(Date.UTC(y, q * 3 + 3, 1));
      prevFrom = new Date(Date.UTC(y, q * 3 - 3, 1));
      prevTo = curFrom;
      label = 'This quarter';
      break;
    }
    case 'year': {
      curFrom = new Date(Date.UTC(y, 0, 1));
      curTo = new Date(Date.UTC(y + 1, 0, 1));
      prevFrom = new Date(Date.UTC(y - 1, 0, 1));
      prevTo = curFrom;
      label = 'This year';
      break;
    }
    case 'month':
    default: {
      curFrom = new Date(Date.UTC(y, m, 1));
      curTo = new Date(Date.UTC(y, m + 1, 1));
      prevFrom = new Date(Date.UTC(y, m - 1, 1));
      prevTo = curFrom;
      label = 'This month';
      break;
    }
  }

  return {
    current: { from: iso(curFrom), to: iso(curTo) },
    previous: { from: iso(prevFrom), to: iso(prevTo) },
    label,
  };
}

/** The last `count` whole months as [from, to) ranges, oldest first. */
export function lastMonths(count: number, now: Date = new Date()): { from: string; to: string; label: string }[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const out: { from: string; to: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(y, m - i, 1));
    const end = new Date(Date.UTC(y, m - i + 1, 1));
    out.push({
      from: iso(start),
      to: iso(end),
      label: start.toLocaleString(undefined, { month: 'short' }),
    });
  }
  return out;
}
