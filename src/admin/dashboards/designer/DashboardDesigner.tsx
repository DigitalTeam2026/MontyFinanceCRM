import { useState, useEffect, useRef, useCallback } from 'react';
import { DndContext, useDraggable, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import {
  Save, Undo2, Redo2, Eye, EyeOff, Upload, X, Loader2, Plus, Trash2,
  Copy, Lock, Unlock, EyeOff as Hide, Grid3x3,
} from 'lucide-react';
import type { DashboardDefinition, DashboardPage, DashboardVisual, VisualType, ThemeConfig } from '../types/dashboard';
import { fetchDefinition, saveDefinition, publishDashboard, fetchThemes } from '../services/dashboardService';
import { clearQueryCache } from '../services/queryEngine';
import { clearLabelResolverCache } from '../visuals/labelResolver';
import { fetchEntities } from '../../../services/entityService';
import type { EntityDefinition } from '../../../types/entity';
import { VISUAL_REGISTRY, VISUAL_GROUPS, visualsByCategory } from '../visuals/registry';
import VisualRenderer, { VisualErrorBoundary } from '../visuals/VisualRenderer';
import PropertiesPanel from './PropertiesPanel';
import { useToast, toFriendlyError } from '../../../app/context/ToastContext';

const FALLBACK_THEME: ThemeConfig = {
  pageBackground: '#0b1220', surfaceBackground: '#111a2e', cardBackground: '#16213e',
  primaryText: '#e7ecf5', secondaryText: '#8b97b0', borderColor: '#243049', gridLineColor: '#243049',
  primaryAccent: '#4f8cff', secondaryAccent: '#7c5cff', success: '#22c55e', warning: '#f59e0b', error: '#ef4444',
  chartPalette: ['#4f8cff', '#7c5cff', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#eab308'],
  fontFamily: 'Inter, system-ui, sans-serif', borderRadius: 12, shadow: '0 1px 3px rgba(0,0,0,0.4)',
};

const COLS = 24;
const ROW_H = 26;

interface Props { dashboardId: string; onExit: () => void }

export default function DashboardDesigner({ dashboardId, onExit }: Props) {
  const { showSuccess, showError } = useToast();
  const [def, setDef] = useState<DashboardDefinition | null>(null);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [theme, setTheme] = useState<ThemeConfig>(FALLBACK_THEME);
  const [pageId, setPageId] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const history = useRef<DashboardDefinition[]>([]);
  const future = useRef<DashboardDefinition[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(40);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // ── load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchEntities().then(setEntities).catch(() => {});
    fetchThemes().then((all) => {
      fetchDefinition(dashboardId).then((d) => {
        setDef(d);
        const p = d.pages.find((x) => x.is_default) ?? d.pages[0];
        setPageId(p?.dashboard_page_id ?? '');
        const th = all.find((t) => t.theme_id === d.dashboard.theme_id);
        if (th) setTheme(th.theme_config);
      }).catch((e) => showError(toFriendlyError(e)));
    }).catch(() => {});
  }, [dashboardId, showError]);

  // measure canvas
  useEffect(() => {
    const measure = () => { if (canvasRef.current) setColWidth(canvasRef.current.clientWidth / COLS); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [def, pageId, preview]);

  // warn on unsaved exit
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // ── mutation with history ─────────────────────────────────────────────────────
  const commit = useCallback((next: DashboardDefinition) => {
    setDef((cur) => { if (cur) history.current.push(cur); future.current = []; return next; });
    setDirty(true);
  }, []);

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    setDef((cur) => { if (cur) future.current.push(cur); return prev; });
    setDirty(true);
  };
  const redo = () => {
    const nxt = future.current.pop();
    if (!nxt) return;
    setDef((cur) => { if (cur) history.current.push(cur); return nxt; });
    setDirty(true);
  };

  if (!def) {
    return <div className="flex-1 flex items-center justify-center bg-slate-900 text-slate-300"><Loader2 className="animate-spin" size={20} /></div>;
  }

  const pages = [...def.pages].sort((a, b) => a.page_order - b.page_order);
  const page = pages.find((p) => p.dashboard_page_id === pageId) ?? pages[0];
  const pageVisuals = def.visuals.filter((v) => v.dashboard_page_id === page?.dashboard_page_id);
  const selected = def.visuals.find((v) => v.dashboard_visual_id === selectedId) ?? null;

  // ── visual ops ────────────────────────────────────────────────────────────────
  const addVisual = (type: VisualType) => {
    const meta = VISUAL_REGISTRY[type];
    const maxY = pageVisuals.reduce((m, v) => Math.max(m, v.y + v.height), 0);
    const dc = meta.defaultConfig();
    const v: DashboardVisual = {
      dashboard_visual_id: crypto.randomUUID(),
      dashboard_page_id: page.dashboard_page_id,
      dashboard_id: def.dashboard.dashboard_id,
      visual_type: type,
      title: meta.label,
      x: 0, y: maxY, width: meta.defaultSize.width, height: meta.defaultSize.height,
      min_width: 2, min_height: 2, z_index: pageVisuals.length, is_visible: true, is_locked: false,
      query_config: dc.query_config ?? {}, data_config: dc.data_config ?? {},
      format_config: dc.format_config ?? {}, interaction_config: dc.interaction_config ?? {},
      filter_config: dc.filter_config ?? {},
    };
    commit({ ...def, visuals: [...def.visuals, v] });
    setSelectedId(v.dashboard_visual_id);
  };

  const patchVisual = (id: string, patch: Partial<DashboardVisual>) =>
    commit({ ...def, visuals: def.visuals.map((v) => v.dashboard_visual_id === id ? { ...v, ...patch } : v) });

  const removeVisual = (id: string) => {
    commit({ ...def, visuals: def.visuals.filter((v) => v.dashboard_visual_id !== id) });
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateVisual = (id: string) => {
    const v = def.visuals.find((x) => x.dashboard_visual_id === id);
    if (!v) return;
    const copy: DashboardVisual = { ...v, dashboard_visual_id: crypto.randomUUID(), x: v.x + 1, y: v.y + 1, z_index: v.z_index + 1 };
    commit({ ...def, visuals: [...def.visuals, copy] });
    setSelectedId(copy.dashboard_visual_id);
  };

  // ── page ops ──────────────────────────────────────────────────────────────────
  const addPage = () => {
    const order = pages.length;
    const p: DashboardPage = {
      dashboard_page_id: crypto.randomUUID(), dashboard_id: def.dashboard.dashboard_id,
      name: `Page ${order + 1}`, display_name: `Page ${order + 1}`, page_order: order,
      icon: null, is_default: pages.length === 0, is_hidden: false, background_config: {}, canvas_config: {},
    };
    commit({ ...def, pages: [...def.pages, p] });
    setPageId(p.dashboard_page_id);
  };
  const renamePage = (id: string, name: string) =>
    commit({ ...def, pages: def.pages.map((p) => p.dashboard_page_id === id ? { ...p, name, display_name: name } : p) });
  const deletePage = (id: string) => {
    if (pages.length <= 1) return;
    const remaining = def.pages.filter((p) => p.dashboard_page_id !== id);
    commit({ ...def, pages: remaining, visuals: def.visuals.filter((v) => v.dashboard_page_id !== id) });
    setPageId(remaining[0].dashboard_page_id);
  };

  // ── drag / resize ───────────────────────────────────────────────────────────
  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const v = def.visuals.find((x) => x.dashboard_visual_id === id);
    if (!v || v.is_locked) return;
    const dx = Math.round(e.delta.x / colWidth);
    const dy = Math.round(e.delta.y / ROW_H);
    if (dx === 0 && dy === 0) return;
    patchVisual(id, { x: Math.max(0, Math.min(COLS - v.width, v.x + dx)), y: Math.max(0, v.y + dy) });
  };

  const resize = (id: string, w: number, h: number) => {
    const v = def.visuals.find((x) => x.dashboard_visual_id === id);
    if (!v) return;
    patchVisual(id, { width: Math.max(v.min_width, Math.min(COLS - v.x, w)), height: Math.max(v.min_height, h) });
  };

  // ── save / publish ────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    try { await saveDefinition(def); setDirty(false); clearQueryCache(); clearLabelResolverCache(); showSuccess('Dashboard saved.'); }
    catch (e) { showError(toFriendlyError(e)); }
    setSaving(false);
  };
  const publish = async () => {
    setSaving(true);
    try { await saveDefinition(def); await publishDashboard(def.dashboard.dashboard_id); setDirty(false); showSuccess('Dashboard published.'); }
    catch (e) { showError(toFriendlyError(e)); }
    setSaving(false);
  };
  const exit = () => { if (dirty && !window.confirm('Discard unsaved changes?')) return; onExit(); };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-900 text-slate-200">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 bg-slate-800 shrink-0">
        <input value={def.dashboard.name}
          onChange={(e) => commit({ ...def, dashboard: { ...def.dashboard, name: e.target.value } })}
          className="bg-transparent text-[13px] font-semibold text-white px-2 py-1 rounded hover:bg-slate-700 focus:bg-slate-700 focus:outline-none w-56" />
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${dirty ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>{dirty ? 'Unsaved' : 'Saved'}</span>
        <div className="flex-1" />
        <TbBtn onClick={undo} title="Undo" disabled={!history.current.length}><Undo2 size={15} /></TbBtn>
        <TbBtn onClick={redo} title="Redo" disabled={!future.current.length}><Redo2 size={15} /></TbBtn>
        <TbBtn onClick={() => setShowGrid((g) => !g)} title="Toggle grid" active={showGrid}><Grid3x3 size={15} /></TbBtn>
        <TbBtn onClick={() => setPreview((p) => !p)} title="Preview" active={preview}>{preview ? <EyeOff size={15} /> : <Eye size={15} />}</TbBtn>
        <div className="w-px h-5 bg-slate-700 mx-1" />
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
        </button>
        <button onClick={publish} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50">
          <Upload size={13} /> Publish
        </button>
        <TbBtn onClick={exit} title="Exit"><X size={16} /></TbBtn>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Visual library */}
        {!preview && (
          <div className="w-44 shrink-0 border-r border-slate-700 bg-slate-800 overflow-y-auto p-2">
            {VISUAL_GROUPS.map((g) => (
              <div key={g.category} className="mb-3">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 px-1">{g.icon} {g.label}</p>
                <div className="grid grid-cols-2 gap-1">
                  {visualsByCategory(g.category).map((v) => (
                    <button key={v.type} onClick={() => addVisual(v.type)} title={v.label}
                      className="flex flex-col items-center gap-1 p-2 rounded bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white text-[9px] text-center">
                      {v.icon}<span className="leading-tight">{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ background: theme.pageBackground }}>
          <div className="flex-1 overflow-auto p-4" onClick={() => setSelectedId(null)}>
            <DndContext sensors={sensors} modifiers={[restrictToParentElement]} onDragEnd={onDragEnd}>
              <div ref={canvasRef} className="relative mx-auto"
                style={{
                  width: '100%', maxWidth: 1280, minHeight: 600,
                  backgroundImage: showGrid && !preview
                    ? `linear-gradient(to right, ${theme.gridLineColor}55 1px, transparent 1px), linear-gradient(to bottom, ${theme.gridLineColor}55 1px, transparent 1px)`
                    : undefined,
                  backgroundSize: showGrid && !preview ? `${colWidth}px ${ROW_H}px` : undefined,
                }}>
                {pageVisuals.filter((v) => preview ? v.is_visible : true).map((v) => (
                  <CanvasVisual key={v.dashboard_visual_id} visual={v} theme={theme} colWidth={colWidth}
                    selected={selectedId === v.dashboard_visual_id} preview={preview}
                    onSelect={() => setSelectedId(v.dashboard_visual_id)}
                    onResize={(w, h) => resize(v.dashboard_visual_id, w, h)}
                    onDelete={() => removeVisual(v.dashboard_visual_id)}
                    onDuplicate={() => duplicateVisual(v.dashboard_visual_id)}
                    onToggleLock={() => patchVisual(v.dashboard_visual_id, { is_locked: !v.is_locked })}
                    onToggleHide={() => patchVisual(v.dashboard_visual_id, { is_visible: !v.is_visible })}
                  />
                ))}
                {!pageVisuals.length && (
                  <div className="absolute inset-0 flex items-center justify-center text-[12px]" style={{ color: theme.secondaryText }}>
                    Add a visual from the left panel to begin.
                  </div>
                )}
              </div>
            </DndContext>
          </div>

          {/* Page tabs */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-t border-slate-700 bg-slate-800 shrink-0 overflow-x-auto">
            {pages.map((p) => (
              <div key={p.dashboard_page_id}
                className={`group flex items-center gap-1 px-2.5 py-1 rounded text-[11px] cursor-pointer ${p.dashboard_page_id === pageId ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}
                onClick={() => { setPageId(p.dashboard_page_id); setSelectedId(null); }}
                onDoubleClick={() => { const n = window.prompt('Page name', p.name); if (n) renamePage(p.dashboard_page_id, n); }}>
                {p.name}
                {pages.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); deletePage(p.dashboard_page_id); }} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"><Trash2 size={11} /></button>
                )}
              </div>
            ))}
            <button onClick={addPage} className="p-1 text-slate-400 hover:text-white" title="Add page"><Plus size={14} /></button>
          </div>
        </div>

        {/* Properties */}
        {!preview && selected && (
          <PropertiesPanel visual={selected} entities={entities}
            onChange={(patch) => patchVisual(selected.dashboard_visual_id, patch)} />
        )}
      </div>
    </div>
  );
}

// ── canvas visual (draggable + resizable) ──────────────────────────────────────
function CanvasVisual({ visual, theme, colWidth, selected, preview, onSelect, onResize, onDelete, onDuplicate, onToggleLock, onToggleHide }: {
  visual: DashboardVisual; theme: ThemeConfig; colWidth: number; selected: boolean; preview: boolean;
  onSelect: () => void; onResize: (w: number, h: number) => void; onDelete: () => void;
  onDuplicate: () => void; onToggleLock: () => void; onToggleHide: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: visual.dashboard_visual_id, disabled: preview || visual.is_locked,
  });
  const left = visual.x * colWidth;
  const top = visual.y * ROW_H;
  const width = visual.width * colWidth;
  const height = visual.height * ROW_H;
  const tf = transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined;

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    const sx = e.clientX, sy = e.clientY, sw = visual.width, sh = visual.height;
    const move = (ev: PointerEvent) => {
      onResize(sw + Math.round((ev.clientX - sx) / colWidth), sh + Math.round((ev.clientY - sy) / ROW_H));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  return (
    <div ref={setNodeRef}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className="absolute group"
      style={{
        left, top, width, height, transform: tf, zIndex: isDragging ? 1000 : visual.z_index,
        opacity: visual.is_visible ? 1 : 0.4,
      }}>
      <div className="w-full h-full rounded-lg overflow-hidden relative flex flex-col"
        style={{
          background: theme.cardBackground, border: `1px solid ${selected ? theme.primaryAccent : theme.borderColor}`,
          boxShadow: theme.shadow, borderRadius: theme.borderRadius,
        }}>
        {visual.format_config.showHeader !== false && (
          <div {...(preview ? {} : { ...attributes, ...listeners })}
            className={`px-2.5 pt-2 pb-1 text-[11px] font-medium shrink-0 ${preview || visual.is_locked ? '' : 'cursor-move'}`}
            style={{ color: theme.primaryText }}>
            {visual.title}
          </div>
        )}
        <div className="flex-1 min-h-0">
          <VisualErrorBoundary theme={theme}>
            <VisualRenderer visual={visual} theme={theme} live />
          </VisualErrorBoundary>
        </div>

        {/* invisible drag layer for header-less visuals */}
        {!preview && !visual.is_locked && visual.format_config.showHeader === false && (
          <div {...attributes} {...listeners} className="absolute inset-0 cursor-move" style={{ background: 'transparent' }} onClick={(e) => { e.stopPropagation(); onSelect(); }} />
        )}
      </div>

      {selected && !preview && (
        <>
          <div className="absolute -top-7 right-0 flex items-center gap-0.5 bg-slate-800 border border-slate-600 rounded px-1 py-0.5 z-[1001]">
            <IconBtn title="Duplicate" onClick={onDuplicate}><Copy size={12} /></IconBtn>
            <IconBtn title={visual.is_locked ? 'Unlock' : 'Lock'} onClick={onToggleLock}>{visual.is_locked ? <Lock size={12} /> : <Unlock size={12} />}</IconBtn>
            <IconBtn title="Hide" onClick={onToggleHide}><Hide size={12} /></IconBtn>
            <IconBtn title="Delete" onClick={onDelete} danger><Trash2 size={12} /></IconBtn>
          </div>
          <div onPointerDown={startResize}
            className="absolute -bottom-1 -right-1 w-3 h-3 rounded-sm cursor-nwse-resize z-[1001]"
            style={{ background: theme.primaryAccent }} />
        </>
      )}
    </div>
  );
}

function TbBtn({ children, onClick, title, disabled, active }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`p-1.5 rounded disabled:opacity-30 ${active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
      {children}
    </button>
  );
}
function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return <button title={title} onClick={(e) => { e.stopPropagation(); onClick(); }} className={`p-1 rounded hover:bg-slate-700 ${danger ? 'text-red-400' : 'text-slate-300'}`}>{children}</button>;
}
