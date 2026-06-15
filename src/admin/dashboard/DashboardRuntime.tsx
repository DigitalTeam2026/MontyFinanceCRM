// Database-driven dashboard runtime (viewer).
//
// Renders a saved dashboard (its dashboard_widget rows) with real, RLS-scoped
// data using the shared dashboard engine — replacing the old static mock
// previews. Every card supports the same inline drill-down as the analytics
// dashboard. This is the consumption surface; Edit mode opens the designer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pencil, RefreshCw, Star } from 'lucide-react';
import { RANGE_OPTIONS, resolveRange, type RangeKey } from '../../app/pages/dashboard/theme';
import { fetchDashboardWithWidgets } from '../../services/dashboardService';
import type { Dashboard, DashboardWidget } from '../../types/dashboard';
import { renderDbWidget } from './runtime/renderDbWidget';
import type { WidgetCtx } from '../admindashboard/widgets';
import { refreshAdminData } from '../admindashboard/adminData';
import DrilldownPanel from '../../app/pages/dashboard/DrilldownPanel';
import type { DrilldownRequest } from '../../app/pages/dashboard/drilldown';
import { buildCrmHash, moduleForEntity, type SerializedFilter } from '../../lib/appRoute';

interface DashboardRuntimeProps {
  dashboardId: string;
  userId: string;
  onBack: () => void;
  onEdit?: (dashboardId: string) => void;
}

function drillSig(req: DrilldownRequest): string {
  const cons = (req.constraints ?? []).map((c) => `${c.field}=${c.value}`).join('&');
  return `${req.sectionId}|${req.entity}|${req.dateField}|${req.primary?.field ?? ''}=${req.primary?.value ?? ''}|${cons}`;
}

function reqToSerializedFilters(req: DrilldownRequest, primaryActive: boolean): SerializedFilter[] {
  const fromStr = req.dateRange.from.slice(0, 10);
  const toDate = new Date(req.dateRange.to);
  toDate.setUTCDate(toDate.getUTCDate() - 1);
  const toStr = toDate.toISOString().slice(0, 10);
  const filters: SerializedFilter[] = [
    { id: 'dash_from', field: req.dateField, label: 'On or after', operator: 'on_or_after', value: fromStr },
    { id: 'dash_to', field: req.dateField, label: 'On or before', operator: 'on_or_before', value: toStr },
  ];
  for (const c of req.constraints ?? []) filters.push({ id: c.id, field: c.field, label: c.label, operator: c.operator, value: c.value });
  if (primaryActive && req.primary && !req.primary.field.startsWith('__')) {
    filters.unshift({ id: req.primary.id, field: req.primary.field, label: req.primary.label, operator: req.primary.operator, value: req.primary.value });
  }
  return filters;
}

export default function DashboardRuntime({ dashboardId, userId, onBack, onEdit }: DashboardRuntimeProps) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const { current, previous } = resolveRange(rangeKey);
  const [activeDrill, setActiveDrill] = useState<DrilldownRequest | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchDashboardWithWidgets(dashboardId)
      .then(({ dashboard, widgets }) => { if (alive) { setDashboard(dashboard); setWidgets(widgets); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dashboardId]);

  useEffect(() => { setActiveDrill(null); }, [current.from, current.to]);

  const openDrill = useCallback((req: DrilldownRequest) => {
    setActiveDrill((cur) => (cur && drillSig(cur) === drillSig(req) ? null : req));
  }, []);

  // Responsive columns.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((e) => {
      const w = e[0].contentRect.width;
      setCols(w > 1180 ? 4 : w > 820 ? 3 : w > 520 ? 2 : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onOpenInList = useCallback((req: DrilldownRequest, primaryActive: boolean) => {
    window.location.hash = buildCrmHash({
      module: moduleForEntity(req.entity), entity: req.entity,
      view: { type: 'filtered-list', data: { filters: reqToSerializedFilters(req, primaryActive), contextLabel: req.contextLabel } },
    });
  }, []);

  const onOpenRecord = useCallback((id: string) => {
    setActiveDrill((cur) => {
      if (cur) window.location.hash = buildCrmHash({ module: moduleForEntity(cur.entity), entity: cur.entity, view: { type: 'record', id } });
      return cur;
    });
  }, []);

  const sorted = useMemo(
    () => [...widgets].filter((w) => w.is_visible !== false).sort((a, b) => a.sort_order - b.sort_order),
    [widgets],
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--app-bg)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Toolbar */}
      <div style={{
        padding: '12px 28px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button onClick={onBack} title="Back to gallery" style={iconBtn}><ArrowLeft size={16} /></button>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {dashboard?.name ?? 'Dashboard'}
              </h2>
              {dashboard?.is_default && <span title="Default dashboard" style={{ color: 'var(--warn-text)', display: 'inline-flex' }}><Star size={14} fill="currentColor" /></span>}
            </div>
            {dashboard?.description && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>{dashboard.description}</p>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
            {RANGE_OPTIONS.map((opt) => {
              const active = rangeKey === opt.key;
              return (
                <button key={opt.key} onClick={() => setRangeKey(opt.key)} style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: active ? 'var(--primary)' : 'transparent', color: active ? 'var(--primary-text)' : 'var(--muted)',
                }}>{opt.label}</button>
              );
            })}
          </div>
          <button onClick={() => refreshAdminData()} title="Refresh data" style={iconBtn}><RefreshCw size={15} /></button>
          {onEdit && (
            <button onClick={() => onEdit(dashboardId)} style={{ ...iconBtn, width: 'auto', padding: '8px 14px', gap: 6, color: 'var(--primary-text)', background: 'var(--primary)', border: '1px solid var(--primary)' }}>
              <Pencil size={15} /> <span style={{ fontSize: 13, fontWeight: 600 }}>Edit</span>
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 1600, margin: '0 auto' }}>
          {loading ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, padding: 32 }}>Loading dashboard…</p>
          ) : sorted.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, padding: 32, textAlign: 'center' }}>This dashboard has no widgets yet.</p>
          ) : (
            <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, alignItems: 'start' }}>
              {sorted.map((w) => {
                const span = Math.max(1, Math.min(cols, Math.round((w.width || 3) / 3)));
                const ctx: WidgetCtx = {
                  wid: w.widget_id, current, previous, drill: openDrill,
                  activeReq: activeDrill?.sectionId === w.widget_id ? activeDrill : null,
                };
                return (
                  <div key={w.widget_id} style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
                    {renderDbWidget(w, ctx)}
                  </div>
                );
              })}
            </div>
          )}

          {activeDrill && (
            <div style={{ marginTop: 18 }}>
              <DrilldownPanel
                key={drillSig(activeDrill)}
                req={activeDrill}
                userId={userId}
                onClose={() => setActiveDrill(null)}
                onOpenInList={onOpenInList}
                onOpenRecord={onOpenRecord}
              />
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes dash-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34,
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer',
};
