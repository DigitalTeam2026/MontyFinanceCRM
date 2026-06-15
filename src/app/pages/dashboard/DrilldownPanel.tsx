// Inline drill-down panel shown below a dashboard section when a chart segment,
// legend row, bar, or funnel stage is clicked. It lists the matching records for
// the current date range WITHOUT navigating away, rendering the columns of the
// user's selected saved view with the same cell rendering as the list page.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { X, ExternalLink, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { ListRow } from '../../services/listService';
import type { ColumnState } from '../../components/ColumnCustomizer';
import { renderListCell } from '../../components/list/renderListCell';
import AnchoredPopover from '../../components/overlay/AnchoredPopover';
import {
  listDrilldownViews, resolveDrilldownColumns, fetchDrilldownPage,
  DRILLDOWN_PAGE_SIZE,
  type DrilldownRequest, type DrilldownView, type DrillChip,
} from './drilldown';
import { formatCount } from './theme';

/**
 * Windowed page numbers for the pagination bar: always show first + last, the
 * current page and its neighbours, and '…' gaps. Keeps the control compact even
 * for large result sets.
 */
function pageWindow(current: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const out: (number | 'gap')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) out.push('gap');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < totalPages - 1) out.push('gap');
  out.push(totalPages);
  return out;
}

/** Shared styling for pager buttons (Prev/Next + numbers), matching the dashboard. */
function pagerBtnStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 30, height: 30, padding: '0 8px', fontSize: 12, fontWeight: 600,
    borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
    border: `1px solid ${active ? 'var(--link)' : 'var(--border)'}`,
    background: active ? 'color-mix(in srgb, var(--link) 13%, transparent)' : 'var(--surface)',
    color: active ? 'var(--link)' : 'var(--text)',
    opacity: disabled && !active ? 0.45 : 1,
    transition: 'background .15s, border-color .15s',
  };
}

interface DrilldownPanelProps {
  req: DrilldownRequest;
  userId: string;
  onClose: () => void;
  onOpenInList: (req: DrilldownRequest, primaryActive: boolean) => void;
  onOpenRecord?: (id: string, label?: string) => void;
}

function lastViewKey(entityLogical: string, userId: string): string {
  return `dash_drill_view_${entityLogical}_${userId}`;
}

export default function DrilldownPanel({ req, userId, onClose, onOpenInList, onOpenRecord }: DrilldownPanelProps) {
  const [views, setViews] = useState<DrilldownView[]>([]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnState[]>([]);
  const [viewFilterChips, setViewFilterChips] = useState<DrillChip[]>([]);
  const [rows, setRows] = useState<ListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [primaryActive, setPrimaryActive] = useState(true);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const viewBtnRef = useRef<HTMLButtonElement>(null);
  const gen = useRef(0);
  // Skips the search effect's first run so it doesn't double-fetch over the initial load.
  const searchMountRef = useRef(false);

  // Smooth-scroll the panel into view when it first opens.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  // Initial load: views → default/last-used view → columns → first page.
  useEffect(() => {
    const g = ++gen.current;
    setLoading(true);
    setError(false);
    setPrimaryActive(true);
    setPage(1);
    setSearch('');
    setDebouncedSearch('');
    (async () => {
      try {
        const { views: vs, defaultViewId } = await listDrilldownViews(req.entity);
        const stored = (() => {
          try { return localStorage.getItem(lastViewKey(req.entity, userId)); } catch { return null; }
        })();
        const chosen = (stored && vs.some((v) => v.view_id === stored)) ? stored : defaultViewId;
        const { columns: cols, viewFilterChips: chips } = await resolveDrilldownColumns(req.entity, chosen);
        const pageData = await fetchDrilldownPage(req, cols, chips, { page: 1, primaryActive: true, search: '' });
        if (g !== gen.current) return;
        setViews(vs);
        setViewId(chosen);
        setColumns(cols);
        setViewFilterChips(chips);
        setRows(pageData.rows);
        setTotal(pageData.total);
        setLoading(false);
      } catch {
        if (g !== gen.current) return;
        setError(true);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch a specific page (replacing rows — true pagination, not append) using the
  // supplied columns/filters/search. Resets nothing else; callers decide the page.
  const fetchPage = useCallback(async (
    cols: ColumnState[], chips: DrillChip[], usePrimary: boolean, searchTerm: string, targetPage: number,
  ) => {
    const g = ++gen.current;
    setLoading(true);
    setError(false);
    try {
      const pageData = await fetchDrilldownPage(req, cols, chips, { page: targetPage, primaryActive: usePrimary, search: searchTerm });
      if (g !== gen.current) return;
      setRows(pageData.rows);
      setTotal(pageData.total);
      setPage(targetPage);
      setLoading(false);
    } catch {
      if (g !== gen.current) return;
      setError(true);
      setLoading(false);
    }
  }, [req]);

  // Debounce the search box (300ms) so each keystroke doesn't fire a query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Re-run the search from page 1 when the debounced term changes (skip first mount —
  // the initial load already fetched page 1 with an empty term).
  useEffect(() => {
    if (!searchMountRef.current) { searchMountRef.current = true; return; }
    fetchPage(columns, viewFilterChips, primaryActive, debouncedSearch, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const onSelectView = useCallback(async (id: string) => {
    setViewMenuOpen(false);
    if (id === viewId) return;
    setViewId(id);
    try { localStorage.setItem(lastViewKey(req.entity, userId), id); } catch { /* ignore */ }
    const { columns: cols, viewFilterChips: chips } = await resolveDrilldownColumns(req.entity, id);
    setColumns(cols);
    setViewFilterChips(chips);
    await fetchPage(cols, chips, primaryActive, debouncedSearch, 1);
  }, [viewId, req.entity, userId, fetchPage, primaryActive, debouncedSearch]);

  const onRemovePrimary = useCallback(() => {
    setPrimaryActive(false);
    fetchPage(columns, viewFilterChips, false, debouncedSearch, 1);
  }, [columns, viewFilterChips, fetchPage, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / DRILLDOWN_PAGE_SIZE));
  const onGoToPage = useCallback((target: number) => {
    if (target < 1 || target > totalPages || target === page || loading) return;
    fetchPage(columns, viewFilterChips, primaryActive, debouncedSearch, target);
  }, [totalPages, page, loading, fetchPage, columns, viewFilterChips, primaryActive, debouncedSearch]);

  const activeView = views.find((v) => v.view_id === viewId);
  const grayChips: DrillChip[] = [...(req.constraints ?? []), ...viewFilterChips];
  const rangeStart = total === 0 ? 0 : (page - 1) * DRILLDOWN_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * DRILLDOWN_PAGE_SIZE, total);

  return (
    <div
      ref={panelRef}
      style={{
        marginTop: 14, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, boxShadow: 'var(--shadow)', overflow: 'hidden',
        animation: 'dash-drill-open .22s ease',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{req.entityLabel}</span>

        {/* Blue primary chip — removable unless it's a synthetic (e.g. funnel stage) marker */}
        {req.primary && primaryActive && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
            color: 'var(--link)', background: 'color-mix(in srgb, var(--link) 13%, transparent)',
            padding: '3px 8px', borderRadius: 12,
          }}>
            {req.primary.label}
            {!req.primary.field.startsWith('__') && (
              <button onClick={onRemovePrimary} title="Remove filter"
                style={{ display: 'inline-flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--link)' }}>
                <X size={13} />
              </button>
            )}
          </span>
        )}

        {/* Gray constraint + view-filter chips */}
        {grayChips.map((c) => (
          <span key={c.id} style={{
            fontSize: 12, fontWeight: 600, color: 'var(--muted)',
            background: 'color-mix(in srgb, var(--muted) 14%, transparent)', padding: '3px 8px', borderRadius: 12,
          }}>
            {c.label}
          </span>
        ))}

        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {loading ? '…' : `${formatCount(total)} record${total === 1 ? '' : 's'}`}
        </span>

        <div style={{ flex: 1 }} />

        {/* View selector */}
        {views.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button
              ref={viewBtnRef}
              onClick={() => setViewMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={viewMenuOpen}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 220, fontSize: 12, fontWeight: 600,
                color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)',
                padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeView?.name ?? 'View'}
              </span>
              <ChevronDown size={13} style={{ flexShrink: 0 }} />
            </button>
            <AnchoredPopover
              anchorEl={viewBtnRef.current}
              open={viewMenuOpen}
              onClose={() => setViewMenuOpen(false)}
              placement="bottom-end"
              matchWidth
              minWidth={200}
              maxHeight={320}
              role="menu"
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                boxShadow: 'var(--shadow)', padding: 4, overflowY: 'auto',
              }}
            >
              {views.map((v) => (
                <button key={v.view_id} role="menuitem" onClick={() => onSelectView(v.view_id)}
                  title={v.name}
                  style={{
                    display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 8,
                    fontSize: 12, padding: '7px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                    background: v.view_id === viewId ? 'color-mix(in srgb, var(--link) 12%, transparent)' : 'transparent',
                    color: v.view_id === viewId ? 'var(--link)' : 'var(--text)', fontWeight: v.view_id === viewId ? 700 : 500,
                  }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.name}{v.is_default ? ' (default)' : ''}
                  </span>
                </button>
              ))}
            </AnchoredPopover>
          </div>
        )}

        <button
          onClick={() => onOpenInList(req, primaryActive)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
            color: 'var(--link)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Open in {req.entityLabel} list <ExternalLink size={13} />
        </button>

        <button onClick={onClose} title="Close"
          style={{ display: 'inline-flex', background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--muted)' }}>
          <X size={16} />
        </button>
      </div>

      {/* Search toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360, minWidth: 180 }}>
          <Search
            size={14}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${req.entityLabel.toLowerCase()}…`}
            aria-label={`Search ${req.entityLabel}`}
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: 13, color: 'var(--text)',
              background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '7px 30px 7px 32px', outline: 'none',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              title="Clear search"
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                display: 'inline-flex', background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--muted)',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {total > 0 ? `${rangeStart}–${rangeEnd} of ${formatCount(total)}` : ''}
        </span>
      </div>

      {/* Body */}
      <div style={{ overflowX: 'auto' }}>
        {error ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Unable to load records.
          </div>
        ) : loading ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No matching records.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={{
                    textAlign: 'left', padding: '8px 14px', fontSize: 11, fontWeight: 600,
                    color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.03em',
                    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                  }}>
                    {c.labelOverride ?? c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onOpenRecord?.(row.id)}
                  style={{ cursor: onOpenRecord ? 'pointer' : 'default', borderBottom: '1px solid var(--border)' }}
                >
                  {columns.map((c) => (
                    <td key={c.key} style={{ padding: '9px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {renderListCell(row, c, { onOpenRecord })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!error && totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap',
          padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)',
        }}>
          <button
            onClick={() => onGoToPage(page - 1)}
            disabled={page <= 1 || loading}
            title="Previous page"
            style={pagerBtnStyle(false, page <= 1 || loading)}
          >
            <ChevronLeft size={14} />
            <span style={{ marginLeft: 2 }}>Prev</span>
          </button>

          {pageWindow(page, totalPages).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} style={{ padding: '0 4px', fontSize: 12, color: 'var(--muted)' }}>…</span>
            ) : (
              <button
                key={p}
                onClick={() => onGoToPage(p)}
                disabled={loading}
                aria-current={p === page ? 'page' : undefined}
                style={pagerBtnStyle(p === page, loading && p !== page)}
              >
                {p}
              </button>
            ),
          )}

          <button
            onClick={() => onGoToPage(page + 1)}
            disabled={page >= totalPages || loading}
            title="Next page"
            style={pagerBtnStyle(false, page >= totalPages || loading)}
          >
            <span style={{ marginRight: 2 }}>Next</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      <style>{`
        @keyframes dash-drill-open {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
