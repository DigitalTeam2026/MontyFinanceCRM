// Shared read-only cell renderer for entity-grid rows. Extracted from
// EntityListPage so the dashboard drill-down table renders cells identically
// (status chips, lookup links, owner avatars, formatted dates/currency).
//
// This covers only the DISPLAY path. Inline-edit inputs stay in EntityListPage.

import type { ReactNode } from 'react';
import type { ListRow } from '../../services/listService';
import type { ColumnState } from '../ColumnCustomizer';
import StatusBadge from '../StatusBadge';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AVATAR_COLORS = ['#2b6cb0', '#0d9488', '#b45309', '#7c3aed', '#dc2626', '#059669'];

export function formatDate(val: unknown): string {
  if (!val || typeof val !== 'string') return '—';
  return new Date(val).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatCurrency(val: unknown, currencyCode?: string | null): string {
  if (val == null || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode ?? 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

export interface RenderListCellOptions {
  /** Invoked when a link/name cell is clicked. */
  onOpenRecord?: (id: string, label?: string) => void;
  /** Dynamics-style redesign chips (always true in the app today). */
  isRedesign?: boolean;
}

/** Render a single grid cell's display value for `row[col.key]`. */
export function renderListCell(row: ListRow, col: ColumnState, opts: RenderListCellOptions = {}): ReactNode {
  const { onOpenRecord, isRedesign = true } = opts;
  const colKey = col.key;
  const colType = col.type;
  const val = row[colKey];

  // Null / empty
  if (val === null || val === undefined || val === '') {
    return <span className="text-[var(--ink-300)] text-[12px]">—</span>;
  }

  // Skip rendering Supabase nested objects
  if (typeof val === 'object' && !Array.isArray(val)) {
    return <span className="text-[var(--ink-300)] text-[12px]">—</span>;
  }

  const strVal = String(val);
  if (UUID_RE.test(strVal) && colType !== 'link') {
    return <span className="text-[var(--ink-300)] text-[12px]">—</span>;
  }

  if (colType === 'date') {
    return <span className="text-[var(--ink-500)] text-[12px]">{formatDate(val)}</span>;
  }

  if (colType === 'phone') {
    return (
      <a
        href={`tel:${strVal.replace(/\s/g, '')}`}
        onClick={(e) => e.stopPropagation()}
        className="text-[var(--link)] hover:underline text-[12px]"
      >
        {strVal}
      </a>
    );
  }

  if (colType === 'currency') {
    return <span className="text-[var(--ink-700)] text-[14px] font-medium">{formatCurrency(val, row.currency_code as string | null)}</span>;
  }

  if (colType === 'badge') {
    // Inline-choice options can carry an uploaded SVG icon; the grid value is already
    // resolved to the label, so match the option by label to recover its icon.
    const icon = col.inline_choices?.find((o) => o.label === strVal)?.icon;
    if (isRedesign) {
      const lc = strVal.toLowerCase();
      let pillCls = 'rd-pill-blue';
      if (lc === 'active' || lc === 'open') pillCls = 'rd-pill-green';
      else if (lc === 'inactive' || lc === 'closed') pillCls = 'rd-pill-gray';
      else if (lc.includes('progress') || lc.includes('pending')) pillCls = 'rd-pill-amber';
      else if (lc.includes('lost') || lc.includes('won') || lc === 'dead') pillCls = 'rd-pill-red';
      return (
        <span className={`rd-pill ${pillCls}`}>
          {icon
            ? <img src={icon} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
            : <span className="rd-pill-dot" />}
          {strVal}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5">
        {icon && <img src={icon} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />}
        <StatusBadge value={strVal} />
      </span>
    );
  }

  if (colType === 'multi_badge') {
    if (!strVal || strVal === '—') return <span className="text-[var(--ink-300)] text-[12px]">—</span>;
    const parts = strVal.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return <span className="text-[var(--ink-300)] text-[12px]">—</span>;
    return (
      <span className="inline-flex flex-wrap gap-1">
        {parts.map((p, i) => {
          const icon = col.inline_choices?.find((o) => o.label === p)?.icon;
          return (
            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
              {icon && <img src={icon} alt="" className="w-3 h-3 object-contain shrink-0" />}
              {p}
            </span>
          );
        })}
      </span>
    );
  }

  if (colType === 'link') {
    return (
      <span
        className="text-[var(--link)] cursor-pointer font-semibold text-[14px] hover:underline"
        onClick={(e) => { e.stopPropagation(); onOpenRecord?.(row.id, strVal); }}
      >
        {strVal || '—'}
      </span>
    );
  }

  if (colType === 'owner') {
    const emailStr = String(row[colKey] ?? '');
    if (!emailStr || emailStr === '—' || /^[0-9a-f]{8}-/i.test(emailStr)) return <span className="text-[var(--ink-300)] text-[11px]">—</span>;
    const shortName = emailStr.split('@')[0];
    const nameParts = shortName.split(/[.\-_+\s]+/).filter(Boolean);
    const initials = (nameParts.length >= 2
      ? nameParts[0][0] + nameParts[1][0]
      : shortName.slice(0, 2)).toUpperCase();
    if (isRedesign) {
      return (
        <span className="flex items-center gap-2">
          <span className="rd-avatar">{initials}</span>
          <span className="text-[13px] text-[var(--text)] font-medium truncate max-w-[120px]">{shortName}</span>
        </span>
      );
    }
    const colorIndex = emailStr.charCodeAt(0) % AVATAR_COLORS.length;
    return (
      <span className="flex items-center gap-1.5">
        <span
          className="w-5 h-5 rounded-full text-[9.5px] font-bold text-white flex items-center justify-center shrink-0 uppercase"
          style={{ background: AVATAR_COLORS[colorIndex] }}
        >
          {initials}
        </span>
        <span className="text-[12px] text-[var(--ink-600)] truncate max-w-[100px]">{shortName}</span>
      </span>
    );
  }

  if (colType === 'lookup') {
    return <span className="text-[var(--ink-600)] text-[12px]">{strVal}</span>;
  }

  if (colType === 'boolean') {
    const isTrue = val === true || val === 'true' || val === '1' || val === 1;
    const isFalse = val === false || val === 'false' || val === '0' || val === 0;
    if (!isTrue && !isFalse) return <span className="text-[var(--ink-300)] text-[12px]">—</span>;
    return (
      <span className={`text-[12px] font-medium ${isTrue ? 'text-emerald-600' : 'text-[var(--ink-400)]'}`}>
        {isTrue ? 'Yes' : 'No'}
      </span>
    );
  }

  // Auto-detect: if column key ends with _id and value is a UUID, show dash
  if (colKey.endsWith('_id') && UUID_RE.test(strVal)) {
    return <span className="text-[var(--ink-300)] text-[12px]">—</span>;
  }

  // Auto-detect: date-like strings (ISO 8601)
  if (!colType && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}(T|\s)/.test(val)) {
    return <span className="text-[var(--ink-500)] text-[12px]">{formatDate(val)}</span>;
  }

  // Auto-detect: numeric with decimal for untyped columns
  if (!colType && typeof val === 'number') {
    return <span className="text-[var(--ink-700)] text-[12px] font-medium tabular-nums">{val.toLocaleString()}</span>;
  }

  // Default text rendering
  return <span className="text-[var(--ink-600)] text-[12px]">{strVal}</span>;
}
