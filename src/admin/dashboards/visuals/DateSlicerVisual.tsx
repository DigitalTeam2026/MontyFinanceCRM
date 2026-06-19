import { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2, CalendarOff, CalendarRange, X, CalendarCheck, AlertTriangle, Lock, ChevronDown, Calendar, Users } from 'lucide-react';
import type {
  DashboardVisual, DashboardDefinition, ThemeConfig, VisualFilter, DateSlicerConfig,
  SlicerDateRange, DateFilterMode,
} from '../types/dashboard';
import { SLICER_DATE_RANGES } from '../types/dashboard';
import { runAggregate } from '../services/queryEngine';
import { computeDateRange, buildDateFilters, toDateInput, fromDateInput, type DateBounds } from './dateRanges';
import { resolveDateBoundsSource, activeMappingsFor } from './semanticRuntime';
import { fetchEntitiesCached, fetchFieldsCached } from '../services/relationshipService';
import { isAuthError } from '../../../lib/supabase';
import FilterSelect from '../../../app/components/FilterSelect';
import { renderNavIcon } from '../../../app/utils/navIcons';

/** Resolved display info for one active mapping — drives the card's entity + field-mapping rows. */
interface MappingInfo { entityId: string; entityName: string; fieldLabel: string; icon?: string | null }

/** Presets surfaced as quick pills on the timeline_card (matches the approved mockup). */
const CARD_PRESETS: SlicerDateRange[] = ['today', 'tomorrow', 'this_week', 'this_month', 'custom'];

interface Props {
  visual: DashboardVisual;
  theme: ThemeConfig;
  live?: boolean;
  /** Full dashboard definition — lets a GLOBAL slicer resolve its mappings / bounds. */
  definition?: DashboardDefinition;
  /** Broadcast the current date-range filters (or [] when cleared). */
  onFilterChange?: (filters: VisualFilter[]) => void;
}

type Bounds = { min: Date | null; max: Date | null };
type State =
  | { kind: 'loading' } | { kind: 'no_field' } | { kind: 'no_mapping' } | { kind: 'no_dates' }
  | { kind: 'denied' } | { kind: 'error'; message: string }
  | { kind: 'ready'; bounds: Bounds };

// Placeholder filter field for GLOBAL semantic mode: the leaf field is overwritten
// per entity by resolveForVisual (direct) or by the path's targetFieldId (server).
const SEMANTIC_DATE_FIELD = '__dashboard_date__';

const QUICK_PRESETS: SlicerDateRange[] = [
  'today', 'this_week', 'last_7_days', 'this_month', 'last_30_days', 'this_quarter', 'this_year',
];

export default function DateSlicerVisual({ visual, theme, live = true, definition, onFilterChange }: Props) {
  const ds: DateSlicerConfig = visual.data_config.dateSlicer ?? {};
  const entity = visual.query_config.entity;
  const field = ds.dateField;
  // GLOBAL semantic mode: the slicer drives a dashboard-wide semantic date filter
  // mapped to many entities. Its own entity/field are no longer required — they
  // only (optionally) provide the timeline's MIN/MAX bounds source.
  const semanticId = ds.semanticFilterId;
  const semantic = !!semanticId;
  const activeMappings = useMemo(
    () => (semantic ? activeMappingsFor(definition ?? null, semanticId) : []),
    [semantic, semanticId, definition],
  );
  const mode: DateFilterMode = ds.filterMode ?? 'between';
  const style = ds.style ?? 'timeline';
  const isCard = style === 'timeline_card';
  const orientation = ds.orientation ?? 'horizontal';
  const compact = !!ds.compact;
  const autoApply = ds.autoApply !== false;
  const withTime = !!ds.showTime && !!ds.dateFieldIsDateTime;
  const accent = ds.selectedRangeColor ?? theme.primaryAccent;
  const track = ds.trackColor ?? theme.gridLineColor;
  const handle = ds.handleColor ?? accent;
  const presetBg = ds.presetButtonColor ?? theme.surfaceBackground;
  const presetText = ds.presetButtonTextColor ?? theme.secondaryText;
  const activeBg = ds.activePresetColor ?? accent;
  const activeText = ds.activePresetTextColor ?? '#ffffff';

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [pending, setPending] = useState<VisualFilter[] | null>(null);
  // timeline_card: the currently selected preset (for pill highlight + active chip
  // label) and the runtime entity narrowing (null = all mapped entities).
  const [activePreset, setActivePreset] = useState<SlicerDateRange | null>(null);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[] | null>(null);
  const [mappingInfo, setMappingInfo] = useState<MappingInfo[]>([]);
  const reqId = useRef(0);
  const touched = useRef(false);
  const emitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bounds: Bounds = state.kind === 'ready' ? state.bounds : { min: null, max: null };

  // ── resolve the timeline bounds source (entity + physical date column) ──────
  // Direct mode → the slicer's own entity/field. Semantic mode → the primary
  // mapping's field (spec §4), unless the slicer was given an explicit bounds
  // field of its own. null = no slider domain (presets / inputs still work).
  const [boundsSrc, setBoundsSrc] = useState<{ entity: string; field: string } | null>(null);
  const mappingsKey = useMemo(
    () => JSON.stringify(activeMappings.map((m) => [m.target_entity_id, m.target_field_id, m.priority, m.relationship_path])),
    [activeMappings],
  );
  useEffect(() => {
    let alive = true;
    if (field && entity) { setBoundsSrc({ entity, field }); return; }
    if (semantic && semanticId) {
      resolveDateBoundsSource(definition ?? null, semanticId).then((s) => { if (alive) setBoundsSrc(s); });
    } else {
      setBoundsSrc(null);
    }
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, field, semantic, semanticId, mappingsKey]);

  // ── load min / max available date ─────────────────────────────────────────
  useEffect(() => {
    touched.current = false;
    // The card has no slider domain — skip the MIN/MAX query entirely and stay
    // usable (presets / entity narrowing) even before any mapping resolves.
    if (isCard) { setState({ kind: 'ready', bounds: { min: null, max: null } }); return; }
    // Gate: direct mode needs a field; semantic mode needs ≥1 active mapping.
    if (semantic) {
      if (!activeMappings.length) { setState({ kind: 'no_mapping' }); return; }
    } else if (!field) {
      setState({ kind: 'no_field' }); return;
    }
    // No bounds source (or inert) → controls render without a slider domain.
    if (!boundsSrc || !live) { setState({ kind: 'ready', bounds: { min: null, max: null } }); return; }
    const id = ++reqId.current;
    setState({ kind: 'loading' });
    runAggregate({
      entity: boundsSrc.entity,
      aggregations: [{ fn: 'min', field: boundsSrc.field, alias: 'min' }, { fn: 'max', field: boundsSrc.field, alias: 'max' }],
      includeDeleted: false,
    }).then((res) => {
      if (id !== reqId.current) return;
      const row = res.rows[0] ?? {};
      const min = row.min ? new Date(String(row.min)) : null;
      const max = row.max ? new Date(String(row.max)) : null;
      // Missing dates aren't fatal in semantic mode — keep the presets/inputs usable.
      if (!min || !max || isNaN(min.getTime()) || isNaN(max.getTime())) {
        setState(semantic ? { kind: 'ready', bounds: { min: null, max: null } } : { kind: 'no_dates' });
        return;
      }
      setState({ kind: 'ready', bounds: { min, max } });
    }).catch((e) => {
      if (id !== reqId.current) return;
      if (isAuthError(e)) { setState({ kind: 'denied' }); return; }
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Query failed' });
    });
  }, [field, semantic, isCard, activeMappings.length, boundsSrc, live]);

  // ── seed the default range once bounds are known (until the user interacts) ──
  useEffect(() => {
    if (state.kind !== 'ready' || touched.current) return;
    const preset = ds.defaultRange ?? 'all_time';
    let s: Date | null; let e: Date | null;
    if (preset === 'custom') {
      s = fromDateInput(ds.startDate ?? '');
      e = fromDateInput(ds.endDate ?? '');
    } else {
      const r = computeDateRange(preset);
      s = r.start; e = r.end;
    }
    // Emit the TRUE selected range — never clamp it to the data's [min,max].
    // Clamping silently turned "Today" into "the latest day that has data", so a
    // range with no records (e.g. today, when nothing was created today) wrongly
    // matched every record instead of returning zero. The slider clamps for
    // display only (see RangeSlider); the filter must stay the real selection.
    setStart(s);
    setEnd(e);
    setActivePreset(preset === 'all_time' ? null : preset);
  }, [state.kind, ds.defaultRange, ds.startDate, ds.endDate]);

  // ── resolve entity / date-field display names for the card's chip rows ───────
  useEffect(() => {
    if (!isCard || !activeMappings.length) { setMappingInfo([]); return; }
    let alive = true;
    (async () => {
      try {
        const ents = await fetchEntitiesCached();
        const out: MappingInfo[] = [];
        for (const m of activeMappings) {
          if (!m.target_entity_id) continue;
          const ent = ents.find((e) => e.entity_definition_id === m.target_entity_id);
          if (!ent) continue;
          let fieldLabel = 'Date';
          try {
            const fields = await fetchFieldsCached(m.target_entity_id);
            const f = fields.find((x) => x.field_definition_id === m.target_field_id);
            if (f) fieldLabel = f.display_name || f.physical_column_name;
          } catch { /* keep fallback label */ }
          if (!out.some((o) => o.entityId === ent.entity_definition_id)) {
            out.push({ entityId: ent.entity_definition_id, entityName: ent.display_name, fieldLabel, icon: ent.icon_name });
          }
        }
        out.sort((a, b) => a.entityName.localeCompare(b.entityName));
        if (alive) setMappingInfo(out);
      } catch { if (alive) setMappingInfo([]); }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCard, mappingsKey]);

  // ── emit the active filters (auto-apply, debounced) ─────────────────────────
  // In semantic mode the leaf field is overwritten downstream per entity/path, so
  // emit against a stable placeholder; in direct mode emit on the real column.
  const emitField = semantic ? SEMANTIC_DATE_FIELD : (field ?? '');
  const filters = useMemo(
    () => buildDateFilters(emitField, mode, { start, end } as DateBounds, withTime),
    [emitField, mode, start, end, withTime],
  );

  // Entity narrowing only applies in semantic card mode; non-card / non-semantic
  // slicers always broadcast a null narrowing (every mapped entity is filtered).
  const emitEntityIds = isCard ? selectedEntityIds : null;
  useEffect(() => {
    if (state.kind !== 'ready' || !onFilterChange) return;
    if (!autoApply && touched.current) { setPending(filters); return; }
    if (emitTimer.current) clearTimeout(emitTimer.current);
    const ms = Math.max(0, ds.debounceMs ?? 0);
    emitTimer.current = setTimeout(() => onFilterChange(filters, { entityIds: emitEntityIds }), ms);
    return () => { if (emitTimer.current) clearTimeout(emitTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, state.kind, autoApply, emitEntityIds]);

  const applyPreset = (preset: SlicerDateRange) => {
    touched.current = true;
    setActivePreset(preset === 'all_time' ? null : preset);
    if (preset === 'all_time') { setStart(null); setEnd(null); return; }
    if (preset === 'custom') return; // keep current start/end; reveal the inputs
    const r = computeDateRange(preset);
    // True selected range — unclamped (see seeding effect above for why).
    setStart(r.start);
    setEnd(r.end);
  };
  const clear = () => {
    touched.current = true;
    setStart(null); setEnd(null);
    setActivePreset(null);
    setSelectedEntityIds(null);
    setPending(null);
    onFilterChange?.([]);
  };
  const applyToday = () => applyPreset('today');
  const applyPending = () => { if (pending) { onFilterChange?.(pending, { entityIds: emitEntityIds }); setPending(null); } };

  // ── timeline_card entity narrowing helpers ──────────────────────────────────
  const allEntityIds = useMemo(() => mappingInfo.map((m) => m.entityId), [mappingInfo]);
  const effectiveEntityIds = selectedEntityIds ?? allEntityIds;
  const isEntityOn = (id: string) => selectedEntityIds === null || selectedEntityIds.includes(id);
  // Selecting every entity collapses back to "All" (null = no narrowing).
  const normalizeSel = (next: string[]) =>
    next.length === 0 || next.length === allEntityIds.length ? null : next;
  const toggleEntity = (id: string) => {
    touched.current = true;
    const cur = selectedEntityIds ?? allEntityIds;
    setSelectedEntityIds(normalizeSel(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };
  const removeEntity = (id: string) => {
    touched.current = true;
    const cur = selectedEntityIds ?? allEntityIds;
    setSelectedEntityIds(normalizeSel(cur.filter((x) => x !== id)));
  };
  const selectAllEntities = () => { touched.current = true; setSelectedEntityIds(null); };

  const presetLabel = (p: SlicerDateRange | null) =>
    (p && SLICER_DATE_RANGES.find((r) => r.value === p)?.label) || 'Custom';
  const hasDateFilter = !!(start || end);

  // ── status states ───────────────────────────────────────────────────────────
  if (state.kind === 'loading') return <Status icon={<Loader2 className="animate-spin" size={16} />} text="Loading…" theme={theme} />;
  if (state.kind === 'no_field') return <Status icon={<CalendarRange size={18} />} text="Select a date field" theme={theme} />;
  if (state.kind === 'no_mapping') return <Status icon={<CalendarRange size={18} />} text="Configure at least one entity mapping" theme={theme} />;
  if (state.kind === 'no_dates') return <Status icon={<CalendarOff size={18} />} text="No dated records found" theme={theme} />;
  if (state.kind === 'denied') return <Status icon={<Lock size={16} />} text="Permission denied" theme={theme} />;
  if (state.kind === 'error') return <Status icon={<AlertTriangle size={16} />} text={state.message} theme={theme} tone="error" />;

  // ── timeline_card: the combined "Timeline / Date Filter" card (approved mockup) ──
  if (isCard) {
    const showEnt = ds.showEntitySelector !== false && mappingInfo.length > 0;
    const showMap = ds.showFieldMapping !== false && mappingInfo.length > 0;
    const showChips = ds.showActiveChips !== false;
    const applyNow = () => onFilterChange?.(filters, { entityIds: emitEntityIds });
    const title = ds.cardTitle || visual.title || 'Timeline / Date Filter';
    const label = (t: string) => (
      <span className="text-[11px] font-medium mb-1.5 block" style={{ color: theme.secondaryText }}>{t}</span>
    );
    // Segmented-control cell styling (active = blue outline + accent text, like the mockup).
    const cell = (active: boolean): React.CSSProperties => active
      ? { background: theme.surfaceBackground, color: accent, boxShadow: `inset 0 0 0 1.5px ${accent}`, position: 'relative', zIndex: 1 }
      : { background: 'transparent', color: presetText };

    return (
      <div className="h-full w-full overflow-auto p-3.5 flex flex-col gap-3" style={{ color: theme.primaryText }}>
        {visual.format_config?.showHeader !== false && (
          <h3 className="text-[14px] font-semibold" style={{ color: theme.primaryText }}>{title}</h3>
        )}

        {/* Date range + Entities — side by side, wrap on narrow cards */}
        <div className="flex flex-wrap gap-x-8 gap-y-3 items-start">
          {/* Date range */}
          <div className="min-w-0">
            {label('Date range')}
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                value={activePreset ?? 'all_time'}
                onChange={(e) => applyPreset(e.target.value as SlicerDateRange)}
                className="px-2.5 py-1.5 text-[12px] rounded-lg border"
                style={{ borderColor: theme.borderColor, color: theme.primaryText, background: theme.surfaceBackground }}>
                {SLICER_DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </FilterSelect>
              <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: theme.borderColor }}>
                {CARD_PRESETS.map((p, i) => (
                  <button key={p} onClick={() => applyPreset(p)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors"
                    style={{ ...cell(p === activePreset), borderLeft: i ? `1px solid ${theme.borderColor}` : undefined }}>
                    {p === 'custom' && <Calendar size={12} />}
                    {SLICER_DATE_RANGES.find((r) => r.value === p)?.label ?? p}
                  </button>
                ))}
              </div>
            </div>
            {activePreset === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <input type={withTime ? 'datetime-local' : 'date'} value={toDateInput(start)}
                  onChange={(e) => { touched.current = true; setStart(fromDateInput(e.target.value)); setActivePreset('custom'); }}
                  className="px-2 py-1.5 text-[12px] rounded-lg border bg-transparent" style={{ borderColor: theme.borderColor, color: theme.primaryText }} />
                <span className="text-[12px]" style={{ color: theme.secondaryText }}>→</span>
                <input type={withTime ? 'datetime-local' : 'date'} value={toDateInput(end)}
                  onChange={(e) => { touched.current = true; setEnd(fromDateInput(e.target.value)); setActivePreset('custom'); }}
                  className="px-2 py-1.5 text-[12px] rounded-lg border bg-transparent" style={{ borderColor: theme.borderColor, color: theme.primaryText }} />
              </div>
            )}
          </div>

          {/* Entities — interactive runtime narrowing */}
          {showEnt && (
            <div className="min-w-0 ml-auto">
              {label('Entities')}
              <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: theme.borderColor }}>
                {mappingInfo.map((m, i) => {
                  const on = isEntityOn(m.entityId);
                  return (
                    <button key={m.entityId} onClick={() => toggleEntity(m.entityId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors"
                      style={{ ...cell(on), borderLeft: i ? `1px solid ${theme.borderColor}` : undefined }}>
                      {renderNavIcon(m.icon, 13)}{m.entityName}
                    </button>
                  );
                })}
                <button onClick={selectAllEntities}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors"
                  style={{ ...cell(selectedEntityIds === null), borderLeft: `1px solid ${theme.borderColor}` }}>
                  <Users size={13} />All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Field mapping (read-only) + Clear / Apply */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            {showMap && (
              <div className="min-w-0">
                {label('Field mapping')}
                <div className="flex flex-wrap items-center gap-2">
                  {mappingInfo.filter((m) => isEntityOn(m.entityId)).map((m) => (
                    <span key={m.entityId} title="Configured in Global filters"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px]"
                      style={{ background: theme.surfaceBackground, borderColor: theme.borderColor }}>
                      <span style={{ color: accent }}>{renderNavIcon(m.icon, 13)}</span>
                      <span style={{ color: theme.primaryText }}>{m.entityName}</span>
                      <span style={{ color: theme.secondaryText }}>→ {m.fieldLabel}</span>
                      <ChevronDown size={13} style={{ color: theme.secondaryText }} />
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {ds.showClearButton !== false && (
                <button onClick={clear} className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium border"
                  style={{ borderColor: theme.borderColor, color: theme.secondaryText, background: theme.surfaceBackground }}>
                  Clear
                </button>
              )}
              <button onClick={pending ? applyPending : applyNow}
                className="px-4 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: activeBg, color: activeText }}>
                Apply
              </button>
            </div>
        </div>

        {/* Active filter chips */}
        {showChips && hasDateFilter && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip label={presetLabel(activePreset)} onClear={clear} accent={accent} theme={theme} icon={<CalendarCheck size={11} />} />
            {effectiveEntityIds.map((id) => {
              const m = mappingInfo.find((x) => x.entityId === id);
              if (!m) return null;
              return <Chip key={id} label={`${m.entityName}.${m.fieldLabel}`} onClear={() => removeEntity(id)} accent={accent} theme={theme} icon={renderNavIcon(m.icon, 11)} />;
            })}
          </div>
        )}
      </div>
    );
  }

  const vertical = orientation === 'vertical';
  const showPresets = ds.showPresetRanges !== false && style !== 'dropdown_preset';
  const showInputs = style === 'date_inputs' || (style !== 'dropdown_preset' && style !== 'button_presets' && (ds.showStartInput !== false || ds.showEndInput !== false));
  const showSlider = style === 'range_slider' || style === 'timeline';
  const inputCls = 'px-2 py-1 text-[11px] rounded border bg-transparent';

  return (
    <div className={`h-full w-full overflow-auto ${compact ? 'p-1.5' : 'p-2.5'} flex flex-col gap-2`}
      style={{ color: theme.primaryText }}>
      {/* preset chips / dropdown */}
      {style === 'dropdown_preset' ? (
        <FilterSelect
          value={ds.defaultRange ?? 'all_time'}
          onChange={(e) => applyPreset(e.target.value as SlicerDateRange)}
          className="w-full px-2 py-1.5 text-[12px] rounded border"
          style={{ borderColor: theme.borderColor, color: theme.primaryText, background: theme.surfaceBackground }}
        >
          {SLICER_DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </FilterSelect>
      ) : showPresets && (
        <div className={`flex flex-wrap gap-1 ${vertical ? 'flex-col' : ''}`}>
          {(style === 'button_presets' ? SLICER_DATE_RANGES.map((r) => r.value) : QUICK_PRESETS).map((p) => {
            const active = p === ds.defaultRange;
            return (
              <button key={p} onClick={() => applyPreset(p)}
                className="px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors"
                style={{
                  background: active ? activeBg : presetBg,
                  border: `1px solid ${active ? activeBg : theme.borderColor}`,
                  color: active ? activeText : presetText,
                }}>
                {SLICER_DATE_RANGES.find((r) => r.value === p)?.label ?? p}
              </button>
            );
          })}
        </div>
      )}

      {/* slider / timeline track */}
      {showSlider && bounds.min && bounds.max && (
        <RangeSlider
          min={bounds.min} max={bounds.max} start={start} end={end} accent={accent} track={track} handle={handle}
          ds={ds} theme={theme}
          onChange={(s, e) => { touched.current = true; setStart(s); setEnd(e); }}
        />
      )}

      {/* date inputs */}
      {showInputs && (
        <div className={`flex gap-2 items-center ${vertical ? 'flex-col items-stretch' : ''}`}>
          {ds.showStartInput !== false && (
            <input type={withTime ? 'datetime-local' : 'date'} value={toDateInput(start)} className={inputCls}
              style={{ borderColor: theme.borderColor, color: theme.primaryText }}
              onChange={(e) => { touched.current = true; setStart(fromDateInput(e.target.value)); }} />
          )}
          {mode === 'between' && ds.showEndInput !== false && (
            <>
              {!vertical && <span className="text-[11px]" style={{ color: theme.secondaryText }}>→</span>}
              <input type={withTime ? 'datetime-local' : 'date'} value={toDateInput(end)} className={inputCls}
                style={{ borderColor: theme.borderColor, color: theme.primaryText }}
                onChange={(e) => { touched.current = true; setEnd(fromDateInput(e.target.value)); }} />
            </>
          )}
        </div>
      )}

      {/* actions */}
      <div className="flex flex-wrap gap-1.5 items-center mt-auto">
        {!autoApply && pending && (
          <button onClick={applyPending} className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: activeBg, color: activeText }}>Apply</button>
        )}
        {ds.showTodayButton !== false && (
          <button onClick={applyToday} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
            style={{ border: `1px solid ${theme.borderColor}`, color: theme.secondaryText }}>
            <CalendarCheck size={11} /> Today
          </button>
        )}
        {ds.showClearButton !== false && (
          <button onClick={clear} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
            style={{ border: `1px solid ${theme.borderColor}`, color: theme.secondaryText }}>
            <X size={11} /> Clear
          </button>
        )}
        {(start || end) && (
          <span className="text-[10px] ml-auto" style={{ color: theme.secondaryText }}>
            {toDateInput(start) || '…'} – {toDateInput(end) || '…'}
          </span>
        )}
      </div>
    </div>
  );
}

// ── dual-thumb range slider over the [min,max] date domain ─────────────────────
function RangeSlider({ min, max, start, end, accent, track, handle, ds, theme, onChange }: {
  min: Date; max: Date; start: Date | null; end: Date | null;
  accent: string; track: string; handle: string; ds: DateSlicerConfig; theme: ThemeConfig;
  onChange: (s: Date | null, e: Date | null) => void;
}) {
  const labelColor = ds.dateLabelColor ?? theme.secondaryText;
  const lo = min.getTime();
  const hi = max.getTime();
  const span = Math.max(1, hi - lo);
  // Display only: clamp the thumbs into [lo,hi] so a selection outside the data's
  // range (e.g. "Today" when the latest record is older) still renders on-track.
  // The actual broadcast filter keeps the unclamped selection.
  const clampMs = (v: number) => Math.min(Math.max(v, lo), hi);
  const sVal = clampMs(start ? start.getTime() : lo);
  const eVal = clampMs(end ? end.getTime() : hi);
  const pct = (v: number) => ((v - lo) / span) * 100;
  const day = 86_400_000;

  const labels = useMemo(() => {
    const out: { pos: number; text: string }[] = [];
    const showYear = ds.showYearLabels !== false;
    const showMonth = !!ds.showMonthLabels;
    const showQuarter = !!ds.showQuarterLabels;
    if (!showYear && !showMonth && !showQuarter) return out;
    const startY = min.getFullYear();
    const endY = max.getFullYear();
    for (let y = startY; y <= endY; y++) {
      if (showQuarter) {
        for (let q = 0; q < 4; q++) {
          const d = new Date(y, q * 3, 1).getTime();
          if (d >= lo && d <= hi) out.push({ pos: pct(d), text: `Q${q + 1} ${showYear ? `'${String(y).slice(2)}` : ''}` });
        }
      } else if (showMonth) {
        for (let mo = 0; mo < 12; mo++) {
          const d = new Date(y, mo, 1).getTime();
          if (d >= lo && d <= hi) out.push({ pos: pct(d), text: new Date(y, mo, 1).toLocaleString(undefined, { month: 'short' }) });
        }
      } else {
        const d = new Date(y, 0, 1).getTime();
        const dd = Math.max(d, lo);
        out.push({ pos: pct(dd), text: String(y) });
      }
    }
    return out.slice(0, 24);
  }, [lo, hi, span, ds.showYearLabels, ds.showMonthLabels, ds.showQuarterLabels]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="px-1 py-2">
      <div className="relative h-1.5 rounded-full" style={{ background: track }}>
        <div className="absolute h-full rounded-full"
          style={{ left: `${pct(sVal)}%`, width: `${Math.max(0, pct(eVal) - pct(sVal))}%`, background: accent }} />
        {/* start thumb */}
        <input type="range" min={lo} max={hi} step={day} value={sVal}
          onChange={(ev) => { const v = Math.min(Number(ev.target.value), eVal); onChange(new Date(v), end ?? max); }}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full"
          style={{ accentColor: handle }} />
        {/* end thumb */}
        <input type="range" min={lo} max={hi} step={day} value={eVal}
          onChange={(ev) => { const v = Math.max(Number(ev.target.value), sVal); onChange(start ?? min, new Date(v)); }}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full"
          style={{ accentColor: handle }} />
      </div>
      {labels.length > 0 && (
        <div className="relative mt-3 h-3">
          {labels.map((l, i) => (
            <span key={i} className="absolute -translate-x-1/2 text-[9px] whitespace-nowrap"
              style={{ left: `${l.pos}%`, color: labelColor }}>{l.text}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Active-filter chip for the timeline_card. The × clears the date filter (preset
// chip) or removes one entity from the runtime narrowing (per-entity chip).
function Chip({ label, onClear, accent, theme, icon }: { label: string; onClear: () => void; accent: string; theme: ThemeConfig; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium"
      style={{ background: theme.surfaceBackground, color: accent, border: `1px solid ${accent}` }}>
      {icon}{label}
      <button onClick={onClear} className="hover:opacity-60" aria-label={`Remove ${label}`}><X size={11} /></button>
    </span>
  );
}

function Status({ icon, text, theme, tone }: { icon: React.ReactNode; text: string; theme: ThemeConfig; tone?: 'error' }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-1.5 text-center px-3"
      style={{ color: tone === 'error' ? theme.error : theme.secondaryText }}>
      {icon}<span className="text-[11px] leading-snug">{text}</span>
    </div>
  );
}
