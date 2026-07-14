import { uuid } from '../../../lib/uuid';
import { useState, useEffect } from 'react';
import {
  Plus, Trash2, Copy, ChevronUp, ChevronDown, ChevronRight, GripVertical, Sparkles,
} from 'lucide-react';
import type {
  DashboardVisual, FunnelStage, StageMeasure, StageInteraction, StageDisplayMode, StageLayout, FilterOp,
  NumberFormat, ThemeConfig, VisualFilter, StageSemanticMap,
} from '../types/dashboard';
import type { EntityDefinition } from '../../../types/entity';
import type { FieldDefinition } from '../../../types/field';
import { fetchFieldsForEntity } from '../../../services/fieldService';
import { getFilterFieldInfo, type FilterFieldInfo } from '../visuals/labelResolver';
import { customKey } from '../visuals/colorConfig';
import { STAGE_ICON_NAMES } from '../visuals/stageIcons';
import FilterSelect from '../../../app/components/FilterSelect';
import ColorPicker from './ColorPicker';
import { Section, ColorRow } from './FormatColorPanel';

const DISPLAY_MODES: { value: StageDisplayMode; label: string }[] = [
  { value: 'simple', label: 'Simple total' },
  { value: 'breakdown', label: 'Total + breakdown' },
  { value: 'breakdown_only', label: 'Breakdown only' },
];
const STAGE_LAYOUTS: { value: StageLayout; label: string }[] = [
  { value: 'detailed', label: 'Detailed (bars)' },
  { value: 'compact', label: 'Compact' },
  { value: 'auto', label: 'Auto' },
];

const inputCls = 'w-full px-2 py-1.5 text-[12px] rounded border border-slate-700 bg-slate-900 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500';
const smallCls = 'px-1 py-1 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-200';

const MEASURES: { value: StageMeasure; label: string }[] = [
  { value: 'count', label: 'Count' },
  { value: 'count_distinct', label: 'Count distinct' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'custom', label: 'Custom measure' },
];
const STAGE_OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'starts_with', 'is_empty', 'is_not_empty', 'in'];

// Example funnel: Campaign budget/spend → Lead → Opportunity → Account → Revenue.
const EXAMPLE_STAGES: (Omit<FunnelStage, 'id' | 'entity'> & { match: string[] })[] = [
  { label: 'Budget', match: ['campaign'], measure: 'sum', color: '#ffffff', numberFormat: 'currency', icon: 'Wallet' },
  { label: 'Marketing Spend', match: ['campaign'], measure: 'sum', color: '#f97316', numberFormat: 'currency', icon: 'Megaphone' },
  { label: 'Leads', match: ['lead'], measure: 'count', color: '#3b82f6', icon: 'Users' },
  { label: 'Opportunities', match: ['opportunit', 'deal'], measure: 'count', color: '#eab308', icon: 'Target' },
  { label: 'Accounts', match: ['account'], measure: 'count', color: '#22c55e', icon: 'Building2' },
  { label: 'Revenue', match: ['invoice', 'opportunit'], measure: 'sum', color: '#a855f7', numberFormat: 'currency', icon: 'DollarSign' },
];

type SetData = (patch: Partial<DashboardVisual['data_config']>) => void;
type SetFmt = (patch: Partial<DashboardVisual['format_config']>) => void;

// ── Data tab: the Stages editor ──────────────────────────────────────────────
export function FunnelStageData({ visual, entities, theme, siblings, setData }: {
  visual: DashboardVisual; entities: EntityDefinition[]; theme: ThemeConfig;
  siblings?: DashboardVisual[]; setData: SetData;
}) {
  const stages = visual.data_config.stages ?? [];
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Global filter sources to suggest in semantic mapping — bound slicer fields.
  const slicerSources = [...new Set((siblings ?? [])
    .map((v) => v.data_config.dateSlicer?.dateField)
    .filter((f): f is string => !!f))];

  const writeStages = (next: FunnelStage[]) => setData({ stages: next });
  const update = (i: number, patch: Partial<FunnelStage>) =>
    writeStages(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => writeStages([...stages, {
    id: uuid(), label: `Stage ${stages.length + 1}`, measure: 'count', interaction: 'filter',
  }]);
  const duplicate = (i: number) => {
    const copy: FunnelStage = { ...stages[i], id: uuid(), label: `${stages[i].label} (copy)` };
    writeStages([...stages.slice(0, i + 1), copy, ...stages.slice(i + 1)]);
  };
  const remove = (i: number) => writeStages(stages.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    writeStages(next);
  };
  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const next = [...stages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    writeStages(next);
  };
  const seedExamples = () => {
    const resolve = (matchers: string[]): string | undefined => {
      const e = entities.find((en) => matchers.some((m) =>
        en.logical_name.toLowerCase().includes(m) || en.display_name.toLowerCase().includes(m)));
      return e?.logical_name;
    };
    writeStages(EXAMPLE_STAGES.map(({ match, ...rest }) => ({
      ...rest, id: uuid(), entity: resolve(match), interaction: 'filter' as StageInteraction,
    })));
  };

  return (
    <div className="space-y-2 border-t border-slate-700/60 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-slate-300 text-[11px] font-semibold uppercase tracking-wide">Stages</span>
        <div className="flex items-center gap-1">
          {!stages.length && (
            <button onClick={seedExamples} title="Insert the example sales funnel"
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-slate-700 hover:bg-slate-700 text-slate-300">
              <Sparkles size={11} /> Example
            </button>
          )}
          <button onClick={add} title="Add stage" className="text-blue-400 hover:text-blue-300"><Plus size={14} /></button>
        </div>
      </div>

      {!stages.length && (
        <p className="text-[10px] text-slate-500 py-1">
          No stages yet. Add a stage (or insert the example funnel) — each stage can target a different entity.
        </p>
      )}

      <div className="space-y-1.5">
        {stages.map((s, i) => (
          <StageCard
            key={s.id} index={i} total={stages.length} stage={s} entities={entities} theme={theme}
            slicerSources={slicerSources}
            onUpdate={(patch) => update(i, patch)}
            onDuplicate={() => duplicate(i)} onRemove={() => remove(i)} onMove={(d) => move(i, d)}
            dragging={dragIdx === i}
            onDragStart={() => setDragIdx(i)}
            onDragEnd={() => setDragIdx(null)}
            onDropOn={() => { if (dragIdx != null) reorder(dragIdx, i); setDragIdx(null); }}
          />
        ))}
      </div>
    </div>
  );
}

// ── one stage ────────────────────────────────────────────────────────────────
function StageCard({
  index, total, stage, entities, theme, slicerSources,
  onUpdate, onDuplicate, onRemove, onMove, dragging, onDragStart, onDragEnd, onDropOn,
}: {
  index: number; total: number; stage: FunnelStage; entities: EntityDefinition[]; theme: ThemeConfig;
  slicerSources: string[];
  onUpdate: (patch: Partial<FunnelStage>) => void; onDuplicate: () => void; onRemove: () => void;
  onMove: (dir: -1 | 1) => void; dragging: boolean;
  onDragStart: () => void; onDragEnd: () => void; onDropOn: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const entity = entities.find((e) => e.logical_name === stage.entity || e.physical_table_name === stage.entity);

  useEffect(() => {
    if (!entity) { setFields([]); return; }
    let alive = true;
    fetchFieldsForEntity(entity.entity_definition_id).then((f) => { if (alive) setFields(f); }).catch(() => { if (alive) setFields([]); });
    return () => { alive = false; };
  }, [entity]);

  const measure = stage.measure ?? 'count';
  const needsField = ['sum', 'avg', 'min', 'max'].includes(measure);

  return (
    <div
      className={`rounded border ${dragging ? 'border-blue-500 opacity-60' : 'border-slate-700'} bg-slate-800/40`}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); onDropOn(); }}
    >
      {/* header */}
      <div className="flex items-center gap-1 px-1.5 py-1">
        <span
          draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
          className="cursor-grab text-slate-500 hover:text-slate-300" title="Drag to reorder">
          <GripVertical size={13} />
        </span>
        <span className="w-3.5 h-3.5 rounded-sm shrink-0 border border-slate-600" style={{ background: stage.color || theme.primaryAccent }} />
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 flex-1 min-w-0 text-left text-[12px] text-slate-200">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="truncate">{stage.label || `Stage ${index + 1}`}</span>
        </button>
        <button onClick={() => onMove(-1)} disabled={index === 0} title="Move up/left" className="text-slate-500 hover:text-slate-200 disabled:opacity-30"><ChevronUp size={13} /></button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} title="Move down/right" className="text-slate-500 hover:text-slate-200 disabled:opacity-30"><ChevronDown size={13} /></button>
        <button onClick={onDuplicate} title="Duplicate stage" className="text-slate-500 hover:text-slate-200"><Copy size={12} /></button>
        <button onClick={onRemove} title="Delete stage" className="text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
      </div>

      {open && (
        <div className="px-2 pb-2 pt-0.5 space-y-2 border-t border-slate-700/50">
          <Field label="Stage label">
            <input value={stage.label} onChange={(e) => onUpdate({ label: e.target.value })} className={inputCls} />
          </Field>

          <Field label="Entity">
            <FilterSelect value={stage.entity ?? ''} onChange={(e) => onUpdate({ entity: e.target.value || undefined, field: undefined, filters: [], semanticMap: [] })} className={inputCls}>
              <option value="">— Select —</option>
              {entities.map((en) => <option key={en.entity_definition_id} value={en.logical_name}>{en.display_name}</option>)}
            </FilterSelect>
          </Field>

          <Field label="Measure">
            <div className="flex gap-1.5">
              <FilterSelect value={measure} onChange={(e) => onUpdate({ measure: e.target.value as StageMeasure })} className={inputCls}>
                {MEASURES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </FilterSelect>
              {needsField && (
                <FilterSelect value={stage.field ?? ''} onChange={(e) => onUpdate({ field: e.target.value || undefined })} className={inputCls}>
                  <option value="">field…</option>
                  {fields.map((f) => <option key={f.field_definition_id} value={f.physical_column_name}>{f.display_name}</option>)}
                </FilterSelect>
              )}
            </div>
          </Field>

          {measure === 'custom' && (
            <Field label="Custom measure name">
              <input value={stage.customMeasure ?? ''} onChange={(e) => onUpdate({ customMeasure: e.target.value })} placeholder="dashboard measure" className={inputCls} />
            </Field>
          )}

          <Field label="Total label">
            <input value={stage.totalLabel ?? ''} onChange={(e) => onUpdate({ totalLabel: e.target.value || undefined })} placeholder="e.g. Total Prospects" className={inputCls} />
          </Field>

          <Field label="Display mode">
            <FilterSelect value={stage.displayMode ?? 'simple'} onChange={(e) => onUpdate({ displayMode: e.target.value as StageDisplayMode })} className={inputCls}>
              {DISPLAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </FilterSelect>
          </Field>

          <StageBreakdownControls stage={stage} fields={fields} entityName={stage.entity} theme={theme} onUpdate={onUpdate} />

          <StageFilterRows entityName={stage.entity} fields={fields} filters={stage.filters ?? []} onChange={(filters) => onUpdate({ filters })} />

          <SemanticMapRows fields={fields} sources={slicerSources} maps={stage.semanticMap ?? []} onChange={(semanticMap) => onUpdate({ semanticMap })} />

          <div className="grid grid-cols-2 gap-2">
            <Field label="Sort">
              <FilterSelect value={stage.sort ?? 'none'} onChange={(e) => onUpdate({ sort: e.target.value as 'asc' | 'desc' | 'none' })} className={inputCls}>
                <option value="none">None</option>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </FilterSelect>
            </Field>
            <Field label="Value format">
              <FilterSelect value={stage.numberFormat ?? ''} onChange={(e) => onUpdate({ numberFormat: (e.target.value || undefined) as NumberFormat | undefined })} className={inputCls}>
                <option value="">Auto</option>
                {(['number', 'currency', 'percentage', 'compact'] as NumberFormat[]).map((n) => <option key={n} value={n}>{n}</option>)}
              </FilterSelect>
            </Field>
          </div>

          <Field label="Subtitle (optional)">
            <input value={stage.subtitle ?? ''} onChange={(e) => onUpdate({ subtitle: e.target.value || undefined })} className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Icon (optional)">
              <FilterSelect value={stage.icon ?? ''} onChange={(e) => onUpdate({ icon: e.target.value || undefined })} className={inputCls}>
                <option value="">— None —</option>
                {STAGE_ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              </FilterSelect>
            </Field>
            <Field label="Stage color">
              <ColorPicker value={stage.color} onChange={(v) => onUpdate({ color: v })} theme={theme} placeholder="Theme" />
            </Field>
          </div>

          <Field label="Click interaction">
            <FilterSelect value={stage.interaction ?? 'filter'} onChange={(e) => onUpdate({ interaction: e.target.value as StageInteraction })} className={inputCls}>
              <option value="filter">Filter dashboard</option>
              <option value="drillthrough">Drill-through</option>
              <option value="none">None</option>
            </FilterSelect>
          </Field>

          {stage.interaction === 'drillthrough' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Drill target type">
                <FilterSelect value={stage.drillThrough?.type ?? 'entity_list'} onChange={(e) => onUpdate({ drillThrough: { ...stage.drillThrough, type: e.target.value as 'entity_list' | 'record' | 'page' } })} className={inputCls}>
                  <option value="entity_list">Entity records</option>
                  <option value="record">Specific record</option>
                  <option value="page">Dashboard page</option>
                </FilterSelect>
              </Field>
              <Field label="Target">
                <input value={stage.drillThrough?.target ?? ''} onChange={(e) => onUpdate({ drillThrough: { type: stage.drillThrough?.type ?? 'entity_list', target: e.target.value || undefined } })} className={inputCls} />
              </Field>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── per-stage Total + Breakdown controls (mirrors the KPI card) ──────────────
function StageBreakdownControls({ stage, fields, entityName, theme, onUpdate }: {
  stage: FunnelStage; fields: FieldDefinition[]; entityName?: string; theme: ThemeConfig;
  onUpdate: (patch: Partial<FunnelStage>) => void;
}) {
  const mode = stage.displayMode ?? 'simple';
  if (mode === 'simple') return null;

  return (
    <div className="space-y-2 rounded border border-slate-700/60 p-2">
      <span className="text-slate-400 text-[10px] font-medium uppercase tracking-wide">Breakdown</span>

      <Field label="Breakdown field">
        <FilterSelect value={stage.breakdownField ?? ''} onChange={(e) => onUpdate({ breakdownField: e.target.value || undefined })} className={inputCls}>
          <option value="">— Select —</option>
          {fields.map((fd) => <option key={fd.field_definition_id} value={fd.physical_column_name}>{fd.display_name}</option>)}
        </FilterSelect>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Max rows">
          <input type="number" min={1} max={50} value={stage.breakdownLimit ?? 10}
            onChange={(e) => onUpdate({ breakdownLimit: Number(e.target.value) })} className={inputCls} />
        </Field>
        <Field label="Sort breakdown by">
          <FilterSelect value={stage.breakdownSort ?? 'value_desc'} onChange={(e) => onUpdate({ breakdownSort: e.target.value as 'value_desc' | 'value_asc' | 'label' })} className={inputCls}>
            <option value="value_desc">Value ↓</option>
            <option value="value_asc">Value ↑</option>
            <option value="label">Label</option>
          </FilterSelect>
        </Field>
      </div>

      <Field label="Layout">
        <FilterSelect value={stage.stageLayout ?? 'detailed'} onChange={(e) => onUpdate({ stageLayout: e.target.value as StageLayout })} className={inputCls}>
          {STAGE_LAYOUTS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </FilterSelect>
      </Field>

      <StageConversionRow stage={stage} entityName={entityName} onUpdate={onUpdate} />

      <Toggle label="Show percentages" checked={!!stage.showPercentages} onChange={(v) => onUpdate({ showPercentages: v })} />
      <Toggle label="Show progress bars" checked={stage.showProgressBars !== false} onChange={(v) => onUpdate({ showProgressBars: v })} />
      <Toggle label="Show zero values" checked={!!stage.showZeroValues} onChange={(v) => onUpdate({ showZeroValues: v })} />
      <Toggle label="Include empty / unassigned" checked={!!stage.showEmptyValues} onChange={(v) => onUpdate({ showEmptyValues: v })} />
      <Toggle label="Enable click filtering" checked={stage.enableClickFilter !== false} onChange={(v) => onUpdate({ enableClickFilter: v })} />
      <Toggle label="Enable multi-select" checked={stage.enableMultiSelect !== false} onChange={(v) => onUpdate({ enableMultiSelect: v })} />

      <StageCustomRows stage={stage} fields={fields} entityName={entityName} onUpdate={onUpdate} />
      <StageValueColors stage={stage} entityName={entityName} theme={theme} onUpdate={onUpdate} />
    </div>
  );
}

// The breakdown value whose records count as "advanced to the next stage" — the
// connector between this card and the next shows (that value's count ÷ stage total),
// i.e. a real pipeline conversion rate (always ≤ 100%). Loads the breakdown field's
// options so the user picks a label; stores the stable raw value.
function StageConversionRow({ stage, entityName, onUpdate }: {
  stage: FunnelStage; entityName?: string; onUpdate: (patch: Partial<FunnelStage>) => void;
}) {
  const [info, setInfo] = useState<FilterFieldInfo | null>(null);
  const field = stage.breakdownField;

  useEffect(() => {
    if (!entityName || !field) { setInfo(null); return; }
    let cancelled = false;
    getFilterFieldInfo(entityName, field)
      .then((fi) => { if (!cancelled) setInfo(fi); })
      .catch(() => { if (!cancelled) setInfo({ kind: 'text', options: [] }); });
    return () => { cancelled = true; };
  }, [entityName, field]);

  const opts = info && info.kind !== 'text' ? info.options : [];
  return (
    <Field label="Conversion value (counts as advanced to next stage)">
      {opts.length ? (
        <FilterSelect value={stage.conversionValue ?? ''} onChange={(e) => onUpdate({ conversionValue: e.target.value || undefined })} className={inputCls}>
          <option value="">— None (use count ratio) —</option>
          {opts.map((o) => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
        </FilterSelect>
      ) : (
        <input value={stage.conversionValue ?? ''} onChange={(e) => onUpdate({ conversionValue: e.target.value || undefined })}
          placeholder="breakdown value or label" className={inputCls} />
      )}
    </Field>
  );
}

// Custom filtered breakdown rows (e.g. "Converted to Lead" = status_reason eq X).
function StageCustomRows({ stage, fields, entityName, onUpdate }: {
  stage: FunnelStage; fields: FieldDefinition[]; entityName?: string;
  onUpdate: (patch: Partial<FunnelStage>) => void;
}) {
  const items = stage.customBreakdownItems ?? [];
  const [info, setInfo] = useState<Record<string, FilterFieldInfo>>({});
  const usedFields = items.map((it) => it.filters?.[0]?.field).filter(Boolean) as string[];

  useEffect(() => {
    if (!entityName) return;
    const needed = [...new Set(usedFields.filter((c) => c && !(c in info)))];
    if (!needed.length) return;
    let cancelled = false;
    Promise.all(needed.map((c) => getFilterFieldInfo(entityName, c).then((fi) => [c, fi] as const).catch(() => [c, { kind: 'text', options: [] } as FilterFieldInfo] as const)))
      .then((pairs) => { if (!cancelled) setInfo((p) => ({ ...p, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityName, usedFields.join(',')]);

  const update = (i: number, patch: Partial<typeof items[number]>) => {
    const n = [...items]; n[i] = { ...items[i], ...patch }; onUpdate({ customBreakdownItems: n });
  };
  const updateFilter = (i: number, fpatch: Partial<{ field: string; op: FilterOp; value: unknown }>) => {
    const cur = items[i].filters?.[0] ?? { field: fields[0]?.physical_column_name ?? '', op: 'eq' as FilterOp, value: '' };
    update(i, { filters: [{ ...cur, ...fpatch }] });
  };

  return (
    <div className="border-t border-slate-700/50 pt-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-slate-400 text-[10px] font-medium uppercase tracking-wide">Custom rows</span>
        <button onClick={() => onUpdate({ customBreakdownItems: [...items, { id: uuid(), label: '', filters: [{ field: fields[0]?.physical_column_name ?? '', op: 'eq', value: '' }] }] })}
          className="text-blue-400 hover:text-blue-300"><Plus size={12} /></button>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => {
          const f = it.filters?.[0] ?? { field: '', op: 'eq' as FilterOp, value: '' };
          const fi = info[f.field];
          const hasOpts = fi && fi.kind !== 'text' && fi.options.length > 0;
          return (
            <div key={i} className="rounded border border-slate-700 p-1.5 space-y-1">
              <div className="flex gap-1 items-center">
                <input value={it.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Row label (e.g. Converted to Lead)" className={inputCls} />
                <button onClick={() => onUpdate({ customBreakdownItems: items.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
              </div>
              <div className="flex gap-1 items-center">
                <FilterSelect value={f.field} onChange={(e) => updateFilter(i, { field: e.target.value, value: '' })} className={inputCls}>
                  {fields.map((fd) => <option key={fd.field_definition_id} value={fd.physical_column_name}>{fd.display_name}</option>)}
                </FilterSelect>
                <FilterSelect value={f.op} onChange={(e) => updateFilter(i, { op: e.target.value as FilterOp })} className={`w-16 ${smallCls}`}>
                  {STAGE_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                </FilterSelect>
                {hasOpts ? (
                  <FilterSelect value={String(f.value ?? '')} onChange={(e) => updateFilter(i, { value: e.target.value })} className={`w-24 ${smallCls}`}>
                    <option value="">—</option>
                    {fi!.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </FilterSelect>
                ) : (
                  <input value={String(f.value ?? '')} onChange={(e) => updateFilter(i, { value: e.target.value })} className={`w-24 ${smallCls}`} />
                )}
              </div>
            </div>
          );
        })}
        {!items.length && <p className="text-[10px] text-slate-500">No custom rows.</p>}
      </div>
    </div>
  );
}

// Per-breakdown-value colours, keyed by the STABLE raw option id (+ custom rows).
function StageValueColors({ stage, entityName, theme, onUpdate }: {
  stage: FunnelStage; entityName?: string; theme: ThemeConfig;
  onUpdate: (patch: Partial<FunnelStage>) => void;
}) {
  const [info, setInfo] = useState<FilterFieldInfo | null>(null);
  const field = stage.breakdownField;

  useEffect(() => {
    if (!entityName || !field) { setInfo(null); return; }
    let cancelled = false;
    getFilterFieldInfo(entityName, field)
      .then((fi) => { if (!cancelled) setInfo(fi); })
      .catch(() => { if (!cancelled) setInfo({ kind: 'text', options: [] }); });
    return () => { cancelled = true; };
  }, [entityName, field]);

  const keys: { key: string; label: string }[] = [
    ...((info && info.kind !== 'text') ? info.options.map((o) => ({ key: String(o.value), label: o.label })) : []),
    ...(stage.customBreakdownItems ?? []).map((it) => ({ key: customKey(it), label: it.label || '(custom)' })),
  ];

  const setColor = (key: string, v: string | undefined) => {
    const next = { ...(stage.colorByValue ?? {}) };
    if (v) next[key] = v; else delete next[key];
    onUpdate({ colorByValue: next });
  };

  if (!keys.length) {
    return <p className="text-[10px] text-slate-500 border-t border-slate-700/50 pt-1.5">Per-value colours appear once the breakdown field has options.</p>;
  }

  return (
    <div className="border-t border-slate-700/50 pt-1.5">
      <span className="text-slate-400 text-[10px] font-medium uppercase tracking-wide">Breakdown colours</span>
      <div className="space-y-1 mt-1">
        {keys.map((k) => (
          <ColorRow key={k.key} label={k.label} value={stage.colorByValue?.[k.key]} onChange={(v) => setColor(k.key, v)} theme={theme} />
        ))}
      </div>
    </div>
  );
}

// ── per-stage filters (label-driven values) ──────────────────────────────────
function StageFilterRows({ entityName, fields, filters, onChange }: {
  entityName?: string; fields: FieldDefinition[]; filters: VisualFilter[];
  onChange: (filters: VisualFilter[]) => void;
}) {
  const [info, setInfo] = useState<Record<string, FilterFieldInfo>>({});
  useEffect(() => {
    if (!entityName) return;
    const needed = [...new Set(filters.map((f) => f.field).filter((c) => c && !(c in info)))];
    if (!needed.length) return;
    let cancelled = false;
    Promise.all(needed.map((c) => getFilterFieldInfo(entityName, c).then((fi) => [c, fi] as const).catch(() => [c, { kind: 'text', options: [] } as FilterFieldInfo] as const)))
      .then((pairs) => { if (!cancelled) setInfo((p) => ({ ...p, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityName, filters.map((f) => f.field).join(',')]);

  const update = (i: number, patch: Partial<VisualFilter>) =>
    onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-slate-400 text-[10px] font-medium uppercase tracking-wide">Filters</span>
        <button onClick={() => onChange([...filters, { field: fields[0]?.physical_column_name ?? '', op: 'eq', value: '' }])}
          className="text-blue-400 hover:text-blue-300" title="Add filter"><Plus size={12} /></button>
      </div>
      <div className="space-y-1.5">
        {filters.map((f, i) => {
          const fi = info[f.field];
          const hasOpts = fi && fi.kind !== 'text' && fi.options.length > 0;
          const needsValue = !['is_empty', 'is_not_empty'].includes(f.op);
          return (
            <div key={i} className="flex gap-1 items-center">
              <FilterSelect value={f.field} onChange={(e) => update(i, { field: e.target.value, value: '' })} className={inputCls}>
                {fields.map((fd) => <option key={fd.field_definition_id} value={fd.physical_column_name}>{fd.display_name}</option>)}
              </FilterSelect>
              <FilterSelect value={f.op} onChange={(e) => update(i, { op: e.target.value as FilterOp })} className={`w-16 ${smallCls}`}>
                {STAGE_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
              </FilterSelect>
              {needsValue && (hasOpts ? (
                <FilterSelect value={String(f.value ?? '')} onChange={(e) => update(i, { value: e.target.value })} className={`w-24 ${smallCls}`}>
                  <option value="">—</option>
                  {fi!.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </FilterSelect>
              ) : (
                <input value={String(f.value ?? '')} onChange={(e) => update(i, { value: e.target.value })} className={`w-24 ${smallCls}`} />
              ))}
              <button onClick={() => onChange(filters.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-400"><Trash2 size={11} /></button>
            </div>
          );
        })}
        {!filters.length && <p className="text-[10px] text-slate-500">No stage filters.</p>}
      </div>
    </div>
  );
}

// ── semantic mapping (global filter field → this stage's column) ─────────────
function SemanticMapRows({ fields, sources, maps, onChange }: {
  fields: FieldDefinition[]; sources: string[]; maps: StageSemanticMap[];
  onChange: (maps: StageSemanticMap[]) => void;
}) {
  const update = (i: number, patch: Partial<StageSemanticMap>) =>
    onChange(maps.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-slate-400 text-[10px] font-medium uppercase tracking-wide" title="Map a dashboard-wide filter onto this stage's own column">Semantic filter mapping</span>
        <button onClick={() => onChange([...maps, { source: sources[0] ?? '', target: fields[0]?.physical_column_name ?? '' }])}
          className="text-blue-400 hover:text-blue-300" title="Add mapping"><Plus size={12} /></button>
      </div>
      <div className="space-y-1.5">
        {maps.map((m, i) => (
          <div key={i} className="flex gap-1 items-center">
            <input list="funnel-slicer-sources" value={m.source} onChange={(e) => update(i, { source: e.target.value })} placeholder="global field" className={`flex-1 ${smallCls}`} />
            <span className="text-slate-500 text-[10px]">→</span>
            <FilterSelect value={m.target} onChange={(e) => update(i, { target: e.target.value })} className={`flex-1 ${smallCls}`}>
              <option value="">column…</option>
              {fields.map((fd) => <option key={fd.field_definition_id} value={fd.physical_column_name}>{fd.display_name}</option>)}
            </FilterSelect>
            <button onClick={() => onChange(maps.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-400"><Trash2 size={11} /></button>
          </div>
        ))}
        {!maps.length && <p className="text-[10px] text-slate-500">Auto-applies global filters whose column also exists on this entity.</p>}
      </div>
      <datalist id="funnel-slicer-sources">
        {sources.map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}

// ── Format tab ───────────────────────────────────────────────────────────────
export function FunnelStageFormat({ visual, theme, setFmt }: {
  visual: DashboardVisual; theme: ThemeConfig; setFmt: SetFmt;
}) {
  const fmt = visual.format_config;
  return (
    <>
      <Toggle label="Show header" checked={fmt.showHeader !== false} onChange={(v) => setFmt({ showHeader: v })} />

      <Section title="Layout" defaultOpen>
        <Field label="Orientation">
          <FilterSelect value={fmt.funnelLayout ?? 'horizontal'} onChange={(e) => setFmt({ funnelLayout: e.target.value as 'horizontal' | 'vertical' })} className={inputCls}>
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </FilterSelect>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Card width (px)"><NumInput value={fmt.stageCardWidth} placeholder="auto" min={40} max={600} onChange={(n) => setFmt({ stageCardWidth: n })} /></Field>
          <Field label="Card height (px)"><NumInput value={fmt.stageCardHeight} placeholder="auto" min={30} max={400} onChange={(n) => setFmt({ stageCardHeight: n })} /></Field>
          <Field label="Card gap (px)"><NumInput value={fmt.stageGap ?? 8} min={0} max={48} onChange={(n) => setFmt({ stageGap: n ?? 0 })} /></Field>
          <Field label="Border radius"><NumInput value={fmt.borderRadius ?? 10} min={0} max={32} onChange={(n) => setFmt({ borderRadius: n ?? 0 })} /></Field>
        </div>
        <Toggle label="Compact mode" checked={!!fmt.compactStages} onChange={(v) => setFmt({ compactStages: v })} />
        <Toggle label="Wrap stages" checked={!!fmt.wrapStages} onChange={(v) => setFmt({ wrapStages: v })} />
        <Toggle label="Stretch cards to fill width" checked={!!fmt.fitStages} onChange={(v) => setFmt({ fitStages: v })} />
        <Toggle label="Scroll horizontally when overflowing" checked={fmt.scrollStages !== false} onChange={(v) => setFmt({ scrollStages: v })} />
      </Section>

      <Section title="Connectors & conversion" defaultOpen>
        <Toggle label="Show arrows" checked={fmt.showArrows !== false} onChange={(v) => setFmt({ showArrows: v })} />
        <Field label="Arrow size (px)"><NumInput value={fmt.arrowSize ?? 18} min={8} max={48} onChange={(n) => setFmt({ arrowSize: n ?? 18 })} /></Field>
        <Toggle label="Show conversion rate" checked={fmt.showConversion !== false} onChange={(v) => setFmt({ showConversion: v })} />
        <Field label="Conversion decimals"><NumInput value={fmt.conversionDecimals ?? 0} min={0} max={4} onChange={(n) => setFmt({ conversionDecimals: n ?? 0 })} /></Field>
        <Toggle label="Show subtitle" checked={fmt.showStageSubtitle !== false} onChange={(v) => setFmt({ showStageSubtitle: v })} />
      </Section>

      <Section title="Number format" defaultOpen>
        <Field label="Default value format">
          <FilterSelect value={fmt.numberFormat ?? 'number'} onChange={(e) => setFmt({ numberFormat: e.target.value as NumberFormat })} className={inputCls}>
            {(['number', 'compact', 'currency', 'percentage'] as NumberFormat[]).map((n) => <option key={n} value={n}>{n}</option>)}
          </FilterSelect>
        </Field>
        <Field label="Decimals"><NumInput value={fmt.decimals ?? 0} min={0} max={6} onChange={(n) => setFmt({ decimals: n ?? 0 })} /></Field>
        <Field label="Empty message">
          <input value={fmt.emptyMessage ?? ''} onChange={(e) => setFmt({ emptyMessage: e.target.value })} className={inputCls} />
        </Field>
      </Section>

      <Section title="Colours" defaultOpen>
        <ColorRow label="Background" value={fmt.background} onChange={(v) => setFmt({ background: v })} theme={theme} />
        <ColorRow label="Border color" value={fmt.borderColor} onChange={(v) => setFmt({ borderColor: v })} theme={theme} />
        <ColorRow label="Accent (default)" value={fmt.accentColor} onChange={(v) => setFmt({ accentColor: v })} theme={theme} />
        <ColorRow label="Label / text color" value={fmt.secondaryTextColor} onChange={(v) => setFmt({ secondaryTextColor: v })} theme={theme} />
        <ColorRow label="Value color" value={fmt.valueColor} onChange={(v) => setFmt({ valueColor: v })} theme={theme} />
        <ColorRow label="Subtitle color" value={fmt.subtitleColor} onChange={(v) => setFmt({ subtitleColor: v })} theme={theme} />
        <ColorRow label="Icon color" value={fmt.iconColor} onChange={(v) => setFmt({ iconColor: v })} theme={theme} />
        <ColorRow label="Arrow color" value={fmt.arrowColor} onChange={(v) => setFmt({ arrowColor: v })} theme={theme} />
        <ColorRow label="Selected color" value={fmt.selectedColor} onChange={(v) => setFmt({ selectedColor: v })} theme={theme} />
        <ColorRow label="Empty-state color" value={fmt.emptyStateColor} onChange={(v) => setFmt({ emptyStateColor: v })} theme={theme} />
      </Section>

      <p className="text-[10px] text-slate-500 leading-snug px-0.5">
        Per-stage colours are set on each stage in the Data tab. Stage colours override the default accent here.
      </p>
    </>
  );
}

// ── tiny primitives ──────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] text-slate-400 mb-1">{label}</label>{children}</div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-0.5 cursor-pointer">
      <span className="text-slate-300 text-[12px]">{label}</span>
      <button type="button" onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full transition-colors relative ${checked ? 'bg-blue-500' : 'bg-slate-600'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

function NumInput({ value, min, max, placeholder, onChange }: {
  value?: number; min: number; max: number; placeholder?: string; onChange: (n: number | undefined) => void;
}) {
  return (
    <input type="number" min={min} max={max} placeholder={placeholder}
      value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      className={inputCls} />
  );
}
