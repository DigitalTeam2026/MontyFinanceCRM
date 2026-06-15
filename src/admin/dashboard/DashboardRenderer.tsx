// THE shared dashboard renderer — one component, two modes.
//
//   mode="view"  → Sales Dashboard runtime (published) and the Admin viewer.
//   mode="edit"  → Admin Studio designer: select / configure / drag / duplicate /
//                  delete / add widgets, then Save (writes the live draft rows).
//
// Both modes render the SAME widgets through the SAME engine (renderDbWidget), so
// what an admin edits is exactly what Sales shows. There is no second canvas.
//
// Draft/publish: Admin Studio reads the LIVE rows (metadata snapshot is not
// hydrated there) so edits are visible immediately to the admin; Sales reads the
// PUBLISHED snapshot, so users only see changes after a Publish All.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Pencil, RefreshCw, Star, Plus, Save, Check, RotateCcw, GripVertical, Copy, Trash2, Settings,
} from 'lucide-react';
import { RANGE_OPTIONS, resolveRange, type RangeKey } from '../../app/pages/dashboard/theme';
import { fetchDashboardWithWidgets, upsertWidgets } from '../../services/dashboardService';
import type { Dashboard, DashboardWidget, DashboardWidgetInput } from '../../types/dashboard';
import { renderDbWidget } from './runtime/renderDbWidget';
import DashboardConfigPanel from './config/DashboardConfigPanel';
import type { WidgetCtx } from '../admindashboard/widgets';
import { refreshAdminData } from '../admindashboard/adminData';
import DrilldownPanel from '../../app/pages/dashboard/DrilldownPanel';
import type { DrilldownRequest } from '../../app/pages/dashboard/drilldown';
import { buildCrmHash, moduleForEntity, type SerializedFilter } from '../../lib/appRoute';

interface Props {
  dashboardId: string;
  userId: string;
  mode: 'view' | 'edit';
  onBack?: () => void;
  onRequestEdit?: () => void;
  onExitEdit?: () => void;
  canEdit?: boolean;
}

function drillSig(req: DrilldownRequest): string {
  const cons = (req.constraints ?? []).map((c) => `${c.field}=${c.value}`).join('&');
  return `${req.sectionId}|${req.entity}|${req.dateField}|${req.primary?.field ?? ''}=${req.primary?.value ?? ''}|${cons}`;
}

function reqToSerializedFilters(req: DrilldownRequest, primaryActive: boolean): SerializedFilter[] {
  const fromStr = req.dateRange.from.slice(0, 10);
  const toDate = new Date(req.dateRange.to); toDate.setUTCDate(toDate.getUTCDate() - 1);
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

let tempSeq = 0;
function newWidget(dashboardId: string): DashboardWidget {
  tempSeq += 1;
  return {
    widget_id: `temp-${tempSeq}`,
    dashboard_id: dashboardId,
    widget_type: 'kpi',
    title: 'New KPI',
    config_json: {},
    position_x: 0, position_y: 0, width: 3, height: 2, sort_order: 9999,
    data_source_type: 'entity', entity_name: 'opportunities',
    query_definition: { entity: 'opportunities', measure: 'count' },
    visual_config: { chartType: 'kpi' }, is_visible: true,
  };
}

interface Group { name: string | null; items: DashboardWidget[] }

export default function DashboardRenderer({ dashboardId, userId, mode, onBack, onRequestEdit, onExitEdit, canEdit }: Props) {
  const editing = mode === 'edit';
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [savedWidgets, setSavedWidgets] = useState<DashboardWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const { current, previous } = resolveRange(rangeKey);
  const [activeDrill, setActiveDrill] = useState<DrilldownRequest | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchDashboardWithWidgets(dashboardId)
      .then(({ dashboard, widgets }) => {
        if (!alive) return;
        setDashboard(dashboard);
        setWidgets(widgets);
        setSavedWidgets(widgets);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dashboardId]);

  useEffect(() => { setActiveDrill(null); }, [current.from, current.to]);

  const dirty = useMemo(() => JSON.stringify(widgets) !== JSON.stringify(savedWidgets), [widgets, savedWidgets]);

  const openDrill = useCallback((req: DrilldownRequest) => {
    if (editing) return; // in edit mode, clicks select the widget instead of drilling
    setActiveDrill((cur) => (cur && drillSig(cur) === drillSig(req) ? null : req));
  }, [editing]);

  // Responsive columns.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((e) => {
      const wd = e[0].contentRect.width;
      setCols(wd > 1180 ? 4 : wd > 820 ? 3 : wd > 520 ? 2 : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onOpenInList = useCallback((req: DrilldownRequest, primaryActive: boolean) => {
    window.location.hash = buildCrmHash({ module: moduleForEntity(req.entity), entity: req.entity, view: { type: 'filtered-list', data: { filters: reqToSerializedFilters(req, primaryActive), contextLabel: req.contextLabel } } });
  }, []);
  const onOpenRecord = useCallback((id: string) => {
    setActiveDrill((cur) => { if (cur) window.location.hash = buildCrmHash({ module: moduleForEntity(cur.entity), entity: cur.entity, view: { type: 'record', id } }); return cur; });
  }, []);

  // ── Edit operations ──────────────────────────────────────────────────────
  const updateWidgetDraft = useCallback((next: DashboardWidget) => {
    setWidgets((prev) => prev.map((w) => (w.widget_id === next.widget_id ? next : w)));
  }, []);
  const duplicateWidget = useCallback((id: string) => {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.widget_id === id);
      if (idx === -1) return prev;
      tempSeq += 1;
      const copy: DashboardWidget = { ...prev[idx], widget_id: `temp-${tempSeq}` };
      const next = [...prev]; next.splice(idx + 1, 0, copy); return next;
    });
  }, []);
  const deleteWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.widget_id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);
  const addWidget = useCallback(() => {
    const w = newWidget(dashboardId);
    setWidgets((prev) => [...prev, w]);
    setSelectedId(w.widget_id);
  }, [dashboardId]);

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      const inputs: DashboardWidgetInput[] = widgets.map((w, i) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { widget_id: _w, ...rest } = w;
        return { ...rest, dashboard_id: dashboardId, sort_order: i } as DashboardWidgetInput;
      });
      await upsertWidgets(dashboardId, inputs);
      const { widgets: fresh } = await fetchDashboardWithWidgets(dashboardId);
      setWidgets(fresh); setSavedWidgets(fresh);
    } finally {
      setSaving(false);
    }
  }, [widgets, dashboardId]);

  const onReset = useCallback(() => { setWidgets(savedWidgets); setSelectedId(null); }, [savedWidgets]);

  // ── Drag reorder (edit) ──────────────────────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);
  const onDropOn = useCallback((targetId: string) => {
    setWidgets((prev) => {
      if (!dragId || dragId === targetId) return prev;
      const from = prev.findIndex((w) => w.widget_id === dragId);
      const to = prev.findIndex((w) => w.widget_id === targetId);
      if (from === -1 || to === -1) return prev;
      // Adopt the target's section so dragging across sections moves the widget.
      const targetSection = prev[to].query_definition?.section;
      const moved: DashboardWidget = { ...prev[from], query_definition: { ...(prev[from].query_definition ?? {}), section: targetSection } };
      const without = prev.filter((_, i) => i !== from);
      const insertAt = without.findIndex((w) => w.widget_id === targetId);
      return [...without.slice(0, insertAt), moved, ...without.slice(insertAt)];
    });
    setDragId(null);
  }, [dragId]);

  // ── Grouping by section ──────────────────────────────────────────────────
  const groups: Group[] = useMemo(() => {
    const ordered = [...widgets].sort((a, b) => a.sort_order - b.sort_order);
    const visible = ordered.filter((w) => editing || w.is_visible !== false);
    const top = visible.filter((w) => !w.query_definition?.section);
    const names: string[] = [];
    for (const w of visible) { const s = w.query_definition?.section; if (s && !names.includes(s)) names.push(s); }
    const result: Group[] = [];
    if (top.length) result.push({ name: null, items: top });
    for (const n of names) result.push({ name: n, items: visible.filter((w) => w.query_definition?.section === n) });
    return result;
  }, [widgets, editing]);

  const selected = selectedId ? widgets.find((w) => w.widget_id === selectedId) ?? null : null;

  const renderWidget = (w: DashboardWidget) => {
    const span = Math.max(1, Math.min(cols, Math.round((w.width || 3) / 3)));
    const ctx: WidgetCtx = { wid: w.widget_id, current, previous, drill: openDrill, activeReq: activeDrill?.sectionId === w.widget_id ? activeDrill : null };
    const isSel = editing && selectedId === w.widget_id;
    return (
      <div
        key={w.widget_id}
        draggable={editing}
        onDragStart={() => editing && setDragId(w.widget_id)}
        onDragOver={(e) => { if (editing) e.preventDefault(); }}
        onDrop={() => editing && onDropOn(w.widget_id)}
        onDragEnd={() => setDragId(null)}
        style={{
          gridColumn: `span ${span}`, position: 'relative', borderRadius: 10, minWidth: 0,
          outline: isSel ? '2px solid var(--primary)' : 'none', outlineOffset: 2,
          opacity: dragId === w.widget_id ? 0.4 : 1,
        }}
      >
        {editing && (
          <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 5, display: 'flex', gap: 6, pointerEvents: 'auto' }}>
            <span title="Drag" style={chip('var(--muted)')}><GripVertical size={14} /></span>
            <button title="Settings" onClick={() => setSelectedId(w.widget_id)} style={chipBtn('var(--link)')}><Settings size={14} /></button>
            <button title="Duplicate" onClick={() => duplicateWidget(w.widget_id)} style={chipBtn('var(--text)')}><Copy size={14} /></button>
            <button title="Delete" onClick={() => deleteWidget(w.widget_id)} style={chipBtn('var(--danger)')}><Trash2 size={14} /></button>
          </div>
        )}
        <div
          onClick={editing ? () => setSelectedId(w.widget_id) : undefined}
          style={editing ? { pointerEvents: 'none', userSelect: 'none' } : undefined}
        >
          {renderDbWidget(w, ctx)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--app-bg)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Toolbar */}
      <div style={{ padding: '12px 28px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {onBack && <button onClick={onBack} title="Back" style={iconBtn}><ArrowLeft size={16} /></button>}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dashboard?.name ?? 'Dashboard'}</h2>
              {dashboard?.is_default && <span title="Default" style={{ color: 'var(--warn-text)', display: 'inline-flex' }}><Star size={14} fill="currentColor" /></span>}
              {editing && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--link)', background: 'color-mix(in srgb, var(--link) 14%, transparent)', padding: '2px 8px', borderRadius: 10 }}>EDITING DRAFT</span>}
            </div>
            {dashboard?.description && !editing && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>{dashboard.description}</p>}
            {editing && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>Edits are saved as a draft — users see them after <b style={{ color: 'var(--text)' }}>Publish All</b>.</p>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
            {RANGE_OPTIONS.map((opt) => {
              const active = rangeKey === opt.key;
              return <button key={opt.key} onClick={() => setRangeKey(opt.key)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: active ? 'var(--primary)' : 'transparent', color: active ? 'var(--primary-text)' : 'var(--muted)' }}>{opt.label}</button>;
            })}
          </div>
          <button onClick={() => refreshAdminData()} title="Refresh data" style={iconBtn}><RefreshCw size={15} /></button>
          {!editing && canEdit && onRequestEdit && (
            <button onClick={onRequestEdit} style={primaryBtn}><Pencil size={15} /> Edit</button>
          )}
          {editing && (
            <>
              <button onClick={addWidget} style={secondaryBtn}><Plus size={15} /> Add widget</button>
              <button onClick={onReset} style={secondaryBtn}><RotateCcw size={15} /> Reset</button>
              <button onClick={onSave} disabled={!dirty || saving} style={{ ...primaryBtn, opacity: !dirty || saving ? 0.6 : 1, cursor: !dirty || saving ? 'default' : 'pointer' }}>
                {saving ? <>Saving…</> : <><Save size={15} /> Save{dirty ? ' *' : ''}</>}
              </button>
              {onExitEdit && <button onClick={onExitEdit} style={secondaryBtn}><Check size={15} /> Done</button>}
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div ref={gridRef} style={{ maxWidth: 1600, margin: '0 auto' }}>
          {loading ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, padding: 32 }}>Loading dashboard…</p>
          ) : groups.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, padding: 32, textAlign: 'center' }}>This dashboard has no widgets yet.{editing ? ' Click “Add widget”.' : ''}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {groups.map((g, gi) => (
                <section key={g.name ?? `top-${gi}`}>
                  {g.name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 14px' }}>
                      <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0, textTransform: 'uppercase', letterSpacing: '.04em' }}>{g.name}</h3>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, alignItems: 'start' }}>
                    {g.items.map(renderWidget)}
                  </div>
                </section>
              ))}
            </div>
          )}

          {activeDrill && (
            <div style={{ marginTop: 18 }}>
              <DrilldownPanel key={drillSig(activeDrill)} req={activeDrill} userId={userId} onClose={() => setActiveDrill(null)} onOpenInList={onOpenInList} onOpenRecord={onOpenRecord} />
            </div>
          )}
        </div>
      </div>

      {editing && selected && (
        <DashboardConfigPanel widget={selected} onChange={updateWidgetDraft} onClose={() => setSelectedId(null)} />
      )}

      <style>{`@keyframes dash-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' };
const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--primary)', background: 'var(--primary)', color: 'var(--primary-text)' };
const secondaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' };
const chip = (color: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', color, cursor: 'grab' });
const chipBtn = (color: string): React.CSSProperties => ({ ...chip(color), cursor: 'pointer' });
