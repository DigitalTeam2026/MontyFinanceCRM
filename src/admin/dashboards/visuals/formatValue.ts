import type { FormatConfig } from '../types/dashboard';

/** Format a numeric value per the visual's format config (locale-aware). */
export function formatNumber(value: unknown, fmt: FormatConfig = {}): string {
  if (value == null || value === '') return fmt.emptyMessage ?? '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return String(value);

  const decimals = fmt.decimals ?? (fmt.numberFormat === 'percentage' ? 1 : 0);
  const useGroup = fmt.thousands ?? true;

  let out: string;
  if (fmt.numberFormat === 'currency') {
    out = new Intl.NumberFormat(undefined, {
      style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(n);
  } else if (fmt.numberFormat === 'percentage') {
    out = `${new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)}%`;
  } else if (fmt.numberFormat === 'compact') {
    out = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } else {
    out = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: useGroup,
    }).format(n);
  }
  return `${fmt.prefix ?? ''}${out}${fmt.suffix ?? ''}`;
}

/** Format a category/axis label — dates get a friendly short form. */
export function formatLabel(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string') {
    // ISO timestamp from date_trunc → short date
    const m = /^\d{4}-\d{2}-\d{2}T/.test(value);
    if (m) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }
    }
    return value;
  }
  return String(value);
}
