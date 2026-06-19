// Lookup / choice slicer (spec §6/§8). Drives a NON-date semantic filter (e.g.
// Industry). It renders only the values ACTUALLY referenced by accessible records
// across the dashboard's mapped entities — never the whole master table — and
// broadcasts an `in`/`eq` selection that each visual translates to its own field
// or relationship path (handled by useDashboardSemanticFilters.resolveForVisual).
//
// The option set is CONTEXTUAL: it re-queries whenever another active slicer
// (Date, Country, Status, Owner, …) changes, but ignores this slicer's own
// current selection so it never collapses to the value just picked (§7).

import { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, Filter, X, Lock, AlertTriangle, Search, CheckSquare, Square } from 'lucide-react';
import type {
  DashboardVisual, DashboardDefinition, ThemeConfig, VisualFilter, ValueSlicerConfig, SlicerBroadcastOpts,
} from '../types/dashboard';
import { runDistinctValues, type DistinctSource } from '../services/queryEngine';
import { buildSlicerSources, type SlicerSelection } from './slicerValues';
import { fetchEntitiesCached } from '../services/relationshipService';
import { isAuthError } from '../../../lib/supabase';
import FilterSelect from '../../../app/components/FilterSelect';

interface Props {
  visual: DashboardVisual;
  theme: ThemeConfig;
  live?: boolean;
  definition?: DashboardDefinition;
  /** Current semantic selections (so the value set stays contextual). */
  semanticSelections?: Record<string, SlicerSelection>;
  onFilterChange?: (filters: VisualFilter[], opts?: SlicerBroadcastOpts) => void;
}

// Placeholder leaf field: resolveForVisual overwrites it per entity (direct) or
// routes through the path's targetFieldId (server-side), so the literal name is
// never used in a query.
const SEMANTIC_VALUE_FIELD = '__dashboard_value__';

type Opt = { id: string; label: string };
type State =
  | { kind: 'loading' } | { kind: 'no_filter' } | { kind: 'no_target' }
  | { kind: 'denied' } | { kind: 'error'; message: string }
  | { kind: 'ready'; options: Opt[] };

export default function ValueSlicerVisual({
  visual, theme, live = true, definition, semanticSelections, onFilterChange,
}: Props) {
  const vs: ValueSlicerConfig = visual.data_config.valueSlicer ?? {};
  const semId = vs.semanticFilterId;
  const multi = vs.multiSelect !== false;
  const style = vs.style ?? 'list';
  const accent = vs.selectedColor ?? theme.primaryAccent;
  const textColor = vs.textColor ?? theme.primaryText;

  const sf = useMemo(
    () => definition?.semanticFilters?.find((s) => s.dashboard_semantic_filter_id === semId) ?? null,
    [definition, semId],
  );

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [selected, setSelected] = useState<string[]>(vs.defaultValues ?? []);
  const [search, setSearch] = useState('');
  const reqId = useRef(0);
  const touched = useRef(false);

  // Other active selections (exclude our own) → drives contextual re-query.
  const otherSelections = useMemo(() => {
    const out: Record<string, SlicerSelection> = {};
    for (const [k, v] of Object.entries(semanticSelections ?? {})) if (k !== semId) out[k] = v;
    return out;
  }, [semanticSelections, semId]);
  const otherKey = JSON.stringify(otherSelections);

  // ── load the used-value option set ──────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    if (!sf || !semId) { setState({ kind: 'no_filter' }); return; }
    const targetEntityId = sf.config?.targetEntityId as string | undefined;
    if (sf.data_type === 'lookup' && !targetEntityId) { setState({ kind: 'no_target' }); return; }
    if (!live) { setState({ kind: 'ready', options: [] }); return; }

    const id = ++reqId.current;
    setState({ kind: 'loading' });
    (async () => {
      const sources: DistinctSource[] = definition
        ? await buildSlicerSources(definition, sf, otherSelections, visual.dashboard_page_id)
        : [];
      if (!sources.length) { if (alive && id === reqId.current) setState({ kind: 'ready', options: [] }); return; }

      // Resolve the target entity for label lookup.
      let labelEntity: string | undefined;
      let labelField: string | undefined;
      if (targetEntityId) {
        const ents = await fetchEntitiesCached();
        const te = ents.find((e) => e.entity_definition_id === targetEntityId);
        labelEntity = te?.logical_name;
        labelField = te?.primary_field_name;
      }

      try {
        const res = await runDistinctValues({ sources, labelEntity, labelField });
        if (!alive || id !== reqId.current) return;
        const options: Opt[] = res.options.length
          ? res.options
          : res.values.map((v) => ({ id: v, label: v }));
        setState({ kind: 'ready', options });
      } catch (e) {
        if (!alive || id !== reqId.current) return;
        if (isAuthError(e as Error)) { setState({ kind: 'denied' }); return; }
        setState({ kind: 'error', message: e instanceof Error ? e.message : 'Query failed' });
      }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sf, semId, live, otherKey, visual.dashboard_page_id]);

  // Drop any selected ids that are no longer available in the current option set.
  useEffect(() => {
    if (state.kind !== 'ready') return;
    const valid = new Set(state.options.map((o) => o.id));
    setSelected((prev) => {
      const next = prev.filter((id) => valid.has(id));
      return next.length === prev.length ? prev : next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, state.kind === 'ready' ? state.options.length : 0]);

  // ── broadcast the selection ─────────────────────────────────────────────────
  useEffect(() => {
    if (!onFilterChange || !touched.current) return;
    if (!selected.length) { onFilterChange([]); return; }
    onFilterChange([{
      field: SEMANTIC_VALUE_FIELD,
      op: multi ? 'in' : 'eq',
      value: multi ? selected : selected[0],
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, multi]);

  const toggle = (id: string) => {
    touched.current = true;
    setSelected((prev) => {
      if (multi) return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return prev.includes(id) ? [] : [id];
    });
  };
  const clear = () => { touched.current = true; setSelected([]); };
  const selectAll = (opts: Opt[]) => { touched.current = true; setSelected(opts.map((o) => o.id)); };

  // ── status states ───────────────────────────────────────────────────────────
  if (state.kind === 'loading') return <Status icon={<Loader2 className="animate-spin" size={16} />} text="Loading…" theme={theme} />;
  if (state.kind === 'no_filter') return <Status icon={<Filter size={18} />} text="Bind this slicer to a global filter" theme={theme} />;
  if (state.kind === 'no_target') return <Status icon={<Filter size={18} />} text="Set the filter's target entity" theme={theme} />;
  if (state.kind === 'denied') return <Status icon={<Lock size={16} />} text="Permission denied" theme={theme} />;
  if (state.kind === 'error') return <Status icon={<AlertTriangle size={16} />} text={state.message} theme={theme} tone="error" />;

  const options = state.options;
  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  if (!options.length) {
    return <Status icon={<Filter size={18} />} text="No values in current context" theme={theme} />;
  }

  const label = sf?.label || 'Filter';

  // ── dropdown style ──────────────────────────────────────────────────────────
  if (style === 'dropdown' && !multi) {
    return (
      <div className="h-full w-full p-2 flex flex-col gap-1" style={{ color: textColor }}>
        <FilterSelect
          value={selected[0] ?? ''}
          onChange={(e) => { touched.current = true; setSelected(e.target.value ? [e.target.value] : []); }}
          className="w-full px-2 py-1.5 text-[12px] rounded border"
          style={{ borderColor: theme.borderColor, color: textColor, background: theme.surfaceBackground }}
        >
          <option value="">All {label}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </FilterSelect>
      </div>
    );
  }

  // ── chips / buttons style ───────────────────────────────────────────────────
  if (style === 'chips' || style === 'buttons') {
    return (
      <div className="h-full w-full p-2 overflow-auto flex flex-wrap gap-1 content-start" style={{ color: textColor }}>
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button key={o.id} onClick={() => toggle(o.id)}
              className="px-2 py-0.5 rounded text-[11px] whitespace-nowrap transition-colors"
              style={{
                background: on ? accent : theme.surfaceBackground,
                border: `1px solid ${on ? accent : theme.borderColor}`,
                color: on ? '#fff' : theme.secondaryText,
              }}>
              {o.label}
            </button>
          );
        })}
        {selected.length > 0 && (vs.showClearButton !== false) && (
          <button onClick={clear} className="px-2 py-0.5 rounded text-[11px] flex items-center gap-1"
            style={{ border: `1px solid ${theme.borderColor}`, color: theme.secondaryText }}>
            <X size={11} /> Clear
          </button>
        )}
      </div>
    );
  }

  // ── list style (default) ────────────────────────────────────────────────────
  return (
    <div className="h-full w-full p-2 flex flex-col gap-1.5" style={{ color: textColor }}>
      {vs.searchable !== false && options.length > 6 && (
        <div className="flex items-center gap-1 px-2 py-1 rounded border" style={{ borderColor: theme.borderColor }}>
          <Search size={12} style={{ color: theme.secondaryText }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
            className="flex-1 bg-transparent text-[11px] outline-none" style={{ color: textColor }} />
        </div>
      )}
      {multi && (vs.showSelectAll !== false || vs.showClearButton !== false) && (
        <div className="flex items-center gap-2 text-[10px]" style={{ color: theme.secondaryText }}>
          {vs.showSelectAll !== false && (
            <button onClick={() => selectAll(filtered)} className="hover:underline">Select all</button>
          )}
          {vs.showClearButton !== false && (
            <button onClick={clear} className="hover:underline">Clear</button>
          )}
          {selected.length > 0 && <span className="ml-auto">{selected.length} selected</span>}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto -mx-1">
        {filtered.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button key={o.id} onClick={() => toggle(o.id)}
              className="w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[12px] transition-colors hover:bg-black/5"
              style={{ color: on ? accent : textColor }}>
              {multi
                ? (on ? <CheckSquare size={14} style={{ color: accent }} /> : <Square size={14} style={{ color: theme.secondaryText }} />)
                : <span className="w-3.5 h-3.5 rounded-full border flex items-center justify-center" style={{ borderColor: on ? accent : theme.secondaryText }}>
                    {on && <span className="w-2 h-2 rounded-full" style={{ background: accent }} />}
                  </span>}
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
        {!filtered.length && <p className="text-[11px] px-2 py-1" style={{ color: theme.secondaryText }}>No matches</p>}
      </div>
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
