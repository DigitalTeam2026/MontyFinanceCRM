// Visual builder for the engine-v2 nested flow definition ({ enabled, trigger,
// steps }). No React Flow dependency — a recursive, controlled tree of step
// cards where container steps (condition/switch/loops/scope) render their child
// step lists indented inside. Edits the same JSON the engine runs.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from 'react';
import { Trash2, ChevronUp, ChevronDown, Paperclip, X, Bold, Italic, Underline, List, Link2, Send } from 'lucide-react';
import FilterSelect from '../../app/components/FilterSelect';
import ConditionValueInput from '../../app/components/ConditionValueInput';
import { fetchFieldsForEntity } from '../../services/fieldService';
import type { FieldDefinition } from '../../types/field';
import type { EntityDefinition } from '../../types/entity';
import { VAR_TYPES } from '../../app/services/workflowEngineV2';
import { sendTestEmail } from '../../app/services/workflowActions';

type Step = Record<string, any>;
interface FlowDef { enabled?: boolean; trigger?: any; steps?: Step[]; }

const nid = () => 's_' + Math.random().toString(36).slice(2, 8);

const ACTIONS = [
  'send_email', 'create_task', 'http_request',
  // record actions — your CRM "connector" (Dataverse-row equivalents)
  'list_records', 'get_record', 'create_record', 'update_record', 'delete_record', 'assign_owner',
];

// Starter params per action so the Designer shows the right keys to fill in
// (entity = the table's logical name; filters/fields accept JSON text).
function defaultActionParams(action: string): Record<string, any> {
  switch (action) {
    case 'list_records':   return { entity: '', filters: '[]', orderBy: '', limit: '' };
    case 'get_record':     return { entity: '', recordId: '{{record.id}}' };
    case 'create_record':  return { entity: '', fields: '{}' };
    case 'update_record':  return { entity: '', recordId: '{{record.id}}', fields: '{}' };
    case 'delete_record':  return { entity: '', recordId: '' };
    case 'assign_owner':   return { entity: '', recordId: '{{record.id}}', ownerId: '' };
    case 'create_task':    return { title: '', assignee: '{{record.owner_id}}' };
    case 'http_request':   return { url: '', method: 'GET' };
    case 'send_email':
    default:               return { to: '{{record.owner_id}}', cc: '', bcc: '', subject: '', body: '', isHtml: true, importance: 'normal', attachments: [] };
  }
}

const STEP_TYPES: { type: string; label: string; group: string }[] = [
  { type: 'initialize_variable', label: 'Initialize variable',  group: 'Variables' },
  { type: 'set_variable',        label: 'Set variable',         group: 'Variables' },
  { type: 'increment_variable',  label: 'Increment variable',   group: 'Variables' },
  { type: 'append_to_variable',  label: 'Append to variable',   group: 'Variables' },
  { type: 'compose',             label: 'Compose',             group: 'Data' },
  { type: 'action',              label: 'Action',              group: 'Data' },
  { type: 'condition',           label: 'Condition',           group: 'Control' },
  { type: 'switch',              label: 'Switch',              group: 'Control' },
  { type: 'apply_to_each',       label: 'Apply to each',       group: 'Control' },
  { type: 'do_until',            label: 'Do until',            group: 'Control' },
  { type: 'scope',               label: 'Scope',               group: 'Control' },
  { type: 'delay',               label: 'Delay',               group: 'Control' },
  { type: 'terminate',           label: 'Terminate',           group: 'Control' },
];

function newStep(type: string): Step {
  const base: Step = { type, id: nid() };
  switch (type) {
    case 'initialize_variable': return { ...base, name: 'var1', varType: 'String', value: '' };
    case 'set_variable':       return { ...base, name: 'var1', value: '' };
    case 'increment_variable': return { ...base, name: 'counter', by: 1 };
    case 'append_to_variable': return { ...base, name: 'list', value: '' };
    case 'compose':            return { ...base, value: '' };
    case 'action':             return { ...base, action: 'send_email', params: defaultActionParams('send_email') };
    case 'condition':          return { ...base, expression: '', then: [], else: [] };
    case 'switch':             return { ...base, expression: '', cases: {}, default: [] };
    case 'apply_to_each':      return { ...base, items: '{{record.items}}', do: [] };
    case 'do_until':           return { ...base, until: '', do: [], maxIterations: 60 };
    case 'scope':              return { ...base, do: [] };
    case 'delay':              return { ...base, ms: 1000 };
    case 'terminate':          return { ...base, status: 'Succeeded', message: '' };
    default:                   return base;
  }
}

// ── value / expression input ───────────────────────────────────────────────────
function ValExpr({ value, expression, onChange, placeholder }: {
  value?: any; expression?: string; onChange: (patch: Step) => void; placeholder?: string;
}) {
  const isExpr = expression != null;
  return (
    <div className="flex gap-1.5">
      <FilterSelect
        value={isExpr ? 'expr' : 'val'}
        onChange={(e) => e.target.value === 'expr'
          ? onChange({ expression: value != null ? String(value) : '', value: undefined })
          : onChange({ value: expression ?? '', expression: undefined })}
        className="w-16 text-[10px] border border-slate-200 rounded-lg px-1.5 py-1.5 bg-white"
      >
        <option value="val">Value</option>
        <option value="expr">fx</option>
      </FilterSelect>
      <input
        type="text"
        value={isExpr ? expression : (value ?? '')}
        onChange={(e) => isExpr
          ? onChange({ expression: e.target.value, value: undefined })
          : onChange({ value: e.target.value, expression: undefined })}
        placeholder={isExpr ? "expression e.g. add(variables('total'),1)" : (placeholder ?? "value, {{path}} or @{expr}")}
        className="flex-1 min-w-0 text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300"
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function Txt({ value, onChange, placeholder, w }: { value: any; onChange: (v: string) => void; placeholder?: string; w?: string }) {
  return (
    <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={`${w ?? 'w-full'} text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300`} />
  );
}

// ── add-step menu ───────────────────────────────────────────────────────────────
function AddStepMenu({ onAdd }: { onAdd: (type: string) => void }) {
  return (
    <FilterSelect
      value=""
      forceSearch
      onChange={(e) => { if (e.target.value) onAdd(e.target.value); }}
      className="w-full text-[11px] border-2 border-dashed border-blue-200 text-blue-600 rounded-xl px-2.5 py-2 bg-white hover:border-blue-400"
    >
      <option value="">+ Add step…</option>
      {STEP_TYPES.map((s) => <option key={s.type} value={s.type}>{s.group} — {s.label}</option>)}
    </FilterSelect>
  );
}

// ── recursive list ──────────────────────────────────────────────────────────────
function StepList({ steps, onChange }: { steps: Step[]; onChange: (s: Step[]) => void }) {
  const update = (i: number, s: Step) => onChange(steps.map((x, idx) => idx === i ? s : x));
  const remove = (i: number) => onChange(steps.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const copy = [...steps];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => (
        <StepCard key={s.id ?? i} step={s} onChange={(ns) => update(i, ns)} onRemove={() => remove(i)}
          onUp={() => move(i, -1)} onDown={() => move(i, 1)} />
      ))}
      <AddStepMenu onAdd={(t) => onChange([...steps, newStep(t)])} />
    </div>
  );
}

const TYPE_COLOR: Record<string, string> = {
  initialize_variable: 'bg-purple-50 border-purple-200 text-purple-700',
  set_variable: 'bg-purple-50 border-purple-200 text-purple-700',
  increment_variable: 'bg-purple-50 border-purple-200 text-purple-700',
  append_to_variable: 'bg-purple-50 border-purple-200 text-purple-700',
  compose: 'bg-violet-50 border-violet-200 text-violet-700',
  action: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  condition: 'bg-orange-50 border-orange-200 text-orange-700',
  switch: 'bg-orange-50 border-orange-200 text-orange-700',
  apply_to_each: 'bg-blue-50 border-blue-200 text-blue-700',
  do_until: 'bg-blue-50 border-blue-200 text-blue-700',
  scope: 'bg-slate-50 border-slate-300 text-slate-700',
  delay: 'bg-slate-50 border-slate-300 text-slate-600',
  terminate: 'bg-red-50 border-red-200 text-red-700',
};

function StepCard({ step, onChange, onRemove, onUp, onDown }: {
  step: Step; onChange: (s: Step) => void; onRemove: () => void; onUp: () => void; onDown: () => void;
}) {
  const set = (patch: Step) => onChange({ ...step, ...patch });
  const meta = STEP_TYPES.find((s) => s.type === step.type);
  return (
    <div className={`rounded-xl border ${TYPE_COLOR[step.type] ?? 'bg-white border-slate-200'} p-2.5`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] font-bold">{meta?.label ?? step.type}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={onUp} className="p-0.5 text-slate-300 hover:text-slate-600"><ChevronUp size={12} /></button>
          <button onClick={onDown} className="p-0.5 text-slate-300 hover:text-slate-600"><ChevronDown size={12} /></button>
          <button onClick={onRemove} className="p-0.5 text-slate-300 hover:text-red-500"><Trash2 size={11} /></button>
        </div>
      </div>

      <div className="space-y-1.5 bg-white/60 rounded-lg p-2">
        {step.type === 'initialize_variable' && (
          <>
            <Field label="Variable name"><Txt value={step.name} onChange={(v) => set({ name: v })} placeholder="e.g. total" /></Field>
            <Field label="Type">
              <FilterSelect value={step.varType ?? 'String'} onChange={(e) => set({ varType: e.target.value })} className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                {VAR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </FilterSelect>
            </Field>
            <Field label="Initial value"><ValExpr value={step.value} expression={step.expression} onChange={set} /></Field>
          </>
        )}
        {(step.type === 'set_variable' || step.type === 'append_to_variable') && (
          <>
            <Field label="Variable name"><Txt value={step.name} onChange={(v) => set({ name: v })} placeholder="e.g. total" /></Field>
            <Field label="Value"><ValExpr value={step.value} expression={step.expression} onChange={set} /></Field>
          </>
        )}
        {step.type === 'increment_variable' && (
          <div className="flex gap-1.5">
            <Field label="Variable"><Txt value={step.name} onChange={(v) => set({ name: v })} /></Field>
            <Field label="By"><Txt value={step.by} onChange={(v) => set({ by: v })} placeholder="1" /></Field>
          </div>
        )}
        {step.type === 'compose' && (
          <>
            <Field label="Output id"><Txt value={step.id} onChange={(v) => set({ id: v })} placeholder="lines" /></Field>
            <Field label="Value"><ValExpr value={step.value} expression={step.expression} onChange={set} /></Field>
          </>
        )}
        {step.type === 'action' && (
          <>
            <Field label="Action">
              <FilterSelect
                value={step.action}
                onChange={(e) => {
                  const action = e.target.value;
                  // Re-seed param keys when the params are still empty/untouched, so each
                  // action shows the fields it needs without clobbering a filled-in form.
                  const empty = !step.params || Object.keys(step.params).length === 0;
                  set(empty ? { action, params: defaultActionParams(action) } : { action });
                }}
                className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
              >
                {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </FilterSelect>
            </Field>
            {step.action === 'send_email'
              ? <EmailComposer params={step.params ?? {}} onChange={(p) => set({ params: p })} />
              : <ParamsEditor params={step.params ?? {}} onChange={(p) => set({ params: p })} />}
          </>
        )}
        {step.type === 'condition' && (
          <>
            <Field label="Expression (true / false)"><Txt value={step.expression} onChange={(v) => set({ expression: v })} placeholder="greater(record('amount'),10000)" /></Field>
            <Branch label="THEN" steps={step.then ?? []} onChange={(s) => set({ then: s })} />
            <Branch label="ELSE" steps={step.else ?? []} onChange={(s) => set({ else: s })} />
          </>
        )}
        {step.type === 'switch' && (
          <SwitchEditor step={step} set={set} />
        )}
        {step.type === 'apply_to_each' && (
          <>
            <Field label="Items (array)"><ValExpr value={step.items} expression={step.expression} onChange={set} placeholder="{{record.lineItems}}" /></Field>
            <Branch label="DO (use item())" steps={step.do ?? []} onChange={(s) => set({ do: s })} />
          </>
        )}
        {step.type === 'do_until' && (
          <>
            <Field label="Until (expression)"><Txt value={step.until} onChange={(v) => set({ until: v })} placeholder="greater(variables('n'),5)" /></Field>
            <Field label="Max iterations"><Txt value={step.maxIterations} onChange={(v) => set({ maxIterations: Number(v) || 60 })} w="w-24" /></Field>
            <Branch label="DO" steps={step.do ?? []} onChange={(s) => set({ do: s })} />
          </>
        )}
        {step.type === 'scope' && (
          <>
            <Branch label="DO" steps={step.do ?? []} onChange={(s) => set({ do: s })} />
            <Branch label="CATCH (on error)" steps={step.catch ?? []} onChange={(s) => set({ catch: s })} />
          </>
        )}
        {step.type === 'delay' && (
          <Field label="Milliseconds"><Txt value={step.ms} onChange={(v) => set({ ms: Number(v) || 0 })} w="w-28" /></Field>
        )}
        {step.type === 'terminate' && (
          <>
            <Field label="Status">
              <FilterSelect value={step.status ?? 'Succeeded'} onChange={(e) => set({ status: e.target.value })} className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                {['Succeeded', 'Failed', 'Cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
              </FilterSelect>
            </Field>
            <Field label="Message"><Txt value={step.message} onChange={(v) => set({ message: v })} placeholder="Done @{record('name')}" /></Field>
          </>
        )}
      </div>
    </div>
  );
}

function Branch({ label, steps, onChange }: { label: string; steps: Step[]; onChange: (s: Step[]) => void }) {
  return (
    <div className="border-l-2 border-slate-200 pl-2 ml-1">
      <p className="text-[9px] font-bold text-slate-400 mb-1">{label}</p>
      <StepList steps={steps} onChange={onChange} />
    </div>
  );
}

function SwitchEditor({ step, set }: { step: Step; set: (p: Step) => void }) {
  const cases: Record<string, Step[]> = step.cases ?? {};
  const keys = Object.keys(cases);
  const addCase = () => {
    let k = 'case1'; let i = 1;
    while (cases[k]) { i++; k = `case${i}`; }
    set({ cases: { ...cases, [k]: [] } });
  };
  const renameCase = (oldK: string, newK: string) => {
    if (!newK || newK === oldK || cases[newK]) return;
    const next: Record<string, Step[]> = {};
    for (const k of keys) next[k === oldK ? newK : k] = cases[k];
    set({ cases: next });
  };
  const setCase = (k: string, s: Step[]) => set({ cases: { ...cases, [k]: s } });
  const removeCase = (k: string) => { const next = { ...cases }; delete next[k]; set({ cases: next }); };
  return (
    <>
      <Field label="On (expression / value)"><ValExpr value={step.on} expression={step.expression} onChange={set} placeholder="record('tier')" /></Field>
      {keys.map((k) => (
        <div key={k} className="border-l-2 border-orange-200 pl-2 ml-1">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[9px] font-bold text-slate-400">CASE</span>
            <input value={k} onChange={(e) => renameCase(k, e.target.value)} className="text-[10px] font-mono border border-slate-200 rounded px-1 py-0.5 w-24" />
            <button onClick={() => removeCase(k)} className="text-slate-300 hover:text-red-500"><Trash2 size={10} /></button>
          </div>
          <StepList steps={cases[k]} onChange={(s) => setCase(k, s)} />
        </div>
      ))}
      <button onClick={addCase} className="text-[10px] text-orange-600 hover:underline">+ Add case</button>
      <Branch label="DEFAULT" steps={step.default ?? []} onChange={(s) => set({ default: s })} />
    </>
  );
}

function ParamsEditor({ params, onChange }: { params: Record<string, any>; onChange: (p: Record<string, any>) => void }) {
  const entries = Object.entries(params);
  const setKey = (oldK: string, newK: string) => {
    if (!newK || newK === oldK) return;
    const next: Record<string, any> = {};
    for (const [k, v] of entries) next[k === oldK ? newK : k] = v;
    onChange(next);
  };
  const setVal = (k: string, v: string) => onChange({ ...params, [k]: v });
  const remove = (k: string) => { const next = { ...params }; delete next[k]; onChange(next); };
  const add = () => { let k = 'param'; let i = 1; while (k in params) { i++; k = `param${i}`; } onChange({ ...params, [k]: '' }); };
  return (
    <Field label="Params (value supports {{path}} / @{expr})">
      <div className="space-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-1">
            <input value={k} onChange={(e) => setKey(k, e.target.value)} className="w-24 text-[10px] font-mono border border-slate-200 rounded px-1.5 py-1 bg-white" />
            <input value={v ?? ''} onChange={(e) => setVal(k, e.target.value)} className="flex-1 text-[10px] border border-slate-200 rounded px-1.5 py-1 bg-white" placeholder="value" />
            <button onClick={() => remove(k)} className="text-slate-300 hover:text-red-500"><Trash2 size={10} /></button>
          </div>
        ))}
        <button onClick={add} className="text-[10px] text-emerald-600 hover:underline">+ Add param</button>
      </div>
    </Field>
  );
}

// ── top-level builder ───────────────────────────────────────────────────────────
export default function FlowBuilder({
  entityName,
  entities,
  definition,
  onChange,
}: {
  entityName: string;
  entities: EntityDefinition[];
  definition: Record<string, unknown> | null;
  onChange: (def: Record<string, unknown> | null) => void;
}) {
  const def: FlowDef = (definition as FlowDef) ?? {};
  const trigger = def.trigger ?? {};
  const setDef = (patch: Partial<FlowDef>) => onChange({ ...def, ...patch });
  const setTrigger = (patch: any) => setDef({ trigger: { ...trigger, ...patch } });

  // Load the trigger entity's columns so conditions become field-aware.
  const entityLogical = (trigger.entity as string) || '';
  const entityId = entities.find((e) => e.logical_name === entityLogical)?.entity_definition_id ?? '';
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  useEffect(() => {
    if (!entityId) { setFields([]); return; }
    let cancelled = false;
    fetchFieldsForEntity(entityId)
      .then((f) => { if (!cancelled) setFields(f); })
      .catch(() => { if (!cancelled) setFields([]); });
    return () => { cancelled = true; };
  }, [entityId]);

  const start = () => onChange({
    enabled: true,
    trigger: { type: 'record.updated', entity: entityName || '', conditions: [] },
    steps: [],
  });

  if (!definition) {
    return (
      <div className="max-w-md mx-auto text-center mt-10">
        <p className="text-sm font-semibold text-slate-700 mb-1">No v2 flow yet</p>
        <p className="text-xs text-slate-400 mb-4">Start a nested flow (engine v2) for this workflow.</p>
        <button onClick={start} className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Start a flow</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Trigger */}
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-3">
        <p className="text-[11px] font-bold text-slate-700 mb-2">Trigger</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <FilterSelect value={trigger.type ?? 'record.updated'} onChange={(e) => setTrigger({ type: e.target.value })} className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
              {['record.created', 'record.updated', 'record.deleted'].map((t) => <option key={t} value={t}>{t}</option>)}
            </FilterSelect>
          </Field>
          <Field label="Entity (table)">
            <FilterSelect
              forceSearch
              value={entityLogical}
              onChange={(e) => setTrigger({ entity: e.target.value, conditions: [] })}
              className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
            >
              <option value="">Select table…</option>
              {entities.map((ent) => <option key={ent.entity_definition_id} value={ent.logical_name}>{ent.display_name}</option>)}
            </FilterSelect>
          </Field>
        </div>
        <div className="mt-2">
          <TriggerConditions conditions={trigger.conditions ?? []} fields={fields} onChange={(c) => setTrigger({ conditions: c })} />
        </div>
        <label className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-600">
          <input type="checkbox" checked={def.enabled !== false} onChange={(e) => setDef({ enabled: e.target.checked })} />
          Flow enabled
        </label>
      </div>

      {/* Steps */}
      <div>
        <p className="text-[11px] font-bold text-slate-700 mb-2">Steps</p>
        <StepList steps={def.steps ?? []} onChange={(s) => setDef({ steps: s })} />
      </div>
    </div>
  );
}

function TriggerConditions({ conditions, fields, onChange }: { conditions: any[]; fields: FieldDefinition[]; onChange: (c: any[]) => void }) {
  const OPS = ['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'in', 'is_empty', 'changed'];
  const set = (i: number, p: any) => onChange(conditions.map((c, idx) => idx === i ? { ...c, ...p } : c));
  const logicalOf = (path: any) => String(path ?? '').replace(/^record\./, '');
  const fieldFor = (path: any) => fields.find((f) => f.logical_name === logicalOf(path)) ?? null;
  return (
    <Field label="Conditions (all must match)">
      <div className="space-y-1">
        {conditions.map((c, i) => {
          const logical = logicalOf(c.field);
          const fld = fieldFor(c.field);
          const known = !logical || fields.some((f) => f.logical_name === logical);
          const showVal = c.op !== 'is_empty' && c.op !== 'changed';
          return (
            <div key={i} className="flex items-center gap-1">
              <FilterSelect
                forceSearch
                value={logical}
                onChange={(e) => set(i, { field: e.target.value ? `record.${e.target.value}` : '', value: '' })}
                className="w-36 text-[10px] border border-slate-200 rounded px-1 py-1 bg-white"
              >
                <option value="">{fields.length ? 'field…' : 'pick a table first'}</option>
                {!known && logical && <option value={logical}>{logical}</option>}
                {fields.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
              </FilterSelect>
              <FilterSelect value={c.op} onChange={(e) => set(i, { op: e.target.value })} className="w-24 text-[10px] border border-slate-200 rounded px-1 py-1 bg-white">
                {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
              </FilterSelect>
              {showVal && (
                fld
                  ? <div className="flex-1 min-w-0"><ConditionValueInput field={fld} value={String(c.value ?? '')} onChange={(v) => set(i, { value: v })} variant="boxed" /></div>
                  : <Txt value={c.value} onChange={(v) => set(i, { value: v })} placeholder="value" w="flex-1" />
              )}
              <button onClick={() => onChange(conditions.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500"><Trash2 size={10} /></button>
            </div>
          );
        })}
        <button onClick={() => onChange([...conditions, { field: '', op: 'equals', value: '' }])} className="text-[10px] text-blue-600 hover:underline">+ Add condition</button>
      </div>
    </Field>
  );
}

// ── Outlook-style email composer (HTML body + attachments) ───────────────────────
function EmailComposer({ params, onChange }: { params: Record<string, any>; onChange: (p: Record<string, any>) => void }) {
  const set = (patch: Record<string, any>) => onChange({ ...params, ...patch });
  const attachments: any[] = Array.isArray(params.attachments) ? params.attachments : [];
  const isHtml = params.isHtml !== false;
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const runTest = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await sendTestEmail(params);
      if (r.ok) setTestMsg({ ok: true, text: `Test sent to ${r.to?.join(', ')}` });
      else if (r.notConfigured) setTestMsg({ ok: false, text: 'Mailer not configured yet (GRAPH_* secrets missing).' });
      else setTestMsg({ ok: false, text: r.error || 'Failed to send' });
    } catch (e) {
      setTestMsg({ ok: false, text: String((e as Error)?.message ?? e) });
    } finally {
      setTesting(false);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const added: any[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 1024 * 1024) { window.alert(`"${file.name}" is larger than 1 MB and was skipped.`); continue; }
      const content = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
      });
      added.push({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, content });
    }
    if (added.length) set({ attachments: [...attachments, ...added] });
  };

  return (
    <div className="space-y-2 bg-white/70 rounded-lg p-2">
      <Field label="To"><Txt value={params.to ?? params.recipientId} onChange={(v) => set({ to: v, recipientId: undefined })} placeholder="email, {{record.email}} — or a CRM user id for in-app" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cc"><Txt value={params.cc} onChange={(v) => set({ cc: v })} placeholder="email(s)" /></Field>
        <Field label="Bcc"><Txt value={params.bcc} onChange={(v) => set({ bcc: v })} placeholder="email(s)" /></Field>
      </div>
      <Field label="Subject"><Txt value={params.subject} onChange={(v) => set({ subject: v })} placeholder="Subject — supports {{record.name}}" /></Field>

      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Body</label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[9px] text-slate-500">
              Importance
              <FilterSelect value={params.importance ?? 'normal'} onChange={(e) => set({ importance: e.target.value })} className="text-[9px] border border-slate-200 rounded px-1 py-0.5 bg-white">
                {['low', 'normal', 'high'].map((o) => <option key={o} value={o}>{o}</option>)}
              </FilterSelect>
            </label>
            <label className="flex items-center gap-1 text-[9px] text-slate-500 cursor-pointer">
              <input type="checkbox" checked={isHtml} onChange={(e) => set({ isHtml: e.target.checked })} /> HTML
            </label>
          </div>
        </div>
        {isHtml
          ? <RichTextEditor html={params.body ?? ''} onChange={(html) => set({ body: html })} />
          : <textarea value={params.body ?? ''} onChange={(e) => set({ body: e.target.value })} rows={5} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300" placeholder="Plain text — supports {{record.x}} / @{expr}" />}
        <p className="text-[9px] text-slate-400 mt-0.5">Placeholders like {'{{record.name}}'} and @{'{'}record('amount'){'}'} are resolved when the email sends.</p>
      </div>

      <div>
        <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Attachments</label>
        {attachments.length > 0 && (
          <div className="space-y-1 mb-1">
            {attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1">
                <Paperclip size={11} className="text-slate-400 shrink-0" />
                <span className="flex-1 truncate">{a.name}</span>
                <span className="text-slate-400 shrink-0">{Math.ceil((a.size ?? 0) / 1024)} KB</span>
                <button onClick={() => set({ attachments: attachments.filter((_, idx) => idx !== i) })} className="text-slate-300 hover:text-red-500 shrink-0"><X size={11} /></button>
              </div>
            ))}
          </div>
        )}
        <label className="inline-flex items-center gap-1.5 text-[11px] text-blue-600 hover:underline cursor-pointer">
          <Paperclip size={11} /> Attach file
          <input type="file" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        </label>
        <p className="text-[9px] text-slate-400 mt-0.5">Stored with the flow (max 1 MB each). Email recipients send via Microsoft 365 (Outlook); a CRM user id in <strong>To</strong> gets an in-app notification instead.</p>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
        >
          <Send size={11} /> {testing ? 'Sending…' : 'Send test email'}
        </button>
        {testMsg && (
          <span className={`text-[10px] ${testMsg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{testMsg.text}</span>
        )}
      </div>
      <p className="text-[9px] text-slate-400">Test sends the body literally (placeholders like {'{{record.name}}'} aren't filled in — those resolve only on a real run).</p>
    </div>
  );
}

function RichTextEditor({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Only push external HTML into the node when it actually differs, so typing
  // doesn't reset the caret to the start on every keystroke.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (html ?? '')) ref.current.innerHTML = html ?? '';
  }, [html]);
  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    onChange(ref.current?.innerHTML ?? '');
  };
  const btn = 'p-1 rounded hover:bg-slate-100 text-slate-600';
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center gap-0.5 border-b border-slate-200 px-1 py-0.5 bg-slate-50">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('bold'); }} className={btn} title="Bold"><Bold size={12} /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('italic'); }} className={btn} title="Italic"><Italic size={12} /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('underline'); }} className={btn} title="Underline"><Underline size={12} /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }} className={btn} title="Bulleted list"><List size={12} /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); const url = window.prompt('Link URL'); if (url) exec('createLink', url); }} className={btn} title="Insert link"><Link2 size={12} /></button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        className="min-h-[110px] max-h-64 overflow-y-auto px-2 py-1.5 text-[12px] text-slate-700 focus:outline-none"
      />
    </div>
  );
}
