import { useEffect, useMemo, useState, useCallback } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Mail, PencilLine, FileSpreadsheet, ListChecks, Braces, ToggleLeft, ToggleRight, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import type {
  AutomationRule, AutomationRuleAction, AutomationOperator, AutomationTriggerEvent,
  AutomationActionType, AutomationCondition, SendEmailConfig, UpdateFieldConfig,
  GenerateDocumentConfig, ListRowsConfig, ListRowsFilter, ListRowsOperator, AutomationRunHistoryRow,
} from '../../types/automationRule';
import type { FieldDefinition } from '../../types/field';
import type { EntityDefinition } from '../../types/entity';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { fetchEntities } from '../../services/entityService';
import {
  fetchRuleById, updateRule, setRuleEnabled, fetchActions, createAction, updateAction,
  deleteAction, fetchRunHistory, fetchFieldChoices, type ChoiceOption,
} from '../../services/automationRuleService';
import { invalidateRuleCache } from '../../app/services/automation/dispatch';
import { validateActionConfig, validateRuleTokens } from '../../app/services/automation/actionValidation';
import { operatorLabel, actionLabel } from './ruleSummary';

/** Steps (list_rows) defined before a given action — for token pickers + refs. */
interface EarlierStep { name: string; columns: string[] }
function earlierStepsBefore(actions: AutomationRuleAction[], index: number): EarlierStep[] {
  const out: EarlierStep[] = [];
  for (let i = 0; i < index; i++) {
    const a = actions[i];
    if (a.action_type === 'list_rows') {
      const cfg = a.config as unknown as ListRowsConfig;
      if (cfg.step_name) out.push({ name: cfg.step_name, columns: Array.isArray(cfg.columns) ? cfg.columns : [] });
    }
  }
  return out;
}

// Small "insert token" menu: trigger-record fields + earlier list_rows steps only.
function TokenMenu({ recordFields, steps, onPick }: { recordFields: FieldDefinition[]; steps: EarlierStep[]; onPick: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const tokens: { label: string; value: string }[] = [{ label: 'record.url', value: '{{record.url}}' }];
  for (const f of [...recordFields].sort((a, b) => a.display_name.localeCompare(b.display_name))) {
    tokens.push({ label: `record.${f.logical_name}`, value: `{{record.${f.logical_name}}}` });
  }
  for (const s of steps) {
    const col = s.columns[0] ?? 'email';
    tokens.push({ label: `${s.name}.count`, value: `{{steps.${s.name}.count}}` });
    tokens.push({ label: `${s.name}.join(${col}, ';')`, value: `{{steps.${s.name}.join(${col}, ';')}}` });
    tokens.push({ label: `${s.name}.rows`, value: `{{steps.${s.name}.rows}}` });
  }
  return (
    <span className="relative inline-block">
      <button type="button" title="Insert token" onClick={() => setOpen((v) => !v)} className="text-slate-400 hover:text-blue-600 p-1"><Braces size={14} /></button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-56">
          {tokens.map((t) => (
            <button key={t.value} type="button" onClick={() => { onPick(t.value); setOpen(false); }} className="block w-full text-left px-3 py-1 text-[12px] text-slate-700 hover:bg-slate-50 font-mono">{t.label}</button>
          ))}
        </div>
      )}
    </span>
  );
}

interface Props {
  ruleId: string;
  onBack: () => void;
}

const input = 'w-full px-2.5 py-1.5 text-[13px] border border-slate-300 rounded outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';
const lbl = 'block text-[12px] font-medium text-slate-600 mb-1';
const btnPrimary = 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded disabled:opacity-50';
const card = 'bg-white border border-slate-200 rounded-xl p-4';

const OPERATORS: AutomationOperator[] = ['changes_to', 'equals', 'is_any_of', 'changes_from_to', 'changed'];

function fieldKind(f: FieldDefinition | undefined): 'boolean' | 'choice' | 'lookup' | 'text' {
  const t = (f?.field_type?.name ?? '').toLowerCase();
  if (['boolean', 'two_options', 'yesno', 'yes_no', 'bool'].includes(t)) return 'boolean';
  if (['choice', 'multi_choice', 'option_set', 'optionset', 'picklist', 'status'].includes(t)) return 'choice';
  if (['lookup', 'owner', 'customer'].includes(t)) return 'lookup';
  return 'text';
}

export default function RuleEditorPage({ ruleId, onBack }: Props) {
  const [rule, setRule] = useState<AutomationRule | null>(null);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [choices, setChoices] = useState<ChoiceOption[]>([]);
  const [actions, setActions] = useState<AutomationRuleAction[]>([]);
  const [tab, setTab] = useState<'trigger' | 'actions' | 'history'>('trigger');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // load rule + actions
  useEffect(() => {
    void (async () => {
      const r = await fetchRuleById(ruleId);
      setRule(r);
      setActions(r.actions ?? []);
    })();
  }, [ruleId]);

  // load fields when table known
  useEffect(() => {
    if (!rule) return;
    void (async () => {
      // Resolve the entity id from logical name via the field service's entity filter.
      const { fetchEntities } = await import('../../services/entityService');
      const ents = await fetchEntities();
      const ent = ents.find((e) => e.logical_name === rule.table_logical_name);
      if (ent) setFields(await fetchFieldsForEntity(ent.entity_definition_id));
    })();
  }, [rule?.table_logical_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedField = useMemo(
    () => fields.find((f) => f.logical_name === rule?.field_logical_name),
    [fields, rule?.field_logical_name],
  );
  const kind = fieldKind(selectedField);

  // load choice options for choice fields
  useEffect(() => {
    if (kind === 'choice' && selectedField) {
      void fetchFieldChoices(selectedField.config_json ?? null).then(setChoices);
    } else {
      setChoices([]);
    }
  }, [kind, selectedField]);

  const patch = useCallback((p: Partial<AutomationRule>) => {
    setRule((r) => (r ? { ...r, ...p } : r));
    setDirty(true);
  }, []);

  const save = async () => {
    if (!rule) return;
    setSaving(true);
    try {
      await updateRule(rule.automation_rule_id, {
        name: rule.name,
        description: rule.description,
        trigger_event: rule.trigger_event,
        field_logical_name: rule.field_logical_name,
        operator: rule.operator,
        trigger_value: rule.trigger_value,
        conditions: rule.conditions,
      });
      invalidateRuleCache(rule.table_logical_name);
      setDirty(false);
      flash('Saved');
    } finally {
      setSaving(false);
    }
  };

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2000); };

  const toggleEnabled = async () => {
    if (!rule) return;
    await setRuleEnabled(rule.automation_rule_id, !rule.enabled);
    invalidateRuleCache(rule.table_logical_name);
    setRule({ ...rule, enabled: !rule.enabled });
  };

  const refreshActions = async () => setActions(await fetchActions(ruleId));

  if (!rule) return <div className="p-6 text-[13px] text-slate-500">Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      {/* header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-800"><ArrowLeft size={18} /></button>
        <input
          value={rule.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="text-[15px] font-semibold text-slate-800 outline-none border-b border-transparent hover:border-slate-200 focus:border-blue-500 min-w-[240px]"
        />
        <button onClick={toggleEnabled} title={rule.enabled ? 'Enabled' : 'Disabled'} className={`ml-2 ${rule.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
          {rule.enabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
        </button>
        <div className="flex-1" />
        {dirty && <span className="text-[12px] text-amber-600">Unsaved changes</span>}
        <button className={btnPrimary} onClick={save} disabled={saving || !dirty}><Save size={15} /> Save</button>
      </div>

      {/* tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-slate-200 bg-white">
        {(['trigger', 'actions', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t === 'trigger' ? 'Trigger' : t === 'actions' ? `Actions (${actions.length})` : 'Run history'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
        {tab === 'trigger' && (
          <TriggerTab rule={rule} fields={fields} kind={kind} choices={choices} patch={patch} />
        )}
        {tab === 'actions' && (
          <ActionsTab ruleId={ruleId} fields={fields} actions={actions} onChange={refreshActions} />
        )}
        {tab === 'history' && <HistoryTab ruleId={ruleId} />}
      </div>

      {toast && (
        <div className="fixed bottom-5 right-5 bg-slate-800 text-white text-[13px] px-4 py-2 rounded shadow-lg">{toast}</div>
      )}
    </div>
  );
}

// ── Trigger tab ──────────────────────────────────────────────────────────────

function TriggerTab({
  rule, fields, kind, choices, patch,
}: {
  rule: AutomationRule; fields: FieldDefinition[]; kind: string; choices: ChoiceOption[];
  patch: (p: Partial<AutomationRule>) => void;
}) {
  const events: { v: AutomationTriggerEvent; l: string }[] = [
    { v: 'update', l: 'On update' }, { v: 'create', l: 'On create' }, { v: 'both', l: 'Create or update' },
  ];
  const showValue = rule.operator !== 'changed';

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-[13px] font-semibold text-slate-700 mb-3">WHEN</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Trigger event</label>
            <select value={rule.trigger_event} onChange={(e) => patch({ trigger_event: e.target.value as AutomationTriggerEvent })} className={input}>
              {events.map((e) => <option key={e.v} value={e.v}>{e.l}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Field</label>
            <select
              value={rule.field_logical_name ?? ''}
              onChange={(e) => patch({ field_logical_name: e.target.value || null, trigger_value: null })}
              className={input}
            >
              <option value="">(any change)</option>
              {[...fields].sort((a, b) => a.display_name.localeCompare(b.display_name)).map((f) => (
                <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Operator</label>
            <select value={rule.operator} onChange={(e) => patch({ operator: e.target.value as AutomationOperator })} className={input}>
              {OPERATORS.map((op) => <option key={op} value={op}>{operatorLabel(op)}</option>)}
            </select>
          </div>
          {showValue && (
            <div>
              <label className={lbl}>Value</label>
              <ValueInput kind={kind} operator={rule.operator} choices={choices} value={rule.trigger_value} onChange={(v) => patch({ trigger_value: v })} />
            </div>
          )}
        </div>
        <p className="text-[12px] text-slate-500 mt-3">
          Fires only on the <strong>transition into</strong> the value (was something else, now matches) — not on every save while it already matches.
        </p>
      </div>

      <ConditionsEditor rule={rule} fields={fields} patch={patch} />

      <div className={card}>
        <label className={lbl}>Batching window (seconds, optional)</label>
        <input
          type="number" min={0}
          className={`${input} w-40`}
          value={rule.batch_window_seconds ?? ''}
          onChange={(e) => patch({ batch_window_seconds: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
          placeholder="0 = immediate"
        />
        <p className="text-[12px] text-slate-400 mt-1">Group events within N seconds into one email with <code>{'{{count}}'}</code> (e.g. bulk imports).</p>
      </div>

      <div className={card}>
        <label className={lbl}>Description (optional)</label>
        <textarea value={rule.description ?? ''} onChange={(e) => patch({ description: e.target.value })} rows={2} className={input} />
      </div>
    </div>
  );
}

function ConditionsEditor({
  rule, fields, patch,
}: { rule: AutomationRule; fields: FieldDefinition[]; patch: (p: Partial<AutomationRule>) => void }) {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  const sortedFields = [...fields].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const update = (i: number, p: Partial<AutomationCondition>) =>
    patch({ conditions: conditions.map((c, idx) => (idx === i ? { ...c, ...p } : c)) });
  const add = () => patch({ conditions: [...conditions, { field: '', operator: 'equals', value: '' }] });
  const remove = (i: number) => patch({ conditions: conditions.filter((_, idx) => idx !== i) });
  const needsValue = (op: AutomationCondition['operator']) => op === 'equals' || op === 'not_equals';

  return (
    <div className={card}>
      <p className="text-[13px] font-semibold text-slate-700 mb-1">AND conditions <span className="font-normal text-slate-400">(optional)</span></p>
      <p className="text-[12px] text-slate-400 mb-3">All must hold (evaluated against the saved record) for the rule to run.</p>
      {conditions.length === 0 && <p className="text-[12px] text-slate-400">No conditions.</p>}
      <div className="space-y-2">
        {conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <select className={`${input} flex-1`} value={c.field} onChange={(e) => update(i, { field: e.target.value })}>
              <option value="">Select field…</option>
              {sortedFields.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
            </select>
            <select className={`${input} w-36`} value={c.operator} onChange={(e) => update(i, { operator: e.target.value as AutomationCondition['operator'] })}>
              <option value="equals">equals</option>
              <option value="not_equals">not equals</option>
              <option value="is_empty">is empty</option>
              <option value="is_not_empty">is not empty</option>
            </select>
            {needsValue(c.operator) && (
              <input className={`${input} w-40`} value={c.value == null ? '' : String(c.value)} onChange={(e) => update(i, { value: e.target.value })} placeholder="value" />
            )}
            <button onClick={() => remove(i)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <button onClick={add} className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 border border-dashed border-slate-300 text-slate-600 text-[12px] rounded hover:border-slate-400">
        <Plus size={14} /> Add condition
      </button>
    </div>
  );
}

function ValueInput({
  kind, operator, choices, value, onChange,
}: { kind: string; operator: AutomationOperator; choices: ChoiceOption[]; value: unknown; onChange: (v: unknown) => void }) {
  if (operator === 'changes_from_to') {
    const ft = (value && typeof value === 'object' ? value : {}) as { from?: unknown; to?: unknown };
    return (
      <div className="flex items-center gap-2">
        <input className={input} placeholder="from" value={ft.from == null ? '' : String(ft.from)} onChange={(e) => onChange({ ...ft, from: e.target.value })} />
        <span className="text-slate-400">→</span>
        <input className={input} placeholder="to" value={ft.to == null ? '' : String(ft.to)} onChange={(e) => onChange({ ...ft, to: e.target.value })} />
      </div>
    );
  }
  if (operator === 'is_any_of') {
    const arr = Array.isArray(value) ? value : [];
    return (
      <input className={input} placeholder="value1, value2, …" value={arr.join(', ')}
        onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
    );
  }
  if (kind === 'boolean') {
    return (
      <select className={input} value={value === true ? 'true' : value === false ? 'false' : ''} onChange={(e) => onChange(e.target.value === 'true')}>
        <option value="">Select…</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (kind === 'choice' && choices.length) {
    return (
      <select className={input} value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    );
  }
  return <input className={input} value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} placeholder={kind === 'lookup' ? 'record id (GUID)' : 'value'} />;
}

// ── Actions tab ──────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Record<AutomationActionType, Record<string, unknown>> = {
  list_rows: { step_name: '', source_table: '', filters: [], columns: [], limit: 100 },
  send_email: { to_static: [], to_fields: [], to: '', cc: '', subject: '', body: '' },
  update_field: { target: 'record', field: '', value: '' },
  generate_document: { format: 'xlsx', filename: 'export', scope: 'record', columns: [] },
};

function ActionsTab({
  ruleId, fields, actions, onChange,
}: { ruleId: string; fields: FieldDefinition[]; actions: AutomationRuleAction[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);

  const add = async (type: AutomationActionType) => {
    setAdding(false);
    await createAction(ruleId, type, DEFAULT_CONFIG[type], actions.length);
    onChange();
  };

  const tokenProblems = validateRuleTokens(actions);

  return (
    <div className="space-y-3">
      {tokenProblems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-[12px] font-medium text-amber-800 mb-1">Token / step reference issues:</p>
          <ul className="text-[12px] text-amber-700 list-disc list-inside">{tokenProblems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {actions.length === 0 && <p className="text-[13px] text-slate-500">No actions yet. Add one below.</p>}
      {actions.map((a, idx) => {
        const steps = earlierStepsBefore(actions, idx);
        if (a.action_type === 'list_rows') return <ListRowsActionCard key={a.automation_rule_action_id} action={a} recordFields={fields} steps={steps} onChange={onChange} />;
        if (a.action_type === 'update_field') return <UpdateFieldActionCard key={a.automation_rule_action_id} action={a} fields={fields} steps={steps} onChange={onChange} />;
        if (a.action_type === 'generate_document') return <GenerateDocumentActionCard key={a.automation_rule_action_id} action={a} fields={fields} onChange={onChange} />;
        return <SendEmailActionCard key={a.automation_rule_action_id} action={a} fields={fields} steps={steps} onChange={onChange} />;
      })}

      <div className="relative inline-block">
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-300 text-slate-600 text-[13px] rounded hover:border-slate-400" onClick={() => setAdding((v) => !v)}>
          <Plus size={15} /> Add action
        </button>
        {adding && (
          <div className="absolute z-10 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-48">
            {(['list_rows', 'send_email', 'update_field', 'generate_document'] as AutomationActionType[]).map((t) => (
              <button key={t} onClick={() => add(t)} className="block w-full text-left px-3 py-1.5 text-[13px] text-slate-700 hover:bg-slate-50">{actionLabel(t)}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ListRowsActionCard({
  action, recordFields, steps, onChange,
}: { action: AutomationRuleAction; recordFields: FieldDefinition[]; steps: EarlierStep[]; onChange: () => void }) {
  const cfg = action.config as unknown as ListRowsConfig;
  const [local, setLocal] = useState<ListRowsConfig>({
    step_name: cfg.step_name ?? '', source_table: cfg.source_table ?? '', filters: cfg.filters ?? [],
    columns: cfg.columns ?? [], sort: cfg.sort, limit: cfg.limit ?? 100,
  });
  const [dirty, setDirty] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [srcFields, setSrcFields] = useState<FieldDefinition[]>([]);

  useEffect(() => { void fetchEntities().then(setEntities); }, []);
  useEffect(() => {
    const ent = entities.find((e) => e.logical_name === local.source_table);
    if (ent) void fetchFieldsForEntity(ent.entity_definition_id).then(setSrcFields);
    else setSrcFields([]);
  }, [entities, local.source_table]);

  const set = (p: Partial<ListRowsConfig>) => { setLocal((l) => ({ ...l, ...p })); setDirty(true); };
  const save = async () => {
    const problems = validateActionConfig('list_rows', local as unknown as Record<string, unknown>);
    setErrs(problems);
    if (problems.length) return;
    await updateAction(action.automation_rule_action_id, { config: local });
    setDirty(false); onChange();
  };
  const remove = async () => { await deleteAction(action.automation_rule_action_id); onChange(); };

  const sortedSrc = [...srcFields].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const sortedEnt = [...entities].sort((a, b) => a.display_name.localeCompare(b.display_name));

  const setFilter = (i: number, p: Partial<ListRowsFilter>) => set({ filters: local.filters.map((f, idx) => (idx === i ? { ...f, ...p } : f)) });
  const addFilter = () => set({ filters: [...local.filters, { field: '', operator: 'equals', value: '' }] });
  const rmFilter = (i: number) => set({ filters: local.filters.filter((_, idx) => idx !== i) });

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-3">
        <ListChecks size={15} className="text-blue-600" />
        <span className="text-[13px] font-semibold text-slate-700">List rows</span>
        <div className="flex-1" />
        {dirty && <button onClick={save} className={btnPrimary}><Save size={14} /> Save action</button>}
        <button onClick={remove} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Step name (referenced as {'{{steps.<name>…}}'})</label>
          <input className={input} value={local.step_name} onChange={(e) => set({ step_name: e.target.value })} placeholder="recipients" />
        </div>
        <div>
          <label className={lbl}>Source table</label>
          <select className={input} value={local.source_table} onChange={(e) => set({ source_table: e.target.value, columns: [], filters: [] })}>
            <option value="">Select…</option>
            {sortedEnt.map((e) => <option key={e.entity_definition_id} value={e.logical_name}>{e.display_name}</option>)}
          </select>
        </div>
      </div>

      <label className={`${lbl} mt-3`}>Filters (AND)</label>
      <div className="space-y-2">
        {local.filters.map((f, i) => (
          <ListRowsFilterRow key={i} filter={f} srcFields={sortedSrc} recordFields={recordFields} steps={steps} onChange={(p) => setFilter(i, p)} onRemove={() => rmFilter(i)} />
        ))}
      </div>
      <button onClick={addFilter} disabled={!local.source_table} className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 border border-dashed border-slate-300 text-slate-600 text-[12px] rounded hover:border-slate-400 disabled:opacity-40">
        <Plus size={14} /> Add filter
      </button>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <label className={lbl}>Columns to return (none = all)</label>
          <select multiple className={`${input} h-24`} value={local.columns} onChange={(e) => set({ columns: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
            {sortedSrc.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Sort by</label>
          <div className="flex gap-2">
            <select className={input} value={local.sort?.field ?? ''} onChange={(e) => set({ sort: e.target.value ? { field: e.target.value, dir: local.sort?.dir ?? 'asc' } : undefined })}>
              <option value="">(none)</option>
              {sortedSrc.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
            </select>
            <select className={`${input} w-24`} value={local.sort?.dir ?? 'asc'} onChange={(e) => set({ sort: local.sort ? { ...local.sort, dir: e.target.value as 'asc' | 'desc' } : undefined })} disabled={!local.sort?.field}>
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </div>
          <label className={`${lbl} mt-3`}>Row limit</label>
          <input type="number" min={1} className={`${input} w-32`} value={local.limit ?? 100} onChange={(e) => set({ limit: Math.max(1, Number(e.target.value) || 100) })} />
        </div>
      </div>
      {errs.length > 0 && <ul className="mt-2 text-[12px] text-red-600 list-disc list-inside">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
    </div>
  );
}

function ListRowsFilterRow({
  filter, srcFields, recordFields, steps, onChange, onRemove,
}: {
  filter: ListRowsFilter; srcFields: FieldDefinition[]; recordFields: FieldDefinition[]; steps: EarlierStep[];
  onChange: (p: Partial<ListRowsFilter>) => void; onRemove: () => void;
}) {
  const [choices, setChoices] = useState<ChoiceOption[]>([]);
  const selected = srcFields.find((f) => f.logical_name === filter.field);
  const kind = fieldKind(selected);
  useEffect(() => {
    if (kind === 'choice' && selected) void fetchFieldChoices(selected.config_json ?? null).then(setChoices);
    else setChoices([]);
  }, [kind, selected]);
  const needsValue = filter.operator !== 'is_empty' && filter.operator !== 'is_not_empty';
  const isTokenVal = typeof filter.value === 'string' && filter.value.includes('{{');

  return (
    <div className="flex items-center gap-2">
      <select className={`${input} flex-1`} value={filter.field} onChange={(e) => onChange({ field: e.target.value, value: '' })}>
        <option value="">Field…</option>
        {srcFields.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
      </select>
      <select className={`${input} w-32`} value={filter.operator} onChange={(e) => onChange({ operator: e.target.value as ListRowsOperator })}>
        <option value="equals">equals</option>
        <option value="not_equals">not equals</option>
        <option value="contains">contains</option>
        <option value="is_any_of">is any of</option>
        <option value="is_empty">is empty</option>
        <option value="is_not_empty">not empty</option>
      </select>
      {needsValue && (
        <div className="flex items-center gap-1 w-52">
          {/* Typed input by field kind, unless a token is being used. */}
          {!isTokenVal && kind === 'boolean' ? (
            <select className={input} value={filter.value === true ? 'true' : filter.value === false ? 'false' : ''} onChange={(e) => onChange({ value: e.target.value === 'true' })}>
              <option value="">Select…</option><option value="true">Yes</option><option value="false">No</option>
            </select>
          ) : !isTokenVal && kind === 'choice' && choices.length ? (
            <select className={input} value={filter.value == null ? '' : String(filter.value)} onChange={(e) => onChange({ value: e.target.value })}>
              <option value="">Select…</option>
              {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          ) : (
            <input className={input} value={filter.value == null ? '' : String(filter.value)} onChange={(e) => onChange({ value: e.target.value })} placeholder="value or {{token}}" />
          )}
          <TokenMenu recordFields={recordFields} steps={steps} onPick={(t) => onChange({ value: `${filter.value ?? ''}${t}` })} />
        </div>
      )}
      <button onClick={onRemove} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
    </div>
  );
}

function SendEmailActionCard({
  action, fields, steps, onChange,
}: { action: AutomationRuleAction; fields: FieldDefinition[]; steps: EarlierStep[]; onChange: () => void }) {
  const cfg = action.config as SendEmailConfig;
  const [local, setLocal] = useState<SendEmailConfig>({
    to_static: cfg.to_static ?? [], to_fields: cfg.to_fields ?? [], to: cfg.to ?? '', cc: cfg.cc ?? '',
    subject: cfg.subject ?? '', body: cfg.body ?? '', attach_document: cfg.attach_document,
  });
  const [dirty, setDirty] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);

  const set = (p: Partial<SendEmailConfig>) => { setLocal((l) => ({ ...l, ...p })); setDirty(true); };
  const save = async () => {
    const problems = validateActionConfig('send_email', local as unknown as Record<string, unknown>);
    setErrs(problems);
    if (problems.length) return;
    await updateAction(action.automation_rule_action_id, { config: local });
    setDirty(false);
    onChange();
  };
  const remove = async () => { await deleteAction(action.automation_rule_action_id); onChange(); };

  // Record fields that resolve to an address (user/owner UUIDs → crm_user.email).
  const recipientFields = fields.filter((f) => {
    const t = (f.field_type?.name ?? '').toLowerCase();
    return ['email', 'lookup', 'owner', 'customer'].includes(t);
  });

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-3">
        <Mail size={15} className="text-blue-600" />
        <span className="text-[13px] font-semibold text-slate-700">Send email</span>
        <div className="flex-1" />
        {dirty && <button onClick={save} className={btnPrimary}><Save size={14} /> Save action</button>}
        <button onClick={remove} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
      </div>

      <label className={lbl}>To — addresses and/or tokens (split on ; ,)</label>
      <div className="flex items-center gap-1">
        <input className={input} value={local.to ?? ''} onChange={(e) => set({ to: e.target.value })} placeholder="sales@co.com; {{steps.recipients.join(email, ';')}}" />
        <TokenMenu recordFields={fields} steps={steps} onPick={(t) => set({ to: `${local.to ?? ''}${t}` })} />
      </div>

      <label className={`${lbl} mt-3`}>Cc</label>
      <div className="flex items-center gap-1">
        <input className={input} value={local.cc ?? ''} onChange={(e) => set({ cc: e.target.value })} placeholder="manager@co.com" />
        <TokenMenu recordFields={fields} steps={steps} onPick={(t) => set({ cc: `${local.cc ?? ''}${t}` })} />
      </div>

      <label className={`${lbl} mt-3`}>…or pick record fields (email or user/owner)</label>
      <select multiple className={`${input} h-20`} value={local.to_fields}
        onChange={(e) => set({ to_fields: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
        {recipientFields.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
      </select>

      <label className={`${lbl} mt-3`}>Subject</label>
      <div className="flex items-center gap-1">
        <input className={input} value={local.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Approval started: {{record.topic}}" />
        <TokenMenu recordFields={fields} steps={steps} onPick={(t) => set({ subject: `${local.subject}${t}` })} />
      </div>

      <label className={`${lbl} mt-3`}>Body (HTML; values are escaped)</label>
      <div className="flex items-start gap-1">
        <textarea className={`${input} font-mono`} rows={5} value={local.body} onChange={(e) => set({ body: e.target.value })} placeholder="<p>…{{record.url}}…</p>  {{steps.recipients.rows}}" />
        <TokenMenu recordFields={fields} steps={steps} onPick={(t) => set({ body: `${local.body}${t}` })} />
      </div>

      <label className="flex items-center gap-2 mt-3 text-[12px] text-slate-600">
        <input type="checkbox" checked={!!local.attach_document} onChange={(e) => set({ attach_document: e.target.checked })} />
        Link a document generated earlier in this rule
      </label>
      {errs.length > 0 && (
        <ul className="mt-2 text-[12px] text-red-600 list-disc list-inside">
          {errs.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}

function UpdateFieldActionCard({
  action, fields, steps, onChange,
}: { action: AutomationRuleAction; fields: FieldDefinition[]; steps: EarlierStep[]; onChange: () => void }) {
  const cfg = action.config as UpdateFieldConfig;
  const [local, setLocal] = useState<UpdateFieldConfig>({
    target: cfg.target ?? 'record', related_lookup_field: cfg.related_lookup_field, field: cfg.field ?? '', value: cfg.value ?? '',
  });
  const [dirty, setDirty] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const set = (p: Partial<UpdateFieldConfig>) => { setLocal((l) => ({ ...l, ...p })); setDirty(true); };
  const save = async () => {
    const problems = validateActionConfig('update_field', local as unknown as Record<string, unknown>);
    setErrs(problems);
    if (problems.length) return;
    await updateAction(action.automation_rule_action_id, { config: local });
    setDirty(false); onChange();
  };
  const remove = async () => { await deleteAction(action.automation_rule_action_id); onChange(); };

  const lookupFields = fields.filter((f) => ['lookup', 'owner', 'customer'].includes((f.field_type?.name ?? '').toLowerCase()));
  const sortedFields = [...fields].sort((a, b) => a.display_name.localeCompare(b.display_name));

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-3">
        <PencilLine size={15} className="text-violet-600" />
        <span className="text-[13px] font-semibold text-slate-700">Update field</span>
        <div className="flex-1" />
        {dirty && <button onClick={save} className={btnPrimary}><Save size={14} /> Save action</button>}
        <button onClick={remove} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Target record</label>
          <select className={input} value={local.target} onChange={(e) => set({ target: e.target.value as 'record' | 'related' })}>
            <option value="record">This record</option>
            <option value="related">Related record (via lookup)</option>
          </select>
        </div>
        {local.target === 'related' && (
          <div>
            <label className={lbl}>Lookup field</label>
            <select className={input} value={local.related_lookup_field ?? ''} onChange={(e) => set({ related_lookup_field: e.target.value })}>
              <option value="">Select…</option>
              {lookupFields.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={lbl}>Field to set</label>
          <select className={input} value={local.field} onChange={(e) => set({ field: e.target.value })}>
            <option value="">Select…</option>
            {sortedFields.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Value (static or {'{{token}}'})</label>
          <div className="flex items-center gap-1">
            <input className={input} value={local.value == null ? '' : String(local.value)} onChange={(e) => set({ value: e.target.value })} placeholder="e.g. Won or {{record.owner}}" />
            <TokenMenu recordFields={fields} steps={steps} onPick={(t) => set({ value: `${local.value ?? ''}${t}` })} />
          </div>
        </div>
      </div>
      {local.target === 'related' && <p className="text-[12px] text-slate-400 mt-2">Updates the record referenced by the chosen lookup (e.g. the parent Account).</p>}
      {errs.length > 0 && <ul className="mt-2 text-[12px] text-red-600 list-disc list-inside">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
    </div>
  );
}

function GenerateDocumentActionCard({
  action, fields, onChange,
}: { action: AutomationRuleAction; fields: FieldDefinition[]; onChange: () => void }) {
  const cfg = action.config as GenerateDocumentConfig & { scope?: string; columns?: string[] };
  const [local, setLocal] = useState({
    format: (cfg.format ?? 'xlsx') as 'xlsx' | 'csv',
    filename: cfg.filename ?? 'export',
    scope: (cfg.scope ?? 'record') as 'record' | 'all',
    columns: cfg.columns ?? [],
  });
  const [dirty, setDirty] = useState(false);
  const set = (p: Partial<typeof local>) => { setLocal((l) => ({ ...l, ...p })); setDirty(true); };
  const save = async () => { await updateAction(action.automation_rule_action_id, { config: local }); setDirty(false); onChange(); };
  const remove = async () => { await deleteAction(action.automation_rule_action_id); onChange(); };
  const sortedFields = [...fields].sort((a, b) => a.display_name.localeCompare(b.display_name));

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-3">
        <FileSpreadsheet size={15} className="text-emerald-600" />
        <span className="text-[13px] font-semibold text-slate-700">Generate document</span>
        <div className="flex-1" />
        {dirty && <button onClick={save} className={btnPrimary}><Save size={14} /> Save action</button>}
        <button onClick={remove} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Format</label>
          <select className={input} value={local.format} onChange={(e) => set({ format: e.target.value as 'xlsx' | 'csv' })}>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Scope</label>
          <select className={input} value={local.scope} onChange={(e) => set({ scope: e.target.value as 'record' | 'all' })}>
            <option value="record">This record only</option>
            <option value="all">All rows (max 5000)</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className={lbl}>Filename</label>
          <input className={input} value={local.filename} onChange={(e) => set({ filename: e.target.value })} placeholder="opportunities-{{record.topic}}" />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Columns (none = all fields)</label>
          <select multiple className={`${input} h-28`} value={local.columns} onChange={(e) => set({ columns: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
            {sortedFields.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
          </select>
        </div>
      </div>
      <p className="text-[12px] text-slate-400 mt-2">Saved to Document storage; link it from an email action with “Link a document”.</p>
    </div>
  );
}

// ── Run history tab ──────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { icon: JSX.Element; cls: string }> = {
  succeeded: { icon: <CheckCircle2 size={14} />, cls: 'text-emerald-600' },
  failed: { icon: <XCircle size={14} />, cls: 'text-amber-600' },
  dead: { icon: <XCircle size={14} />, cls: 'text-red-600' },
  skipped: { icon: <MinusCircle size={14} />, cls: 'text-slate-400' },
  running: { icon: <MinusCircle size={14} />, cls: 'text-blue-500' },
  pending: { icon: <MinusCircle size={14} />, cls: 'text-slate-400' },
};

function HistoryTab({ ruleId }: { ruleId: string }) {
  const [rows, setRows] = useState<AutomationRunHistoryRow[] | null>(null);
  useEffect(() => { void fetchRunHistory(ruleId).then(setRows); }, [ruleId]);

  if (!rows) return <p className="text-[13px] text-slate-500">Loading…</p>;
  if (rows.length === 0) return <p className="text-[13px] text-slate-500">No runs yet. Runs appear here after a matching record change (retained 30 days).</p>;

  return (
    <div className="space-y-2">
      {rows.map((j) => {
        const s = STATUS_STYLE[j.status] ?? STATUS_STYLE.pending;
        return (
          <div key={j.automation_job_id} className={card}>
            <div className="flex items-center gap-2">
              <span className={s.cls}>{s.icon}</span>
              <span className="text-[13px] font-medium capitalize">{j.status}</span>
              <span className="text-[12px] text-slate-400">· record {j.record_id?.slice(0, 8)}…</span>
              <div className="flex-1" />
              <span className="text-[12px] text-slate-400">{new Date(j.queued_at).toLocaleString()}</span>
            </div>
            {j.error && <p className="text-[12px] text-red-600 mt-1">{j.error}</p>}
            <div className="mt-2 space-y-1">
              {j.action_logs.map((l) => {
                const ls = STATUS_STYLE[l.status] ?? STATUS_STYLE.pending;
                const out = (l.output ?? {}) as Record<string, unknown>;
                const recips = [...(Array.isArray(out.to) ? out.to as string[] : []), ...(Array.isArray(out.cc) ? out.cc as string[] : [])];
                return (
                  <div key={l.automation_job_action_log_id} className="flex items-center gap-2 text-[12px] text-slate-500">
                    <span className={ls.cls}>{ls.icon}</span>
                    <span>{l.action_type}</span>
                    {l.action_type === 'list_rows' && out.count != null && <span className="text-slate-400">· {String(out.count)} rows</span>}
                    {l.action_type === 'send_email' && recips.length > 0 && (
                      <span className="text-slate-400" title={recips.join(', ')}>· to {recips.slice(0, 3).join(', ')}{recips.length > 3 ? ` +${recips.length - 3}` : ''}</span>
                    )}
                    {!!out.transport && <span className="text-slate-400">· {String(out.transport)}</span>}
                    {l.error && <span className="text-red-600">· {l.error}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
