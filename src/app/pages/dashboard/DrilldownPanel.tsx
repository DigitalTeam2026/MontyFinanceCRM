// Inline drill-down panel shown below a dashboard section when a chart segment,
// legend row, bar, or funnel stage is clicked. It lists the matching records for
// the current date range WITHOUT navigating away, rendering the columns of the
// user's selected saved view with the same cell rendering as the list page.

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ExternalLink, ChevronDown } from 'lucide-react';
import type { ListRow } from '../../services/listService';
import type { ColumnState } from '../../components/ColumnCustomizer';
import { renderListCell } from '../../components/list/renderListCell';
import {
  listDrilldownViews, resolveDrilldownColumns, fetchDrilldownPage,
  type DrilldownRequest, type DrilldownView, type DrillChip,
} from './drilldown';
import { formatCount } from './theme';

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
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [primaryActive, setPrimaryActive] = useState(true);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const gen = useRef(0);

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
    (async () => {
      try {
        const { views: vs, defaultViewId } = await listDrilldownViews(req.entity);
        const stored = (() => {
          try { return localStorage.getItem(lastViewKey(req.entity, userId)); } catch { return null; }
        })();
        const chosen = (stored && vs.some((v) => v.view_id === stored)) ? stored : defaultViewId;
        const { columns: cols, viewFilterChips: chips } = await resolveDrilldownColumns(req.entity, chosen);
        const pageData = await fetchDrilldownPage(req, cols, chips, { page: 1, primaryActive: true });
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

  // Re-fetch page 1 with current columns/filters (after view change or chip toggle).
  const refetch = useCallback(async (cols: ColumnState[], chips: DrillChip[], usePrimary: boolean) => {
    const g = ++gen.current;
    setLoading(true);
    setError(false);
    setPage(1);
    try {
      const pageData = await fetchDrilldownPage(req, cols, chips, { page: 1, primaryActive: usePrimary });
      if (g !== gen.current) return;
      setRows(pageData.rows);
      setTotal(pageData.total);
      setLoading(false);
    } catch {
      if (g !== gen.current) return;
      setError(true);
      setLoading(false);
    }
  }, [req]);

  const onSelectView = useCallback(async (id: string) => {
    setViewMenuOpen(false);
    if (id === viewId) return;
    setViewId(id);
    try { localStorage.setItem(lastViewKey(req.entity, userId), id); } catch { /* ignore */ }
    const { columns: cols, viewFilterChips: chips } = await resolveDrilldownColumns(req.entity, id);
    setColumns(cols);
    setViewFilterChips(chips);
    await refetch(cols, chips, primaryActive);
  }, [viewId, req.entity, userId, refetch, primaryActive]);

  const onRemovePrimary = useCallback(() => {
    setPrimaryActive(false);
    refetch(columns, viewFilterChips, false);
  }, [columns, viewFilterChips, refetch]);

  const onShowMore = useCallback(async () => {
    const next = page + 1;
    setLoadingMore(true);
    try {
      const pageData = await fetchDrilldownPage(req, columns, viewFilterChips, { page: next, primaryActive });
      setRows((prev) => [...prev, ...pageData.rows]);
      setTotal(pageData.total);
      setPage(next);
    } catch { /* ignore */ }
    setLoadingMore(false);
  }, [page, req, columns, viewFilterChips, primaryActive]);

  const activeView = views.find((v) => v.view_id === viewId);
  const hasMore = rows.length < total;
  const grayChips: DrillChip[] = [...(req.constraints ?? []), ...viewFilterChips];

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
              onClick={() => setViewMenuOpen((o) => !o)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
                color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)',
                padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              }}
            >
              {activeView?.name ?? 'View'}
              <ChevronDown size={13} />
            </button>
            {viewMenuOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 180, zIndex: 20,
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow)',
                padding: 4, maxHeight: 260, overflowY: 'auto',
              }}>
                {views.map((v) => (
                  <button key={v.view_id} onClick={() => onSelectView(v.view_id)}
                    style={{
                      display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 8,
                      fontSize: 12, padding: '7px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                      background: v.view_id === viewId ? 'color-mix(in srgb, var(--link) 12%, transparent)' : 'transparent',
                      color: v.view_id === viewId ? 'var(--link)' : 'var(--text)', fontWeight: v.view_id === viewId ? 700 : 500,
                    }}>
                    {v.name}{v.is_default ? ' (default)' : ''}
                  </button>
                ))}
              </div>
            )}
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

      {/* Show more */}
      {!loading && !error && hasMore && (
        <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <button onClick={onShowMore} disabled={loadingMore}
            style={{
              fontSize: 12, fontWeight: 600, color: 'var(--link)', background: 'var(--surface-2)',
              border: '1px solid var(--border)', borderRadius: 6, padding: '6px 16px', cursor: 'pointer',
            }}>
            {loadingMore ? 'Loading…' : `Show more (${formatCount(total - rows.length)} more)`}
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
