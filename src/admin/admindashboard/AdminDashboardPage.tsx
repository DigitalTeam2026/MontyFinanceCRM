// Customizable, Power BI-like Admin Dashboard.
//
// Shows the SAME analytics as the per-user Sales Dashboard (identical fetchers +
// card styling) but scoped by RLS to ALL records an admin can read. On top of
// that it adds frontend-only customization: the admin toggles "Customize" to
// drag-and-drop reorder, add, remove, and CONFIGURE cards (repoint a card at a
// different source/metric/condition — e.g. Opportunities where status = Lost),
// then Save (to localStorage) or Reset. No backend tables are touched.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutGrid, Plus, RotateCcw, Save, Check, X, GripVertical, Search, RefreshCw, Trash2, Settings, Copy,
} from 'lucide-react';
import { RANGE_OPTIONS, resolveRange, type RangeKey } from '../../app/pages/dashboard/theme';
import {
  WIDGET_REGISTRY, WIDGET_BY_ID, type WidgetCtx, type WidgetDef, type LayoutItem,
} from './widgets';
import { defaultKpiConfig, defaultChartConfig, type WidgetConfig } from './entityMeta';
import { loadLayout, saveLayout, clearLayout, layoutsEqual, defaultLayout, newInstanceId } from './layoutStore';
import { refreshAdminData } from './adminData';
import WidgetConfigPanel from './WidgetConfigPanel';
import DrilldownPanel from '../../app/pages/dashboard/DrilldownPanel';
import type { DrilldownRequest } from '../../app/pages/dashboard/drilldown';
import { buildCrmHash, moduleForEntity, type SerializedFilter } from '../../lib/appRoute';

interface AdminDashboardPageProps {
  userId: string;
}

/** Stable signature for a drill request — drives the open/close toggle. */
function drillSig(req: DrilldownRequest): string {
  const cons = (req.constraints ?? []).map((c) => `${c.field}=${c.value}`).join('&');
  return `${req.sectionId}|${req.entity}|${req.dateField}|${req.primary?.field ?? ''}=${req.primary?.value ?? ''}|${cons}`;
}

/** Convert a drill request into CRM list-page filters for "Open in <Entity> list →". */
function reqToSerializedFilters(req: DrilldownRequest, primaryActive: boolean): SerializedFilter[] {
  const fromStr = req.dateRange.from.slice(0, 10);
  const toDate = new Date(req.dateRange.to);
  toDate.setUTCDate(toDate.getUTCDate() - 1); // range.to is exclusive — step back for on_or_before
  const toStr = toDate.toISOString().slice(0, 10);
  const filters: SerializedFilter[] = [
    { id: 'dash_from', field: req.dateField, label: 'On or after', operator: 'on_or_after', value: fromStr },
    { id: 'dash_to', field: req.dateField, label: 'On or before', operator: 'on_or_before', value: toStr },
  ];
  for (const c of req.constraints ?? []) {
    filters.push({ id: c.id, field: c.field, label: c.label, operator: c.operator, value: c.value });
  }
  if (primaryActive && req.primary && !req.primary.field.startsWith('__')) {
    filters.unshift({ id: req.primary.id, field: req.primary.field, label: req.primary.label, operator: req.primary.operator, value: req.primary.value });
  }
  return filters;
}

export default function AdminDashboardPage({ userId }: AdminDashboardPageProps) {
  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const { current, previous } = resolveRange(rangeKey);

  const [layout, setLayout] = useState<LayoutItem[]>(() => loadLayout());
  const [saved, setSaved] = useState<LayoutItem[]>(layout);
  const [editing, setEditing] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = !layoutsEqual(layout, saved);

  const [activeDrill, setActiveDrill] = useState<DrilldownRequest | null>(null);
  useEffect(() => { setActiveDrill(null); }, [current.from, current.to]);

  const openDrill = useCallback((req: DrilldownRequest) => {
    setActiveDrill((cur) => (cur && drillSig(cur) === drillSig(req) ? null : req));
  }, []);

  // ── Responsive column count ────────────────────────────────────────────────
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      setCols(w > 1180 ? 4 : w > 820 ? 3 : w > 520 ? 2 : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Layout mutations ───────────────────────────────────────────────────────
  const removeWidget = useCallback((instanceId: string) => {
    setLayout((prev) => prev.filter((it) => it.i !== instanceId));
    setActiveDrill((cur) => (cur?.sectionId === instanceId ? null : cur));
    setConfiguringId((cur) => (cur === instanceId ? null : cur));
  }, []);

  const addCurated = useCallback((defId: string) => {
    // Duplicates allowed — each gets its own instance id.
    setLayout((prev) => [...prev, { i: newInstanceId(defId), def: defId }]);
  }, []);

  const cloneWidget = useCallback((instanceId: string) => {
    setLayout((prev) => {
      const idx = prev.findIndex((it) => it.i === instanceId);
      if (idx === -1) return prev;
      const src = prev[idx];
      const copy: LayoutItem = { i: newInstanceId(src.def), def: src.def, cfg: src.cfg ? { ...src.cfg } : undefined };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }, []);

  const addCustom = useCallback((defId: 'custom.kpi' | 'custom.chart') => {
    const cfg: WidgetConfig = defId === 'custom.kpi' ? defaultKpiConfig() : defaultChartConfig();
    const id = newInstanceId(defId);
    setLayout((prev) => [...prev, { i: id, def: defId, cfg }]);
    setPaletteOpen(false);
    setConfiguringId(id);
  }, []);

  const applyConfig = useCallback((instanceId: string, cfg: WidgetConfig) => {
    setLayout((prev) => prev.map((it) => (it.i === instanceId ? { ...it, cfg } : it)));
  }, []);

  const onSave = useCallback(() => {
    saveLayout(layout);
    setSaved(layout);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  }, [layout]);

  const onReset = useCallback(() => {
    if (!window.confirm('Reset to the default dashboard layout? Your customizations will be discarded.')) return;
    clearLayout();
    const def = defaultLayout();
    setLayout(def);
    setSaved(def);
    setActiveDrill(null);
    setConfiguringId(null);
  }, []);

  // ── Drag-and-drop reordering (native HTML5 DnD) ────────────────────────────
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const onDrop = useCallback((targetIndex: number) => {
    setLayout((prev) => {
      if (dragIndex === null || dragIndex === targetIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
    setOverIndex(null);
  }, [dragIndex]);

  // ── Drill-down panel callbacks (deep-link into the CRM) ────────────────────
  const onOpenInList = useCallback((req: DrilldownRequest, primaryActive: boolean) => {
    const filters = reqToSerializedFilters(req, primaryActive);
    window.location.hash = buildCrmHash({
      module: moduleForEntity(req.entity), entity: req.entity,
      view: { type: 'filtered-list', data: { filters, contextLabel: req.contextLabel } },
    });
  }, []);

  const onOpenRecord = useCallback((id: string) => {
    setActiveDrill((cur) => {
      if (cur) {
        window.location.hash = buildCrmHash({ module: moduleForEntity(cur.entity), entity: cur.entity, view: { type: 'record', id } });
      }
      return cur;
    });
  }, []);

  const configuringItem = useMemo(
    () => (configuringId ? layout.find((it) => it.i === configuringId) : undefined),
    [configuringId, layout],
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--app-bg)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Toolbar */}
      <div style={{
        padding: '12px 28px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', flexShrink: 0,
      }}>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          Showing <b style={{ color: 'var(--text)' }}>all organization records</b> · {layout.length} widget{layout.length === 1 ? '' : 's'}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
            {RANGE_OPTIONS.map((opt) => {
              const active = rangeKey === opt.key;
              return (
                <button key={opt.key} onClick={() => setRangeKey(opt.key)} style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'var(--primary-text)' : 'var(--muted)', transition: 'all .15s ease',
                }}>
                  {opt.label}
                </button>
              );
            })}
          </div>

          <IconButton title="Refresh data" onClick={() => refreshAdminData()}><RefreshCw size={15} /></IconButton>

          {!editing ? (
            <PrimaryButton onClick={() => setEditing(true)}><LayoutGrid size={15} /> Customize</PrimaryButton>
          ) : (
            <>
              <SecondaryButton onClick={() => setPaletteOpen(true)}><Plus size={15} /> Add widget</SecondaryButton>
              <SecondaryButton onClick={onReset}><RotateCcw size={15} /> Reset</SecondaryButton>
              <PrimaryButton onClick={onSave} disabled={!dirty && !justSaved}>
                {justSaved ? <><Check size={15} /> Saved</> : <><Save size={15} /> Save{dirty ? ' *' : ''}</>}
              </PrimaryButton>
              <SecondaryButton onClick={() => { setEditing(false); setPaletteOpen(false); setConfiguringId(null); }}><Check size={15} /> Done</SecondaryButton>
            </>
          )}
        </div>
      </div>

      {editing && (
        <div style={{
          padding: '8px 28px', background: 'color-mix(in srgb, var(--link) 8%, var(--surface))',
          borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap',
        }}>
          <GripVertical size={14} /> Drag to reorder · <Settings size={13} /> gear to change a card's source/condition · <Trash2 size={13} /> to remove · <b style={{ color: 'var(--text)' }}>Add widget</b> to insert more · <b style={{ color: 'var(--text)' }}>Save</b> to keep this layout.
        </div>
      )}

      {/* Widget grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 1600, margin: '0 auto' }}>
          {layout.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 16px', color: 'var(--muted)' }}>
              <p style={{ fontSize: 14, margin: '0 0 12px' }}>No widgets on the dashboard.</p>
              <PrimaryButton onClick={() => { setEditing(true); setPaletteOpen(true); }}><Plus size={15} /> Add a widget</PrimaryButton>
            </div>
          ) : (
            <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, alignItems: 'start' }}>
              {layout.map((item, index) => {
                const def = WIDGET_BY_ID[item.def];
                if (!def) return null;
                const ctx: WidgetCtx = {
                  wid: item.i, current, previous, drill: openDrill,
                  activeReq: activeDrill?.sectionId === item.i ? activeDrill : null,
                  config: item.cfg,
                };
                const span = Math.min(def.span, cols);
                return (
                  <div
                    key={item.i}
                    draggable={editing}
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => { if (editing) { e.preventDefault(); if (overIndex !== index) setOverIndex(index); } }}
                    onDrop={() => onDrop(index)}
                    onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                    style={{
                      gridColumn: `span ${span}`, position: 'relative', borderRadius: 10,
                      outline: editing && overIndex === index && dragIndex !== index ? '2px dashed var(--link)' : 'none',
                      outlineOffset: 2, opacity: dragIndex === index ? 0.4 : 1, transition: 'opacity .15s ease',
                    }}
                  >
                    {editing && (
                      <EditChrome
                        configurable={!!def.configurable}
                        onConfigure={() => setConfiguringId(item.i)}
                        onClone={() => cloneWidget(item.i)}
                        onRemove={() => removeWidget(item.i)}
                      />
                    )}
                    <div style={editing ? { pointerEvents: 'none', userSelect: 'none' } : undefined}>
                      <WidgetView def={def} ctx={ctx} />
                    </div>
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

      {paletteOpen && (
        <WidgetPalette
          onAddCurated={addCurated}
          onAddCustom={addCustom}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {configuringItem && configuringItem.cfg && (
        <WidgetConfigPanel
          key={configuringItem.i}
          config={configuringItem.cfg}
          onApply={(cfg) => applyConfig(configuringItem.i, cfg)}
          onClose={() => setConfiguringId(null)}
        />
      )}

      <style>{`
        @keyframes dash-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </div>
  );
}

/** Renders a widget definition inside its own component boundary so its hooks
 *  stay stable across drag-reorders (the keyed wrapper preserves identity). */
function WidgetView({ def, ctx }: { def: WidgetDef; ctx: WidgetCtx }) {
  return def.Comp(ctx);
}

/** Edit-mode chrome: drag handle + optional configure gear + clone + remove. */
function EditChrome({ configurable, onConfigure, onClone, onRemove }: { configurable: boolean; onConfigure: () => void; onClone: () => void; onRemove: () => void }) {
  const chip: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
    borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)',
  };
  return (
    <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 5, display: 'flex', gap: 6, pointerEvents: 'auto' }}>
      <span title="Drag to move" style={{ ...chip, color: 'var(--muted)', cursor: 'grab' }}><GripVertical size={14} /></span>
      {configurable && (
        <button title="Configure source & condition" onClick={onConfigure} style={{ ...chip, color: 'var(--link)', cursor: 'pointer' }}><Settings size={14} /></button>
      )}
      <button title="Duplicate this widget" onClick={onClone} style={{ ...chip, color: 'var(--text)', cursor: 'pointer' }}><Copy size={14} /></button>
      <button title="Remove widget" onClick={onRemove} style={{ ...chip, color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={14} /></button>
    </div>
  );
}

// ── Add-widget palette (right drawer) ────────────────────────────────────────

function WidgetPalette({ onAddCurated, onAddCustom, onClose }: {
  onAddCurated: (id: string) => void;
  onAddCustom: (id: 'custom.kpi' | 'custom.chart') => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  // Ready-made cards can be added any number of times (duplicates allowed).
  const customDefs = WIDGET_REGISTRY.filter((w) => w.custom);
  const curatedAvailable = WIDGET_REGISTRY.filter((w) => !w.custom);

  const matches = (w: WidgetDef) => !q || w.title.toLowerCase().includes(q) || w.group.toLowerCase().includes(q);

  // Group curated available by their group, preserving registry order.
  const groups: { group: string; items: WidgetDef[] }[] = [];
  for (const w of curatedAvailable.filter(matches)) {
    let g = groups.find((x) => x.group === w.group);
    if (!g) { g = { group: w.group, items: [] }; groups.push(g); }
    g.items.push(w);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{
        position: 'relative', width: 380, maxWidth: '92vw', height: '100%', background: 'var(--surface)',
        borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Add a widget</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0 0' }}>Build your own, or add a ready-made card</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 24px' }}>
          {/* Build your own */}
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px' }}>Build your own</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {customDefs.map((w) => (
              <button key={w.id} onClick={() => onAddCustom(w.id as 'custom.kpi' | 'custom.chart')} style={builderBtnStyle}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{w.title}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>Pick a source, metric & condition</span>
                </span>
                <span style={addPill}><Settings size={13} /> Configure</span>
              </button>
            ))}
          </div>

          {/* Ready-made cards */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', flex: 1 }}>
                <Search size={15} color="var(--muted)" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ready-made cards…"
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)' }} />
              </div>
            </div>

            {curatedAvailable.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>Every ready-made card is already on the dashboard.</p>
            ) : groups.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>No cards match “{query}”.</p>
            ) : (
              groups.map((g) => (
                <div key={g.group} style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px' }}>{g.group}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {g.items.map((w) => (
                      <button key={w.id} onClick={() => onAddCurated(w.id)} style={builderBtnStyle}>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{w.title}</span>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{w.type === 'kpi' ? 'KPI card' : 'Chart'}</span>
                        </span>
                        <span style={addPill}><Plus size={14} /> Add</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const builderBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', width: '100%',
};

const addPill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--link)', flexShrink: 0,
};

// ── Buttons ───────────────────────────────────────────────────────────────────

const baseBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
  fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s ease',
};

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...baseBtn, border: '1px solid var(--primary)',
      background: disabled ? 'var(--surface-2)' : 'var(--primary)',
      color: disabled ? 'var(--muted)' : 'var(--primary-text)',
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1,
    }}>
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ ...baseBtn, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
      {children}
    </button>
  );
}

function IconButton({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{ ...baseBtn, padding: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)' }}>
      {children}
    </button>
  );
}
