import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, Wand2, Loader2, Calendar, Link2, AlertTriangle, RefreshCw, ChevronDown } from 'lucide-react';
import Modal from '../../../app/components/Modal';
import FilterSelect from '../../../app/components/FilterSelect';
import type {
  DashboardDefinition, DashboardSemanticFilter, DashboardFilterMapping,
  SemanticDataType, SemanticScope, RelationshipPath, SemanticDiscoveryConfig, PathCandidate,
} from '../types/dashboard';
import type { EntityDefinition } from '../../../types/entity';
import type { FieldDefinition } from '../../../types/field';
import {
  suggestDateField, discoverPaths, fetchFieldsCached,
} from '../services/relationshipService';
import {
  computeMappingStates, discoveryOf, STATUS_META, type EntityMappingState,
} from '../visuals/semanticStatus';

interface Props {
  def: DashboardDefinition;
  entities: EntityDefinition[];
  onChange: (next: DashboardDefinition) => void;
  onClose: () => void;
}

const uuid = () => crypto.randomUUID();
const hasSteps = (p: unknown): p is RelationshipPath =>
  !!p && Array.isArray((p as RelationshipPath).steps) && (p as RelationshipPath).steps.length > 0;

const DATE_TYPES = new Set(['date', 'datetime']);
const isDateField = (f: FieldDefinition) => DATE_TYPES.has(f.field_type?.name ?? '');

const TONE_CLS: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-700',
  amber: 'bg-amber-50 text-amber-700',
  slate: 'bg-slate-100 text-slate-500',
  red: 'bg-red-50 text-red-700',
};

export default function GlobalFiltersPanel({ def, entities, onChange, onClose }: Props) {
  const filters = def.semanticFilters ?? [];
  const mappings = useMemo(() => def.filterMappings ?? [], [def.filterMappings]);
  const [selectedId, setSelectedId] = useState<string | null>(filters[0]?.dashboard_semantic_filter_id ?? null);
  const [busy, setBusy] = useState(false);
  const [states, setStates] = useState<Record<string, EntityMappingState>>({});
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  // Date filters: manual entity selection — per-entity date-field dropdowns + an
  // "Add entity" picker so the admin chooses exactly which entities are filtered.
  const [dateFields, setDateFields] = useState<Record<string, FieldDefinition[]>>({});
  const [extraEntityIds, setExtraEntityIds] = useState<string[]>([]);

  // Entities actually used by this dashboard's visuals (resolved to definitions).
  const dashboardEntities = useMemo(() => {
    const names = new Set(def.visuals.map((v) => v.query_config.entity).filter(Boolean) as string[]);
    const out: EntityDefinition[] = [];
    for (const n of names) {
      const e = entities.find((x) => x.logical_name === n || x.physical_table_name === n);
      if (e && !out.some((o) => o.entity_definition_id === e.entity_definition_id)) out.push(e);
    }
    return out.sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [def.visuals, entities]);

  const selected = filters.find((f) => f.dashboard_semantic_filter_id === selectedId) ?? null;
  const disc = discoveryOf(selected);

  // Resolve per-entity mapping status whenever the selected filter / mappings change.
  const statesKey = JSON.stringify({
    id: selectedId,
    m: mappings.filter((m) => m.semantic_filter_id === selectedId).map((m) => [m.target_entity_id, m.target_field_id, m.relationship_path, m.is_active]),
    d: selected?.config?.discovery,
    e: dashboardEntities.map((e) => e.entity_definition_id),
  });
  useEffect(() => {
    let alive = true;
    if (!selected) { setStates({}); return; }
    (async () => {
      const next = await computeMappingStates(def, selected, dashboardEntities);
      if (alive) setStates(next);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesKey]);

  const patchFilters = useCallback((sf: DashboardSemanticFilter[]) =>
    onChange({ ...def, semanticFilters: sf }), [def, onChange]);
  const patchMappings = useCallback((mp: DashboardFilterMapping[]) =>
    onChange({ ...def, filterMappings: mp }), [def, onChange]);

  const addFilter = (dataType: SemanticDataType) => {
    const n = filters.length + 1;
    const sf: DashboardSemanticFilter = {
      dashboard_semantic_filter_id: uuid(),
      dashboard_id: def.dashboard.dashboard_id,
      key: `${dataType}_filter_${n}`,
      label: dataType === 'date' ? 'Date' : 'Filter',
      data_type: dataType,
      scope: 'dashboard',
      default_value: {},
      config: dataType === 'date' ? {} : { discovery: { mode: 'automatic', maxDepth: 3 } },
    };
    patchFilters([...filters, sf]);
    setSelectedId(sf.dashboard_semantic_filter_id);
  };

  const removeFilter = (id: string) => {
    onChange({
      ...def,
      semanticFilters: filters.filter((f) => f.dashboard_semantic_filter_id !== id),
      filterMappings: mappings.filter((m) => m.semantic_filter_id !== id),
      visualBindings: (def.visualBindings ?? []).filter((b) => b.semantic_filter_id !== id),
    });
    if (selectedId === id) setSelectedId(null);
  };

  const updateFilter = (id: string, patch: Partial<DashboardSemanticFilter>) =>
    patchFilters(filters.map((f) => f.dashboard_semantic_filter_id === id ? { ...f, ...patch } : f));

  const setDiscovery = (patch: Partial<SemanticDiscoveryConfig>) => {
    if (!selected) return;
    updateFilter(selected.dashboard_semantic_filter_id, {
      config: { ...selected.config, discovery: { ...disc, ...patch } },
    });
  };

  // Apply (or clear) a manual mapping for one entity from a discovered candidate.
  const applyCandidate = (entityId: string, candidate: PathCandidate | null, origin: 'auto' | 'manual') => {
    if (!selected) return;
    const sfId = selected.dashboard_semantic_filter_id;
    const others = mappings.filter((m) => !(m.semantic_filter_id === sfId && m.target_entity_id === entityId));
    const nextMappings = candidate
      ? [...others, makeMapping(sfId, def.dashboard.dashboard_id, entityId, candidate.targetFieldId,
          candidate.steps.length ? { sourceEntityId: entityId, steps: candidate.steps, targetFieldId: candidate.targetFieldId } : null)]
      : others;
    const nextOrigin = { ...(disc.origin ?? {}) };
    if (candidate) nextOrigin[entityId] = origin; else delete nextOrigin[entityId];
    onChange({
      ...def,
      filterMappings: nextMappings,
      semanticFilters: filters.map((f) => f.dashboard_semantic_filter_id === sfId
        ? { ...f, config: { ...f.config, discovery: { ...disc, origin: nextOrigin } } } : f),
    });
    setOpenPicker(null);
  };

  // Scan the whole dashboard: discover the best path for every entity, auto-map
  // the unambiguous ones, and record candidates for ambiguous / review. Manual
  // overrides are preserved.
  const scan = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const sfId = selected.dashboard_semantic_filter_id;
      const maxDepth = Math.min(Math.max(disc.maxDepth ?? 3, 1), 5);
      const targetEntityId = (selected.config?.targetEntityId as string) || null;
      const origin = { ...(disc.origin ?? {}) };
      const candidatesByEntity: Record<string, PathCandidate[]> = {};
      const unmapped: string[] = [];

      // Leaf fields already chosen anywhere (nudges discovery toward prior intent).
      const configuredLeaves = new Set(
        mappings.filter((m) => m.target_field_id).map((m) => m.target_field_id as string),
      );

      // Keep manual overrides; drop previous auto mappings for this filter.
      const kept = mappings.filter((m) =>
        m.semantic_filter_id !== sfId || origin[m.target_entity_id ?? ''] === 'manual');
      const next: DashboardFilterMapping[] = [...kept];

      for (const ent of dashboardEntities) {
        const eid = ent.entity_definition_id;
        if (origin[eid] === 'manual') continue;        // respect an admin override

        if (selected.data_type === 'date') {
          const f = await suggestDateField(eid);
          if (!f) { unmapped.push(eid); continue; }
          next.push(makeMapping(sfId, def.dashboard.dashboard_id, eid, f.field_definition_id, null));
          origin[eid] = 'auto';
          continue;
        }

        if (!targetEntityId) { unmapped.push(eid); continue; }
        const result = await discoverPaths(eid, targetEntityId, maxDepth, configuredLeaves);
        candidatesByEntity[eid] = result.candidates.slice(0, 8);
        if (!result.best) { unmapped.push(eid); delete origin[eid]; continue; }
        if (result.ambiguous) { delete origin[eid]; continue; } // leave for human review

        const best = result.best;
        next.push(makeMapping(sfId, def.dashboard.dashboard_id, eid, best.targetFieldId,
          best.steps.length ? { sourceEntityId: eid, steps: best.steps, targetFieldId: best.targetFieldId } : null));
        origin[eid] = 'auto';
      }

      onChange({
        ...def,
        filterMappings: next,
        semanticFilters: filters.map((f) => f.dashboard_semantic_filter_id === sfId
          ? { ...f, config: { ...f.config, discovery: { ...disc, mode: disc.mode ?? 'automatic', maxDepth, origin, candidates: candidatesByEntity, unmapped } } }
          : f),
      });
    } finally {
      setBusy(false);
    }
  };

  const stateList = dashboardEntities.map((e) => states[e.entity_definition_id]).filter(Boolean) as EntityMappingState[];
  const ambiguousCount = stateList.filter((s) => s.status === 'ambiguous').length;
  const isDate = selected?.data_type === 'date';
  const canScan = !!selected && (isDate || !!selected.config?.targetEntityId);

  // ── date filter: the entities shown for manual mapping ──────────────────────
  // Union of (entities the dashboard's visuals use) + (entities already mapped) +
  // (entities the admin added by hand). Lets you map ANY entity, not just the
  // auto-discovered ones.
  const dateEntities = useMemo<EntityDefinition[]>(() => {
    if (!selected || !isDate) return [];
    const ids = new Set<string>();
    dashboardEntities.forEach((e) => ids.add(e.entity_definition_id));
    mappings.forEach((m) => { if (m.semantic_filter_id === selected.dashboard_semantic_filter_id && m.target_entity_id) ids.add(m.target_entity_id); });
    extraEntityIds.forEach((id) => ids.add(id));
    const out: EntityDefinition[] = [];
    ids.forEach((id) => { const e = entities.find((x) => x.entity_definition_id === id); if (e) out.push(e); });
    return out.sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [selected, isDate, dashboardEntities, mappings, extraEntityIds, entities]);

  const dateEntitiesKey = dateEntities.map((e) => e.entity_definition_id).join(',');
  // Load each entity's date/datetime fields for the dropdowns (cached, on demand).
  useEffect(() => {
    if (!isDate) return;
    let alive = true;
    (async () => {
      const next: Record<string, FieldDefinition[]> = {};
      for (const e of dateEntities) {
        if (dateFields[e.entity_definition_id]) continue;
        try { next[e.entity_definition_id] = (await fetchFieldsCached(e.entity_definition_id)).filter(isDateField); }
        catch { next[e.entity_definition_id] = []; }
      }
      if (alive && Object.keys(next).length) setDateFields((prev) => ({ ...prev, ...next }));
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDate, dateEntitiesKey]);

  // Hand-added entities are per-filter — drop them when switching filters.
  useEffect(() => { setExtraEntityIds([]); }, [selectedId]);

  const dateMappingFor = (entityId: string) =>
    mappings.find((m) => m.semantic_filter_id === selected?.dashboard_semantic_filter_id && m.target_entity_id === entityId) ?? null;

  // Pick (or clear) the date field for one entity — '' removes the mapping.
  const setDateField = (entityId: string, fieldId: string) => {
    if (!selected) return;
    const sfId = selected.dashboard_semantic_filter_id;
    const others = mappings.filter((m) => !(m.semantic_filter_id === sfId && m.target_entity_id === entityId));
    const nextMappings = fieldId
      ? [...others, makeMapping(sfId, def.dashboard.dashboard_id, entityId, fieldId, null)]
      : others;
    const nextOrigin = { ...(disc.origin ?? {}) };
    if (fieldId) nextOrigin[entityId] = 'manual'; else delete nextOrigin[entityId];
    onChange({
      ...def,
      filterMappings: nextMappings,
      semanticFilters: filters.map((f) => f.dashboard_semantic_filter_id === sfId
        ? { ...f, config: { ...f.config, discovery: { ...disc, origin: nextOrigin } } } : f),
    });
  };
  const addDateEntity = (entityId: string) => { if (entityId) setExtraEntityIds((p) => (p.includes(entityId) ? p : [...p, entityId])); };
  const removeDateEntity = (entityId: string) => {
    setDateField(entityId, '');
    setExtraEntityIds((p) => p.filter((x) => x !== entityId));
  };
  const addableEntities = entities
    .filter((e) => !dateEntities.some((d) => d.entity_definition_id === e.entity_definition_id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  return (
    <Modal
      title="Global filters"
      description="Define a filter once; the engine discovers how every dashboard entity reaches it (direct field or relationship path) and maps them automatically. One slicer selection filters all compatible visuals — each through its own field or path."
      icon={<Link2 size={16} />}
      width={820}
      onClose={onClose}
      footer={<button onClick={onClose} className="px-3 py-1.5 text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Done</button>}
    >
      <div className="flex gap-4 min-h-[380px]">
        {/* Filters list */}
        <div className="w-48 shrink-0 border-r border-slate-200 pr-3">
          <div className="flex items-center gap-1 mb-2">
            <button onClick={() => addFilter('date')} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-slate-100 hover:bg-slate-200 text-slate-700"><Calendar size={12} /> Date</button>
            <button onClick={() => addFilter('lookup')} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-slate-100 hover:bg-slate-200 text-slate-700"><Plus size={12} /> Lookup</button>
          </div>
          <div className="space-y-0.5">
            {filters.map((f) => (
              <button key={f.dashboard_semantic_filter_id}
                onClick={() => setSelectedId(f.dashboard_semantic_filter_id)}
                className={`w-full text-left px-2 py-1.5 rounded text-[12px] flex items-center justify-between gap-1 ${selectedId === f.dashboard_semantic_filter_id ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100 text-slate-700'}`}>
                <span className="truncate">{f.label || f.key}</span>
                <Trash2 size={12} className="text-slate-400 hover:text-red-500 shrink-0"
                  onClick={(e) => { e.stopPropagation(); removeFilter(f.dashboard_semantic_filter_id); }} />
              </button>
            ))}
            {!filters.length && <p className="text-[11px] text-slate-400 px-1 py-2">No global filters yet.</p>}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-[12px] text-slate-400">Select or add a global filter.</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Label">
                  <input value={selected.label} onChange={(e) => updateFilter(selected.dashboard_semantic_filter_id, { label: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Key">
                  <input value={selected.key} onChange={(e) => updateFilter(selected.dashboard_semantic_filter_id, { key: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })} className={inputCls} />
                </Field>
                <Field label="Type">
                  <FilterSelect value={selected.data_type} onChange={(e) => updateFilter(selected.dashboard_semantic_filter_id, { data_type: e.target.value as SemanticDataType })} className={inputCls}>
                    <option value="date">Date</option>
                    <option value="lookup">Lookup</option>
                    <option value="choice">Choice</option>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                  </FilterSelect>
                </Field>
                <Field label="Scope">
                  <FilterSelect value={selected.scope} onChange={(e) => updateFilter(selected.dashboard_semantic_filter_id, { scope: e.target.value as SemanticScope })} className={inputCls}>
                    <option value="dashboard">Entire dashboard</option>
                    <option value="page">Current page</option>
                    <option value="selected">Selected visuals</option>
                  </FilterSelect>
                </Field>
              </div>

              {!isDate && (
                <Field label="Target entity (the entity this filter selects from, e.g. Industry)">
                  <FilterSelect
                    value={(selected.config?.targetEntityId as string) ?? ''}
                    onChange={(e) => updateFilter(selected.dashboard_semantic_filter_id, { config: { ...selected.config, targetEntityId: e.target.value || undefined } })}
                    className={inputCls}>
                    <option value="">— Select —</option>
                    {entities.map((en) => <option key={en.entity_definition_id} value={en.entity_definition_id}>{en.display_name}</option>)}
                  </FilterSelect>
                </Field>
              )}

              {/* Relationship discovery controls (lookup filters only) */}
              {!isDate && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Relationship discovery">
                    <FilterSelect value={disc.mode ?? 'automatic'} onChange={(e) => setDiscovery({ mode: e.target.value as 'automatic' | 'manual' })} className={inputCls}>
                      <option value="automatic">Automatic</option>
                      <option value="manual">Manual</option>
                    </FilterSelect>
                  </Field>
                  <Field label="Maximum path depth (1–5 hops)">
                    <FilterSelect value={String(disc.maxDepth ?? 3)} onChange={(e) => setDiscovery({ maxDepth: Number(e.target.value) })} className={inputCls}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} hop{n > 1 ? 's' : ''}</option>)}
                    </FilterSelect>
                  </Field>
                </div>
              )}

              {/* Mapping table */}
              <div className="border-t border-slate-100 pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-slate-600">
                    {isDate ? `Mapped entities (${dateEntities.filter((e) => dateMappingFor(e.entity_definition_id)).length})` : `Mapped dashboard entities (${dashboardEntities.length})`}
                    {ambiguousCount > 0 && <span className="ml-1 text-amber-600">· {ambiguousCount} ambiguous</span>}
                  </span>
                  <button onClick={scan} disabled={busy || !canScan}
                    title={isDate ? 'Auto-suggest a date field for the dashboard entities (your manual picks are kept)' : 'Re-discover relationship paths'}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40">
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {isDate ? 'Auto-suggest' : 'Re-scan'}
                  </button>
                </div>
                {isDate ? (
                  /* ── Date filter: manual per-entity date-field mapping ── */
                  <div className="space-y-0.5">
                    {dateEntities.map((e) => {
                      const id = e.entity_definition_id;
                      const mapping = dateMappingFor(id);
                      const fields = dateFields[id];
                      const noFields = fields !== undefined && fields.length === 0;
                      return (
                        <div key={id} className="flex items-center gap-2 py-1 border-b border-slate-50 text-[12px]">
                          <span className="w-28 shrink-0 truncate text-slate-700">{e.display_name}</span>
                          <FilterSelect
                            value={mapping?.target_field_id ?? ''}
                            disabled={noFields}
                            onChange={(ev) => setDateField(id, ev.target.value)}
                            className="flex-1 min-w-0 px-2 py-1 text-[12px] rounded border border-slate-300 text-slate-800">
                            <option value="">{noFields ? 'No date fields available' : '— Not mapped —'}</option>
                            {(fields ?? []).map((f) => (
                              <option key={f.field_definition_id} value={f.field_definition_id}>{f.display_name}</option>
                            ))}
                          </FilterSelect>
                          {mapping && (
                            <input type="checkbox" title="Active" checked={mapping.is_active}
                              onChange={() => patchMappings(mappings.map((x) => x.dashboard_filter_mapping_id === mapping.dashboard_filter_mapping_id ? { ...x, is_active: !x.is_active } : x))} />
                          )}
                          <Trash2 size={13} title="Remove entity" className="shrink-0 text-slate-400 hover:text-red-500 cursor-pointer"
                            onClick={() => removeDateEntity(id)} />
                        </div>
                      );
                    })}
                    {!dateEntities.length && (
                      <p className="text-[11px] text-slate-400 py-1">No entities yet — add one below to map a date field.</p>
                    )}
                    {/* Add any entity (not just the auto-discovered ones). */}
                    <div className="pt-2">
                      <FilterSelect value="" onChange={(ev) => { addDateEntity(ev.target.value); }}
                        className="w-full px-2 py-1.5 text-[12px] rounded border border-dashed border-slate-300 text-slate-600">
                        <option value="">+ Add entity…</option>
                        {addableEntities.map((en) => <option key={en.entity_definition_id} value={en.entity_definition_id}>{en.display_name}</option>)}
                      </FilterSelect>
                    </div>
                  </div>
                ) : (
                <>
                {!dashboardEntities.length && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle size={12} /> Add visuals first — mappings target the entities your visuals use.</p>
                )}
                {!!dashboardEntities.length && !stateList.length && (
                  <p className="text-[11px] text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Resolving…</p>
                )}
                <div className="space-y-0.5">
                  {stateList.map((st) => {
                    const meta = STATUS_META[st.status];
                    const open = openPicker === st.entityId;
                    return (
                      <div key={st.entityId} className="text-[12px] py-1 border-b border-slate-50">
                        <div className="flex items-center gap-2">
                          <span className="w-28 shrink-0 truncate text-slate-700">{st.entityName}</span>
                          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${TONE_CLS[meta.tone]}`}>{meta.label}</span>
                          <span className="flex-1 truncate text-slate-500">{st.pathLabel || st.detail || ''}</span>
                          {!isDate && (st.candidates.length > 0 || st.mapping) && (
                            <button onClick={() => setOpenPicker(open ? null : st.entityId)}
                              className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-slate-500 hover:bg-slate-100">
                              {st.status === 'ambiguous' ? 'Resolve' : 'Override'} <ChevronDown size={11} />
                            </button>
                          )}
                          {st.mapping && (
                            <input type="checkbox" title="Active" checked={st.mapping.is_active}
                              onChange={() => {
                                const m = st.mapping!;
                                patchMappings(mappings.map((x) => x.dashboard_filter_mapping_id === m.dashboard_filter_mapping_id ? { ...x, is_active: !x.is_active } : x));
                              }} />
                          )}
                        </div>
                        {open && (
                          <div className="mt-1 ml-2 pl-2 border-l-2 border-slate-100 space-y-0.5">
                            {st.candidates.map((c, i) => {
                              const active = !!st.mapping && st.mapping.target_field_id === c.targetFieldId
                                && (hasSteps(st.mapping.relationship_path) ? (st.mapping.relationship_path as RelationshipPath).steps.length : 0) === c.steps.length;
                              return (
                                <button key={i} onClick={() => applyCandidate(st.entityId, c, 'manual')}
                                  className={`w-full text-left px-2 py-1 rounded text-[11px] flex items-center justify-between gap-2 ${active ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-600'}`}>
                                  <span className="truncate">{st.candidateLabels[i]}</span>
                                  <span className="shrink-0 text-[10px] text-slate-400">{c.hops === 0 ? 'direct' : `${c.hops} hop${c.hops > 1 ? 's' : ''}`}{c.hasReverse ? ' · reverse' : ''}</span>
                                </button>
                              );
                            })}
                            <button onClick={() => applyCandidate(st.entityId, null, 'manual')}
                              className="w-full text-left px-2 py-1 rounded text-[11px] text-slate-500 hover:bg-slate-50">
                              Not affected by this filter
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                </>
                )}
              </div>

              {isDate && (
                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Wand2 size={11} /> Pick a date field per entity, or “Add entity” to map any entity. “Auto-suggest” fills empty ones but never overrides your picks.
                </p>
              )}

              {disc.mode === 'manual' && !isDate && (
                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Wand2 size={11} /> Manual mode: Re-scan still discovers candidates, but only entities you pick are mapped.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function makeMapping(
  semanticFilterId: string, dashboardId: string, entityId: string,
  leafFieldId: string, path: RelationshipPath | null,
): DashboardFilterMapping {
  return {
    dashboard_filter_mapping_id: uuid(),
    dashboard_id: dashboardId,
    semantic_filter_id: semanticFilterId,
    target_entity_id: entityId,
    target_field_id: leafFieldId,
    relationship_path: path ?? {},
    join_mode: 'auto',
    null_behavior: 'exclude',
    priority: 0,
    is_active: true,
  };
}

const inputCls = 'w-full px-2 py-1.5 text-[12px] rounded border border-slate-300 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] text-slate-500 mb-1">{label}</label>{children}</div>;
}
