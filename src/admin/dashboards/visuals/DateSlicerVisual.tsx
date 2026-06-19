import { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2, CalendarOff, CalendarRange, X, CalendarCheck, AlertTriangle, Lock } from 'lucide-react';
import type {
  DashboardVisual, DashboardDefinition, ThemeConfig, VisualFilter, DateSlicerConfig,
  SlicerDateRange, DateFilterMode,
} from '../types/dashboard';
import { SLICER_DATE_RANGES } from '../types/dashboard';
import { runAggregate } from '../services/queryEngine';
import { computeDateRange, buildDateFilters, toDateInput, fromDateInput, type DateBounds } from './dateRanges';
import { resolveDateBoundsSource, activeMappingsFor } from './semanticRuntime';
import { isAuthError } from '../../../lib/supabase';
import FilterSelect from '../../../app/components/FilterSelect';

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
  }, [field, semantic, activeMappings.length, boundsSrc, live]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, ds.defaultRange, ds.startDate, ds.endDate]);

  // ── emit the active filters (auto-apply, debounced) ─────────────────────────
  // In semantic mode the leaf field is overwritten downstream per entity/path, so
  // emit against a stable placeholder; in direct mode emit on the real column.
  const emitField = semantic ? SEMANTIC_DATE_FIELD : (field ?? '');
  const filters = useMemo(
    () => buildDateFilters(emitField, mode, { start, end } as DateBounds, withTime),
    [emitField, mode, start, end, withTime],
  );

  useEffect(() => {
    if (state.kind !== 'ready' || !onFilterChange) return;
    if (!autoApply && touched.current) { setPending(filters); return; }
    if (emitTimer.current) clearTimeout(emitTimer.current);
    const ms = Math.max(0, ds.debounceMs ?? 0);
    emitTimer.current = setTimeout(() => onFilterChange(filters), ms);
    return () => { if (emitTimer.current) clearTimeout(emitTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, state.kind, autoApply]);

  const applyPreset = (preset: SlicerDateRange) => {
    touched.current = true;
    if (preset === 'all_time') { setStart(null); setEnd(null); return; }
    const r = computeDateRange(preset);
    // True selected range — unclamped (see seeding effect above for why).
    setStart(r.start);
    setEnd(r.end);
  };
  const clear = () => {
    touched.current = true;
    setStart(null); setEnd(null);
    setPending(null);
    onFilterChange?.([]);
  };
  const applyToday = () => applyPreset('today');
  const applyPending = () => { if (pending) { onFilterChange?.(pending); setPending(null); } };

  // ── status states ───────────────────────────────────────────────────────────
  if (state.kind === 'loading') return <Status icon={<Loader2 className="animate-spin" size={16} />} text="Loading…" theme={theme} />;
  if (state.kind === 'no_field') return <Status icon={<CalendarRange size={18} />} text="Select a date field" theme={theme} />;
  if (state.kind === 'no_mapping') return <Status icon={<CalendarRange size={18} />} text="Configure at least one entity mapping" theme={theme} />;
  if (state.kind === 'no_dates') return <Status icon={<CalendarOff size={18} />} text="No dated records found" theme={theme} />;
  if (state.kind === 'denied') return <Status icon={<Lock size={16} />} text="Permission denied" theme={theme} />;
  if (state.kind === 'error') return <Status icon={<AlertTriangle size={16} />} text={state.message} theme={theme} tone="error" />;

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

function Status({ icon, text, theme, tone }: { icon: React.ReactNode; text: string; theme: ThemeConfig; tone?: 'error' }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-1.5 text-center px-3"
      style={{ color: tone === 'error' ? theme.error : theme.secondaryText }}>
      {icon}<span className="text-[11px] leading-snug">{text}</span>
    </div>
  );
}
