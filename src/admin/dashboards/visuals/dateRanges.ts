// Date-slicer range math + filter construction. Pure, runtime-only (uses the
// real `new Date()` — this is app code, not a workflow script). All presets are
// resolved relative to "now" and clamped to the [min,max] available in the data
// by the caller. Boundaries are returned as Date objects; the filter builder
// formats them into the >= start / <= end literals the query engine understands.

import type { DateFilterMode, SlicerDateRange, VisualFilter } from '../types/dashboard';

export interface DateBounds { start: Date | null; end: Date | null }

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Monday-based start of week.
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  return addDays(x, -day);
}

const quarterOf = (m: number) => Math.floor(m / 3); // 0..3

/**
 * Resolve a preset to its [start, end] day boundaries. `all_time` returns nulls
 * (open-ended). `custom` is handled by the caller from the stored start/end.
 */
export function computeDateRange(preset: SlicerDateRange, now: Date = new Date()): DateBounds {
  const today = startOfDay(now);
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (preset) {
    case 'all_time':
      return { start: null, end: null };
    case 'today':
      return { start: today, end: endOfDay(today) };
    case 'tomorrow': {
      const tm = addDays(today, 1);
      return { start: tm, end: endOfDay(tm) };
    }
    case 'yesterday': {
      const yd = addDays(today, -1);
      return { start: yd, end: endOfDay(yd) };
    }
    case 'this_week': {
      const s = startOfWeek(now);
      return { start: s, end: endOfDay(addDays(s, 6)) };
    }
    case 'last_week': {
      const s = addDays(startOfWeek(now), -7);
      return { start: s, end: endOfDay(addDays(s, 6)) };
    }
    case 'last_7_days':
      return { start: addDays(today, -6), end: endOfDay(today) };
    case 'last_30_days':
      return { start: addDays(today, -29), end: endOfDay(today) };
    case 'this_month':
      return { start: startOfDay(new Date(y, m, 1)), end: endOfDay(new Date(y, m + 1, 0)) };
    case 'last_month':
      return { start: startOfDay(new Date(y, m - 1, 1)), end: endOfDay(new Date(y, m, 0)) };
    case 'this_quarter': {
      const q = quarterOf(m);
      return { start: startOfDay(new Date(y, q * 3, 1)), end: endOfDay(new Date(y, q * 3 + 3, 0)) };
    }
    case 'last_quarter': {
      const q = quarterOf(m);
      const qStart = new Date(y, q * 3 - 3, 1);
      return { start: startOfDay(qStart), end: endOfDay(new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0)) };
    }
    case 'this_year':
      return { start: startOfDay(new Date(y, 0, 1)), end: endOfDay(new Date(y, 11, 31)) };
    case 'last_year':
      return { start: startOfDay(new Date(y - 1, 0, 1)), end: endOfDay(new Date(y - 1, 11, 31)) };
    case 'custom':
    default:
      return { start: null, end: null };
  }
}

// ── formatting ───────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` (local). */
export function toDateInput(d: Date | null): string {
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a `YYYY-MM-DD` input value back to a local Date (start of that day). */
export function fromDateInput(s: string): Date | null {
  if (!s) return null;
  const [y, mo, da] = s.split('-').map(Number);
  if (!y || !mo || !da) return null;
  return new Date(y, mo - 1, da);
}

/**
 * Inclusive lower bound — the start of the selected local day (or the exact time
 * when the slicer is time-aware). Postgres casts the literal to the column type.
 */
function startBoundLiteral(d: Date, withTime: boolean): string {
  const date = toDateInput(d);
  if (!withTime) return `${date}T00:00:00`;
  return `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * EXCLUSIVE upper bound — the start of the day AFTER the selected end day, so the
 * predicate is `field < nextDayMidnight`. This captures the whole end day for
 * `date` and `timestamp(tz)` columns alike (a record at 23:59:59.999 still
 * matches) and makes a same-day custom range (17th → 17th) cover all of the 17th
 * rather than just midnight. Time-aware slicers compare against the exact instant.
 */
function endBoundLiteralExclusive(d: Date, withTime: boolean): string {
  if (withTime) return `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const next = addDays(startOfDay(d), 1);
  return `${toDateInput(next)}T00:00:00`;
}

/**
 * Build the runtime filters this slicer broadcasts. Range modes
 * (between/relative/timeline) emit `field >= start AND field < end_exclusive`;
 * before/after/on emit a single bound. Returns [] when the range is fully open
 * (no active filter) — an empty range here means "no filter", which is distinct
 * from a filter that simply matches zero rows.
 */
export function buildDateFilters(
  field: string, mode: DateFilterMode, bounds: DateBounds, withTime = false,
): VisualFilter[] {
  if (!field) return [];
  const { start, end } = bounds;
  const startLit = start ? startBoundLiteral(start, withTime) : null;

  switch (mode) {
    case 'before':
      return end ? [{ field, op: 'before', value: startBoundLiteral(end, withTime) }] : [];
    case 'after':
      return startLit ? [{ field, op: 'after', value: startLit }] : [];
    case 'on':
      return startLit ? [{ field, op: 'on', value: startLit }] : [];
    case 'between':
    case 'relative_date':
    case 'relative_period':
    case 'timeline':
    default: {
      const out: VisualFilter[] = [];
      // Inclusive start, exclusive end (`>= start AND < startOfNextDay`).
      if (startLit) out.push({ field, op: 'gte', value: startLit });
      if (end) out.push({ field, op: 'lt', value: endBoundLiteralExclusive(end, withTime) });
      return out;
    }
  }
}
