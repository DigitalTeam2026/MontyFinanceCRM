import { uuid } from '../../../lib/uuid';
import { useState, useEffect, useRef, useCallback } from 'react';
import { DndContext, useDraggable, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import {
  Save, Undo2, Redo2, Eye, EyeOff, Upload, X, Loader2, Plus, Trash2,
  Copy, Lock, Unlock, EyeOff as Hide, Grid3x3, Workflow, Filter as FilterIcon, Sparkles, Ban,
  ArrowLeftToLine, ArrowRightToLine, Settings2,
} from 'lucide-react';
import type {
  DashboardDefinition, DashboardPage, DashboardVisual, VisualType, ThemeConfig, InteractionMode,
  DashboardSemanticFilter, DashboardFilterMapping,
} from '../types/dashboard';
import { fetchDefinition, saveDefinition, publishDashboard } from '../services/dashboardService';
import { suggestDateField } from '../services/relationshipService';
import { clearQueryCache } from '../services/queryEngine';
import { clearLabelResolverCache } from '../visuals/labelResolver';
import { fetchEntities } from '../../../services/entityService';
import type { EntityDefinition } from '../../../types/entity';
import { VISUAL_REGISTRY, VISUAL_GROUPS, visualsByCategory } from '../visuals/registry';
import VisualRenderer, { VisualErrorBoundary } from '../visuals/VisualRenderer';
import { useSlicerFilters, buildSlicerEmit } from '../visuals/useSlicerFilters';
import { useCrossFilter } from '../visuals/useCrossFilter';
import { useDashboardSemanticFilters } from '../visuals/semanticRuntime';
import GlobalFiltersPanel from './GlobalFiltersPanel';
import FilterSummaryBar from '../../../app/components/dashboard/FilterSummaryBar';
import PropertiesPanel from './PropertiesPanel';
import { useAppThemeConfig } from '../visuals/useAppThemeConfig';
import { useToast, toFriendlyError } from '../../../app/context/ToastContext';

const COLS = 24;
const ROW_H = 26;
// Canvas is a free-form, unbounded vertical surface (Power BI-style). The floor
// keeps an empty page usable; the drag pad reserves empty space below the lowest
// card so a card can always be dragged further down — the canvas then re-grows on
// drop, so the page extends downward indefinitely instead of forcing a new page.
const CANVAS_MIN_H = 600;
const CANVAS_DRAG_PAD = 360;

/**
 * Effective canvas height in px. In 'auto' mode the canvas grows to fit the
 * lowest card (plus drag padding in the builder); in 'fixed' mode it honours the
 * page's configured height. Either way the canvas can exceed the viewport and the
 * scroll container handles vertical scrolling — one page, unlimited length.
 */
function canvasHeightPx(page: DashboardPage | undefined, visuals: DashboardVisual[], preview: boolean): number {
  const contentBottom = visuals.reduce((m, v) => Math.max(m, v.y + v.height), 0) * ROW_H;
  if (page?.canvas_config?.heightMode === 'fixed' && page.canvas_config.canvasHeight) {
    return Math.max(page.canvas_config.canvasHeight, CANVAS_MIN_H);
  }
  return Math.max(CANVAS_MIN_H, contentBottom + (preview ? 24 : CANVAS_DRAG_PAD));
}

interface Props { dashboardId: string; onExit: () => void }

export default function DashboardDesigner({ dashboardId, onExit }: Props) {
  const { showSuccess, showError } = useToast();
  const [def, setDef] = useState<DashboardDefinition | null>(null);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  // Canvas + properties panels render against the live app theme so the builder
  // previews the exact colours the runtime viewer will show (forms/views parity).
  const theme = useAppThemeConfig();
  const [pageId, setPageId] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [editInteractions, setEditInteractions] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showPageSettings, setShowPageSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const history = useRef<DashboardDefinition[]>([]);
  const future = useRef<DashboardDefinition[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(40);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const { filtersFor, setEmit } = useSlicerFilters();
  const cf = useCrossFilter(def?.visuals ?? []);
  const sem = useDashboardSemanticFilters(def);
  const [showGlobals, setShowGlobals] = useState(false);

  // Route a slicer broadcast to the semantic bus when it drives a global filter.
  const onSlicerChange = useCallback((v: DashboardVisual, filters: import('../types/dashboard').VisualFilter[], opts?: import('../types/dashboard').SlicerBroadcastOpts) => {
    const semId = v.data_config.dateSlicer?.semanticFilterId ?? v.data_config.valueSlicer?.semanticFilterId;
    if (semId) sem.setSelection(semId, filters, v.dashboard_page_id, opts?.entityIds);
    else setEmit(buildSlicerEmit(v, filters));
  }, [sem, setEmit]);

  // ── mutation with history ─────────────────────────────────────────────────────
  const commit = useCallback((next: DashboardDefinition) => {
    setDef((cur) => { if (cur) history.current.push(cur); future.current = []; return next; });
    setDirty(true);
  }, []);

  // One-click "Create global date filter" from a slicer's properties: reuse the
  // dashboard's existing date semantic filter (or mint the canonical "Dashboard
  // Date"), auto-map a date field onto every entity the dashboard's visuals use,
  // bind this slicer to it, then open the mapping editor for review.
  const createGlobalDateFilter = useCallback(async (visualId: string) => {
    if (!def) return;
    const filters = [...(def.semanticFilters ?? [])];
    let sf = filters.find((s) => s.data_type === 'date');
    if (!sf) {
      const created: DashboardSemanticFilter = {
        dashboard_semantic_filter_id: uuid(),
        dashboard_id: def.dashboard.dashboard_id,
        key: 'dashboard_date', label: 'Dashboard Date',
        data_type: 'date', scope: 'dashboard',
        default_value: {}, config: { rangeSource: 'primary' },
      };
      filters.push(created);
      sf = created;
    }
    const sfId = sf.dashboard_semantic_filter_id;
    const mappings = [...(def.filterMappings ?? [])];
    const names = new Set(def.visuals.map((v) => v.query_config.entity).filter(Boolean) as string[]);
    for (const n of names) {
      const ent = entities.find((e) => e.logical_name === n || e.physical_table_name === n);
      if (!ent) continue;
      if (mappings.some((m) => m.semantic_filter_id === sfId && m.target_entity_id === ent.entity_definition_id)) continue;
      const f = await suggestDateField(ent.entity_definition_id).catch(() => null);
      if (!f) continue;
      const m: DashboardFilterMapping = {
        dashboard_filter_mapping_id: uuid(),
        dashboard_id: def.dashboard.dashboard_id,
        semantic_filter_id: sfId,
        target_entity_id: ent.entity_definition_id,
        target_field_id: f.field_definition_id,
        relationship_path: {},
        join_mode: 'auto', null_behavior: 'exclude', priority: 0, is_active: true,
      };
      mappings.push(m);
    }
    const visuals = def.visuals.map((v) => v.dashboard_visual_id === visualId
      ? { ...v, data_config: { ...v.data_config, dateSlicer: { ...(v.data_config.dateSlicer ?? {}), semanticFilterId: sfId } } }
      : v);
    commit({ ...def, semanticFilters: filters, filterMappings: mappings, visuals });
    setShowGlobals(true);
  }, [def, entities, commit]);

  // ── load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchEntities().then(setEntities).catch(() => {});
    fetchDefinition(dashboardId).then((d) => {
      setDef(d);
      const p = d.pages.find((x) => x.is_default) ?? d.pages[0];
      setPageId(p?.dashboard_page_id ?? '');
    }).catch((e) => showError(toFriendlyError(e)));
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

  // Canvas layout direction (per page). 'right-to-left' anchors new cards to the
  // right edge so they flow right→left; default 'left-to-right' anchors them left.
  const layoutDir = page?.canvas_config?.dashboardLayoutDirection ?? 'left-to-right';
  const patchCanvasConfig = (patch: Partial<import('../types/dashboard').CanvasConfig>) =>
    commit({ ...def, pages: def.pages.map((p) => p.dashboard_page_id === page.dashboard_page_id
      ? { ...p, canvas_config: { ...p.canvas_config, ...patch } } : p) });
  const setLayoutDir = (dir: 'left-to-right' | 'right-to-left') => patchCanvasConfig({ dashboardLayoutDirection: dir });

  // Effective canvas height — drives the scrollable surface in both build and
  // preview. Auto mode grows with content; fixed mode honours the page setting.
  const canvasH = canvasHeightPx(page, pageVisuals, preview);

  // ── visual ops ────────────────────────────────────────────────────────────────
  const addVisual = (type: VisualType) => {
    const meta = VISUAL_REGISTRY[type];
    const maxY = pageVisuals.reduce((m, v) => Math.max(m, v.y + v.height), 0);
    const dc = meta.defaultConfig();
    // Anchor the new card to the side dictated by the canvas layout direction.
    const startX = layoutDir === 'right-to-left' ? Math.max(0, COLS - meta.defaultSize.width) : 0;
    const v: DashboardVisual = {
      dashboard_visual_id: uuid(),
      dashboard_page_id: page.dashboard_page_id,
      dashboard_id: def.dashboard.dashboard_id,
      visual_type: type,
      title: meta.label,
      x: startX, y: maxY, width: meta.defaultSize.width, height: meta.defaultSize.height,
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

  // Edit Interactions: set how a source visual affects a target (filter/highlight/none).
  const setInteraction = (sourceId: string, targetId: string, mode: InteractionMode) => {
    const src = def.visuals.find((v) => v.dashboard_visual_id === sourceId);
    if (!src) return;
    patchVisual(sourceId, {
      interaction_config: { ...src.interaction_config, targets: { ...src.interaction_config?.targets, [targetId]: mode } },
    });
  };
  const cycleInteraction = (sourceId: string, targetId: string, cur: InteractionMode) => {
    const order: InteractionMode[] = ['filter', 'highlight', 'none'];
    setInteraction(sourceId, targetId, order[(order.indexOf(cur) + 1) % order.length]);
  };

  const removeVisual = (id: string) => {
    commit({ ...def, visuals: def.visuals.filter((v) => v.dashboard_visual_id !== id) });
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateVisual = (id: string) => {
    const v = def.visuals.find((x) => x.dashboard_visual_id === id);
    if (!v) return;
    const copy: DashboardVisual = { ...v, dashboard_visual_id: uuid(), x: v.x + 1, y: v.y + 1, z_index: v.z_index + 1 };
    commit({ ...def, visuals: [...def.visuals, copy] });
    setSelectedId(copy.dashboard_visual_id);
  };

  // ── page ops ──────────────────────────────────────────────────────────────────
  const addPage = () => {
    const order = pages.length;
    const p: DashboardPage = {
      dashboard_page_id: uuid(), dashboard_id: def.dashboard.dashboard_id,
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
        <TbBtn
          onClick={() => setLayoutDir(layoutDir === 'right-to-left' ? 'left-to-right' : 'right-to-left')}
          title={layoutDir === 'right-to-left' ? 'Cards start from the right (click for left)' : 'Cards start from the left (click for right)'}
          active={layoutDir === 'right-to-left'}>
          {layoutDir === 'right-to-left' ? <ArrowRightToLine size={15} /> : <ArrowLeftToLine size={15} />}
        </TbBtn>
        <TbBtn onClick={() => setShowGlobals(true)} title="Global filters" active={showGlobals}><FilterIcon size={15} /></TbBtn>
        <TbBtn onClick={() => { setEditInteractions((e) => !e); setPreview(false); }} title="Edit interactions" active={editInteractions}><Workflow size={15} /></TbBtn>
        <TbBtn onClick={() => { setPreview((p) => !p); setEditInteractions(false); }} title="Preview" active={preview}>{preview ? <EyeOff size={15} /> : <Eye size={15} />}</TbBtn>
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
                  width: '100%', maxWidth: 1280, height: canvasH,
                  backgroundImage: showGrid && !preview
                    ? `linear-gradient(to right, ${theme.gridLineColor}55 1px, transparent 1px), linear-gradient(to bottom, ${theme.gridLineColor}55 1px, transparent 1px)`
                    : undefined,
                  backgroundSize: showGrid && !preview ? `${colWidth}px ${ROW_H}px` : undefined,
                }}>
                {pageVisuals.filter((v) => preview ? v.is_visible : true).map((v) => {
                  const src = selectedId ? pageVisuals.find((s) => s.dashboard_visual_id === selectedId) : undefined;
                  const defaultMode: InteractionMode = src?.visual_type === 'button' ? 'none' : 'filter';
                  const curMode: InteractionMode = src?.interaction_config?.targets?.[v.dashboard_visual_id] ?? defaultMode;
                  const isSource = selectedId === v.dashboard_visual_id;
                  const resolved = sem.resolveForVisual(v);
                  return (
                  <CanvasVisual key={v.dashboard_visual_id} visual={v} theme={theme} colWidth={colWidth}
                    definition={def}
                    semanticSelections={sem.selections}
                    selected={selectedId === v.dashboard_visual_id} preview={preview}
                    runtimeFilters={preview ? [...filtersFor(v), ...cf.filtersFor(v), ...resolved.runtimeFilters] : [...filtersFor(v), ...resolved.runtimeFilters]}
                    runtimeSemanticFilters={preview ? [...resolved.semanticFilters, ...cf.semanticFiltersFor(v)] : resolved.semanticFilters}
                    crossFilterForEntity={preview ? ((entity) => cf.crossFilterForEntity(entity, v.dashboard_visual_id)) : undefined}
                    semanticForEntity={preview ? ((entity) => sem.resolveForVisual(v, entity)) : undefined}
                    crossSelect={preview ? cf.apply : undefined}
                    highlight={preview ? cf.highlightFor(v) : undefined}
                    getHighlight={preview ? ((e, f) => cf.highlightForField(e, f, v.dashboard_visual_id)) : undefined}
                    editInteractions={editInteractions && !preview && !!selectedId && !isSource}
                    isInteractionSource={editInteractions && isSource}
                    interactionMode={curMode}
                    onCycleInteraction={() => selectedId && cycleInteraction(selectedId, v.dashboard_visual_id, curMode)}
                    onFilterChange={(filters, opts) => onSlicerChange(v, filters, opts)}
                    onSelect={() => setSelectedId(v.dashboard_visual_id)}
                    onResize={(w, h) => resize(v.dashboard_visual_id, w, h)}
                    onDelete={() => removeVisual(v.dashboard_visual_id)}
                    onDuplicate={() => duplicateVisual(v.dashboard_visual_id)}
                    onToggleLock={() => patchVisual(v.dashboard_visual_id, { is_locked: !v.is_locked })}
                    onToggleHide={() => patchVisual(v.dashboard_visual_id, { is_visible: !v.is_visible })}
                  />
                  );
                })}
                {!pageVisuals.length && (
                  <div className="absolute inset-0 flex items-center justify-center text-[12px]" style={{ color: theme.secondaryText }}>
                    Add a visual from the left panel to begin.
                  </div>
                )}
              </div>
            </DndContext>
          </div>

          {editInteractions && !preview && (
            <div className="px-3 py-1.5 border-t border-slate-700 bg-slate-800 shrink-0 text-[11px] text-slate-300">
              {selectedId
                ? 'Click a visual’s badge to cycle how the selected visual affects it: Filter → Highlight → None.'
                : 'Select a source visual, then choose how it interacts with each other visual.'}
            </div>
          )}
          {preview && (
            <FilterSummaryBar selections={cf.selections} theme={theme} onRemoveValue={cf.removeValue} onClearAll={cf.clearAll} />
          )}

          {/* Page tabs */}
          <div className="relative flex items-center gap-1 px-3 py-1.5 border-t border-slate-700 bg-slate-800 shrink-0 overflow-x-auto">
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
            <div className="flex-1" />
            <span className="text-[10px] text-slate-500 hidden sm:inline">{Math.round(canvasH)}px tall</span>
            <button onClick={() => setShowPageSettings((s) => !s)} title="Page settings"
              className={`p-1 rounded ${showPageSettings ? 'text-white bg-slate-700' : 'text-slate-400 hover:text-white'}`}><Settings2 size={14} /></button>

            {showPageSettings && page && (
              <PageSettingsPopover
                config={page.canvas_config}
                contentBottomPx={Math.round(pageVisuals.reduce((m, v) => Math.max(m, v.y + v.height), 0) * ROW_H)}
                onChange={patchCanvasConfig}
                onClose={() => setShowPageSettings(false)}
              />
            )}
          </div>
        </div>

        {/* Properties */}
        {!preview && selected && (
          <PropertiesPanel visual={selected} entities={entities} theme={theme} siblings={pageVisuals}
            definition={def}
            onCreateGlobalDateFilter={() => createGlobalDateFilter(selected.dashboard_visual_id)}
            onManageGlobalFilters={() => setShowGlobals(true)}
            onChange={(patch) => patchVisual(selected.dashboard_visual_id, patch)} />
        )}
      </div>

      {showGlobals && (
        <GlobalFiltersPanel def={def} entities={entities}
          onChange={(next) => commit(next)} onClose={() => setShowGlobals(false)} />
      )}
    </div>
  );
}

// ── canvas visual (draggable + resizable) ──────────────────────────────────────
function CanvasVisual({ visual, theme, colWidth, definition, semanticSelections, selected, preview, runtimeFilters, runtimeRelatedFilters, runtimeSemanticFilters, crossSelect, crossFilterForEntity, semanticForEntity, highlight, getHighlight, editInteractions, isInteractionSource, interactionMode, onCycleInteraction, onFilterChange, onSelect, onResize, onDelete, onDuplicate, onToggleLock, onToggleHide }: {
  visual: DashboardVisual; theme: ThemeConfig; colWidth: number; definition?: DashboardDefinition; selected: boolean; preview: boolean;
  semanticSelections?: Record<string, import('../visuals/slicerValues').SlicerSelection>;
  runtimeFilters?: import('../types/dashboard').VisualFilter[];
  runtimeRelatedFilters?: import('../types/dashboard').RelatedFilter[];
  runtimeSemanticFilters?: import('../types/dashboard').SemanticQueryFilter[];
  crossSelect?: (emit: import('../visuals/useCrossFilter').SelectionEmit) => void;
  crossFilterForEntity?: (entity: string) => { filters: import('../types/dashboard').VisualFilter[]; semanticFilters: import('../types/dashboard').SemanticQueryFilter[] };
  semanticForEntity?: (entity: string) => { runtimeFilters: import('../types/dashboard').VisualFilter[]; semanticFilters: import('../types/dashboard').SemanticQueryFilter[] };
  highlight?: Set<string>;
  getHighlight?: (entity: string, fieldId: string | undefined) => Set<string>;
  editInteractions?: boolean; isInteractionSource?: boolean;
  interactionMode?: InteractionMode; onCycleInteraction?: () => void;
  onFilterChange?: (filters: import('../types/dashboard').VisualFilter[], opts?: import('../types/dashboard').SlicerBroadcastOpts) => void;
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
          background: visual.format_config.background ?? theme.cardBackground,
          border: `${visual.format_config.borderWidth ?? 1}px solid ${selected ? theme.primaryAccent : (visual.format_config.borderColor ?? theme.borderColor)}`,
          boxShadow: theme.shadow,
          borderRadius: visual.format_config.borderRadius ?? theme.borderRadius,
          opacity: visual.format_config.opacity ?? 1,
        }}>
        {visual.format_config.showHeader !== false && (
          <div {...(preview ? {} : { ...attributes, ...listeners })}
            className={`px-2.5 pt-2 pb-1 text-[11px] font-medium shrink-0 ${preview || visual.is_locked ? '' : 'cursor-move'}`}
            style={{ color: visual.format_config.titleColor ?? theme.primaryText, textAlign: visual.format_config.cardContentAlign ?? 'left' }}>
            {visual.title}
          </div>
        )}
        <div className="flex-1 min-h-0">
          <VisualErrorBoundary theme={theme}>
            <VisualRenderer visual={visual} theme={theme} live definition={definition}
              semanticSelections={semanticSelections}
              runtimeFilters={runtimeFilters} runtimeRelatedFilters={runtimeRelatedFilters}
              runtimeSemanticFilters={runtimeSemanticFilters} crossFilterForEntity={crossFilterForEntity}
              semanticForEntity={semanticForEntity}
              onSelect={crossSelect} highlight={highlight} getHighlight={getHighlight} onFilterChange={onFilterChange} />
          </VisualErrorBoundary>

          {/* Edit-interactions overlay — cycle how the selected source affects this target. */}
          {(editInteractions || isInteractionSource) && (
            <div className="absolute inset-0 z-[1002] flex items-start justify-center pt-1 pointer-events-none"
              style={{ background: isInteractionSource ? `${theme.primaryAccent}14` : 'transparent' }}>
              {isInteractionSource ? (
                <span className="pointer-events-auto px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ background: theme.primaryAccent }}>
                  Source
                </span>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); onCycleInteraction?.(); }}
                  className="pointer-events-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shadow"
                  style={{
                    background: interactionMode === 'none' ? '#3f3f46' : theme.surfaceBackground,
                    color: interactionMode === 'none' ? '#a1a1aa' : theme.primaryText,
                    border: `1px solid ${theme.borderColor}`,
                  }}>
                  {interactionMode === 'none' ? <Ban size={11} /> : interactionMode === 'highlight' ? <Sparkles size={11} /> : <FilterIcon size={11} />}
                  {interactionMode === 'none' ? 'None' : interactionMode === 'highlight' ? 'Highlight' : 'Filter'}
                </button>
              )}
            </div>
          )}
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

// ── Page settings (canvas height) ───────────────────────────────────────────────
// One dashboard page is an unbounded vertical canvas. 'Auto height' grows the page
// to fit its cards (the default — scroll down forever, never forced onto a new
// page); 'Fixed height' pins the canvas to a chosen px height that still scrolls
// when taller than the viewport.
function PageSettingsPopover({ config, contentBottomPx, onChange, onClose }: {
  config: import('../types/dashboard').CanvasConfig;
  contentBottomPx: number;
  onChange: (patch: Partial<import('../types/dashboard').CanvasConfig>) => void;
  onClose: () => void;
}) {
  const mode = config.heightMode ?? 'auto';
  const fixedH = config.canvasHeight ?? Math.max(1200, contentBottomPx + 200);
  return (
    <>
      <div className="fixed inset-0 z-[1100]" onClick={onClose} />
      <div className="absolute bottom-9 right-2 z-[1101] w-64 rounded-lg border border-slate-600 bg-slate-800 shadow-xl p-3 text-slate-200">
        <p className="text-[11px] font-semibold text-white mb-2">Page Layout</p>
        <div className="grid grid-cols-2 gap-1 mb-3">
          {(['auto', 'fixed'] as const).map((m) => (
            <button key={m} onClick={() => onChange({ heightMode: m })}
              className={`px-2 py-1.5 rounded text-[11px] ${mode === m ? 'bg-blue-600 text-white' : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'}`}>
              {m === 'auto' ? 'Auto height' : 'Fixed height'}
            </button>
          ))}
        </div>
        {mode === 'auto' ? (
          <p className="text-[10px] leading-relaxed text-slate-400">
            The canvas grows as you add or drag cards lower — scroll down to keep designing. Content currently reaches {contentBottomPx}px.
          </p>
        ) : (
          <label className="block">
            <span className="text-[10px] text-slate-400">Canvas height (px)</span>
            <input type="number" min={CANVAS_MIN_H} step={50}
              value={config.canvasHeight ?? fixedH}
              onChange={(e) => onChange({ canvasHeight: Math.max(CANVAS_MIN_H, Number(e.target.value) || CANVAS_MIN_H) })}
              className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-[12px] text-white focus:outline-none focus:border-blue-500" />
            <span className="text-[10px] text-slate-500 mt-1 block">Preview still scrolls when this exceeds the screen.</span>
          </label>
        )}
      </div>
    </>
  );
}
