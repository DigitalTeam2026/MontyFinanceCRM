import { useState, useEffect, useRef } from 'react';
import { Loader2, LayoutDashboard } from 'lucide-react';
import type { DashboardDefinition, ThemeConfig, DashboardVisual, VisualFilter, SlicerBroadcastOpts } from '../../../admin/dashboards/types/dashboard';
import { fetchAccessibleDashboards, fetchDefinition, fetchThemes } from '../../../admin/dashboards/services/dashboardService';
import type { AccessibleDashboard } from '../../../admin/dashboards/services/dashboardService';
import FilterSelect from '../FilterSelect';
import VisualRenderer, { VisualErrorBoundary } from '../../../admin/dashboards/visuals/VisualRenderer';
import { useSlicerFilters, buildSlicerEmit } from '../../../admin/dashboards/visuals/useSlicerFilters';
import { useCrossFilter } from '../../../admin/dashboards/visuals/useCrossFilter';
import { useDashboardSemanticFilters } from '../../../admin/dashboards/visuals/semanticRuntime';
import FilterSummaryBar from './FilterSummaryBar';

// Grid geometry — must match the designer canvas (DashboardDesigner.tsx) so a
// dashboard renders identically here as it does in the builder.
const COLS = 24;
const ROW_H = 26;
const MAX_W = 1280;
// Floor for the canvas height — keep in sync with the designer (DashboardDesigner
// CANVAS_MIN_H) so a published dashboard matches its builder layout.
const CANVAS_MIN_H = 600;

const FALLBACK_THEME: ThemeConfig = {
  pageBackground: '#0b1220', surfaceBackground: '#111a2e', cardBackground: '#16213e',
  primaryText: '#e7ecf5', secondaryText: '#8b97b0', borderColor: '#243049', gridLineColor: '#243049',
  primaryAccent: '#4f8cff', secondaryAccent: '#7c5cff', success: '#22c55e', warning: '#f59e0b', error: '#ef4444',
  chartPalette: ['#4f8cff', '#7c5cff', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#eab308'],
  fontFamily: 'Inter, system-ui, sans-serif', borderRadius: 12, shadow: '0 1px 3px rgba(0,0,0,0.4)',
};

/**
 * Read-only runtime renderer for the org-wide default dashboard ("for all users").
 * Surfaces whatever dashboard is flagged is_default = true. RLS grants every
 * authenticated user read access to the default, while the underlying entity
 * RLS still governs the data each visual can see.
 */
export default function DashboardViewer() {
  const [def, setDef] = useState<DashboardDefinition | null>(null);
  const [theme, setTheme] = useState<ThemeConfig>(FALLBACK_THEME);
  const [pageId, setPageId] = useState<string>('');
  const [state, setState] = useState<'loading' | 'empty' | 'error' | 'ready'>('loading');
  // Dashboards the signed-in user may open (default + anything shared with them),
  // and which one is currently selected in the switcher.
  const [dashboards, setDashboards] = useState<AccessibleDashboard[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const canvasRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(MAX_W / COLS);
  const { filtersFor, setEmit } = useSlicerFilters();
  // Interactive cross-filtering (click / ctrl / shift). Lives above the page so
  // selections persist across page switches within the session.
  const cf = useCrossFilter(def?.visuals ?? []);
  // Global semantic filters (slicer → many entities via mappings / paths).
  const sem = useDashboardSemanticFilters(def);

  // A slicer routes its broadcast to the semantic bus when it drives a semantic
  // filter (date slicer → dateSlicer.semanticFilterId; value slicer →
  // valueSlicer.semanticFilterId), else to the legacy single-entity slicer bus.
  const onSlicerChange = (v: DashboardVisual, filters: VisualFilter[], opts?: SlicerBroadcastOpts) => {
    const semId = v.data_config.dateSlicer?.semanticFilterId ?? v.data_config.valueSlicer?.semanticFilterId;
    if (semId) sem.setSelection(semId, filters, v.dashboard_page_id, opts?.entityIds);
    else setEmit(buildSlicerEmit(v, filters));
  };

  // Stage 1: discover the dashboards this user can open and pick an initial one
  // (the org default if present, else the first accessible dashboard).
  useEffect(() => {
    let alive = true;
    setState('loading');
    fetchAccessibleDashboards()
      .then((list) => {
        if (!alive) return;
        setDashboards(list);
        if (!list.length) { setState('empty'); return; }
        const initial = list.find((d) => d.is_default) ?? list[0];
        setSelectedId(initial.dashboard_id);
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, []);

  // Stage 2: load the full definition (+ theme) for the selected dashboard.
  // Re-runs whenever the user switches dashboards.
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    setState('loading');
    Promise.all([fetchDefinition(selectedId), fetchThemes().catch(() => [])])
      .then(([d, themes]) => {
        if (!alive) return;
        if (!d) { setState('empty'); return; }
        setDef(d);
        const p = d.pages.find((x) => x.is_default) ?? d.pages[0];
        setPageId(p?.dashboard_page_id ?? '');
        const th = themes.find((t) => t.theme_id === d.dashboard.theme_id);
        setTheme(th ? th.theme_config : FALLBACK_THEME);
        setState('ready');
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [selectedId]);

  // Keep grid column width in sync with the rendered canvas width.
  useEffect(() => {
    const measure = () => { if (canvasRef.current) setColWidth(canvasRef.current.clientWidth / COLS); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [def, pageId, state]);

  // Full-screen spinner only on the very first load. When switching dashboards we
  // keep the current one on screen (def is already set) until the next is ready.
  if (state === 'loading' && !def) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--app-bg)' }}>
        <Loader2 className="animate-spin text-slate-400" size={22} />
      </div>
    );
  }

  if (state === 'empty' || state === 'error') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6" style={{ background: 'var(--app-bg)' }}>
        <LayoutDashboard size={34} className="mb-3 text-slate-300" />
        <p className="text-[14px] font-medium text-slate-600">
          {state === 'error' ? 'Could not load the dashboard.' : 'No default dashboard configured.'}
        </p>
        <p className="text-[12px] text-slate-400 mt-1 max-w-sm">
          {state === 'error'
            ? 'Please try again later.'
            : 'An administrator can mark a dashboard as the default for all users from Admin Studio → Dashboards.'}
        </p>
      </div>
    );
  }

  if (!def) return null;

  const pages = [...def.pages].sort((a, b) => a.page_order - b.page_order);
  const page = pages.find((p) => p.dashboard_page_id === pageId) ?? pages[0];
  const pageVisuals = def.visuals
    .filter((v) => v.dashboard_page_id === page?.dashboard_page_id && v.is_visible);
  const maxRow = pageVisuals.reduce((m, v) => Math.max(m, v.y + v.height), 0);
  // Mirror the designer's canvas-height logic so a published dashboard renders at
  // the exact same vertical extent as the builder/preview. 'fixed' pages honour
  // their configured height; 'auto' pages grow to fit the lowest card.
  const cfg = page?.canvas_config;
  const canvasHeight = cfg?.heightMode === 'fixed' && cfg.canvasHeight
    ? Math.max(cfg.canvasHeight, CANVAS_MIN_H)
    : Math.max(maxRow * ROW_H + 24, CANVAS_MIN_H);

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background: theme.pageBackground, fontFamily: theme.fontFamily }}>
      {dashboards.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0"
          style={{ borderColor: theme.borderColor, background: theme.surfaceBackground }}>
          <span className="text-[11px] font-medium" style={{ color: theme.secondaryText }}>Dashboard</span>
          <FilterSelect
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            matchTriggerWidth
            className="min-w-[200px] max-w-[320px] px-2.5 py-1 text-[12px] rounded border bg-transparent"
            style={{ color: theme.primaryText, borderColor: theme.borderColor }}
          >
            {dashboards.map((d) => (
              <option key={d.dashboard_id} value={d.dashboard_id}>
                {d.name}{d.is_default ? ' (Default)' : ''}
              </option>
            ))}
          </FilterSelect>
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        <div
          ref={canvasRef}
          className="relative mx-auto"
          style={{ width: '100%', maxWidth: MAX_W, height: canvasHeight }}
        >
          {pageVisuals.map((v) => (
            <div
              key={v.dashboard_visual_id}
              className="absolute"
              style={{
                left: v.x * colWidth, top: v.y * ROW_H,
                width: v.width * colWidth, height: v.height * ROW_H,
                zIndex: v.z_index,
              }}
            >
              <div
                className="w-full h-full overflow-hidden relative flex flex-col"
                style={{
                  background: v.format_config.background ?? theme.cardBackground,
                  border: `${v.format_config.borderWidth ?? 1}px solid ${v.format_config.borderColor ?? theme.borderColor}`,
                  boxShadow: theme.shadow,
                  borderRadius: v.format_config.borderRadius ?? theme.borderRadius,
                  opacity: v.format_config.opacity ?? 1,
                }}
              >
                {v.format_config.showHeader !== false && (
                  <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium shrink-0" style={{ color: v.format_config.titleColor ?? theme.primaryText, textAlign: v.format_config.cardContentAlign ?? 'left' }}>
                    {v.title}
                  </div>
                )}
                <div className="flex-1 min-h-0">
                  {(() => {
                    const resolved = sem.resolveForVisual(v);
                    return (
                      <VisualErrorBoundary theme={theme}>
                        <VisualRenderer
                          visual={v} theme={theme} live definition={def}
                          semanticSelections={sem.selections}
                          runtimeFilters={[...filtersFor(v), ...cf.filtersFor(v), ...resolved.runtimeFilters]}
                          runtimeSemanticFilters={[...resolved.semanticFilters, ...cf.semanticFiltersFor(v)]}
                          crossFilterForEntity={(entity) => cf.crossFilterForEntity(entity, v.dashboard_visual_id)}
                          onSelect={cf.apply}
                          highlight={cf.highlightFor(v)}
                          getHighlight={(e, f) => cf.highlightForField(e, f, v.dashboard_visual_id)}
                          onFilterChange={(filters, opts) => onSlicerChange(v, filters, opts)}
                        />
                      </VisualErrorBoundary>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}
          {!pageVisuals.length && (
            <div className="absolute inset-0 flex items-center justify-center text-[12px]" style={{ color: theme.secondaryText }}>
              This dashboard has no visuals yet.
            </div>
          )}
        </div>
      </div>

      <FilterSummaryBar selections={cf.selections} theme={theme} onRemoveValue={cf.removeValue} onClearAll={cf.clearAll} />

      {pages.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-t shrink-0 overflow-x-auto"
          style={{ borderColor: theme.borderColor, background: theme.surfaceBackground }}>
          {pages.map((p) => (
            <button
              key={p.dashboard_page_id}
              onClick={() => setPageId(p.dashboard_page_id)}
              className="px-2.5 py-1 rounded text-[11px] whitespace-nowrap transition-colors"
              style={{
                color: p.dashboard_page_id === page?.dashboard_page_id ? theme.primaryText : theme.secondaryText,
                background: p.dashboard_page_id === page?.dashboard_page_id ? theme.cardBackground : 'transparent',
              }}
            >
              {p.display_name || p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
