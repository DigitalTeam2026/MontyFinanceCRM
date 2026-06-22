import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowLeft, ArrowDown, Save, Settings, GitMerge, Plus,
  CheckCircle2, XCircle, Lock, ToggleLeft, ToggleRight,
  AlertTriangle, Globe, Briefcase, Package, Info,
  GitBranch, ArrowRight,
  Layers, X, GripVertical, Trash2,
  Check, Pencil, Loader2, Star, StarOff, Link2, Building2,
  ArrowLeftRight, ShieldCheck, Tag, ListChecks, Pin, Search,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type {
  ProcessFlow, ProcessStage, ProcessFlowTransition,
  ProcessStageFormData, StageType, ProcessFlowScope, ComponentType,
  ProcessStageField, StageCategory, ProcessFlowEntityConfig,
  ProcessFlowEntityConfigFormData, LinkBehavior, ConditionGroup, ConditionLeaf,
  ProcessFlowDraft,
} from '../../types/processFlow';
import { STAGE_TYPE_META, STAGE_CATEGORIES, CONDITION_OPERATORS, LINK_BEHAVIOR_OPTIONS, isConditionGroup } from '../../types/processFlow';
import {
  fetchProcessFlowWithDetails, updateProcessFlow,
  createProcessStage, updateProcessStage, deleteProcessStage,
  reorderProcessStages, replaceAllTransitions, setDefaultStage,
  fetchFormsForEntity, fetchStageFields, addStageField,
  updateStageField, deleteStageField, reorderStageFields,
  fetchEntityConfigs, upsertEntityConfig, deleteEntityConfig,
  ensurePrimaryEntityConfig,
  publishProcessFlowDraft, fetchStageFieldsForFlow,
} from '../../services/processFlowService';
import type { EntityDefinition } from '../../types/entity';
import { fetchEntities } from '../../services/entityService';
import type { LineOfBusiness, Product } from '../../types/product';
import { fetchLinesOfBusiness, fetchProducts } from '../../services/productService';
import type { FieldDefinition } from '../../types/field';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { fetchRelationshipsForEntity } from '../../services/relationshipService';
import type { RelationshipDefinitionWithEntities } from '../../types/relationship';
import TransitionMatrixPanel from './TransitionMatrixPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import { supabase } from '../../lib/supabase';

interface ProcessFlowEditorPageProps {
  flow: ProcessFlow;
  onBack: () => void;
  onFlowUpdate: (flow: ProcessFlow) => void;
}

// ─── Component palette definition ────────────────────────────────────────────

interface ComponentDef {
  type: ComponentType;
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  description: string;
}

const COMPONENT_DEFS: ComponentDef[] = [
  {
    type: 'stage',
    label: 'Stage',
    icon: <Layers size={14} />,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    description: 'A progress stage with fields',
  },
  {
    type: 'condition',
    label: 'Condition',
    icon: <GitBranch size={14} />,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    description: 'Branch flow based on field values',
  },
];

const getComponentDef = (type: ComponentType): ComponentDef =>
  COMPONENT_DEFS.find((c) => c.type === type) ?? COMPONENT_DEFS[0];

// ─── Condition group builder (AND/OR + nested groups) ─────────────────────────
function ConditionGroupEditor({ group, onChange, fields, entityId, depth = 0, valueLabels: vlProp, registerLabel: rlProp }: {
  group: ConditionGroup;
  onChange: (g: ConditionGroup) => void;
  fields: FieldDefinition[];
  entityId: string;
  depth?: number;
  // Shared registry mapping `${field}::${value}` → human-readable label so lookup/choice
  // values can be shown as record names (not GUIDs) in the live IF preview.
  valueLabels?: Record<string, string>;
  registerLabel?: (key: string, label: string) => void;
}) {
  // The root (depth 0) owns the label registry; nested groups reuse the one passed down.
  const [vlState, setVlState] = useState<Record<string, string>>({});
  const valueLabels = vlProp ?? vlState;
  const registerLabel = rlProp ?? ((key: string, label: string) =>
    setVlState((prev) => (prev[key] === label ? prev : { ...prev, [key]: label })));

  const update = (rules: (ConditionLeaf | ConditionGroup)[]) => onChange({ ...group, rules });
  const setRule = (i: number, r: ConditionLeaf | ConditionGroup) => update(group.rules.map((x, idx) => (idx === i ? r : x)));
  const removeAt = (i: number) => update(group.rules.filter((_, idx) => idx !== i));
  const addRule = () => update([...group.rules, { field: '', operator: 'eq', value: '' }]);
  const addGroup = () => update([...group.rules, { logic: 'AND', rules: [{ field: '', operator: 'eq', value: '' }] }]);
  const selCls = 'px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 bg-white';

  return (
    <div className={depth > 0 ? 'pl-2 border-l-2 border-amber-200' : ''}>
      <div className="flex items-center gap-1 mb-2">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {(['AND', 'OR'] as const).map((op) => (
            <button key={op} type="button" onClick={() => onChange({ ...group, logic: op })}
              className={`px-2.5 py-1 text-[11px] font-bold ${group.logic === op ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {op}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-gray-400">match {group.logic === 'AND' ? 'all' : 'any'} of the following</span>
      </div>

      <div className="space-y-1.5">
        {group.rules.map((r, i) => (isConditionGroup(r) ? (
          <div key={i} className="rounded-lg border border-amber-100 bg-amber-50/30 p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Group</span>
              <button type="button" onClick={() => removeAt(i)} className="text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
            </div>
            <ConditionGroupEditor group={r} onChange={(g) => setRule(i, g)} fields={fields} entityId={entityId} depth={depth + 1} valueLabels={valueLabels} registerLabel={registerLabel} />
          </div>
        ) : (
          <div key={i} className="flex items-center gap-1.5 flex-wrap">
            {/* Field — dynamic dropdown of the selected entity's fields */}
            <FilterSelect value={r.field} onChange={(e) => setRule(i, { ...r, field: e.target.value, value: '' })} className={`${selCls} flex-1 min-w-[6.5rem]`}>
              <option value="">— field —</option>
              {fields.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
            </FilterSelect>
            {/* Operator — fixed width so it can't squeeze the field/value out of view */}
            <FilterSelect value={r.operator} onChange={(e) => setRule(i, { ...r, operator: e.target.value })} className={`${selCls} w-[7.5rem] shrink-0`}>
              {CONDITION_OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
            </FilterSelect>
            {/* Value — type-aware control (lookup search / choice dropdown / plain input) */}
            {r.operator !== 'empty' && r.operator !== 'not_empty' && (() => {
              const f = fields.find((ff) => ff.logical_name === r.field);
              const ftype = f?.field_type?.name ?? 'text';
              const cfg = f?.config_json as Record<string, unknown> | null;
              if (f && (ftype === 'lookup' || ftype === 'owner')) {
                return <div className="flex-1 min-w-[9rem]"><ConditionLookupValueInput field={f} value={r.value} hideLabel onResolved={(val, label) => registerLabel(`${r.field}::${val}`, label)} onChange={(v) => setRule(i, { ...r, value: v })} /></div>;
              }
              if (f && (ftype === 'choice' || ftype === 'optionset') && (cfg?.is_statecode_field || cfg?.is_statusreason_field) && entityId) {
                return <div className="flex-1 min-w-[9rem]"><ConditionChoiceValueInput field={f} entityDefId={entityId} value={r.value} hideLabel onResolved={(val, label) => registerLabel(`${r.field}::${val}`, label)} onChange={(v) => setRule(i, { ...r, value: v })} /></div>;
              }
              return <input value={r.value} onChange={(e) => setRule(i, { ...r, value: e.target.value })} placeholder="value" className={`${selCls} flex-1 min-w-[6rem]`} />;
            })()}
            <button type="button" onClick={() => removeAt(i)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={11} /></button>
          </div>
        )))}
      </div>

      <div className="flex items-center gap-1.5 mt-2">
        <button type="button" onClick={addRule}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100">
          <Plus size={11} /> Condition
        </button>
        <button type="button" onClick={addGroup}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100">
          <Plus size={11} /> Group
        </button>
      </div>

      {/* Live preview of the whole condition (readable) */}
      {depth === 0 && (() => {
        const leafText = (r: ConditionLeaf): string => {
          if (!r.field) return '';
          const fname = fields.find((f) => f.logical_name === r.field)?.display_name ?? r.field;
          const opLabel = CONDITION_OPERATORS.find((o) => o.value === r.operator)?.label ?? r.operator;
          // Prefer the resolved record/choice name over the raw stored value (GUID / option code).
          const valLabel = valueLabels[`${r.field}::${r.value}`] ?? r.value;
          return (r.operator === 'empty' || r.operator === 'not_empty') ? `${fname} ${opLabel}` : `${fname} ${opLabel} ${valLabel || '…'}`;
        };
        const groupText = (g: ConditionGroup): string =>
          g.rules.map((r) => (isConditionGroup(r) ? `(${groupText(r)})` : leafText(r))).filter(Boolean).join(` ${g.logic} `);
        const text = groupText(group);
        return text ? (
          <div className="mt-2 flex items-start gap-1.5 px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 flex-wrap">
            <span className="font-bold text-[10px] text-amber-600 mt-px shrink-0">IF</span>
            <span className="font-mono break-words">{text}</span>
          </div>
        ) : null;
      })()}
    </div>
  );
}

type Tab = 'designer' | 'transitions' | 'settings';

// Fetch dynamic choices for statecode / statusreason fields from the DB
function ConditionChoiceValueInput({
  field,
  entityDefId,
  value,
  onChange,
  hideLabel = false,
  onResolved,
}: {
  field: FieldDefinition;
  entityDefId: string;
  value: string;
  onChange: (v: string) => void;
  hideLabel?: boolean;
  onResolved?: (value: string, label: string) => void;
}) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const cfg = field.config_json as Record<string, unknown> | null;
  const isStatecode = !!cfg?.is_statecode_field;
  const isStatusReason = !!cfg?.is_statusreason_field;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (isStatecode) {
          const { data } = await supabase
            .from('statecode_definition')
            .select('state_value, display_label')
            .eq('entity_definition_id', entityDefId)
            .order('sort_order');
          if (!cancelled) {
            setOptions((data ?? []).map((d: Record<string, unknown>) => ({
              value: String(d.state_value),
              label: String(d.display_label),
            })));
          }
        } else if (isStatusReason) {
          const { data } = await supabase
            .from('status_reason_definition')
            .select('reason_value, display_label, statecode_id, statecode:statecode_definition!statecode_id(display_label)')
            .eq('entity_definition_id', entityDefId)
            .eq('is_active', true)
            .order('sort_order');
          if (!cancelled) {
            setOptions((data ?? []).map((d: Record<string, unknown>) => {
              const sc = d.statecode as Record<string, unknown> | null;
              const groupLabel = sc?.display_label ? ` (${sc.display_label})` : '';
              return {
                value: String(d.reason_value),
                label: `${d.display_label}${groupLabel}`,
              };
            }));
          }
        }
      } catch { /* fallback to empty */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [entityDefId, isStatecode, isStatusReason]);

  // Report the readable label for the current value up to the condition summary.
  useEffect(() => {
    if (!value) return;
    const match = options.find((o) => o.value === value);
    if (match) onResolved?.(value, match.label);
  }, [value, options]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputCls = hideLabel
    ? "w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
    : "w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400";

  if (loading) {
    return (
      <div>
        {!hideLabel && <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Value</label>}
        <div className="flex items-center gap-2 px-2.5 py-2 border border-gray-200 rounded-lg text-xs text-gray-400">
          <Loader2 size={11} className="animate-spin" /> Loading options...
        </div>
      </div>
    );
  }

  return (
    <div>
      {!hideLabel && <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Value</label>}
      <FilterSelect value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">-- Select --</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </FilterSelect>
    </div>
  );
}

function ConditionLookupValueInput({
  field,
  value,
  onChange,
  hideLabel = false,
  onResolved,
}: {
  field: FieldDefinition;
  value: string;
  onChange: (v: string) => void;
  hideLabel?: boolean;
  onResolved?: (value: string, label: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayLabel, setDisplayLabel] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const lookupEntityId = field.lookup_entity_id;

  // Cache entity meta to avoid refetching on every search
  const entityMetaRef = useRef<{ table: string; pk: string; nameCol: string } | null>(null);

  const resolveEntityMeta = useCallback(async () => {
    if (entityMetaRef.current) return entityMetaRef.current;
    if (!lookupEntityId) return null;
    const { data: eDef } = await supabase
      .from('entity_definition')
      .select('physical_table_name, primary_field_name')
      .eq('entity_definition_id', lookupEntityId)
      .maybeSingle();
    if (!eDef) return null;
    const meta = {
      table: eDef.physical_table_name,
      pk: `${eDef.physical_table_name.replace(/s$/, '')}_id`,
      nameCol: eDef.primary_field_name,
    };
    entityMetaRef.current = meta;
    return meta;
  }, [lookupEntityId]);

  // Resolve display label for the current value
  useEffect(() => {
    if (!value || !lookupEntityId) { setDisplayLabel(''); return; }
    let cancelled = false;
    resolveEntityMeta().then(async (meta) => {
      if (!meta || cancelled) return;
      const { data: row } = await supabase
        .from(meta.table)
        .select(meta.nameCol)
        .eq(meta.pk, value)
        .maybeSingle();
      if (!cancelled && row) {
        const label = String(row[meta.nameCol] ?? '');
        setDisplayLabel(label);
        onResolved?.(value, label);
      }
    });
    return () => { cancelled = true; };
  }, [value, lookupEntityId, resolveEntityMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click-outside handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Block parent scroll when scrolling inside the result list
  useEffect(() => {
    const el = listRef.current;
    if (!el || !open) return;
    const handler = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const atTop = scrollTop === 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) e.preventDefault();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [open, results]);

  const doSearch = useCallback(async (q: string) => {
    setLoading(true);
    const meta = await resolveEntityMeta();
    if (!meta) { setLoading(false); return; }
    let query = supabase
      .from(meta.table)
      .select(`${meta.pk}, ${meta.nameCol}`)
      .order(meta.nameCol)
      .limit(15);
    if (q.trim()) query = query.ilike(meta.nameCol, `%${q}%`);
    const { data } = await query;
    setResults(((data ?? []) as unknown as Record<string, unknown>[]).map((r: Record<string, unknown>) => ({
      id: String(r[meta.pk] ?? ''),
      label: String(r[meta.nameCol] ?? ''),
    })));
    setLoading(false);
  }, [resolveEntityMeta]);

  const handleOpen = () => {
    setOpen(true);
    doSearch('');
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const handleSelect = (id: string, label: string) => {
    onChange(id);
    setDisplayLabel(label);
    onResolved?.(id, label);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setDisplayLabel('');
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={wrapRef} className="relative">
      {!hideLabel && <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Value</label>}

      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        className={`w-full flex items-center gap-2 border border-gray-200 rounded-lg text-left bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-colors ${
          hideLabel ? 'px-2 py-1.5 text-xs' : 'px-2.5 py-2 text-sm'
        }`}
      >
        <Search size={12} className="text-gray-400 shrink-0" />
        {value ? (
          <span className="flex-1 truncate text-gray-800">{displayLabel || value}</span>
        ) : (
          <span className="flex-1 text-gray-400 truncate">{hideLabel ? 'Search…' : 'Click to search records...'}</span>
        )}
        {value && (
          <span onClick={handleClear} className="shrink-0 p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={11} />
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-xl flex flex-col" style={{ maxHeight: 240 }}>
          {/* Sticky search header */}
          <div className="px-2.5 py-2 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                autoFocus
                value={search}
                onChange={(e) => { setSearch(e.target.value); doSearch(e.target.value); }}
                placeholder="Search records..."
                className="w-full pl-7 pr-2.5 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 focus:bg-white transition-colors placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Scrollable results */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto overscroll-contain"
            style={{ maxHeight: 180 }}
          >
            {loading && (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-gray-400">
                <Loader2 size={12} className="animate-spin" /> Searching...
              </div>
            )}
            {!loading && results.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-400 text-center">No records found</p>
            )}
            {!loading && results.map((r) => {
              const selected = r.id === value;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelect(r.id, r.label)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors border-b border-gray-50 last:border-b-0 ${
                    selected
                      ? 'bg-amber-50 text-amber-800 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="block truncate">{r.label || '(No name)'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProcessFlowEditorPage({ flow: initialFlow, onBack, onFlowUpdate }: ProcessFlowEditorPageProps) {
  const { showSuccess, showError } = useToast();
  const [flow, setFlow] = useState<ProcessFlow>(initialFlow);
  const [stages, setStages] = useState<ProcessStage[]>([]);
  const [transitions, setTransitions] = useState<ProcessFlowTransition[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('designer');
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const draggingType = useRef<ComponentType | null>(null);
  const [dropTarget, setDropTarget] = useState<'canvas' | null>(null);
  const [branchPickerState, setBranchPickerState] = useState<{ stageId: string; conditionId: string } | null>(null);
  const [addBranchState, setAddBranchState] = useState<{ conditionId: string; branch: 'yes' | 'no' } | null>(null);

  const loadFlow = useCallback(async () => {
    setLoading(true);
    try {
      const [full, entityData] = await Promise.all([
        fetchProcessFlowWithDetails(initialFlow.process_flow_id),
        fetchEntities(),
      ]);
      setFlow(full);
      setStages(full.stages ?? []);
      setTransitions(full.transitions ?? []);
      setEntities(entityData);
      onFlowUpdate(full);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [initialFlow.process_flow_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadFlow(); }, [loadFlow]);

  const entity = entities.find((e) => e.entity_definition_id === flow.entity_definition_id);

  const markDirty = () => setIsDirty(true);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleSavePublish = async () => {
    setPublishing(true);
    try {
      const [stageFieldMap, entityConfigsRaw] = await Promise.all([
        fetchStageFieldsForFlow(flow.process_flow_id),
        fetchEntityConfigs(flow.process_flow_id),
      ]);
      const allStageFields = Object.values(stageFieldMap).flat();
      const snapshot: ProcessFlowDraft = {
        version: 1,
        flow: {
          name: flow.name,
          description: flow.description ?? '',
          entity_definition_id: flow.entity_definition_id,
          lob_id: flow.lob_id ?? null,
          product_id: flow.product_id ?? null,
          form_id: flow.form_id ?? null,
          stage_field: flow.stage_field ?? '',
          is_active: flow.is_active ?? true,
          default_stage_id: flow.default_stage_id ?? null,
        },
        stages,
        transitions,
        stageFields: allStageFields,
        entityConfigs: entityConfigsRaw.map((c) => ({
          config_id: c.config_id,
          entity_definition_id: c.entity_definition_id,
          is_primary: c.is_primary,
          form_id: c.form_id,
          relationship_definition_id: c.relationship_definition_id,
          relationship_column: c.relationship_column,
          link_behavior: c.link_behavior,
          display_order: c.display_order,
        })),
      };
      await publishProcessFlowDraft(flow.process_flow_id, snapshot);
      setIsDirty(false);
      showSuccess('Published successfully');
      await loadFlow();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  // Next display_order = after the current maximum (robust to gaps from deletes/reorders,
  // so a newly-added stage always sorts last and lands in the right column).
  const nextDisplayOrder = () => (stages.length ? Math.max(...stages.map((s) => s.display_order)) + 1 : 0);

  // A "trunk condition" is a condition that sits on the main line (it is NOT nested inside
  // another condition's Yes/No branch). Once the trunk ends in one, the flow only continues
  // through that condition's branches — there is no slot to append a stage AFTER it. New
  // trunk stages must therefore be inserted BEFORE it (Stage → New Stage → Condition).
  // Fully generic: derived purely from branch links, never from entity/stage names.
  const findTrunkCondition = (): ProcessStage | null => {
    const branchTargets = new Set<string>();
    for (const s of stages) {
      if (s.branch_yes_stage_id) branchTargets.add(s.branch_yes_stage_id);
      if (s.branch_no_stage_id) branchTargets.add(s.branch_no_stage_id);
    }
    return stages
      .filter((s) =>
        s.stage_type === 'active' &&
        s.component_type === 'condition' &&
        !branchTargets.has(s.process_stage_id))
      .sort((a, b) => a.display_order - b.display_order)[0] ?? null;
  };

  // Create a new component (stage OR condition) and slot it immediately BEFORE `beforeStageId`
  // — anywhere in the flow: the main line OR inside any Yes/No branch. The target and every
  // node ordered at/after it shift up by one, so column ordering is preserved and the new node
  // takes the freed slot. Connections are re-wired so nothing orphans:
  //   • Incoming — whoever pointed at `before` through a Yes/No branch slot now points at the
  //     new node instead (on the trunk there is no pointer; display-order adjacency reconnects).
  //   • Outgoing — the new node connects to `before`. A CONDITION always adopts `before` as its
  //     YES branch (… → Condition --YES--> before …, empty NO). A STAGE only needs an explicit
  //     link when it landed inside a branch; on the trunk, order adjacency already connects it.
  // Fully generic — derived from branch links, never from entity/stage names.
  const insertComponentBefore = async (beforeStageId: string, componentType: ComponentType) => {
    const before = stages.find((s) => s.process_stage_id === beforeStageId);
    if (!before) return;
    const insertOrder = before.display_order;

    // Who currently points at `before` through a branch slot (its incoming link, if any)?
    let predId: string | null = null;
    let predSlot: 'yes' | 'no' | null = null;
    for (const s of stages) {
      if (s.branch_yes_stage_id === beforeStageId) { predId = s.process_stage_id; predSlot = 'yes'; break; }
      if (s.branch_no_stage_id === beforeStageId) { predId = s.process_stage_id; predSlot = 'no'; break; }
    }
    const beforeIsBranchTarget = predId !== null;

    try {
      let created = await createProcessStage(flow.process_flow_id, buildStagePayload(componentType, insertOrder));
      const newId = created.process_stage_id;

      // Outgoing: keep `before` attached to the new node.
      if (componentType === 'condition' || beforeIsBranchTarget) {
        created = await updateProcessStage(newId, { branch_yes_stage_id: beforeStageId });
      }
      // Incoming: redirect the predecessor's branch slot from `before` to the new node.
      let predUpdated: ProcessStage | null = null;
      if (predId && predSlot) {
        predUpdated = await updateProcessStage(predId, predSlot === 'yes'
          ? { branch_yes_stage_id: newId }
          : { branch_no_stage_id: newId });
      }

      const next = [...stages, created].map((s) => {
        if (s.process_stage_id === newId) return created;
        const base = predUpdated && s.process_stage_id === predId ? predUpdated : s;
        return base.display_order >= insertOrder ? { ...base, display_order: base.display_order + 1 } : base;
      });
      setStages(next);
      setSelectedStageId(newId);
      setDropTarget(null);
      markDirty();
      await reorderProcessStages(next.map((s) => ({ process_stage_id: s.process_stage_id, display_order: s.display_order })));
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to insert component');
    }
  };

  const handleDropOnCanvas = async (componentType: ComponentType) => {
    // Adding a stage while the trunk already ends in a branch point (condition): the stage
    // belongs in front of that condition, not after it. Both the "+" button and a palette
    // drag funnel through here, so this one guard fixes every entry point. Conditions keep
    // appending normally (a new branch point at the end of the line).
    if (componentType === 'stage') {
      const trunkCondition = findTrunkCondition();
      if (trunkCondition) {
        await insertComponentBefore(trunkCondition.process_stage_id, 'stage');
        return;
      }
    }
    const order = nextDisplayOrder();
    const def = getComponentDef(componentType);
    const isFirstStage = stages.filter((s) => s.stage_type === 'active').length === 0 && componentType === 'stage';
    // Give new stages a unique numbered name instead of the generic label
    const sameTypeCount = stages.filter((s) => s.component_type === componentType && s.stage_type === 'active').length + 1;
    const defaultName = componentType === 'stage' ? `Stage ${sameTypeCount}` : def.label;
    const payload: ProcessStageFormData = {
      name: defaultName,
      description: '',
      stage_key: `${componentType}_${Date.now()}`,
      display_order: order,
      stage_color: componentType === 'condition' ? '#f59e0b' : '#3b82f6',
      stage_type: 'active',
      stage_category: 'general',
      is_default: isFirstStage,
      is_fixed: isFirstStage,
      probability: null,
      allow_backward_movement: true,
      requires_entry_approval: false,
      requires_exit_approval: false,
      entry_rules: [],
      exit_rules: [],
      target_entity_id: null,
      stage_entity_id: null,
      target_relationship_name: '',
      create_linked_record: false,
      relationship_definition_id: null,
      component_type: componentType,
      branch_yes_stage_id: null,
      branch_no_stage_id: null,
      condition_field: null,
      condition_operator: null,
      condition_value: null,
    };
    try {
      const created = await createProcessStage(flow.process_flow_id, payload);
      setStages((prev) => [...prev, created]);
      setSelectedStageId(created.process_stage_id);
      setDropTarget(null);
      markDirty();

      // After dropping any component (stage OR condition — conditions can nest inside a
      // branch), if a condition has an empty Yes/No slot, prompt which branch it belongs to.
      // Prefer the condition the user currently has selected so the drop lands in that one.
      const hasOpenSlot = (s: ProcessStage) =>
        s.component_type === 'condition' && s.stage_type === 'active' &&
        (!s.branch_yes_stage_id || !s.branch_no_stage_id);
      const selected = stages.find((s) => s.process_stage_id === selectedStageId);
      const conditionWithSlot =
        selected && hasOpenSlot(selected) ? selected : stages.find(hasOpenSlot);
      if (conditionWithSlot && conditionWithSlot.process_stage_id !== created.process_stage_id) {
        setBranchPickerState({ stageId: created.process_stage_id, conditionId: conditionWithSlot.process_stage_id });
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to add component');
    }
  };

  const handleBranchAssign = async (branch: 'yes' | 'no') => {
    if (!branchPickerState) return;
    const { stageId, conditionId } = branchPickerState;
    const updates = branch === 'yes'
      ? { branch_yes_stage_id: stageId }
      : { branch_no_stage_id: stageId };
    try {
      const updated = await updateProcessStage(conditionId, updates);
      setStages((prev) => prev.map((s) => s.process_stage_id === conditionId ? updated : s));
      markDirty();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to assign branch');
    }
    setBranchPickerState(null);
  };

  // Build a fresh stage/condition payload (mirrors the canvas-drop defaults).
  const buildStagePayload = (componentType: ComponentType, order: number): ProcessStageFormData => {
    const def = getComponentDef(componentType);
    const sameTypeCount = stages.filter((s) => s.component_type === componentType && s.stage_type === 'active').length + 1;
    return {
      name: componentType === 'stage' ? `Stage ${sameTypeCount}` : def.label,
      description: '',
      stage_key: `${componentType}_${Date.now()}`,
      display_order: order,
      stage_color: componentType === 'condition' ? '#f59e0b' : '#3b82f6',
      stage_type: 'active',
      stage_category: 'general',
      is_default: false,
      is_fixed: false,
      probability: null,
      allow_backward_movement: true,
      requires_entry_approval: false,
      requires_exit_approval: false,
      entry_rules: [],
      exit_rules: [],
      target_entity_id: null,
      stage_entity_id: null,
      target_relationship_name: '',
      create_linked_record: false,
      relationship_definition_id: null,
      component_type: componentType,
      branch_yes_stage_id: null,
      branch_no_stage_id: null,
      condition_field: null,
      condition_operator: null,
      condition_value: null,
    };
  };

  // Disconnect a condition's Yes/No branch so it becomes empty and droppable again
  // (lets each condition have its own independent branches instead of a shared link).
  const handleClearBranch = async (conditionId: string, branch: 'yes' | 'no') => {
    const updates = branch === 'yes' ? { branch_yes_stage_id: null } : { branch_no_stage_id: null };
    try {
      const updated = await updateProcessStage(conditionId, updates);
      setStages((prev) => prev.map((s) => s.process_stage_id === conditionId ? updated : s));
      markDirty();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to disconnect branch');
    }
  };

  // Explicitly add a new Stage/Condition into a condition's Yes or No branch (supports nesting).
  const handleAddToBranch = async (conditionId: string, branch: 'yes' | 'no', componentType: ComponentType) => {
    try {
      const created = await createProcessStage(flow.process_flow_id, buildStagePayload(componentType, nextDisplayOrder()));
      const updates = branch === 'yes'
        ? { branch_yes_stage_id: created.process_stage_id }
        : { branch_no_stage_id: created.process_stage_id };
      const updatedCond = await updateProcessStage(conditionId, updates);
      setStages((prev) => [
        ...prev.map((s) => s.process_stage_id === conditionId ? updatedCond : s),
        created,
      ]);
      setSelectedStageId(created.process_stage_id);
      markDirty();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to add to branch');
    }
    setAddBranchState(null);
  };

  const handleDeleteStage = async (stageId: string) => {
    const stage = stages.find((s) => s.process_stage_id === stageId);
    if (stage?.is_fixed) {
      showError('The first stage is fixed and cannot be deleted while the process exists.');
      return;
    }
    try {
      // If this stage is the flow's default_stage_id, clear that FK first to avoid a constraint violation
      if (flow.default_stage_id === stageId) {
        await setDefaultStage(flow.process_flow_id, null);
        setFlow((prev) => ({ ...prev, default_stage_id: null }));
      }
      await deleteProcessStage(stageId);
      setStages((prev) => prev.filter((s) => s.process_stage_id !== stageId));
      if (selectedStageId === stageId) setSelectedStageId(null);
      setTransitions((prev) => prev.filter((t) => t.from_stage_id !== stageId && t.to_stage_id !== stageId));
      markDirty();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const handleUpdateStage = async (stageId: string, updates: Partial<ProcessStageFormData>) => {
    try {
      const updated = await updateProcessStage(stageId, updates);
      setStages((prev) => prev.map((s) => s.process_stage_id === stageId ? updated : s));
      markDirty();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const handleRenameStage = async (stageId: string, name: string) => {
    setStages((prev) => prev.map((s) => s.process_stage_id === stageId ? { ...s, name } : s));
    markDirty();
    try {
      await updateProcessStage(stageId, { name });
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to rename');
    }
  };

  const handleSetDefault = async (stageId: string) => {
    try {
      await setDefaultStage(flow.process_flow_id, stageId);
      setFlow((prev) => ({ ...prev, default_stage_id: stageId }));
      setStages((prev) => prev.map((s) => ({ ...s, is_default: s.process_stage_id === stageId })));
      markDirty();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleMoveStage = async (id: string, dir: 'left' | 'right') => {
    const activeStages = stages
      .filter((s) => s.stage_type === 'active')
      .sort((a, b) => a.display_order - b.display_order);
    const idx = activeStages.findIndex((s) => s.process_stage_id === id);
    const stage = activeStages[idx];

    // Cannot move fixed stage, cannot move to position 0 if would displace fixed stage
    if (stage?.is_fixed) return;
    const target = dir === 'left' ? idx - 1 : idx + 1;
    if (target < 0 || target >= activeStages.length) return;
    // Cannot swap with the fixed first stage
    if (activeStages[target]?.is_fixed) return;

    const reordered = [...activeStages];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    const withOrder = reordered.map((s, i) => ({ ...s, display_order: i }));
    // Merge back with terminal stages
    const terminalStages = stages.filter((s) => s.stage_type !== 'active');
    const terminalWithOrder = terminalStages.map((s, i) => ({ ...s, display_order: withOrder.length + i }));
    setStages([...withOrder, ...terminalWithOrder]);
    markDirty();
    try {
      await reorderProcessStages([...withOrder, ...terminalWithOrder].map((s) => ({
        process_stage_id: s.process_stage_id,
        display_order: s.display_order,
      })));
    } catch {
      await loadFlow();
    }
  };

  const handleSaveTransitions = async (t: ProcessFlowTransition[]) => {
    try {
      await replaceAllTransitions(flow.process_flow_id, t.map((x) => ({
        from_stage_id: x.from_stage_id,
        to_stage_id: x.to_stage_id,
        transition_name: x.transition_name,
        requires_fields: x.requires_fields,
        conditions: x.conditions ?? [],
        priority: x.priority ?? 100,
        is_default: x.is_default ?? false,
      })));
      setTransitions(t);
      markDirty();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const selectedStage = stages.find((s) => s.process_stage_id === selectedStageId) ?? null;

  // Compute the "effective context entity" for any stage:
  // Walk backwards through sorted active stages to find the last stage that explicitly set a target_entity_id.
  // If none, the primary entity is the context.
  const getStageContextEntityId = (stageId: string): string => {
    const sorted = [...stages]
      .filter((s) => s.stage_type === 'active')
      .sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((s) => s.process_stage_id === stageId);
    for (let i = idx - 1; i >= 0; i--) {
      if (sorted[i].target_entity_id) return sorted[i].target_entity_id!;
    }
    return flow.entity_definition_id;
  };

  const selectedStagePreviousContextEntityId = selectedStage
    ? getStageContextEntityId(selectedStage.process_stage_id)
    : flow.entity_definition_id;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'designer', label: 'Designer', icon: <GitMerge size={14} /> },
    { id: 'transitions', label: 'Transitions', icon: <ArrowRight size={14} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={14} /> },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { if (isDirty) { setConfirmLeave(true); } else { onBack(); } }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <GitMerge size={14} className="text-blue-600" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">{flow.name}</span>
            {entity && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{entity.display_name}</span>}
            {flow.is_system && (
              <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                <Lock size={10} /> System
              </span>
            )}
            <span className={`flex items-center gap-1 text-xs rounded px-1.5 py-0.5 border ${
              flow.is_active ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-gray-500 bg-gray-50 border-gray-200'
            }`}>
              {flow.is_active ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
              {flow.is_active ? 'Active' : 'Inactive'}
            </span>
            {isDirty && (
              <span className="flex items-center gap-1 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
                <AlertTriangle size={10} /> Unsaved changes
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleSavePublish}
            disabled={publishing || !isDirty}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              isDirty && !publishing
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
            }`}
          >
            {publishing ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {publishing ? 'Publishing…' : 'Save & Publish'}
          </button>
        </div>
      </div>

      {/* Leave confirmation */}
      {confirmLeave && (
        <ConfirmDialog
          title="Unsaved changes"
          message="You have unsaved changes. If you leave now, your changes will be lost. Are you sure you want to leave?"
          confirmLabel="Leave without saving"
          cancelLabel="Stay"
          onConfirm={() => { setConfirmLeave(false); onBack(); }}
          onCancel={() => setConfirmLeave(false)}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          {tab === 'designer' && (
            <>
              <div className="flex-1 flex flex-col min-w-0">
                <BpfCanvas
                  flow={flow}
                  stages={stages}
                  entities={entities}
                  selectedStageId={selectedStageId}
                  onSelect={setSelectedStageId}
                  onDelete={handleDeleteStage}
                  onSetDefault={handleSetDefault}
                  onMove={handleMoveStage}
                  onRename={handleRenameStage}
                  onDropType={handleDropOnCanvas}
                  onInsertBefore={insertComponentBefore}
                  onAddToBranch={(conditionId, branch) => setAddBranchState({ conditionId, branch })}
                  onDropInBranch={handleAddToBranch}
                  onClearBranch={handleClearBranch}
                  dropTarget={dropTarget}
                  setDropTarget={setDropTarget}
                  draggingType={draggingType}
                />
              </div>

              <div className="w-[340px] shrink-0 border-l border-gray-200 bg-white flex flex-col min-h-0">
                {selectedStage ? (
                  <StagePropertiesPanel
                    key={selectedStage.process_stage_id}
                    stage={selectedStage}
                    stages={stages}
                    flow={flow}
                    entities={entities}
                    isDefault={selectedStage.process_stage_id === flow.default_stage_id}
                    inheritedEntityId={selectedStagePreviousContextEntityId}
                    onUpdate={(updates) => handleUpdateStage(selectedStage.process_stage_id, updates)}
                    onDelete={() => handleDeleteStage(selectedStage.process_stage_id)}
                    onSetDefault={() => handleSetDefault(selectedStage.process_stage_id)}
                    onClose={() => setSelectedStageId(null)}
                  />
                ) : (
                  <ComponentPalette draggingType={draggingType} />
                )}
              </div>
            </>
          )}

          {tab === 'transitions' && (
            <div className="flex-1 overflow-auto">
              <TransitionMatrixPanel
                stages={stages}
                transitions={transitions}
                onSave={handleSaveTransitions}
                isSystem={flow.is_system}
              />
            </div>
          )}

          {tab === 'settings' && (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <SettingsPanel
                flow={flow}
                entities={entities}
                stageCount={stages.length}
                saving={saving}
                setSaving={setSaving}
                onFlowChange={(f) => { setFlow(f); onFlowUpdate(f); }}
                showSuccess={showSuccess}
                showError={showError}
              />
            </div>
          )}
        </div>
      )}

      {/* Branch picker modal */}
      {branchPickerState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[340px] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-800">Assign to Branch</p>
              <p className="text-xs text-gray-500 mt-0.5">Which path should this stage belong to?</p>
            </div>
            <div className="p-4 space-y-2.5">
              <button
                onClick={() => handleBranchAssign('yes')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400 transition-all text-left"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <Check size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-800">YES Branch</p>
                  <p className="text-[10px] text-emerald-600">Upper path — condition is true</p>
                </div>
              </button>
              <button
                onClick={() => handleBranchAssign('no')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-400 transition-all text-left"
              >
                <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                  <X size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-red-800">NO Branch</p>
                  <p className="text-[10px] text-red-600">Lower path — condition is false</p>
                </div>
              </button>
              <button
                onClick={() => setBranchPickerState(null)}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-700 py-2 transition-colors"
              >
                Skip — assign later in properties
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-to-branch chooser: pick what the Yes/No branch leads to (a stage, or a nested condition) */}
      {addBranchState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[340px] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-800">
                Add to <span className={addBranchState.branch === 'yes' ? 'text-emerald-600' : 'text-red-600'}>{addBranchState.branch === 'yes' ? 'Yes' : 'No'}</span> branch
              </p>
              <p className="text-xs text-gray-500 mt-0.5">What should this branch lead to?</p>
            </div>
            <div className="p-4 space-y-2.5">
              <button
                onClick={() => handleAddToBranch(addBranchState.conditionId, addBranchState.branch, 'stage')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-all text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-white border border-blue-200 flex items-center justify-center shrink-0 text-blue-600">
                  <Layers size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-blue-800">Stage</p>
                  <p className="text-[10px] text-blue-600">A progress stage with fields</p>
                </div>
              </button>
              <button
                onClick={() => handleAddToBranch(addBranchState.conditionId, addBranchState.branch, 'condition')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 transition-all text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-white border border-amber-200 flex items-center justify-center shrink-0 text-amber-600">
                  <GitBranch size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-800">Condition</p>
                  <p className="text-[10px] text-amber-600">A nested Yes/No branch</p>
                </div>
              </button>
              <button
                onClick={() => setAddBranchState(null)}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-700 py-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── BPF Canvas ──────────────────────────────────────────────────────────────

interface BpfCanvasProps {
  flow: ProcessFlow;
  stages: ProcessStage[];
  entities: EntityDefinition[];
  selectedStageId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => Promise<void>;
  onMove: (id: string, dir: 'left' | 'right') => Promise<void>;
  onRename: (id: string, name: string) => void;
  onDropType: (type: ComponentType) => Promise<void>;
  onInsertBefore: (beforeStageId: string, componentType: ComponentType) => Promise<void>;
  onAddToBranch: (conditionId: string, branch: 'yes' | 'no') => void;
  onDropInBranch: (conditionId: string, branch: 'yes' | 'no', componentType: ComponentType) => void;
  onClearBranch: (conditionId: string, branch: 'yes' | 'no') => void;
  dropTarget: 'canvas' | null;
  setDropTarget: (v: 'canvas' | null) => void;
  draggingType: React.MutableRefObject<ComponentType | null>;
}

const ENTITY_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#ea580c', '#0d9488'];
const NODE_WIDTH = 184;
const NODE_HEIGHT = 96;
const H_GAP = 64;
const V_GAP = 40;
const SWIMLANE_HEADER = 36;
const BRANCH_OFFSET_Y = 160;

type ConnectorDef = { d: string; color: string; dashed?: boolean; label?: string; labelX?: number; labelY?: number; icon?: 'check' | 'x' };

function BpfCanvas({
  flow, stages, entities, selectedStageId, onSelect, onDelete, onSetDefault, onMove, onRename,
  onDropType, onInsertBefore, onAddToBranch, onDropInBranch, onClearBranch, dropTarget, setDropTarget, draggingType,
}: BpfCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [branchDrop, setBranchDrop] = useState<{ conditionId: string; branch: 'yes' | 'no' } | null>(null);
  // The id of the trunk node a dragged component would be inserted BEFORE (gap-drop hover).
  const [gapInsert, setGapInsert] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [showMinimap, setShowMinimap] = useState(true);
  const prevStageCount = useRef(stages.length);

  const activeStages = stages.filter((s) => s.stage_type === 'active').sort((a, b) => a.display_order - b.display_order);
  const terminalStages = stages.filter((s) => s.stage_type !== 'active').sort((a, b) => a.display_order - b.display_order);

  const entityColorMap = useRef(new Map<string, string>());
  const getEntityColor = (entityId: string) => {
    if (!entityColorMap.current.has(entityId)) {
      const idx = entityColorMap.current.size;
      entityColorMap.current.set(entityId, ENTITY_COLORS[idx % ENTITY_COLORS.length]);
    }
    return entityColorMap.current.get(entityId)!;
  };
  entityColorMap.current.set(flow.entity_definition_id, ENTITY_COLORS[0]);

  const stageEffectiveEntityId = new Map<string, string>();
  let currentEntityId = flow.entity_definition_id;
  for (const s of activeStages) {
    if (s.target_entity_id) currentEntityId = s.target_entity_id;
    stageEffectiveEntityId.set(s.process_stage_id, currentEntityId);
    getEntityColor(currentEntityId);
  }

  // ─── Branching layout (Dynamics 365 style) ──────────────────────────────────
  // Map each branch target to its owning condition (ignoring dangling pointers).
  const activeIds = new Set(activeStages.map((s) => s.process_stage_id));
  const yesOwner = new Map<string, string>();      // YES-target id -> condition id
  const noBranchOwner = new Map<string, string>(); // NO-target id  -> condition id
  for (const s of activeStages) {
    // branch_yes chains BOTH conditions (their YES branch) and stages (continue the
    // branch's line with another stage), so a branch can hold multiple stages in a row.
    if (s.branch_yes_stage_id && activeIds.has(s.branch_yes_stage_id)) yesOwner.set(s.branch_yes_stage_id, s.process_stage_id);
    if (s.component_type === 'condition' && s.branch_no_stage_id && activeIds.has(s.branch_no_stage_id)) noBranchOwner.set(s.branch_no_stage_id, s.process_stage_id);
  }
  const noBranchStageIds = new Set<string>(noBranchOwner.keys());

  const BASELINE_Y = SWIMLANE_HEADER + V_GAP;
  const START_X = 52;
  const COLUMN_WIDTH = NODE_WIDTH + H_GAP;
  const ROW_HEIGHT = BRANCH_OFFSET_Y;

  // Deterministic row by branch structure (NOT a running counter, so a branch can
  // never bleed into the main flow): a NO-target sits one row BELOW its condition,
  // a YES-target sits on the SAME row as its condition, everything else is row 0.
  const rowOf = new Map<string, number>();
  const resolveRow = (id: string, seen: Set<string>): number => {
    const cached = rowOf.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;
    seen.add(id);
    let r = 0;
    if (noBranchOwner.has(id)) r = resolveRow(noBranchOwner.get(id)!, seen) + 1;
    else if (yesOwner.has(id)) r = resolveRow(yesOwner.get(id)!, seen);
    rowOf.set(id, r);
    return r;
  };
  for (const s of activeStages) resolveRow(s.process_stage_id, new Set());
  const maxRow = Math.max(0, ...Array.from(rowOf.values()));
  const hasLowerLane = maxRow > 0;
  const LOWER_Y = BASELINE_Y + ROW_HEIGHT; // first NO row (kept for lane labels)

  // Columns: left-to-right by display order within each row; a NO branch indents
  // one column under its owning condition so it reads as a staircase.
  const sortedByOrder = [...activeStages].sort((a, b) => a.display_order - b.display_order);
  const colOf = new Map<string, number>();
  const nextColInRow = new Map<number, number>();
  for (const s of sortedByOrder) {
    const r = rowOf.get(s.process_stage_id) ?? 0;
    if (noBranchOwner.has(s.process_stage_id)) {
      const ownerCol = colOf.get(noBranchOwner.get(s.process_stage_id)!) ?? 0;
      if ((nextColInRow.get(r) ?? 0) <= ownerCol) nextColInRow.set(r, ownerCol + 1);
    }
    const c = nextColInRow.get(r) ?? 0;
    colOf.set(s.process_stage_id, c);
    nextColInRow.set(r, c + 1);
  }

  // Which branch a stage belongs to (green YES / red NO). A condition's YES target is
  // ALWAYS a green YES branch (regardless of where that condition itself sits); a NO
  // target is red; and a stage→stage continuation inherits the colour of the line it
  // continues — so each condition's YES line is green and NO line red.
  const conditionIdSet = new Set(activeStages.filter((s) => s.component_type === 'condition').map((s) => s.process_stage_id));
  const branchKind = new Map<string, 'yes' | 'no'>();
  const resolveKind = (id: string, seen: Set<string>): 'yes' | 'no' | undefined => {
    if (branchKind.has(id)) return branchKind.get(id);
    if (seen.has(id)) return undefined;
    seen.add(id);
    let k: 'yes' | 'no' | undefined;
    if (noBranchOwner.has(id)) k = 'no';
    else if (yesOwner.has(id)) {
      const owner = yesOwner.get(id)!;
      k = conditionIdSet.has(owner) ? 'yes' : resolveKind(owner, seen);
    }
    if (k) branchKind.set(id, k);
    return k;
  };
  for (const s of activeStages) resolveKind(s.process_stage_id, new Set());

  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const s of activeStages) {
    const r = rowOf.get(s.process_stage_id) ?? 0;
    const c = colOf.get(s.process_stage_id) ?? 0;
    nodePositions.set(s.process_stage_id, { x: START_X + c * COLUMN_WIDTH, y: BASELINE_Y + r * ROW_HEIGHT });
  }

  // Terminal stages placed below the deepest row.
  const terminalY = BASELINE_Y + (maxRow + 1) * ROW_HEIGHT + 24;
  let termX = START_X;
  for (const s of terminalStages) {
    nodePositions.set(s.process_stage_id, { x: termX, y: terminalY });
    termX += NODE_WIDTH + 24;
  }

  // A branch is "open" (droppable) when it's unset OR points to a stage that no
  // longer exists (a dangling pointer left over from a deleted stage).
  const branchOpen = (id: string | null | undefined) => !id || !nodePositions.has(id);

  const maxNodeX = Math.max(...Array.from(nodePositions.values()).map((p) => p.x), 0);
  const canvasWidth = Math.max(maxNodeX + NODE_WIDTH + 300, 800);
  const bottomRowY = BASELINE_Y + maxRow * ROW_HEIGHT;
  const canvasHeight = terminalStages.length > 0
    ? terminalY + NODE_HEIGHT + 120
    : bottomRowY + NODE_HEIGHT + 160;

  // ─── Swimlane groups ───────────────────────────────────────────────────────
  type EntityGroup = { entityId: string; stages: ProcessStage[] };
  const groups: EntityGroup[] = [];
  for (const s of activeStages) {
    const eid = stageEffectiveEntityId.get(s.process_stage_id) ?? flow.entity_definition_id;
    if (groups.length === 0 || groups[groups.length - 1].entityId !== eid) {
      groups.push({ entityId: eid, stages: [s] });
    } else {
      groups[groups.length - 1].stages.push(s);
    }
  }

  // Wheel handler: Ctrl/Meta+wheel = zoom, Shift+wheel = horizontal scroll, plain wheel = vertical scroll
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      const cx = rect ? e.clientX - rect.left : 0;
      const cy = rect ? e.clientY - rect.top : 0;
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom((prevZoom) => {
        const newZoom = Math.max(0.3, Math.min(2.5, prevZoom + delta));
        const scale = newZoom / prevZoom;
        setPan((p) => ({
          x: cx - (cx - p.x) * scale,
          y: cy - (cy - p.y) * scale,
        }));
        return newZoom;
      });
    } else if (e.shiftKey) {
      e.preventDefault();
      setPan((p) => ({ x: p.x - e.deltaY, y: p.y }));
    } else {
      e.preventDefault();
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle-click, alt+click, or left-click on empty canvas background
    const isMiddle = e.button === 1;
    const isAltLeft = e.button === 0 && e.altKey;
    const isCanvasBg = e.button === 0 && !e.altKey && (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.canvasBg === 'true');
    if (isMiddle || isAltLeft || isCanvasBg) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  };

  const handleMouseUp = () => setIsPanning(false);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const zoomIn = () => setZoom((z) => Math.min(2.5, z + 0.15));
  const zoomOut = () => setZoom((z) => Math.max(0.3, z - 0.15));

  const fitToScreen = () => {
    const container = containerRef.current;
    if (!container || (activeStages.length === 0 && terminalStages.length === 0)) {
      resetView();
      return;
    }
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const padding = 60;
    const fitZoomX = (cw - padding * 2) / canvasWidth;
    const fitZoomY = (ch - padding * 2) / canvasHeight;
    const fitZoom = Math.max(0.3, Math.min(1, Math.min(fitZoomX, fitZoomY)));
    const offsetX = (cw - canvasWidth * fitZoom) / 2;
    const offsetY = (ch - canvasHeight * fitZoom) / 2;
    setZoom(fitZoom);
    setPan({ x: offsetX, y: offsetY });
  };

  // Auto-scroll to the last (newest) stage when a stage is added
  useEffect(() => {
    if (stages.length > prevStageCount.current && activeStages.length > 0) {
      const lastStage = activeStages[activeStages.length - 1];
      const lastPos = nodePositions.get(lastStage.process_stage_id);
      const container = containerRef.current;
      if (lastPos && container) {
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const targetX = -(lastPos.x * zoom) + cw / 2 - (NODE_WIDTH * zoom) / 2;
        const targetY = -(lastPos.y * zoom) + ch / 2 - (NODE_HEIGHT * zoom) / 2;
        setPan({ x: Math.min(0, targetX), y: Math.min(20, targetY) });
      }
    }
    prevStageCount.current = stages.length;
  }, [stages.length]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // If the release happened while hovering a Yes/No branch drop zone, route the
    // new component INTO that branch (nested) instead of the main horizontal flow.
    const bd = branchDrop;
    setDropTarget(null);
    setBranchDrop(null);
    const type = draggingType.current;
    draggingType.current = null;
    if (!type) return;
    if (bd) onDropInBranch(bd.conditionId, bd.branch, type);
    else onDropType(type);
  };

  // ─── Build SVG connector paths (Dynamics 365 style branching) ──────────────
  const buildConnectors = () => {
    const paths: ConnectorDef[] = [];
    const conditionIds = new Set(activeStages.filter((s) => s.component_type === 'condition').map((s) => s.process_stage_id));

    // Sequential connectors WITHIN each row, ordered by column. Skip conditions
    // (they draw their own YES connector) and skip links INTO a NO-target (its NO
    // branch connector draws that drop-down).
    const byRow = new Map<number, ProcessStage[]>();
    for (const s of activeStages) {
      const r = rowOf.get(s.process_stage_id) ?? 0;
      if (!byRow.has(r)) byRow.set(r, []);
      byRow.get(r)!.push(s);
    }
    for (const rowStages of byRow.values()) {
      const ordered = [...rowStages].sort((a, b) => (colOf.get(a.process_stage_id) ?? 0) - (colOf.get(b.process_stage_id) ?? 0));
      for (let i = 0; i < ordered.length - 1; i++) {
        const curr = ordered[i];
        const next = ordered[i + 1];
        if (conditionIds.has(curr.process_stage_id)) continue;            // condition draws its own YES
        if (noBranchStageIds.has(next.process_stage_id)) continue;        // NO-target drawn by its NO connector
        const currPos = nodePositions.get(curr.process_stage_id);
        const nextPos = nodePositions.get(next.process_stage_id);
        if (!currPos || !nextPos) continue;
        const startX = currPos.x + NODE_WIDTH;
        const startY = currPos.y + NODE_HEIGHT / 2;
        const endX = nextPos.x;
        const endY = nextPos.y + NODE_HEIGHT / 2;
        const midX = (startX + endX) / 2;
        const d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
        const eId = stageEffectiveEntityId.get(curr.process_stage_id) ?? flow.entity_definition_id;
        paths.push({ d, color: getEntityColor(eId) });
      }
    }

    // Condition branch connectors (condition is now full-size card)
    for (const s of activeStages) {
      if (s.component_type !== 'condition') continue;
      const pos = nodePositions.get(s.process_stage_id);
      if (!pos) continue;

      const centerX = pos.x + NODE_WIDTH / 2;
      const centerY = pos.y + NODE_HEIGHT / 2;
      const rightX = pos.x + NODE_WIDTH;
      const bottomY = pos.y + NODE_HEIGHT;

      // YES branch: exits from the RIGHT-CENTER of card → goes horizontally to target
      const yesTargetId = branchOpen(s.branch_yes_stage_id) ? null : s.branch_yes_stage_id;
      if (yesTargetId) {
        const targetPos = nodePositions.get(yesTargetId);
        if (targetPos) {
          const endX = targetPos.x;
          const endY = targetPos.y + NODE_HEIGHT / 2;
          const midX = (rightX + endX) / 2;
          const d = `M ${rightX} ${centerY} C ${midX} ${centerY}, ${midX} ${endY}, ${endX} ${endY}`;
          paths.push({ d, color: '#059669', icon: 'check', labelX: rightX + 12, labelY: centerY - 14 });
        }
      } else {
        // Dashed stub to the right
        const d = `M ${rightX} ${centerY} L ${rightX + 40} ${centerY}`;
        paths.push({ d, color: '#059669', dashed: true, label: 'YES', labelX: rightX + 10, labelY: centerY - 10 });
      }

      // NO branch: exits from the BOTTOM-CENTER of card → goes DOWN then RIGHT (L-shaped path)
      const noTargetId = branchOpen(s.branch_no_stage_id) ? null : s.branch_no_stage_id;
      if (noTargetId) {
        const targetPos = nodePositions.get(noTargetId);
        if (targetPos) {
          const endX = targetPos.x;
          const endY = targetPos.y + NODE_HEIGHT / 2;
          const turnY = endY;
          const d = `M ${centerX} ${bottomY} L ${centerX} ${turnY} L ${endX} ${turnY}`;
          paths.push({ d, color: '#dc2626', icon: 'x', labelX: centerX + 8, labelY: bottomY + 18 });
        }
      } else {
        // Dashed stub downward
        const d = `M ${centerX} ${bottomY} L ${centerX} ${bottomY + 40}`;
        paths.push({ d, color: '#dc2626', dashed: true, label: 'NO', labelX: centerX + 6, labelY: bottomY + 24 });
      }
    }

    return paths;
  };

  const connectors = buildConnectors();

  // Build swimlane background rects
  const buildSwimlaneBgs = () => {
    const lanes: { x: number; width: number; height: number; entityId: string; entityName: string; color: string }[] = [];
    for (const group of groups) {
      const firstPos = nodePositions.get(group.stages[0].process_stage_id);
      const lastStage = group.stages[group.stages.length - 1];
      const lastPos = nodePositions.get(lastStage.process_stage_id);
      if (!firstPos || !lastPos) continue;
      const lastW = NODE_WIDTH;
      const x = firstPos.x - 16;
      const width = (lastPos.x + lastW + 16) - x;
      const groupMaxRow = Math.max(0, ...group.stages.map((s) => rowOf.get(s.process_stage_id) ?? 0));
      const height = BASELINE_Y + groupMaxRow * ROW_HEIGHT + NODE_HEIGHT + 20;
      const entityName = entities.find((e) => e.entity_definition_id === group.entityId)?.display_name ?? 'Entity';
      lanes.push({ x, width, height, entityId: group.entityId, entityName, color: getEntityColor(group.entityId) });
    }
    return lanes;
  };
  const swimlanes = buildSwimlaneBgs();

  // The main (non-branch) flow runs along row 0. Its FINAL stage is the rightmost
  // row-0 stage that isn't a branch target — that's where the single persistent "+"
  // sits, on the connector line just past the card. Conditions branch via their own
  // Yes/No controls, so a condition tail gets no "+".
  const mainFlowStages = activeStages.filter(
    (s) => (rowOf.get(s.process_stage_id) ?? 0) === 0 && !branchKind.has(s.process_stage_id)
  );
  const mainTail = mainFlowStages.length
    ? mainFlowStages.reduce((a, b) => ((colOf.get(b.process_stage_id) ?? 0) > (colOf.get(a.process_stage_id) ?? 0) ? b : a))
    : null;
  const mainAddTail = mainTail && mainTail.component_type !== 'condition' ? mainTail : null;

  // Insertion gaps: one "+" sits on EVERY drawn connector — the main line AND inside any Yes/No
  // branch — so a stage or condition can be dropped/clicked in at any position. Each gap inserts
  // BEFORE the node its connector enters. The predecessor map mirrors how connectors are drawn
  // (buildConnectors), so the "+" lands exactly on a visible line and never jumps over a branch
  // node that shares a row. Generic — derived from layout adjacency, never from names.
  const insertPredecessor = new Map<string, { id: string; slot: 'yes' | 'no' | 'order' }>();
  // Sequential connectors: per row, left→right by column, skipping a condition source (it draws
  // its own YES) and a NO-target dest (drawn by its NO connector) — same skips as buildConnectors.
  const rowBuckets = new Map<number, ProcessStage[]>();
  for (const s of activeStages) {
    const r = rowOf.get(s.process_stage_id) ?? 0;
    if (!rowBuckets.has(r)) rowBuckets.set(r, []);
    rowBuckets.get(r)!.push(s);
  }
  for (const rowStages of rowBuckets.values()) {
    const ordered = [...rowStages].sort((a, b) => (colOf.get(a.process_stage_id) ?? 0) - (colOf.get(b.process_stage_id) ?? 0));
    for (let i = 0; i < ordered.length - 1; i++) {
      const curr = ordered[i];
      const next = ordered[i + 1];
      if (curr.component_type === 'condition') continue;
      if (noBranchStageIds.has(next.process_stage_id)) continue;
      insertPredecessor.set(next.process_stage_id, { id: curr.process_stage_id, slot: 'order' });
    }
  }
  // Branch entries: a condition's YES/NO target enters from that condition.
  for (const s of activeStages) {
    if (s.component_type !== 'condition') continue;
    if (s.branch_yes_stage_id && !branchOpen(s.branch_yes_stage_id)) insertPredecessor.set(s.branch_yes_stage_id, { id: s.process_stage_id, slot: 'yes' });
    if (s.branch_no_stage_id && !branchOpen(s.branch_no_stage_id)) insertPredecessor.set(s.branch_no_stage_id, { id: s.process_stage_id, slot: 'no' });
  }
  const insertGaps: { beforeId: string; x: number; y: number }[] = [];
  for (const s of activeStages) {
    const pred = insertPredecessor.get(s.process_stage_id);
    if (!pred) continue; // first node on a line has no incoming connector
    const rPos = nodePositions.get(s.process_stage_id);
    const pPos = nodePositions.get(pred.id);
    if (!rPos || !pPos) continue;
    // NO branch drops vertically onto the node, so anchor its "+" just left of the node;
    // horizontal connectors (trunk / YES / stage-chain) get a midpoint "+".
    const x = pred.slot === 'no' ? rPos.x - 22 : (pPos.x + NODE_WIDTH + rPos.x) / 2;
    insertGaps.push({ beforeId: s.process_stage_id, x, y: rPos.y + NODE_HEIGHT / 2 });
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Canvas toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Process Canvas</span>
          <span className="text-xs text-gray-400">· {stages.length} component{stages.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={zoomOut} title="Zoom out" className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors text-sm font-bold">&minus;</button>
          <button onClick={resetView} title="Reset to 100%" className="px-2 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-[10px] font-semibold text-gray-500 hover:bg-gray-50 transition-colors min-w-[44px]">{Math.round(zoom * 100)}%</button>
          <button onClick={zoomIn} title="Zoom in" className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors text-sm font-bold">+</button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button onClick={fitToScreen} title="Fit to screen" className="h-7 px-2 flex items-center gap-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors text-[10px] font-semibold">
            <Layers size={10} /> Fit
          </button>
          <button onClick={() => setShowMinimap((v) => !v)} title="Toggle minimap" className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-colors ${showMinimap ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            <Globe size={11} />
          </button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <span className="text-[10px] text-gray-400 hidden lg:inline">Drag to pan · Scroll V · Shift+Scroll H · Ctrl+Scroll zoom</span>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden relative ${isPanning ? 'cursor-grabbing' : 'cursor-grab'} ${
          dropTarget === 'canvas' ? 'ring-2 ring-blue-400 ring-inset bg-blue-50/30' : 'bg-gray-50'
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDragOver={(e) => { e.preventDefault(); setDropTarget('canvas'); }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={handleDrop}
      >
        {/* Dot grid background — captures drag for panning */}
        <div
          data-canvas-bg="true"
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x % (24 * zoom)}px ${pan.y % (24 * zoom)}px`,
          }}
        />

        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: isPanning ? 'none' : 'transform 0.1s ease-out' }}
        >
          {activeStages.length === 0 && terminalStages.length === 0 ? (
            <div className="flex flex-col items-center justify-center w-[500px] h-[300px] mt-12 ml-12">
              <div className={`flex flex-col items-center justify-center py-16 px-20 rounded-2xl border-2 border-dashed transition-colors ${
                dropTarget === 'canvas' ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white/60'
              }`}>
                <GitMerge size={32} className="text-gray-300 mb-4" />
                <p className="text-sm font-medium text-gray-500">Drop components here to build your process</p>
                <p className="text-xs text-gray-400 mt-1.5">Start with a Stage, then add Conditions to branch your flow</p>
              </div>
            </div>
          ) : (
            <>
              {/* SVG Layer for connectors and swimlanes */}
              <svg
                width={canvasWidth}
                height={canvasHeight}
                className="absolute top-0 left-0 pointer-events-none"
                style={{ overflow: 'visible' }}
              >
                {/* Swimlane backgrounds */}
                {swimlanes.map((lane, i) => (
                  <g key={lane.entityId + i}>
                    <rect
                      x={lane.x}
                      y={0}
                      width={lane.width}
                      height={lane.height}
                      rx={12}
                      fill={`${lane.color}08`}
                      stroke={`${lane.color}20`}
                      strokeWidth={1.5}
                      strokeDasharray="6 3"
                    />
                    <rect
                      x={lane.x}
                      y={0}
                      width={lane.width}
                      height={SWIMLANE_HEADER}
                      rx={12}
                      fill={`${lane.color}10`}
                    />
                    <rect
                      x={lane.x}
                      y={SWIMLANE_HEADER - 4}
                      width={lane.width}
                      height={4}
                      fill={`${lane.color}10`}
                    />
                    <text
                      x={lane.x + 14}
                      y={22}
                      fontSize={10}
                      fontWeight={700}
                      fill={lane.color}
                      style={{ letterSpacing: '0.06em' }}
                    >
                      {lane.entityName.toUpperCase()}
                    </text>
                  </g>
                ))}

                {/* Branch lane labels */}
                {hasLowerLane && (
                  <>
                    <text x={16} y={BASELINE_Y + NODE_HEIGHT / 2 + 4} fontSize={9} fontWeight={600} fill="#059669" opacity={0.7} style={{ letterSpacing: '0.06em' }}>
                      YES
                    </text>
                    <text x={16} y={LOWER_Y + NODE_HEIGHT / 2 + 4} fontSize={9} fontWeight={600} fill="#dc2626" opacity={0.7} style={{ letterSpacing: '0.06em' }}>
                      NO
                    </text>
                  </>
                )}

                {/* Connectors */}
                {connectors.map((c, i) => (
                  <g key={i}>
                    <path
                      d={c.d}
                      fill="none"
                      stroke={c.color}
                      strokeWidth={2.5}
                      strokeDasharray={c.dashed ? '6 4' : undefined}
                      strokeLinecap="round"
                      opacity={0.7}
                    />
                    {/* Branch icon: green check circle */}
                    {c.icon === 'check' && c.labelX != null && c.labelY != null && (
                      <g>
                        <circle cx={c.labelX} cy={c.labelY} r={8} fill="#059669" />
                        <path d={`M ${c.labelX - 3} ${c.labelY} L ${c.labelX - 1} ${c.labelY + 2.5} L ${c.labelX + 3.5} ${c.labelY - 2.5}`} stroke="white" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    )}
                    {/* Branch icon: red X circle */}
                    {c.icon === 'x' && c.labelX != null && c.labelY != null && (
                      <g>
                        <circle cx={c.labelX} cy={c.labelY} r={8} fill="#dc2626" />
                        <path d={`M ${c.labelX - 2.5} ${c.labelY - 2.5} L ${c.labelX + 2.5} ${c.labelY + 2.5} M ${c.labelX + 2.5} ${c.labelY - 2.5} L ${c.labelX - 2.5} ${c.labelY + 2.5}`} stroke="white" strokeWidth={2} fill="none" strokeLinecap="round" />
                      </g>
                    )}
                    {/* Text label (for stubs without icon) */}
                    {c.label && !c.icon && c.labelX != null && c.labelY != null && (
                      <text x={c.labelX} y={c.labelY} fontSize={9} fontWeight={700} fill={c.color}>
                        {c.label}
                      </text>
                    )}
                  </g>
                ))}

                {/* Terminal label */}
                {terminalStages.length > 0 && (
                  <text
                    x={START_X}
                    y={terminalY - 16}
                    fontSize={10}
                    fontWeight={600}
                    fill="#9ca3af"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    TERMINAL OUTCOMES
                  </text>
                )}
              </svg>

              {/* HTML stage nodes */}
              {activeStages.map((stage) => {
                const pos = nodePositions.get(stage.process_stage_id);
                if (!pos) return null;
                const globalIdx = activeStages.indexOf(stage);
                const isFirst = globalIdx === 0;
                const isLast = globalIdx === activeStages.length - 1;
                const eId = stageEffectiveEntityId.get(stage.process_stage_id) ?? flow.entity_definition_id;
                const entColor = getEntityColor(eId);
                const entName = entities.find((e) => e.entity_definition_id === eId)?.display_name ?? '';
                return (
                  <div key={stage.process_stage_id} className="absolute" style={{ left: pos.x, top: pos.y }}>
                    <StageNode
                      stage={stage}
                      isSelected={selectedStageId === stage.process_stage_id}
                      isDefault={stage.process_stage_id === flow.default_stage_id}
                      isFirst={isFirst}
                      isLast={isLast}
                      entityColor={entColor}
                      entityName={entName}
                      branchLane={branchKind.get(stage.process_stage_id)}
                      canMoveLeft={!isFirst && !stage.is_fixed && !activeStages[globalIdx - 1]?.is_fixed}
                      canMoveRight={!isLast && !stage.is_fixed}
                      onSelect={() => onSelect(stage.process_stage_id)}
                      onDelete={() => onDelete(stage.process_stage_id)}
                      onSetDefault={() => onSetDefault(stage.process_stage_id)}
                      onMoveLeft={() => onMove(stage.process_stage_id, 'left')}
                      onMoveRight={() => onMove(stage.process_stage_id, 'right')}
                      onRename={(name) => onRename(stage.process_stage_id, name)}
                      onAddToBranch={(branch) => onAddToBranch(stage.process_stage_id, branch)}
                      onClearBranch={(branch) => onClearBranch(stage.process_stage_id, branch)}
                      yesOpen={branchOpen(stage.branch_yes_stage_id)}
                      noOpen={branchOpen(stage.branch_no_stage_id)}
                    />
                  </div>
                );
              })}

              {/* Branch drop zones — drop a Stage/Condition into an empty YES/NO branch.
                  These attach the new component to the parent condition's branch (not the main flow). */}
              {activeStages.filter((s) => s.component_type === 'condition').map((cond) => {
                const pos = nodePositions.get(cond.process_stage_id);
                if (!pos) return null;
                const zones: { branch: 'yes' | 'no'; x: number; y: number }[] = [];
                if (branchOpen(cond.branch_yes_stage_id)) zones.push({ branch: 'yes', x: pos.x + COLUMN_WIDTH, y: pos.y });
                if (branchOpen(cond.branch_no_stage_id)) zones.push({ branch: 'no', x: pos.x, y: pos.y + NODE_HEIGHT + V_GAP });
                return zones.map((z) => {
                  const isYes = z.branch === 'yes';
                  const active = branchDrop?.conditionId === cond.process_stage_id && branchDrop.branch === z.branch;
                  return (
                    <div
                      key={cond.process_stage_id + z.branch}
                      className="absolute"
                      style={{ left: z.x, top: z.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
                      onDragOver={(e) => {
                        if (!draggingType.current) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setDropTarget(null);
                        if (!active) setBranchDrop({ conditionId: cond.process_stage_id, branch: z.branch });
                      }}
                      onDragLeave={(e) => { e.stopPropagation(); setBranchDrop(null); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const type = draggingType.current;
                        setBranchDrop(null);
                        setDropTarget(null);
                        if (type) { onDropInBranch(cond.process_stage_id, z.branch, type); draggingType.current = null; }
                      }}
                    >
                      <div className={`w-full h-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center transition-colors ${
                        active
                          ? (isYes ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-red-500 bg-red-50 text-red-700')
                          : (isYes ? 'border-emerald-300/70 bg-emerald-50/30 text-emerald-500' : 'border-red-300/70 bg-red-50/30 text-red-500')
                      }`}>
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${isYes ? 'text-emerald-600' : 'text-red-600'}`}>{isYes ? 'YES' : 'NO'} branch</span>
                        <Plus size={14} className="my-0.5" />
                        <span className="text-[10px] font-medium px-2 leading-tight">
                          {active
                            ? `Drop ${draggingType.current === 'condition' ? 'condition' : 'stage'} in ${isYes ? 'YES' : 'NO'} branch`
                            : 'Drop Stage / Condition'}
                        </span>
                      </div>
                    </div>
                  );
                });
              })}

              {/* Branch-line "+" — one persistent button on the connector line just past the
                  final stage of each branch. Click appends a stage to that branch; dropping a
                  dragged component on it routes into the same branch (drag-and-drop unchanged). */}
              {activeStages.filter((s) => s.component_type !== 'condition' && branchKind.has(s.process_stage_id) && branchOpen(s.branch_yes_stage_id)).map((st) => {
                const pos = nodePositions.get(st.process_stage_id);
                if (!pos) return null;
                const isYes = branchKind.get(st.process_stage_id) === 'yes';
                const active = branchDrop?.conditionId === st.process_stage_id && branchDrop.branch === 'yes';
                return (
                  <div
                    key={st.process_stage_id + '-cont'}
                    className="absolute flex items-center"
                    style={{ left: pos.x + NODE_WIDTH, top: pos.y + NODE_HEIGHT / 2 - 14, height: 28 }}
                    onDragOver={(e) => {
                      if (!draggingType.current) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setDropTarget(null);
                      if (!active) setBranchDrop({ conditionId: st.process_stage_id, branch: 'yes' });
                    }}
                    onDragLeave={(e) => { e.stopPropagation(); setBranchDrop(null); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const type = draggingType.current;
                      setBranchDrop(null);
                      setDropTarget(null);
                      if (type) { onDropInBranch(st.process_stage_id, 'yes', type); draggingType.current = null; }
                    }}
                  >
                    {/* connector stub */}
                    <div className={`w-4 h-0.5 ${isYes ? 'bg-emerald-300' : 'bg-red-300'}`} />
                    <button
                      type="button"
                      title="Add a stage to this branch"
                      onClick={(e) => { e.stopPropagation(); onDropInBranch(st.process_stage_id, 'yes', 'stage'); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className={`w-7 h-7 rounded-full border-2 border-dashed flex items-center justify-center transition-colors cursor-pointer select-none ${
                        active
                          ? (isYes ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-red-500 bg-red-50 text-red-700')
                          : (isYes ? 'border-emerald-300 bg-white text-emerald-500 hover:border-emerald-400 hover:bg-emerald-50' : 'border-red-300 bg-white text-red-500 hover:border-red-400 hover:bg-red-50')
                      }`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                );
              })}

              {/* Terminal stage nodes */}
              {terminalStages.map((stage) => {
                const pos = nodePositions.get(stage.process_stage_id);
                if (!pos) return null;
                return (
                  <div key={stage.process_stage_id} className="absolute" style={{ left: pos.x, top: pos.y }}>
                    <StageNode
                      stage={stage}
                      isSelected={selectedStageId === stage.process_stage_id}
                      isDefault={stage.process_stage_id === flow.default_stage_id}
                      isFirst
                      isLast
                      canMoveLeft={false}
                      canMoveRight={false}
                      onSelect={() => onSelect(stage.process_stage_id)}
                      onDelete={() => onDelete(stage.process_stage_id)}
                      onSetDefault={() => onSetDefault(stage.process_stage_id)}
                      onMoveLeft={() => {}}
                      onMoveRight={() => {}}
                      onRename={(name) => onRename(stage.process_stage_id, name)}
                    />
                  </div>
                );
              })}

              {/* Main-flow "+" — the single persistent button on the connector line just
                  past the final stage. Clicking appends a new stage after it; because the
                  tail is recomputed every render, the "+" automatically follows the new
                  final stage. It lives OUTSIDE the card, never inside it. */}
              {mainAddTail && (() => {
                const pos = nodePositions.get(mainAddTail.process_stage_id);
                if (!pos) return null;
                return (
                  <div
                    className="absolute flex items-center"
                    style={{ left: pos.x + NODE_WIDTH, top: pos.y + NODE_HEIGHT / 2 - 14, height: 28 }}
                  >
                    {/* connector stub */}
                    <div className="w-4 h-0.5 bg-gray-300" />
                    <button
                      type="button"
                      title="Add a stage"
                      onClick={() => onDropType('stage')}
                      onMouseDown={(e) => e.stopPropagation()}
                      className={`w-7 h-7 rounded-full border-2 border-dashed flex items-center justify-center transition-colors cursor-pointer select-none ${
                        dropTarget === 'canvas'
                          ? 'border-blue-400 bg-blue-50 text-blue-600'
                          : 'border-blue-300 bg-white text-blue-400 hover:border-blue-400 hover:bg-blue-50'
                      }`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                );
              })()}

              {/* Insertion gaps — a "+" on every connector, on the main line AND inside Yes/No
                  branches. Click inserts a stage at that position; dropping a dragged
                  Stage/Condition inserts that type. Both slot in BEFORE the node the connector
                  enters, pushing the rest of that line along (e.g. Qualify → [new] → Develop). */}
              {insertGaps.map((gap) => {
                const active = gapInsert === gap.beforeId;
                return (
                  <div
                    key={'gap-' + gap.beforeId}
                    className="absolute flex items-center justify-center"
                    style={{ left: gap.x - 16, top: gap.y - 16, width: 32, height: 32 }}
                    onDragOver={(e) => {
                      if (!draggingType.current) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setDropTarget(null);
                      setBranchDrop(null);
                      if (!active) setGapInsert(gap.beforeId);
                    }}
                    onDragLeave={(e) => { e.stopPropagation(); setGapInsert(null); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const type = draggingType.current;
                      setGapInsert(null);
                      setDropTarget(null);
                      if (type) { onInsertBefore(gap.beforeId, type); draggingType.current = null; }
                    }}
                  >
                    <button
                      type="button"
                      title="Insert a stage here"
                      onClick={(e) => { e.stopPropagation(); onInsertBefore(gap.beforeId, 'stage'); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className={`rounded-full border-2 border-dashed flex items-center justify-center transition-all cursor-pointer select-none ${
                        active
                          ? 'w-8 h-8 border-blue-500 bg-blue-50 text-blue-600'
                          : 'w-5 h-5 border-blue-300/80 bg-white text-blue-400 opacity-60 hover:opacity-100 hover:w-7 hover:h-7 hover:border-blue-400 hover:bg-blue-50'
                      }`}
                    >
                      <Plus size={active ? 16 : 12} />
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Minimap overlay */}
        {showMinimap && canvasWidth > 0 && canvasHeight > 0 && (activeStages.length > 0 || terminalStages.length > 0) && (
          <Minimap
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            zoom={zoom}
            pan={pan}
            containerRef={containerRef}
            nodePositions={nodePositions}
            activeStages={activeStages}
            terminalStages={terminalStages}
            noBranchStageIds={noBranchStageIds}
            onPanTo={(p) => setPan(p)}
          />
        )}
      </div>

      {/* Footer info */}
      <div className="px-3 py-1.5 border-t border-gray-200 bg-white flex items-center gap-3 text-[10px] text-gray-400 shrink-0">
        <Info size={10} className="shrink-0 text-blue-400" />
        <span>
          <strong className="text-gray-500">First stage is fixed.</strong>{' '}
          Click to configure · Drag from panel to add · Scroll or Shift+Scroll to navigate · Ctrl+Scroll to zoom
        </span>
      </div>
    </div>
  );
}

// ─── Minimap ─────────────────────────────────────────────────────────────────

interface MinimapProps {
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  pan: { x: number; y: number };
  containerRef: React.RefObject<HTMLDivElement>;
  nodePositions: Map<string, { x: number; y: number }>;
  activeStages: ProcessStage[];
  terminalStages: ProcessStage[];
  noBranchStageIds: Set<string>;
  onPanTo: (p: { x: number; y: number }) => void;
}

function Minimap({ canvasWidth, canvasHeight, zoom, pan, containerRef, nodePositions, activeStages, terminalStages, noBranchStageIds, onPanTo }: MinimapProps) {
  const MINIMAP_W = 180;
  const MINIMAP_H = 100;
  const scaleX = MINIMAP_W / canvasWidth;
  const scaleY = MINIMAP_H / canvasHeight;
  const scale = Math.min(scaleX, scaleY);
  const mapW = canvasWidth * scale;
  const mapH = canvasHeight * scale;

  const container = containerRef.current;
  const vpW = container ? container.clientWidth / zoom * scale : mapW;
  const vpH = container ? container.clientHeight / zoom * scale : mapH;
  const vpX = -pan.x / zoom * scale;
  const vpY = -pan.y / zoom * scale;

  const handleMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const canvasX = clickX / scale;
    const canvasY = clickY / scale;
    const cw = container?.clientWidth ?? 600;
    const ch = container?.clientHeight ?? 400;
    onPanTo({
      x: -(canvasX * zoom) + cw / 2,
      y: -(canvasY * zoom) + ch / 2,
    });
  };

  return (
    <div
      className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-sm border border-gray-300 rounded-lg shadow-lg overflow-hidden cursor-crosshair z-10"
      style={{ width: mapW + 8, height: mapH + 8, padding: 4 }}
      onClick={handleMinimapClick}
    >
      <svg width={mapW} height={mapH} className="block">
        {/* Stage nodes as small rectangles */}
        {[...activeStages, ...terminalStages].map((stage) => {
          const pos = nodePositions.get(stage.process_stage_id);
          if (!pos) return null;
          const isNo = noBranchStageIds.has(stage.process_stage_id);
          const isCondition = stage.component_type === 'condition';
          return (
            <rect
              key={stage.process_stage_id}
              x={pos.x * scale}
              y={pos.y * scale}
              width={NODE_WIDTH * scale}
              height={NODE_HEIGHT * scale}
              rx={2}
              fill={isCondition ? '#fbbf24' : isNo ? '#fca5a5' : '#93c5fd'}
              stroke={isCondition ? '#d97706' : isNo ? '#dc2626' : '#2563eb'}
              strokeWidth={0.5}
            />
          );
        })}
        {/* Viewport indicator */}
        <rect
          x={Math.max(0, vpX)}
          y={Math.max(0, vpY)}
          width={Math.min(vpW, mapW)}
          height={Math.min(vpH, mapH)}
          fill="rgba(59, 130, 246, 0.08)"
          stroke="#2563eb"
          strokeWidth={1.5}
          rx={2}
          strokeDasharray="3 2"
        />
      </svg>
    </div>
  );
}

// ─── Stage Node ───────────────────────────────────────────────────────────────

interface StageNodeProps {
  stage: ProcessStage;
  isSelected: boolean;
  isDefault: boolean;
  isFirst: boolean;
  isLast: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  entityColor?: string;
  entityName?: string;
  branchLane?: 'yes' | 'no';
  onSelect: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onRename: (name: string) => void;
  onAddToBranch?: (branch: 'yes' | 'no') => void;
  onClearBranch?: (branch: 'yes' | 'no') => void;
  yesOpen?: boolean;
  noOpen?: boolean;
}

function StageNode({ stage, isSelected, isDefault, canMoveLeft, canMoveRight, entityColor, entityName, branchLane, onSelect, onDelete, onSetDefault, onMoveLeft, onMoveRight, onRename, onAddToBranch, onClearBranch, yesOpen, noOpen }: StageNodeProps) {
  const def = getComponentDef(stage.component_type ?? 'stage');
  const isTerminal = stage.stage_type !== 'active';
  const isEntityBoundary = !!stage.target_entity_id;
  const isCondition = stage.component_type === 'condition';

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(stage.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(stage.name);
    setEditing(true);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== stage.name) onRename(trimmed);
    else setEditValue(stage.name);
  };

  // Condition node renders as a full rectangular card (Dynamics 365 style)
  if (isCondition) {
    return (
      <div
        onClick={editing ? undefined : onSelect}
        className={`group relative cursor-pointer rounded-xl border-2 transition-all shadow-sm hover:shadow-md`}
        style={{
          width: NODE_WIDTH,
          minHeight: NODE_HEIGHT,
          borderColor: isSelected ? '#d97706' : '#fbbf24',
          backgroundColor: '#fffbeb',
          boxShadow: isSelected ? '0 4px 16px rgba(217,119,6,0.25), 0 1px 3px rgba(0,0,0,0.06)' : undefined,
          transform: isSelected ? 'scale(1.02)' : undefined,
        }}
      >
        {/* Top accent bar */}
        <div className="h-1 rounded-t-[10px] bg-amber-500" />

        <div className="px-3 py-2.5">
          {/* Component type badge */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 border border-amber-300">
              <GitBranch size={9} />
              Condition
            </div>
          </div>

          {/* Condition name */}
          {editing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') { setEditing(false); setEditValue(stage.name); }
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-xs font-semibold text-gray-800 bg-white border border-amber-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
              autoFocus
            />
          ) : (
            <div
              className="flex items-center gap-1 cursor-text group/name"
              onClick={(e) => { e.stopPropagation(); startEdit(e); }}
              title="Click to rename"
            >
              <span className="text-[13px] font-semibold text-gray-800 leading-snug truncate flex-1 min-w-0">{stage.name}</span>
              <Pencil size={9} className="shrink-0 text-gray-300 opacity-0 group-hover/name:opacity-100 group-hover/name:text-amber-500 transition-all" />
            </div>
          )}

          {/* Branch indicators — when a branch is empty, it becomes an "+ Add" button */}
          <div className="flex items-center gap-2 mt-2.5">
            {!yesOpen ? (
              <div className="flex items-center gap-1 group/yes">
                <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check size={9} className="text-white" strokeWidth={3} />
                </div>
                <span className="text-[9px] font-semibold text-emerald-700">Yes</span>
                <ArrowRight size={9} className="text-emerald-500" />
                <button
                  onClick={(e) => { e.stopPropagation(); onClearBranch?.('yes'); }}
                  title="Disconnect Yes branch (make it independent)"
                  className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                >
                  <X size={8} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onAddToBranch?.('yes'); }}
                title="Add a stage or condition to the Yes branch"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 transition-colors"
              >
                <Plus size={9} /><span className="text-[9px] font-semibold">Yes</span>
              </button>
            )}
            <div className="w-px h-3 bg-gray-200" />
            {!noOpen ? (
              <div className="flex items-center gap-1 group/no">
                <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                  <X size={9} className="text-white" strokeWidth={3} />
                </div>
                <span className="text-[9px] font-semibold text-red-700">No</span>
                <ArrowDown size={9} className="text-red-500" />
                <button
                  onClick={(e) => { e.stopPropagation(); onClearBranch?.('no'); }}
                  title="Disconnect No branch (make it independent)"
                  className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                >
                  <X size={8} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onAddToBranch?.('no'); }}
                title="Add a stage or condition to the No branch"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400 transition-colors"
              >
                <Plus size={9} /><span className="text-[9px] font-semibold">No</span>
              </button>
            )}
          </div>
        </div>

        {/* Hover actions */}
        <div className="absolute -top-2.5 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 z-10">
          {!stage.is_fixed && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete"
              className="w-5 h-5 bg-white border border-red-200 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:border-red-400 shadow-sm transition-colors"
            >
              <X size={8} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Standard stage card
  return (
    <div
      onClick={editing ? undefined : onSelect}
      className={`group relative cursor-pointer rounded-xl border-2 transition-all shadow-sm hover:shadow-md`}
      style={{
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        borderColor: isSelected
          ? (entityColor ?? '#2563eb')
          : branchLane === 'no' ? '#fca5a5' : branchLane === 'yes' ? '#86efac' : '#e5e7eb',
        backgroundColor: branchLane === 'no' ? '#fef2f2' : '#ffffff',
        boxShadow: isSelected ? `0 4px 16px ${entityColor ?? '#2563eb'}25, 0 1px 3px rgba(0,0,0,0.06)` : undefined,
        transform: isSelected ? 'scale(1.02)' : undefined,
      }}
    >
      {/* Top accent bar */}
      <div className="h-1 rounded-t-[10px]" style={{ backgroundColor: branchLane === 'no' ? '#dc2626' : branchLane === 'yes' ? '#16a34a' : (entityColor ?? stage.stage_color) }} />

      <div className="px-3 py-2.5">
        {/* Component type badge + entity name */}
        <div className="flex items-center justify-between mb-1.5">
          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ${def.bg} ${def.color} border ${def.border}`}>
            {def.icon}
            {def.label}
          </div>
          {entityName && (
            <span className="text-[9px] text-gray-400 font-medium truncate max-w-[72px]" title={entityName}>
              {entityName}
            </span>
          )}
        </div>

        {/* Stage name */}
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') { setEditing(false); setEditValue(stage.name); }
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-xs font-semibold text-gray-800 bg-white border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            autoFocus
          />
        ) : (
          <div
            className="flex items-center gap-1 cursor-text group/name"
            onClick={(e) => { e.stopPropagation(); startEdit(e); }}
            title="Click to rename"
          >
            <span className="text-[13px] font-semibold text-gray-800 leading-snug truncate flex-1 min-w-0">{stage.name}</span>
            <Pencil size={9} className="shrink-0 text-gray-300 opacity-0 group-hover/name:opacity-100 group-hover/name:text-blue-400 transition-all" />
          </div>
        )}

        {/* Metadata badges */}
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {stage.is_fixed && (
            <span className="flex items-center gap-0.5 text-[9px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-semibold">
              <Pin size={7} /> Fixed
            </span>
          )}
          {isDefault && !stage.is_fixed && (
            <span className="text-[9px] text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-semibold">Default</span>
          )}
          {isTerminal && (
            <span className="text-[9px] rounded px-1.5 py-0.5 font-semibold border"
              style={{
                color: STAGE_TYPE_META[stage.stage_type].color,
                backgroundColor: `${STAGE_TYPE_META[stage.stage_type].color}15`,
                borderColor: `${STAGE_TYPE_META[stage.stage_type].color}40`,
              }}
            >
              {stage.stage_type === 'terminal_success' ? 'Won' : stage.stage_type === 'terminal_failure' ? 'Lost' : 'End'}
            </span>
          )}
          {isEntityBoundary && (
            <span className="flex items-center gap-0.5 text-[9px] text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded font-semibold">
              <Link2 size={7} /> Entity Switch
            </span>
          )}
          {stage.probability != null && (
            <span className="text-[9px] text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-medium">
              {stage.probability}%
            </span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute -top-2.5 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 z-10">
        {!isDefault && !stage.is_fixed && (
          <button
            onClick={(e) => { e.stopPropagation(); onSetDefault(); }}
            title="Set as default"
            className="w-5 h-5 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-amber-500 hover:border-amber-300 shadow-sm transition-colors"
          >
            <Star size={8} />
          </button>
        )}
        {canMoveLeft && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveLeft(); }}
            title="Move left"
            className="w-5 h-5 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-500 shadow-sm transition-colors"
          >
            <ArrowLeft size={8} />
          </button>
        )}
        {canMoveRight && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveRight(); }}
            title="Move right"
            className="w-5 h-5 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-500 shadow-sm transition-colors"
          >
            <ArrowRight size={8} />
          </button>
        )}
        {!stage.is_fixed && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete"
            className="w-5 h-5 bg-white border border-red-200 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:border-red-400 shadow-sm transition-colors"
          >
            <X size={8} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Component Palette ────────────────────────────────────────────────────────

function ComponentPalette({ draggingType }: { draggingType: React.MutableRefObject<ComponentType | null> }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Components</p>
        <p className="text-[11px] text-gray-400 mt-0.5">Drag onto the canvas to add</p>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-1.5">
        {COMPONENT_DEFS.map((def) => (
          <div
            key={def.type}
            draggable
            onDragStart={() => { draggingType.current = def.type; }}
            onDragEnd={() => { draggingType.current = null; }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 cursor-grab active:cursor-grabbing select-none transition-all hover:shadow-md hover:scale-[1.02] ${def.bg} ${def.border}`}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${def.color} bg-white shadow-sm border ${def.border}`}>
              {def.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-semibold ${def.color}`}>{def.label}</p>
              <p className="text-[10px] text-gray-400 truncate">{def.description}</p>
            </div>
            <GripVertical size={12} className="text-gray-300 shrink-0" />
          </div>
        ))}
      </div>

      <div className="px-3 py-3 border-t border-gray-100 bg-gray-50 space-y-2">
        <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
          <Info size={11} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-blue-700 leading-relaxed">
            <strong>Stage</strong> — add fields & validate before advancing.<br />
            <strong>Condition</strong> — Yes/No branch based on field values.<br />
            <strong>Cross-entity</strong> — set a target entity on any stage to switch records.
          </p>
        </div>
        <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
          <Pin size={10} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-700 leading-relaxed">
            The <strong>first stage is fixed</strong> — it cannot be moved, deleted, or bypassed.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Stage Properties Panel ───────────────────────────────────────────────────

const PRESET_COLORS = [
  '#6b7280', '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6',
];

type PropSection = 'fields' | 'entity' | 'settings' | 'conditions';

interface StagePropertiesPanelProps {
  stage: ProcessStage;
  stages: ProcessStage[];
  flow: ProcessFlow;
  entities: EntityDefinition[];
  isDefault: boolean;
  /** The entity context inherited from the previous stage (or primary entity) */
  inheritedEntityId: string;
  onUpdate: (updates: Partial<ProcessStageFormData>) => Promise<void>;
  onDelete: () => void;
  onSetDefault: () => Promise<void>;
  onClose: () => void;
}

function StagePropertiesPanel({ stage, stages, flow, entities, isDefault, inheritedEntityId, onUpdate, onDelete, onSetDefault, onClose }: StagePropertiesPanelProps) {
  const def = getComponentDef(stage.component_type ?? 'stage');
  const [name, setName] = useState(stage.name);
  const [stageColor, setStageColor] = useState(stage.stage_color);
  const [stageType, setStageType] = useState<StageType>(stage.stage_type);
  const [stageCategory, setStageCategory] = useState<StageCategory>(stage.stage_category ?? 'general');
  const [allowBackward, setAllowBackward] = useState(stage.allow_backward_movement ?? true);
  const [requiresEntryApproval, setRequiresEntryApproval] = useState(stage.requires_entry_approval ?? false);
  const [requiresExitApproval, setRequiresExitApproval] = useState(stage.requires_exit_approval ?? false);
  const [probability, setProbability] = useState<number | null>(stage.probability);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeSection, setActiveSection] = useState<PropSection>('fields');

  // Entity context
  const [targetEntityId, setTargetEntityId] = useState<string | null>(stage.target_entity_id ?? stage.stage_entity_id ?? null);
  const [relationshipDefId, setRelationshipDefId] = useState<string | null>(stage.relationship_definition_id ?? null);
  const [createLinkedRecord, setCreateLinkedRecord] = useState(stage.create_linked_record ?? false);
  const [relationships, setRelationships] = useState<RelationshipDefinitionWithEntities[]>([]);
  const [loadingRel, setLoadingRel] = useState(false);

  // Condition branch
  const [conditionEntityId, setConditionEntityId] = useState<string>(
    stage.condition_entity_id ?? inheritedEntityId
  );
  const [conditionGroup, setConditionGroup] = useState<ConditionGroup>(() => {
    if (stage.condition_rules && stage.condition_rules.rules?.length) return stage.condition_rules;
    if (stage.condition_field) return { logic: 'AND', rules: [{ field: stage.condition_field, operator: stage.condition_operator ?? 'eq', value: stage.condition_value ?? '' }] };
    return { logic: 'AND', rules: [{ field: '', operator: 'eq', value: '' }] };
  });
  const [branchYesStageId] = useState<string>(stage.branch_yes_stage_id ?? '');
  const [branchNoStageId] = useState<string>(stage.branch_no_stage_id ?? '');
  const [conditionEntityFields, setConditionEntityFields] = useState<FieldDefinition[]>([]);
  const [conditionEntityFieldsLoading, setConditionEntityFieldsLoading] = useState(false);

  // Fields
  const [steps, setSteps] = useState<ProcessStageField[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [entityFields, setEntityFields] = useState<FieldDefinition[]>([]);
  const [entityFieldsLoading, setEntityFieldsLoading] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [addingStep, setAddingStep] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  // The effective entity for this stage:
  // - If this stage has an explicit target_entity_id, use it
  // - Otherwise inherit from the previous stage context
  const effectiveEntityId = targetEntityId ?? inheritedEntityId;
  const isEntityBoundary = targetEntityId !== null && targetEntityId !== inheritedEntityId;

  // Load relationships FROM inheritedEntityId TO candidate related entities
  const [allRelationships, setAllRelationships] = useState<RelationshipDefinitionWithEntities[]>([]);
  useEffect(() => {
    if (!inheritedEntityId) return;
    fetchRelationshipsForEntity(inheritedEntityId)
      .then((rels) => setAllRelationships(rels.filter(
        (r) => r.source_entity_id === inheritedEntityId && r.relationship_storage_type === 'lookup'
      )))
      .catch(() => setAllRelationships([]));
  }, [inheritedEntityId]);

  // When a specific target entity is set, filter relationships to that entity
  useEffect(() => {
    if (!targetEntityId || targetEntityId === inheritedEntityId) {
      setRelationships([]);
      return;
    }
    setLoadingRel(true);
    fetchRelationshipsForEntity(inheritedEntityId)
      .then((rels) => {
        const relevant = rels.filter(
          (r) => r.source_entity_id === inheritedEntityId && r.target_entity_id === targetEntityId && r.relationship_storage_type === 'lookup'
        );
        setRelationships(relevant);
      })
      .catch(() => setRelationships([]))
      .finally(() => setLoadingRel(false));
  }, [targetEntityId, inheritedEntityId]);

  // Load fields for the condition entity
  useEffect(() => {
    if (!conditionEntityId) return;
    setConditionEntityFieldsLoading(true);
    fetchFieldsForEntity(conditionEntityId)
      .then((f) => setConditionEntityFields(f.filter((x) => x.is_active && !x.deleted_at)))
      .catch(() => setConditionEntityFields([]))
      .finally(() => setConditionEntityFieldsLoading(false));
  }, [conditionEntityId]);

  useEffect(() => {
    setStepsLoading(true);
    fetchStageFields(stage.process_stage_id).then(setSteps).catch(() => setSteps([])).finally(() => setStepsLoading(false));
  }, [stage.process_stage_id]);

  useEffect(() => {
    if (!effectiveEntityId) return;
    setEntityFieldsLoading(true);
    fetchFieldsForEntity(effectiveEntityId)
      .then((f) => setEntityFields(f.filter((x) => x.is_active && !x.deleted_at)))
      .catch(() => setEntityFields([]))
      .finally(() => setEntityFieldsLoading(false));
  }, [effectiveEntityId]);

  const markDirty = () => setDirty(true);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({
        name, stage_color: stageColor, stage_type: stageType, stage_category: stageCategory,
        allow_backward_movement: allowBackward,
        requires_entry_approval: requiresEntryApproval,
        requires_exit_approval: requiresExitApproval,
        probability,
        target_entity_id: targetEntityId,
        stage_entity_id: targetEntityId,
        relationship_definition_id: relationshipDefId,
        create_linked_record: createLinkedRecord,
        branch_yes_stage_id: branchYesStageId || null,
        branch_no_stage_id: branchNoStageId || null,
        condition_entity_id: conditionEntityId || null,
        ...(() => {
          // Keep only rules with a field; drop empty groups. Mirror the first leaf into the
          // legacy condition_* columns for backward compatibility.
          const prune = (g: ConditionGroup): ConditionGroup => ({
            logic: g.logic,
            rules: g.rules
              .map((r) => (isConditionGroup(r) ? prune(r) : r))
              .filter((r) => (isConditionGroup(r) ? r.rules.length > 0 : !!r.field)),
          });
          const firstLeaf = (g: ConditionGroup): ConditionLeaf | null => {
            for (const r of g.rules) {
              if (isConditionGroup(r)) { const f = firstLeaf(r); if (f) return f; }
              else if (r.field) return r;
            }
            return null;
          };
          const pruned = prune(conditionGroup);
          const hasRules = pruned.rules.length > 0;
          const leaf = hasRules ? firstLeaf(pruned) : null;
          return {
            condition_rules: hasRules ? pruned : null,
            condition_field: leaf?.field ?? null,
            condition_operator: leaf?.operator ?? null,
            condition_value: leaf?.value ?? null,
          };
        })(),
      });
      setDirty(false);
    } finally { setSaving(false); }
  };

  const handleAddField = async () => {
    const fieldDef = entityFields.find((f) => f.field_definition_id === selectedFieldId);
    if (!fieldDef) return;
    setAddingStep(true);
    try {
      const nextOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.display_order)) + 10 : 10;
      const created = await addStageField(
        stage.process_stage_id, flow.process_flow_id, fieldDef.logical_name, nextOrder, undefined, null,
      );
      setSteps((prev) => [...prev, created]);
      setSelectedFieldId('');
    } finally { setAddingStep(false); }
  };

  const handleToggleRequired = async (s: ProcessStageField) => {
    const updated = { is_required: !s.is_required };
    setSteps((prev) => prev.map((x) => x.psf_id === s.psf_id ? { ...x, ...updated } : x));
    await updateStageField(s.psf_id, updated);
  };

  const handleToggleReadonly = async (s: ProcessStageField) => {
    const updated = { is_readonly: !s.is_readonly };
    setSteps((prev) => prev.map((x) => x.psf_id === s.psf_id ? { ...x, ...updated } : x));
    await updateStageField(s.psf_id, updated);
  };

  const handleDeleteField = async (psfId: string) => {
    setSteps((prev) => prev.filter((s) => s.psf_id !== psfId));
    await deleteStageField(psfId);
  };

  const commitLabel = async (psfId: string) => {
    const label = editingLabel.trim() || null;
    setSteps((prev) => prev.map((s) => s.psf_id === psfId ? { ...s, display_label: label } : s));
    setEditingStepId(null);
    await updateStageField(psfId, { display_label: label });
  };

  const handleDragEnd = async () => {
    if (dragIdx === null || dragOverIdx.current === null || dragIdx === dragOverIdx.current) {
      setDragIdx(null); dragOverIdx.current = null; return;
    }
    const reordered = [...steps];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dragOverIdx.current, 0, moved);
    const withOrder = reordered.map((s, i) => ({ ...s, display_order: (i + 1) * 10 }));
    setSteps(withOrder);
    setDragIdx(null); dragOverIdx.current = null;
    await reorderStageFields(withOrder.map((s) => ({ psf_id: s.psf_id, display_order: s.display_order })));
  };

  const isStageComponent = (stage.component_type ?? 'stage') === 'stage';
  const isConditionComponent = (stage.component_type ?? 'stage') === 'condition';

  // Build the set of entity IDs reachable at or before this condition stage in the flow.
  // Used to populate the condition entity selector.
  const reachableEntityIds: string[] = (() => {
    const sorted = [...stages]
      .filter((s) => s.stage_type === 'active')
      .sort((a, b) => a.display_order - b.display_order);
    const condIdx = sorted.findIndex((s) => s.process_stage_id === stage.process_stage_id);
    const seen = new Set<string>();
    seen.add(flow.entity_definition_id);
    for (let i = 0; i <= condIdx; i++) {
      if (sorted[i].target_entity_id) seen.add(sorted[i].target_entity_id!);
    }
    return Array.from(seen);
  })();

  // For condition: is the entity ambiguous (condition sits between two entity groups)?
  const isAtEntityBoundary = reachableEntityIds.length > 1;

  const SECTIONS: { id: PropSection; label: string }[] = [
    { id: 'fields', label: 'Fields' },
    { id: 'entity', label: 'Entity' },
    ...(isConditionComponent ? [{ id: 'conditions' as PropSection, label: 'Condition' }] : []),
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stageColor }} />
          <span className={`text-[10px] font-bold uppercase tracking-wide shrink-0 ${def.color}`}>{def.label}</span>
          <span className="text-xs font-semibold text-gray-700 truncate">{name}</span>
          {stage.is_fixed && <span className="flex items-center gap-0.5 text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded shrink-0"><Pin size={8} />Fixed</span>}
          {isDefault && !stage.is_fixed && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded shrink-0">Default</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isDefault && !stage.is_fixed && (
            <button onClick={onSetDefault} title="Set as default" className="p-1 text-gray-400 hover:text-amber-500 transition-colors rounded">
              <StarOff size={12} />
            </button>
          )}
          {isDefault && !stage.is_fixed && <Star size={12} className="text-amber-500 mx-1" />}
          {!stage.is_fixed && (
            <button onClick={() => setShowDeleteConfirm(true)} className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded">
              <Trash2 size={12} />
            </button>
          )}
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex border-b border-gray-100 shrink-0 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors whitespace-nowrap px-2 ${activeSection === s.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">

        {/* ── Fields tab ─────────────────────────────────────────────────────── */}
        {activeSection === 'fields' && (
          <div className="p-3 space-y-3">
            {!isStageComponent && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <Info size={11} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700">
                  Field steps are only on <strong>Stage</strong> components. This is a <strong>{def.label}</strong>.
                </p>
              </div>
            )}

            {isStageComponent && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">Stage Fields</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Shown in the BPF bar. Required fields block advancement.</p>
                  </div>
                  {steps.length > 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">{steps.length}</span>}
                </div>

                {stepsLoading ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Loading…</div>
                ) : (
                  <>
                    {steps.length === 0 ? (
                      <div className="flex items-center gap-2 py-4 px-3 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400">
                        <ListChecks size={13} className="shrink-0" />
                        No fields yet. Add fields below.
                      </div>
                    ) : (
                      <ul className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                        {steps.map((step, idx) => {
                          const fieldDef = entityFields.find((f) => f.logical_name === step.field_logical_name);
                          const label = step.display_label ?? fieldDef?.display_name ?? step.field_logical_name;
                          const isEditing = editingStepId === step.psf_id;
                          const isFromRelated = !!step.related_entity_id;
                          return (
                            <li
                              key={step.psf_id}
                              draggable={!isEditing}
                              onDragStart={() => !isEditing && setDragIdx(idx)}
                              onDragEnter={() => { dragOverIdx.current = idx; }}
                              onDragOver={(e) => e.preventDefault()}
                              onDragEnd={handleDragEnd}
                              className={`flex items-center gap-2 px-2.5 py-2 group transition-colors ${dragIdx === idx ? 'opacity-40 bg-blue-50' : 'hover:bg-gray-50'}`}
                            >
                              <GripVertical size={11} className={`shrink-0 ${isEditing ? 'text-gray-200' : 'text-gray-300 cursor-grab group-hover:text-gray-400'}`} />

                              <div className="flex-1 min-w-0">
                                {isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      autoFocus value={editingLabel}
                                      onChange={(e) => setEditingLabel(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(step.psf_id); if (e.key === 'Escape') setEditingStepId(null); }}
                                      className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] border border-blue-400 rounded focus:outline-none bg-white"
                                    />
                                    <button onClick={() => commitLabel(step.psf_id)} className="text-blue-500 hover:text-blue-700 shrink-0"><Check size={11} /></button>
                                    <button onClick={() => setEditingStepId(null)} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={11} /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 min-w-0">
                                    <span className="text-[11px] font-medium text-gray-800 truncate">{label}</span>
                                    {isFromRelated && <span title="From related entity" className="inline-flex shrink-0"><Link2 size={8} className="text-teal-500" /></span>}
                                    <button
                                      onClick={() => { setEditingStepId(step.psf_id); setEditingLabel(step.display_label ?? fieldDef?.display_name ?? ''); }}
                                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-500 transition-all shrink-0"
                                    ><Pencil size={9} /></button>
                                  </div>
                                )}
                                <span className="text-[9px] text-gray-400 font-mono">{step.field_logical_name}</span>
                              </div>

                              <button
                                onClick={() => handleToggleRequired(step)}
                                title={step.is_required ? 'Required — click to make optional' : 'Optional — click to make required'}
                                className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded border transition-all ${
                                  step.is_required
                                    ? 'bg-red-600 text-white border-red-600 shadow-sm'
                                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                {step.is_required ? 'REQ' : 'OPT'}
                              </button>

                              <button
                                onClick={() => handleToggleReadonly(step)}
                                title={step.is_readonly ? 'Read-only' : 'Editable'}
                                className={`shrink-0 px-1 py-0.5 text-[9px] font-medium rounded border transition-all ${
                                  step.is_readonly
                                    ? 'bg-amber-50 text-amber-600 border-amber-200'
                                    : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                R/O
                              </button>

                              <button
                                onClick={() => handleDeleteField(step.psf_id)}
                                className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                              ><X size={11} /></button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {/* Add field from the stage's effective entity */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Add field</p>
                        <span className="text-[9px] text-gray-400">
                          — from <strong className="text-gray-600">{entities.find((e) => e.entity_definition_id === effectiveEntityId)?.display_name ?? '...'}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FilterSelect
                          value={selectedFieldId} onChange={(e) => setSelectedFieldId(e.target.value)}
                          disabled={entityFieldsLoading}
                          className="flex-1 min-w-0 px-2 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white disabled:bg-gray-50"
                        >
                          <option value="">{entityFieldsLoading ? 'Loading…' : '— Select field —'}</option>
                          {entityFields.filter((f) => !steps.some((s) => s.field_logical_name === f.logical_name))
                            .map((f) => <option key={f.field_definition_id} value={f.field_definition_id}>{f.display_name}</option>)}
                        </FilterSelect>
                        <button
                          onClick={handleAddField}
                          disabled={!selectedFieldId || addingStep}
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                        >
                          {addingStep ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />} Add
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <span className="flex items-center gap-1 text-[9px] text-gray-400">
                        <span className="inline-block w-5 h-3 bg-red-600 rounded text-white text-center text-[8px] font-bold leading-3">REQ</span>
                        = Required (blocks next stage)
                      </span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Entity tab ─────────────────────────────────────────────────────── */}
        {activeSection === 'entity' && (
          <div className="p-3 space-y-3">

            {/* Current context — always shown, read-only */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <Building2 size={12} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">Inherited context</p>
                <p className="text-xs font-semibold text-blue-800">
                  {entities.find((e) => e.entity_definition_id === inheritedEntityId)?.display_name ?? '—'}
                </p>
              </div>
              {isEntityBoundary && (
                <button
                  onClick={() => { setTargetEntityId(null); setRelationshipDefId(null); markDirty(); }}
                  title="Remove entity boundary — revert to inherited context"
                  className="shrink-0 text-blue-400 hover:text-red-500 transition-colors p-1 rounded"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* If this stage has an entity boundary, show it */}
            {isEntityBoundary ? (
              <>
                <div className="flex items-center gap-2.5 px-3 py-2.5 bg-teal-50 border border-teal-200 rounded-xl">
                  <div className="w-6 h-6 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
                    <Link2 size={12} className="text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-teal-500 uppercase tracking-wide">This stage switches to</p>
                    <p className="text-xs font-semibold text-teal-800">
                      {entities.find((e) => e.entity_definition_id === targetEntityId)?.display_name ?? '—'}
                    </p>
                  </div>
                  <button
                    onClick={() => { setTargetEntityId(null); setRelationshipDefId(null); markDirty(); }}
                    title="Remove entity boundary"
                    className="shrink-0 text-teal-400 hover:text-red-500 transition-colors p-1 rounded"
                  >
                    <X size={12} />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Relationship / Lookup
                  </label>
                  {loadingRel ? (
                    <div className="flex items-center gap-2 px-2.5 py-2 border border-gray-200 rounded-lg text-xs text-gray-400">
                      <Loader2 size={12} className="animate-spin" /> Loading…
                    </div>
                  ) : (
                    <FilterSelect
                      value={relationshipDefId ?? ''}
                      onChange={(e) => {
                        const rel = relationships.find(r => r.relationship_definition_id === e.target.value);
                        setRelationshipDefId(e.target.value || null);
                        markDirty();
                        if (rel) {
                          // also store physical column name for runtime engine
                          setTargetEntityId(targetEntityId); // keep
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                    >
                      <option value="">None (standalone)</option>
                      {relationships.map((r) => (
                        <option key={r.relationship_definition_id} value={r.relationship_definition_id}>
                          {r.display_name}
                          {r.lookup_field_physical_column ? ` · ${r.lookup_field_physical_column}` : ''}
                        </option>
                      ))}
                    </FilterSelect>
                  )}
                  {!loadingRel && relationships.length === 0 && (
                    <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle size={10} />
                      No lookup relationships found from <strong>{entities.find((e) => e.entity_definition_id === inheritedEntityId)?.display_name}</strong>.
                      Register one in Relationships first.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                  <Building2 size={13} className="text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Auto-create linked record</p>
                    <p className="text-[10px] text-gray-400 leading-snug">Create a new linked record if none exists when entering this stage</p>
                  </div>
                  <button onClick={() => { setCreateLinkedRecord((v) => !v); markDirty(); }} className="shrink-0 text-gray-300 hover:text-teal-600 transition-colors">
                    {createLinkedRecord ? <ToggleRight size={22} className="text-teal-600" /> : <ToggleLeft size={22} />}
                  </button>
                </div>

                <div className="flex items-start gap-2 p-2.5 bg-teal-50 border border-teal-200 rounded-lg">
                  <Info size={10} className="text-teal-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-teal-800 leading-relaxed">
                    Subsequent stages automatically inherit this{' '}
                    <strong>{entities.find((e) => e.entity_definition_id === targetEntityId)?.display_name}</strong>{' '}
                    context until another boundary is defined.
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Switch to related entity */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-0.5">Switch to a related entity</p>
                  <p className="text-[10px] text-gray-400 mb-2">
                    This stage and all following stages will operate on the selected entity's record.
                  </p>

                  {allRelationships.length === 0 ? (
                    <div className="flex items-start gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                      <Info size={10} className="text-gray-400 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-gray-500">
                        No outgoing lookup relationships from{' '}
                        <strong>{entities.find((e) => e.entity_definition_id === inheritedEntityId)?.display_name}</strong>.
                        Register relationships in the Relationships section to enable cross-entity stages.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {/* Group by target entity */}
                      {Array.from(new Set(allRelationships.map((r) => r.target_entity_id))).map((entId) => {
                        const relEntName = entities.find((e) => e.entity_definition_id === entId)?.display_name ?? entId;
                        const relsForEnt = allRelationships.filter((r) => r.target_entity_id === entId);
                        return (
                          <div key={entId} className="border border-gray-200 rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                              <span className="text-xs font-semibold text-gray-700">{relEntName}</span>
                              <button
                                onClick={() => {
                                  setTargetEntityId(entId);
                                  // auto-select first relationship
                                  if (relsForEnt.length === 1) {
                                    setRelationshipDefId(relsForEnt[0].relationship_definition_id);
                                  } else {
                                    setRelationshipDefId(null);
                                  }
                                  markDirty();
                                }}
                                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100 transition-colors"
                              >
                                <Link2 size={9} /> Switch here
                              </button>
                            </div>
                            <div className="divide-y divide-gray-50">
                              {relsForEnt.map((r) => (
                                <div key={r.relationship_definition_id} className="px-3 py-1.5">
                                  <p className="text-[11px] text-gray-600">{r.display_name}</p>
                                  {r.lookup_field_physical_column && (
                                    <p className="text-[9px] text-gray-400 font-mono">{r.lookup_field_physical_column}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Condition tab ───────────────────────────────────────────────── */}
        {activeSection === 'conditions' && isConditionComponent && (
          <div className="p-3 space-y-4">

            {/* ── How this works callout ── */}
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
              <GitBranch size={11} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-800 leading-relaxed">
                When the user clicks <strong>Next</strong>, the system evaluates this condition against the record and automatically routes to the <strong>IF (Yes)</strong> or <strong>ELSE (No)</strong> branch.
              </p>
            </div>

            {/* ── Step 1: Entity ── */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                <div className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px] font-bold shrink-0">1</div>
                <p className="text-xs font-semibold text-gray-700">Evaluate on entity</p>
              </div>
              <div className="p-3 space-y-2">
                {isAtEntityBoundary ? (
                  <>
                    <p className="text-[10px] text-gray-500">
                      This condition is between multiple entity contexts. Choose which entity's field to evaluate:
                    </p>
                    <div className="space-y-1.5">
                      {reachableEntityIds.map((eid) => {
                        const ent = entities.find((e) => e.entity_definition_id === eid);
                        const isPrimary = eid === flow.entity_definition_id;
                        const isSelected = conditionEntityId === eid;
                        return (
                          <button
                            key={eid}
                            onClick={() => {
                              setConditionEntityId(eid);
                              setConditionGroup({ logic: 'AND', rules: [{ field: '', operator: 'eq', value: '' }] });
                              markDirty();
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border-2 text-left transition-all ${
                              isSelected
                                ? 'border-amber-400 bg-amber-50'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                          >
                            <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-amber-500' : 'bg-gray-300'}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold ${isSelected ? 'text-amber-800' : 'text-gray-700'}`}>
                                {ent?.display_name ?? eid}
                              </p>
                              {isPrimary && <p className="text-[9px] text-gray-400">Primary entity</p>}
                            </div>
                            {isSelected && <Check size={11} className="text-amber-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <Building2 size={11} className="text-blue-600 shrink-0" />
                    <p className="text-xs font-semibold text-blue-800">
                      {entities.find((e) => e.entity_definition_id === conditionEntityId)?.display_name ?? '—'}
                    </p>
                    <span className="text-[9px] text-blue-500 ml-auto">inherited</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Step 2: Condition rule ── */}
            <div className="border border-gray-200 rounded-xl overflow-visible">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                <div className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px] font-bold shrink-0">2</div>
                <p className="text-xs font-semibold text-gray-700">Condition rule</p>
              </div>
              <div className="p-3">
                {conditionEntityFieldsLoading ? (
                  <div className="flex items-center gap-2 px-2.5 py-2 border border-gray-200 rounded-lg text-xs text-gray-400">
                    <Loader2 size={11} className="animate-spin" /> Loading fields…
                  </div>
                ) : (
                  <ConditionGroupEditor
                    group={conditionGroup}
                    onChange={(g) => { setConditionGroup(g); markDirty(); }}
                    fields={conditionEntityFields}
                    entityId={conditionEntityId}
                  />
                )}
              </div>
            </div>

            {/* Branch routing is automatic: next stage after condition = YES, stage below = NO */}
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <Info size={10} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-800 leading-relaxed">
                Branching is visual and automatic. The stage to the <strong>right</strong> of this condition is the <strong>Yes</strong> path.
                The stage <strong>below</strong> is the <strong>No</strong> path. Drag stages on the canvas to assign branches.
              </p>
            </div>
          </div>
        )}

        {/* ── Settings tab ───────────────────────────────────────────────────── */}
        {activeSection === 'settings' && (
          <div className="p-3 space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); markDirty(); }}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => { setStageColor(c); markDirty(); }}
                    className={`w-6 h-6 rounded-full transition-all ${stageColor === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input type="color" value={stageColor} onChange={(e) => { setStageColor(e.target.value); markDirty(); }} className="w-6 h-6 rounded cursor-pointer border border-gray-200" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Stage Type</label>
              <div className="space-y-1.5">
                {(Object.keys(STAGE_TYPE_META) as StageType[]).map((type) => {
                  const meta = STAGE_TYPE_META[type];
                  return (
                    <button
                      key={type}
                      onClick={() => { setStageType(type); markDirty(); }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border-2 text-left transition-all ${
                        stageType === type ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{meta.label}</p>
                        <p className="text-[9px] text-gray-400 truncate">{meta.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Tag size={10} /> Category
              </label>
              <div className="flex flex-wrap gap-1">
                {STAGE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { setStageCategory(cat.id); markDirty(); }}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded-lg border transition-colors ${
                      stageCategory === cat.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <ShieldCheck size={10} /> Gates &amp; Approvals
              </p>
              <div className="space-y-1.5">
                {[
                  { label: 'Allow Backward Movement', val: allowBackward, set: setAllowBackward, icon: <ArrowLeftRight size={11} className="text-blue-500" /> },
                  { label: 'Requires Entry Approval', val: requiresEntryApproval, set: setRequiresEntryApproval, icon: <CheckCircle2 size={11} className="text-emerald-500" /> },
                  { label: 'Requires Exit Approval', val: requiresExitApproval, set: setRequiresExitApproval, icon: <ShieldCheck size={11} className="text-amber-500" /> },
                ].map(({ label, val, set, icon }) => (
                  <div key={label} className="flex items-center gap-2.5 px-2.5 py-2 bg-white border border-gray-200 rounded-xl">
                    {icon}
                    <span className="flex-1 text-xs font-medium text-gray-700">{label}</span>
                    <button onClick={() => { set((v: boolean) => !v); markDirty(); }} className="shrink-0 text-gray-300 hover:text-blue-600 transition-colors">
                      {val ? <ToggleRight size={20} className="text-blue-600" /> : <ToggleLeft size={20} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {stageType === 'active' && (
              <div className="border-t border-gray-100 pt-3">
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Win Probability (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={0} max={100} step={5} value={probability ?? 0}
                    onChange={(e) => { setProbability(parseInt(e.target.value)); markDirty(); }}
                    className="flex-1 h-2 accent-blue-600"
                  />
                  <input
                    type="number" min={0} max={100} value={probability ?? ''}
                    onChange={(e) => { setProbability(e.target.value === '' ? null : parseInt(e.target.value)); markDirty(); }}
                    placeholder="—"
                    className="w-12 px-1.5 py-1 text-xs text-center border border-gray-200 rounded-lg focus:outline-none"
                  />
                  <span className="text-xs text-gray-500">%</span>
                </div>
              </div>
            )}

            {stage.is_fixed && (
              <div className="flex items-start gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <Pin size={10} className="text-slate-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-700">
                  This is the <strong>fixed first stage</strong>. It cannot be moved, deleted, or bypassed — it is always the entry point of the process.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save bar */}
      {dirty && (
        <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Component"
          message={`Delete "${stage.name}"? Any transitions referencing this component will also be removed.`}
          confirmLabel="Delete"
          onConfirm={async () => {
            setDeleting(true);
            try { onDelete(); }
            finally { setDeleting(false); setShowDeleteConfirm(false); }
          }}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={deleting}
          danger
        />
      )}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

type SettingsFormState = {
  name: string;
  description: string;
  lob_id: string | null;
  product_id: string | null;
  form_id: string | null;
  entity_definition_id: string;
  stage_field: string;
};

function SettingsPanel({
  flow, entities, stageCount, saving, setSaving, onFlowChange, showSuccess, showError,
}: {
  flow: ProcessFlow;
  entities: EntityDefinition[];
  stageCount: number;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onFlowChange: (f: ProcessFlow) => void;
  showSuccess: (m: string) => void;
  showError: (m: string) => void;
}) {
  const [form, setForm] = useState<SettingsFormState>({
    name: flow.name, description: flow.description,
    lob_id: flow.lob_id, product_id: flow.product_id,
    form_id: flow.form_id ?? null,
    entity_definition_id: flow.entity_definition_id,
    stage_field: flow.stage_field,
  });
  const [dirty, setDirty] = useState(false);
  const [scope, setScope] = useState<ProcessFlowScope>(flow.product_id ? 'product' : flow.lob_id ? 'lob' : 'global');
  const [lobs, setLobs] = useState<LineOfBusiness[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [formOptions, setFormOptions] = useState<{ form_id: string; name: string; is_default: boolean }[]>([]);

  const set = <K extends keyof SettingsFormState>(k: K, v: SettingsFormState[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  useEffect(() => {
    if (scope === 'lob' && lobs.length === 0) fetchLinesOfBusiness().then(setLobs).catch(() => {});
    if (scope === 'product' && products.length === 0) fetchProducts().then(setProducts).catch(() => {});
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!form.entity_definition_id) { setFormOptions([]); return; }
    fetchFormsForEntity(form.entity_definition_id).then(setFormOptions).catch(() => {});
  }, [form.entity_definition_id]);

  const handleScopeChange = (s: ProcessFlowScope) => {
    setScope(s);
    setForm((p) => ({ ...p, lob_id: s === 'lob' ? p.lob_id : null, product_id: s === 'product' ? p.product_id : null }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProcessFlow(flow.process_flow_id, form);
      onFlowChange(updated);
      setDirty(false);
      showSuccess('Settings saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed');
    } finally { setSaving(false); }
  };

  const handleToggleActive = async () => {
    setSaving(true);
    try {
      const updated = await updateProcessFlow(flow.process_flow_id, { is_active: !flow.is_active });
      onFlowChange(updated);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed');
    } finally { setSaving(false); }
  };

  const SCOPE_OPTIONS: { id: ProcessFlowScope; label: string; icon: React.ReactNode }[] = [
    { id: 'global', label: 'Global', icon: <Globe size={14} className="text-blue-500" /> },
    { id: 'lob', label: 'Line of Business', icon: <Briefcase size={14} className="text-amber-500" /> },
    { id: 'product', label: 'Product', icon: <Package size={14} className="text-emerald-500" /> },
  ];

  const entityChanged = form.entity_definition_id !== flow.entity_definition_id;

  return (
    <div className="p-6 max-w-2xl space-y-6 pb-20">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">General</h3>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Scope</label>
          <div className="grid grid-cols-3 gap-2">
            {SCOPE_OPTIONS.map((opt) => (
              <button key={opt.id} onClick={() => handleScopeChange(opt.id)} disabled={flow.is_system}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all disabled:opacity-50 ${
                  scope === opt.id ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.icon}
                <span className={`text-xs font-semibold ${scope === opt.id ? 'text-blue-700' : 'text-gray-700'}`}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {scope === 'lob' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Line of Business</label>
            <FilterSelect value={form.lob_id ?? ''} onChange={(e) => set('lob_id', e.target.value || null)} disabled={flow.is_system}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none">
              <option value="">Select line of business…</option>
              {lobs.map((l) => <option key={l.lob_id} value={l.lob_id}>{l.name}</option>)}
            </FilterSelect>
          </div>
        )}

        {scope === 'product' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Product</label>
            <FilterSelect value={form.product_id ?? ''} onChange={(e) => set('product_id', e.target.value || null)} disabled={flow.is_system}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none">
              <option value="">Select product…</option>
              {products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}
            </FilterSelect>
          </div>
        )}

        {form.entity_definition_id && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Form</label>
            <FilterSelect value={form.form_id ?? ''} onChange={(e) => set('form_id', e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none">
              <option value="">Use entity default form</option>
              {formOptions.map((f) => <option key={f.form_id} value={f.form_id}>{f.name}{f.is_default ? ' (default)' : ''}</option>)}
            </FilterSelect>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Configuration</h3>
        {flow.is_system ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            <span className="text-sm text-gray-700 font-medium">{entities.find((e) => e.entity_definition_id === form.entity_definition_id)?.display_name ?? '—'}</span>
            <Lock size={12} className="text-gray-400 ml-auto" />
          </div>
        ) : (
          <FilterSelect value={form.entity_definition_id} onChange={(e) => set('entity_definition_id', e.target.value)}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none ${entityChanged ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}>
            <option value="">Select entity…</option>
            {entities.map((ent) => <option key={ent.entity_definition_id} value={ent.entity_definition_id}>{ent.display_name}</option>)}
          </FilterSelect>
        )}

        {entityChanged && stageCount > 0 && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-300 rounded-xl">
            <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">Changing the entity with existing stages may break field references.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-gray-400">Type</p><p className="font-medium text-gray-700">{flow.is_system ? 'System' : 'Custom'}</p></div>
          <div><p className="text-xs text-gray-400">Stages</p><p className="font-medium text-gray-700">{stageCount}</p></div>
          <div><p className="text-xs text-gray-400">Created</p><p className="font-medium text-gray-700">{new Date(flow.created_at).toLocaleDateString()}</p></div>
        </div>
      </div>

      <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl">
        <div>
          <p className="text-sm font-medium text-gray-800">Active</p>
          <p className="text-xs text-gray-400 mt-0.5">When inactive, hidden from end users</p>
        </div>
        <button onClick={handleToggleActive} disabled={saving} className="text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50">
          {flow.is_active ? <ToggleRight size={28} className="text-blue-600" /> : <ToggleLeft size={28} />}
        </button>
      </div>

      {dirty && (
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          <Save size={14} />
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      )}

      {flow.is_system && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">System process flow — entity and stage field are locked.</p>
        </div>
      )}

      <div className="border-t border-gray-200 pt-6">
        <EntityParticipantsPanel flow={flow} entities={entities} />
      </div>
    </div>
  );
}

// ─── Entity Participants Panel ────────────────────────────────────────────────

interface EntityParticipantsPanelProps {
  flow: ProcessFlow;
  entities: EntityDefinition[];
}

type EntityConfigRow = ProcessFlowEntityConfig & {
  _editing?: boolean;
  _formOptions?: { form_id: string; name: string; is_default: boolean }[];
  _relationships?: RelationshipDefinitionWithEntities[];
  _loadingForms?: boolean;
  _loadingRels?: boolean;
};

function EntityParticipantsPanel({ flow, entities }: EntityParticipantsPanelProps) {
  const { showError, showSuccess } = useToast();
  const [configs, setConfigs] = useState<EntityConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingEntity, setAddingEntity] = useState(false);
  const [newEntityId, setNewEntityId] = useState('');
  const [newFormId, setNewFormId] = useState<string | null>(null);
  const [newRelDefId, setNewRelDefId] = useState<string | null>(null);
  const [newRelColumn, setNewRelColumn] = useState('');
  const [newLinkBehavior, setNewLinkBehavior] = useState<LinkBehavior>('create_if_missing');
  const [newForms, setNewForms] = useState<{ form_id: string; name: string; is_default: boolean }[]>([]);
  const [newRels, setNewRels] = useState<RelationshipDefinitionWithEntities[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Partial<ProcessFlowEntityConfigFormData> | null>(null);
  const [editForms, setEditForms] = useState<{ form_id: string; name: string; is_default: boolean }[]>([]);
  const [editRels, setEditRels] = useState<RelationshipDefinitionWithEntities[]>([]);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      let rows = await fetchEntityConfigs(flow.process_flow_id);
      // Ensure primary entity row exists
      if (!rows.find((r) => r.is_primary)) {
        await ensurePrimaryEntityConfig(flow.process_flow_id, flow.entity_definition_id, flow.form_id ?? null);
        rows = await fetchEntityConfigs(flow.process_flow_id);
      }
      setConfigs(rows);
    } catch {
      // noop — graceful
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfigs(); }, [flow.process_flow_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load forms when new entity selected
  useEffect(() => {
    if (!newEntityId) { setNewForms([]); setNewRelDefId(null); setNewRels([]); return; }
    fetchFormsForEntity(newEntityId).then((f) => {
      setNewForms(f);
      const def = f.find((x) => x.is_default);
      setNewFormId(def?.form_id ?? f[0]?.form_id ?? null);
    }).catch(() => setNewForms([]));
    // Load relationships from primary entity to this entity
    if (newEntityId !== flow.entity_definition_id) {
      fetchRelationshipsForEntity(flow.entity_definition_id).then((rels) => {
        const filtered = rels.filter(
          (r) => r.source_entity_id === flow.entity_definition_id && r.target_entity_id === newEntityId && r.relationship_storage_type === 'lookup'
        );
        setNewRels(filtered);
        if (filtered.length > 0) {
          setNewRelDefId(filtered[0].relationship_definition_id);
          setNewRelColumn(filtered[0].lookup_field_physical_column ?? '');
        }
      }).catch(() => setNewRels([]));
    }
  }, [newEntityId, flow.entity_definition_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load forms/rels when editing
  useEffect(() => {
    if (!editingId || !editRow?.entity_definition_id) return;
    fetchFormsForEntity(editRow.entity_definition_id).then(setEditForms).catch(() => setEditForms([]));
    if (editRow.entity_definition_id !== flow.entity_definition_id) {
      fetchRelationshipsForEntity(flow.entity_definition_id).then((rels) => {
        setEditRels(rels.filter(
          (r) => r.source_entity_id === flow.entity_definition_id && r.target_entity_id === editRow.entity_definition_id && r.relationship_storage_type === 'lookup'
        ));
      }).catch(() => setEditRels([]));
    }
  }, [editingId, editRow?.entity_definition_id, flow.entity_definition_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddEntity = async () => {
    if (!newEntityId) return;
    setSaving(true);
    try {
      await upsertEntityConfig(flow.process_flow_id, {
        entity_definition_id: newEntityId,
        form_id: newFormId,
        relationship_definition_id: newRelDefId,
        relationship_column: newRelColumn,
        link_behavior: newLinkBehavior,
        display_order: configs.length,
        is_primary: false,
      });
      showSuccess('Entity added');
      setAddingEntity(false);
      setNewEntityId('');
      await loadConfigs();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to add entity');
    } finally { setSaving(false); }
  };

  const handleSaveEdit = async (configId: string) => {
    if (!editRow) return;
    setSaving(true);
    try {
      const cfg = configs.find((c) => c.config_id === configId);
      if (!cfg) return;
      await upsertEntityConfig(flow.process_flow_id, {
        entity_definition_id: cfg.entity_definition_id,
        form_id: editRow.form_id ?? cfg.form_id,
        relationship_definition_id: editRow.relationship_definition_id ?? cfg.relationship_definition_id,
        relationship_column: editRow.relationship_column ?? cfg.relationship_column,
        link_behavior: (editRow.link_behavior ?? cfg.link_behavior) as LinkBehavior,
        display_order: cfg.display_order,
        is_primary: cfg.is_primary,
      });
      showSuccess('Saved');
      setEditingId(null);
      setEditRow(null);
      await loadConfigs();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (cfg: ProcessFlowEntityConfig) => {
    if (cfg.is_primary) return;
    setDeletingId(cfg.config_id);
    try {
      await deleteEntityConfig(cfg.config_id);
      setConfigs((prev) => prev.filter((c) => c.config_id !== cfg.config_id));
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Delete failed');
    } finally { setDeletingId(null); }
  };

  const usedEntityIds = new Set(configs.map((c) => c.entity_definition_id));
  const availableEntities = entities.filter((e) => !usedEntityIds.has(e.entity_definition_id));

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Link2 size={14} className="text-teal-600 shrink-0" />
            Entity Participants
          </h3>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
            Configure each entity that participates in this process, the form to open, and how records link at runtime.
          </p>
        </div>
        {!addingEntity && availableEntities.length > 0 && (
          <button
            onClick={() => setAddingEntity(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shrink-0 mt-0.5"
          >
            <Plus size={12} /> Add Entity
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-gray-400">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column header strip */}
          {configs.length > 0 && (
            <div className="grid gap-x-3 px-3 pb-1 border-b border-gray-100" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto' }}>
              {(['Entity', 'Form', 'Relationship', 'Link Behavior'] as const).map((h) => (
                <span key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{h}</span>
              ))}
              <span />
            </div>
          )}

          {/* Participant cards */}
          {configs.map((cfg) => {
            const isEditing = editingId === cfg.config_id;
            const entityName = cfg.entity_display_name
              ?? entities.find((e) => e.entity_definition_id === cfg.entity_definition_id)?.display_name
              ?? cfg.entity_definition_id;

            return (
              <div
                key={cfg.config_id}
                className={`rounded-lg border transition-all ${
                  isEditing
                    ? 'border-blue-200 bg-blue-50/40 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                {isEditing ? (
                  /* ── Edit mode: vertical stacked form inside the card ── */
                  <div className="p-3 space-y-3">
                    {/* Entity name (read-only in edit) */}
                    <div className="flex items-center gap-2">
                      {cfg.is_primary && (
                        <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">Primary</span>
                      )}
                      <span className="text-xs font-semibold text-gray-800">{entityName}</span>
                    </div>

                    {/* Edit fields row 1: Form + Link Behavior */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Form</label>
                        <FilterSelect
                          value={editRow?.form_id ?? ''}
                          onChange={(e) => setEditRow((p) => ({ ...p, form_id: e.target.value || null }))}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-blue-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 text-gray-700"
                        >
                          <option value="">Default form</option>
                          {editForms.map((f) => (
                            <option key={f.form_id} value={f.form_id}>{f.name}{f.is_default ? ' ✓' : ''}</option>
                          ))}
                        </FilterSelect>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Link Behavior</label>
                        {cfg.is_primary ? (
                          <p className="text-xs text-gray-400 italic py-1.5">Open Existing</p>
                        ) : (
                          <FilterSelect
                            value={editRow?.link_behavior ?? 'open_existing'}
                            onChange={(e) => setEditRow((p) => ({ ...p, link_behavior: e.target.value as LinkBehavior }))}
                            className="w-full px-2 py-1.5 text-xs bg-white border border-blue-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 text-gray-700"
                          >
                            {LINK_BEHAVIOR_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </FilterSelect>
                        )}
                      </div>
                    </div>

                    {/* Edit fields row 2: Relationship + FK column (non-primary only) */}
                    {!cfg.is_primary && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Relationship</label>
                          <FilterSelect
                            value={editRow?.relationship_definition_id ?? ''}
                            onChange={(e) => {
                              const rel = editRels.find((r) => r.relationship_definition_id === e.target.value);
                              setEditRow((p) => ({
                                ...p,
                                relationship_definition_id: e.target.value || null,
                                relationship_column: rel?.lookup_field_physical_column ?? p?.relationship_column ?? '',
                              }));
                            }}
                            className="w-full px-2 py-1.5 text-xs bg-white border border-blue-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 text-gray-700"
                          >
                            <option value="">None</option>
                            {editRels.map((r) => (
                              <option key={r.relationship_definition_id} value={r.relationship_definition_id}>{r.display_name}</option>
                            ))}
                          </FilterSelect>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Lookup Field</label>
                          <input
                            value={editRow?.relationship_column ?? ''}
                            onChange={(e) => setEditRow((p) => ({ ...p, relationship_column: e.target.value }))}
                            placeholder="FK column"
                            className="w-full px-2 py-1.5 text-xs bg-white border border-blue-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 font-mono text-gray-700 placeholder-gray-300"
                          />
                        </div>
                      </div>
                    )}

                    {/* Save / Cancel */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-blue-100">
                      <button
                        onClick={() => { setEditingId(null); setEditRow(null); }}
                        className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(cfg.config_id)}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {saving ? <Loader2 size={10} className="animate-spin" /> : null}
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Read mode: single horizontal row ── */
                  <div className="grid items-center gap-x-3 px-3 py-2.5" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto' }}>
                    {/* Entity */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      {cfg.is_primary && (
                        <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full shrink-0">Primary</span>
                      )}
                      <span className="text-xs font-medium text-gray-800 truncate">{entityName}</span>
                    </div>

                    {/* Form */}
                    <div className="min-w-0">
                      <span className={`text-xs truncate block ${cfg.form_name ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                        {cfg.form_name ?? 'Default form'}
                      </span>
                    </div>

                    {/* Relationship */}
                    <div className="min-w-0">
                      {cfg.is_primary ? (
                        <span className="text-xs text-gray-400 italic">—</span>
                      ) : (
                        <div className="min-w-0">
                          <span className={`text-xs truncate block ${cfg.relationship_display_name ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                            {cfg.relationship_display_name ?? 'None'}
                          </span>
                          {cfg.relationship_column && (
                            <span className="text-[10px] text-gray-400 font-mono truncate block">{cfg.relationship_column}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Link Behavior */}
                    <div className="min-w-0">
                      {cfg.is_primary ? (
                        <span className="text-xs text-gray-400 italic">Open Existing</span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-md truncate max-w-full">
                          {LINK_BEHAVIOR_OPTIONS.find((o) => o.value === cfg.link_behavior)?.label ?? cfg.link_behavior}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setEditingId(cfg.config_id);
                          setEditRow({
                            entity_definition_id: cfg.entity_definition_id,
                            form_id: cfg.form_id,
                            relationship_definition_id: cfg.relationship_definition_id,
                            relationship_column: cfg.relationship_column,
                            link_behavior: cfg.link_behavior,
                            display_order: cfg.display_order,
                          });
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={12} />
                      </button>
                      {!cfg.is_primary && (
                        <button
                          onClick={() => handleDelete(cfg)}
                          disabled={deletingId === cfg.config_id}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Remove"
                        >
                          {deletingId === cfg.config_id
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Trash2 size={12} />}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add entity form */}
          {addingEntity && (
            <div className="rounded-lg border-2 border-dashed border-teal-300 bg-teal-50/30 p-3 space-y-3">
              <p className="text-xs font-semibold text-teal-800 flex items-center gap-1.5">
                <Plus size={11} /> Add Related Entity
              </p>

              {/* Row 1: Entity + Form */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-1">
                    Entity <span className="text-red-500">*</span>
                  </label>
                  <FilterSelect
                    value={newEntityId}
                    onChange={(e) => { setNewEntityId(e.target.value); setNewRelDefId(null); setNewRelColumn(''); setNewFormId(null); }}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-teal-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-400 text-gray-700"
                  >
                    <option value="">Select entity…</option>
                    {availableEntities.map((e) => (
                      <option key={e.entity_definition_id} value={e.entity_definition_id}>{e.display_name}</option>
                    ))}
                  </FilterSelect>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Form</label>
                  <FilterSelect
                    value={newFormId ?? ''}
                    onChange={(e) => setNewFormId(e.target.value || null)}
                    disabled={newForms.length === 0}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-teal-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-400 disabled:bg-gray-50 disabled:text-gray-400 text-gray-700"
                  >
                    <option value="">Default main form</option>
                    {newForms.map((f) => (
                      <option key={f.form_id} value={f.form_id}>{f.name}{f.is_default ? ' (default)' : ''}</option>
                    ))}
                  </FilterSelect>
                </div>
              </div>

              {/* Row 2: Relationship + FK (only when non-primary) */}
              {newEntityId && newEntityId !== flow.entity_definition_id && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Relationship</label>
                    <FilterSelect
                      value={newRelDefId ?? ''}
                      onChange={(e) => {
                        const rel = newRels.find((r) => r.relationship_definition_id === e.target.value);
                        setNewRelDefId(e.target.value || null);
                        setNewRelColumn(rel?.lookup_field_physical_column ?? '');
                      }}
                      className="w-full px-2 py-1.5 text-xs bg-white border border-teal-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-400 text-gray-700"
                    >
                      <option value="">None (standalone)</option>
                      {newRels.map((r) => (
                        <option key={r.relationship_definition_id} value={r.relationship_definition_id}>{r.display_name}</option>
                      ))}
                    </FilterSelect>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Lookup Field</label>
                    <input
                      value={newRelColumn}
                      onChange={(e) => setNewRelColumn(e.target.value)}
                      placeholder="e.g. originating_lead_id"
                      className="w-full px-2 py-1.5 text-xs bg-white border border-teal-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono text-gray-700 placeholder-gray-300"
                    />
                  </div>
                </div>
              )}

              {/* Link Behavior — compact inline selector */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Link Behavior</label>
                <div className="grid grid-cols-1 gap-1">
                  {LINK_BEHAVIOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setNewLinkBehavior(opt.value)}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md border text-left transition-all ${
                        newLinkBehavior === opt.value
                          ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-200'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${newLinkBehavior === opt.value ? 'border-teal-500 bg-teal-500' : 'border-gray-300'}`}>
                        {newLinkBehavior === opt.value && <div className="w-1 h-1 rounded-full bg-white" />}
                      </div>
                      <div className="min-w-0 flex items-baseline gap-2">
                        <span className={`text-xs font-semibold shrink-0 ${newLinkBehavior === opt.value ? 'text-teal-800' : 'text-gray-700'}`}>{opt.label}</span>
                        <span className="text-[10px] text-gray-400 truncate">{opt.description}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-teal-100">
                <button
                  onClick={() => { setAddingEntity(false); setNewEntityId(''); setNewFormId(null); setNewRelDefId(null); setNewRelColumn(''); }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEntity}
                  disabled={!newEntityId || saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                  {saving ? 'Adding…' : 'Add Entity'}
                </button>
              </div>
            </div>
          )}

          {configs.length === 0 && !addingEntity && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-400">
              <Link2 size={13} className="shrink-0" />
              No entity participants configured yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
