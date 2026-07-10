import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Mail, PencilLine, FileSpreadsheet, ListChecks, Braces, ToggleLeft, ToggleRight, CheckCircle2, XCircle, MinusCircle, Zap, ChevronDown, Loader2, ArrowDown } from 'lucide-react';
import type {
  AutomationRule, AutomationRuleAction, AutomationOperator, AutomationTriggerEvent,
  AutomationActionType, AutomationCondition, SendEmailConfig, UpdateFieldConfig,
  GenerateDocumentConfig, ListRowsConfig, ListRowsFilter, ListRowsOperator, AutomationRunHistoryRow,
  AutomationRunAfter, AutomationJobActionLog,
} from '../../types/automationRule';
import type { FieldDefinition } from '../../types/field';
import type { EntityDefinition } from '../../types/entity';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { fetchEntities } from '../../services/entityService';
import {
  fetchRuleById, updateRule, setRuleEnabled, fetchActions, createAction, updateAction,
  deleteAction, fetchRunHistory, fetchFieldChoices,
  type ChoiceOption,
} from '../../services/automationRuleService';
import { invalidateRuleCache } from '../../app/services/automation/dispatch';
import { fetchEmailAccountOptions, type EmailAccountOption } from '../../services/automationEmailAccountService';
import { validateActionConfig, validateRuleTokens } from '../../app/services/automation/actionValidation';
import { operatorLabel, actionLabel, triggerSummary, RUN_AFTER_META, timeAgo } from './ruleSummary';
import ConditionValueInput from '../../app/components/ConditionValueInput';
import Combobox, { type ComboOption } from '../components/Combobox';

export type EditorTab = 'trigger' | 'actions' | 'history';

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
  initialTab?: EditorTab;
}

const input = 'w-full px-2.5 py-1.5 text-[13px] border border-slate-300 rounded outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';
// Same look as `input` but WITHOUT w-full, for use as a flex child (w-full would
// override flex-1 / fixed widths and blow the row's layout out horizontally).
const ctrl = 'px-2.5 py-1.5 text-[13px] border border-slate-300 rounded bg-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';
const lbl = 'block text-[12px] font-medium text-slate-600 mb-1';
const btnPrimary = 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded disabled:opacity-50';
const card = 'bg-white border border-slate-200 rounded-xl p-4';

const OPERATORS: AutomationOperator[] = ['changes_to', 'equals', 'is_any_of', 'changes_from_to', 'changed'];

// Fields that hold a TABLE logical-name (the polymorphic "regarding" parent on a
// timeline note). Their Value input is a dropdown of tables, not a free-text box.
const ENTITY_REF_FIELDS = new Set(['regarding_entity_name']);

/** FieldDefinition[] → combobox options (sorted), optionally under a group header. */
function fieldsToOptions(fields: FieldDefinition[], group?: string): ComboOption[] {
  return [...fields]
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .map((f) => ({ value: f.logical_name, label: f.display_name, group, hint: f.field_type?.name }));
}

interface CondFields { options: ComboOption[]; defs: Record<string, FieldDefinition> }

/**
 * Condition field choices for a rule:
 *  - "This table" — the trigger table's own fields.
 *  - "Related · <Lookup>" — one hop through each lookup field ("<lookup>.<field>").
 *  - "Parent record · <Entity>" — for a polymorphic note-style table, the fields of
 *    the parent entity chosen in the trigger (Regarding (Table) = Lead), encoded
 *    "regarding.<field>" and resolved server-side via regarding_entity_name/id.
 * `defs` maps each encoded value to its FieldDefinition so the value editor is typed.
 */
function useConditionFields(fields: FieldDefinition[], regardingEntities: string[]): CondFields {
  const [extra, setExtra] = useState<CondFields>({ options: [], defs: {} });
  const regKey = regardingEntities.join(',');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const options: ComboOption[] = [];
      const defs: Record<string, FieldDefinition> = {};

      // One hop through this table's lookup fields.
      const lookups = fields.filter(
        (f) => !!f.lookup_entity_id && ['lookup', 'owner', 'customer'].includes((f.field_type?.name ?? '').toLowerCase()),
      );
      for (const lf of lookups) {
        try {
          const tf = await fetchFieldsForEntity(lf.lookup_entity_id as string);
          for (const rf of [...tf].sort((a, b) => a.display_name.localeCompare(b.display_name))) {
            const key = `${lf.logical_name}.${rf.logical_name}`;
            options.push({ value: key, label: rf.display_name, group: `Related · ${lf.display_name}`, hint: rf.field_type?.name });
            defs[key] = rf;
          }
        } catch { /* skip */ }
      }

      // Parent (regarding) record fields — resolved at runtime from the note's regarding pointer.
      if (regardingEntities.length) {
        const ents = await fetchEntities().catch(() => []);
        const seen = new Set<string>();
        for (const logical of regardingEntities) {
          const e = ents.find((x) => x.logical_name === logical);
          if (!e) continue;
          try {
            const tf = await fetchFieldsForEntity(e.entity_definition_id);
            for (const rf of [...tf].sort((a, b) => a.display_name.localeCompare(b.display_name))) {
              const key = `regarding.${rf.logical_name}`;
              if (seen.has(key)) continue;
              seen.add(key);
              options.push({ value: key, label: rf.display_name, group: `Parent record · ${e.display_name}`, hint: rf.field_type?.name });
              defs[key] = rf;
            }
          } catch { /* skip */ }
        }
      }

      if (!cancelled) setExtra({ options, defs });
    })();
    return () => { cancelled = true; };
  }, [fields, regKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const own = useMemo(() => fieldsToOptions(fields, 'This table'), [fields]);
  return useMemo(() => ({ options: [...own, ...extra.options], defs: extra.defs }), [own, extra]);
}

function fieldKind(f: FieldDefinition | undefined): 'boolean' | 'choice' | 'lookup' | 'text' {
  const t = (f?.field_type?.name ?? '').toLowerCase();
  if (['boolean', 'two_options', 'yesno', 'yes_no', 'bool'].includes(t)) return 'boolean';
  if (['choice', 'multi_choice', 'option_set', 'optionset', 'picklist', 'status'].includes(t)) return 'choice';
  if (['lookup', 'owner', 'customer'].includes(t)) return 'lookup';
  return 'text';
}

export default function RuleEditorPage({ ruleId, onBack, initialTab = 'trigger' }: Props) {
  const [rule, setRule] = useState<AutomationRule | null>(null);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [choices, setChoices] = useState<ChoiceOption[]>([]);
  const [actions, setActions] = useState<AutomationRuleAction[]>([]);
  const [tab, setTab] = useState<EditorTab>(initialTab);
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
          <ActionsTab rule={rule} ruleId={ruleId} fields={fields} actions={actions} onChange={refreshActions} />
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

  // A "Regarding (Table)" field picks its value from the list of tables.
  const isEntityRef = ENTITY_REF_FIELDS.has(rule.field_logical_name ?? '');
  const [entityOpts, setEntityOpts] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!isEntityRef) return;
    void fetchEntities().then((es) =>
      setEntityOpts(
        [...es].sort((a, b) => a.display_name.localeCompare(b.display_name))
          .map((e) => ({ value: e.logical_name, label: e.display_name })),
      ),
    );
  }, [isEntityRef]);

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
            <Combobox
              options={[{ value: '', label: '(any change)' }, ...fieldsToOptions(fields)]}
              value={rule.field_logical_name ?? ''}
              onChange={(v) => patch({ field_logical_name: v || null, trigger_value: null })}
              placeholder="(any change)"
              searchPlaceholder="Search fields…"
            />
          </div>
          <div>
            <label className={lbl}>Operator</label>
            <select value={rule.operator} onChange={(e) => patch({ operator: e.target.value as AutomationOperator })} className={input}>
              {OPERATORS.map((op) => <option key={op} value={op}>{operatorLabel(op)}</option>)}
            </select>
          </div>
          {showValue && (
            <div>
              <label className={lbl}>Value{isEntityRef && rule.operator === 'is_any_of' ? ' (pick one or more)' : ''}</label>
              <ValueInput
                kind={kind} operator={rule.operator} choices={choices}
                value={rule.trigger_value} onChange={(v) => patch({ trigger_value: v })}
                entityOptions={isEntityRef ? entityOpts : undefined}
              />
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
  // If the trigger pins the polymorphic parent (Regarding (Table) = Lead / is any of …),
  // offer that parent entity's fields as "regarding.<field>" conditions.
  const regardingEntities = useMemo<string[]>(() => {
    if (rule.field_logical_name !== 'regarding_entity_name') return [];
    const v = rule.trigger_value;
    if (rule.operator === 'is_any_of' && Array.isArray(v)) return v.map(String).filter(Boolean);
    if (typeof v === 'string' && v) return [v];
    return [];
  }, [rule.field_logical_name, rule.operator, rule.trigger_value]);
  const { options: fieldOptions, defs: fieldDefs } = useConditionFields(fields, regardingEntities);
  const update = (i: number, p: Partial<AutomationCondition>) =>
    patch({ conditions: conditions.map((c, idx) => (idx === i ? { ...c, ...p } : c)) });
  const add = () => patch({ conditions: [...conditions, { field: '', operator: 'equals', value: '' }] });
  const remove = (i: number) => patch({ conditions: conditions.filter((_, idx) => idx !== i) });

  return (
    <div className={card}>
      <p className="text-[13px] font-semibold text-slate-700 mb-1">AND conditions <span className="font-normal text-slate-400">(optional)</span></p>
      <p className="text-[12px] text-slate-400 mb-3">All must hold (evaluated against the saved record) for the rule to run.</p>
      {conditions.length === 0 && <p className="text-[12px] text-slate-400 mb-1">No conditions.</p>}
      <div className="space-y-2">
        {conditions.map((c, i) => (
          <ConditionRow
            key={i}
            index={i}
            condition={c}
            fields={fields}
            fieldOptions={fieldOptions}
            fieldDefs={fieldDefs}
            onChange={(p) => update(i, p)}
            onRemove={() => remove(i)}
          />
        ))}
      </div>
      <button onClick={add} className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 border border-dashed border-slate-300 text-slate-600 text-[12px] rounded hover:border-slate-400">
        <Plus size={14} /> Add condition
      </button>
    </div>
  );
}

// A single AND-condition row. The value editor is chosen by the selected field's
// TYPE (lookup → record dropdown of labels, choice/optionset → label dropdown,
// boolean → Yes/No, date/number → typed input, else text) via ConditionValueInput.
function ConditionRow({
  index, condition, fields, fieldOptions, fieldDefs, onChange, onRemove,
}: {
  index: number;
  condition: AutomationCondition;
  fields: FieldDefinition[];
  fieldOptions: ComboOption[];
  fieldDefs: Record<string, FieldDefinition>;
  onChange: (p: Partial<AutomationCondition>) => void;
  onRemove: () => void;
}) {
  // Resolve the field def from own fields OR the related/parent map so the value
  // editor is typed (choice → dropdown, lookup → record picker, etc.).
  const selectedField =
    fieldDefs[condition.field] ?? fields.find((f) => f.logical_name === condition.field) ?? null;
  const needsValue = condition.operator === 'equals' || condition.operator === 'not_equals';

  return (
    <div className="grid grid-cols-[auto_1.4fr_1fr_1.4fr_auto] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
      <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {index === 0 ? 'Where' : 'And'}
      </span>
      {/* Field — reset the value when the column (and therefore its type) changes. */}
      <Combobox
        options={fieldOptions}
        value={condition.field}
        onChange={(v) => onChange({ field: v, value: '' })}
        placeholder="Select field…"
        searchPlaceholder="Search fields (incl. related)…"
      />
      <select
        className={ctrl}
        value={condition.operator}
        onChange={(e) => onChange({ operator: e.target.value as AutomationCondition['operator'] })}
      >
        <option value="equals">equals</option>
        <option value="not_equals">not equals</option>
        <option value="is_empty">is empty</option>
        <option value="is_not_empty">is not empty</option>
      </select>
      {needsValue ? (
        condition.field ? (
          <ConditionValueInput
            field={selectedField}
            value={condition.value == null ? '' : String(condition.value)}
            onChange={(v) => onChange({ value: v })}
            variant="boxed"
            placeholder="value"
          />
        ) : (
          <input className={`${ctrl} w-full`} disabled placeholder="pick a field first" />
        )
      ) : (
        <span />
      )}
      <button onClick={onRemove} className="justify-self-end text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
    </div>
  );
}

function ValueInput({
  kind, operator, choices, value, onChange, entityOptions,
}: { kind: string; operator: AutomationOperator; choices: ChoiceOption[]; value: unknown; onChange: (v: unknown) => void; entityOptions?: { value: string; label: string }[] }) {
  // "Regarding (Table)" and similar entity-name fields: pick from the table list.
  if (entityOptions) {
    if (operator === 'is_any_of') {
      const arr = Array.isArray(value) ? value.map(String) : [];
      return (
        <select
          multiple
          className={`${input} h-28`}
          value={arr}
          onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}
        >
          {entityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    // Single value → searchable combobox of related tables.
    return (
      <Combobox
        options={entityOptions}
        value={value == null ? '' : String(value)}
        onChange={(v) => onChange(v)}
        placeholder="Select related table…"
        searchPlaceholder="Search tables…"
      />
    );
  }
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

// A vertical connector between flow nodes. Its centre optionally holds the
// "run after" branch selector (shown for every step except the first).
function FlowConnector({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 py-1.5">
      <div className="h-3.5 w-px bg-slate-300" />
      {children ?? <ArrowDown size={14} className="text-slate-300" />}
      <div className="h-3.5 w-px bg-slate-300" />
    </div>
  );
}

// "Configure run after" pill — a dropdown styled by branch (success/failure/always).
function RunAfterSelect({
  value, onChange, busy,
}: { value: AutomationRunAfter; onChange: (v: AutomationRunAfter) => void; busy: boolean }) {
  const meta = RUN_AFTER_META[value];
  return (
    <div className="relative inline-flex" title={meta.hint}>
      <select
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value as AutomationRunAfter)}
        className={`appearance-none cursor-pointer rounded-full border pl-2.5 pr-6 py-0.5 text-[11px] font-semibold outline-none ${meta.cls}`}
      >
        <option value="success">Run after · On success</option>
        <option value="failure">Run after · On failure</option>
        <option value="always">Run after · Always</option>
      </select>
      {busy
        ? <Loader2 size={12} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 animate-spin opacity-60" />
        : <ChevronDown size={12} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 opacity-60" />}
    </div>
  );
}

function ActionsTab({
  rule, ruleId, fields, actions, onChange,
}: { rule: AutomationRule; ruleId: string; fields: FieldDefinition[]; actions: AutomationRuleAction[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = async (type: AutomationActionType) => {
    setAdding(false);
    await createAction(ruleId, type, DEFAULT_CONFIG[type], actions.length);
    onChange();
  };

  const setRunAfter = async (a: AutomationRuleAction, ra: AutomationRunAfter) => {
    setBusyId(a.automation_rule_action_id);
    try { await updateAction(a.automation_rule_action_id, { run_after: ra }); onChange(); }
    finally { setBusyId(null); }
  };

  const tokenProblems = validateRuleTokens(actions);
  const hasFailureBranch = actions.some((a) => a.run_after === 'failure' || a.run_after === 'always');

  const renderCard = (a: AutomationRuleAction, idx: number) => {
    const steps = earlierStepsBefore(actions, idx);
    if (a.action_type === 'list_rows') return <ListRowsActionCard action={a} recordFields={fields} steps={steps} onChange={onChange} />;
    if (a.action_type === 'update_field') return <UpdateFieldActionCard action={a} fields={fields} steps={steps} onChange={onChange} />;
    if (a.action_type === 'generate_document') return <GenerateDocumentActionCard action={a} fields={fields} onChange={onChange} />;
    return <SendEmailActionCard action={a} fields={fields} steps={steps} onChange={onChange} />;
  };

  return (
    <div className="mx-auto max-w-2xl">
      {tokenProblems.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-[12px] font-medium text-amber-800">Token / step reference issues:</p>
          <ul className="list-inside list-disc text-[12px] text-amber-700">{tokenProblems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      {/* Trigger node — the flow's starting point */}
      <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-600"><Zap size={17} /></div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Trigger</p>
          <p className="text-[13px] font-medium text-slate-800">{triggerSummary(rule)}</p>
        </div>
      </div>

      {actions.length === 0 ? (
        <>
          <FlowConnector />
          <p className="rounded-xl border border-dashed border-slate-300 py-6 text-center text-[13px] text-slate-400">
            No actions yet — add your first step below.
          </p>
        </>
      ) : (
        actions.map((a, idx) => (
          <div key={a.automation_rule_action_id}>
            <FlowConnector>
              {idx > 0 && (
                <RunAfterSelect
                  value={a.run_after ?? 'success'}
                  busy={busyId === a.automation_rule_action_id}
                  onChange={(ra) => setRunAfter(a, ra)}
                />
              )}
            </FlowConnector>
            <div className="relative">
              <span className="absolute -left-2.5 -top-2.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-slate-700 text-[11px] font-bold text-white shadow ring-2 ring-white">
                {idx + 1}
              </span>
              {renderCard(a, idx)}
            </div>
          </div>
        ))
      )}

      <FlowConnector />

      <div className="relative flex justify-center">
        <button
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-white px-4 py-1.5 text-[13px] text-slate-600 hover:border-blue-400 hover:text-blue-600"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus size={15} /> Add step
        </button>
        {adding && (
          <div className="absolute top-full z-10 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {(['list_rows', 'send_email', 'update_field', 'generate_document'] as AutomationActionType[]).map((t) => (
              <button key={t} onClick={() => add(t)} className="block w-full px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50">{actionLabel(t)}</button>
            ))}
          </div>
        )}
      </div>

      {hasFailureBranch && (
        <p className="mt-4 text-center text-[11.5px] text-slate-400">
          Steps with an <span className="font-semibold text-red-500">On failure</span> / <span className="font-semibold text-slate-500">Always</span> branch let the flow react to an earlier step's error (e.g. send an alert).
        </p>
      )}
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
          <Combobox
            options={sortedEnt.map((e) => ({ value: e.logical_name, label: e.display_name }))}
            value={local.source_table}
            onChange={(v) => set({ source_table: v, columns: [], filters: [] })}
            placeholder="Select…"
            searchPlaceholder="Search tables…"
          />
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
    <div className="grid grid-cols-[1.2fr_1fr_1.2fr_auto] items-center gap-2">
      <Combobox
        options={fieldsToOptions(srcFields)}
        value={filter.field}
        onChange={(v) => onChange({ field: v, value: '' })}
        placeholder="Field…"
        searchPlaceholder="Search fields…"
      />
      <select className={ctrl} value={filter.operator} onChange={(e) => onChange({ operator: e.target.value as ListRowsOperator })}>
        <option value="equals">equals</option>
        <option value="not_equals">not equals</option>
        <option value="contains">contains</option>
        <option value="is_any_of">is any of</option>
        <option value="is_empty">is empty</option>
        <option value="is_not_empty">not empty</option>
      </select>
      {needsValue ? (
        /* Typed input by field kind, unless a token is being used. */
        !isTokenVal && kind === 'boolean' ? (
          <select className={`${ctrl} w-full`} value={filter.value === true ? 'true' : filter.value === false ? 'false' : ''} onChange={(e) => onChange({ value: e.target.value === 'true' })}>
            <option value="">Select…</option><option value="true">Yes</option><option value="false">No</option>
          </select>
        ) : !isTokenVal && kind === 'choice' && choices.length ? (
          <select className={`${ctrl} w-full`} value={filter.value == null ? '' : String(filter.value)} onChange={(e) => onChange({ value: e.target.value })}>
            <option value="">Select…</option>
            {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        ) : (
          <input className={`${ctrl} w-full`} value={filter.value == null ? '' : String(filter.value)} onChange={(e) => onChange({ value: e.target.value })} placeholder="value or {{token}}" />
        )
      ) : (
        <span />
      )}
      <div className="flex items-center justify-end gap-0.5">
        {needsValue && <TokenMenu recordFields={recordFields} steps={steps} onPick={(t) => onChange({ value: `${filter.value ?? ''}${t}` })} />}
        <button onClick={onRemove} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
      </div>
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
    email_account_id: cfg.email_account_id ?? null,
  });
  const [dirty, setDirty] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<EmailAccountOption[]>([]);
  useEffect(() => { void fetchEmailAccountOptions().then((a) => setAccounts(a.filter((x) => x.enabled))).catch(() => {}); }, []);

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

      <label className={lbl}>Send from</label>
      <select
        className={input}
        value={local.email_account_id ?? ''}
        onChange={(e) => set({ email_account_id: e.target.value || null })}
      >
        <option value="">
          {`Default account${accounts.find((a) => a.is_default) ? ` (${accounts.find((a) => a.is_default)!.from_address})` : ''}`}
        </option>
        {accounts.map((a) => (
          <option key={a.account_id} value={a.account_id}>{a.name} — {a.from_address}</option>
        ))}
      </select>
      {accounts.length === 0 && (
        <p className="text-[11px] text-slate-400 mt-1">No mailboxes configured yet — add one in the Email accounts tab, or set GRAPH_* in the server .env.</p>
      )}

      <label className={`${lbl} mt-3`}>To — addresses and/or tokens (split on ; ,)</label>
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

function fmtDuration(a: string | null, b: string | null): string {
  if (!a || !b) return '';
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

// Short one-line summary of an action's output, per action type.
function stepOutputSummary(l: AutomationJobActionLog): string | null {
  const out = (l.output ?? {}) as Record<string, unknown>;
  if (l.action_type === 'list_rows' && out.count != null) return `${out.count} row${out.count === 1 ? '' : 's'}`;
  if (l.action_type === 'send_email') {
    const recips = [...(Array.isArray(out.to) ? out.to as string[] : []), ...(Array.isArray(out.cc) ? out.cc as string[] : [])];
    if (recips.length) return `to ${recips.slice(0, 3).join(', ')}${recips.length > 3 ? ` +${recips.length - 3}` : ''}${out.transport ? ` · ${out.transport}` : ''}`;
  }
  if (l.action_type === 'update_field' && out.field) return `${out.field} = ${String(out.value ?? '')}`.slice(0, 60);
  if (l.action_type === 'generate_document' && out.document_path) return String(out.document_path).split('/').pop() ?? null;
  return null;
}

function HistoryTab({ ruleId }: { ruleId: string }) {
  const [rows, setRows] = useState<AutomationRunHistoryRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async () => {
    setReloading(true);
    try { setRows(await fetchRunHistory(ruleId)); } finally { setReloading(false); }
  }, [ruleId]);
  useEffect(() => { void load(); }, [load]);

  if (!rows) return <p className="text-[13px] text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[12px] text-slate-400">{rows.length} recent run{rows.length === 1 ? '' : 's'} · click a run to see each step</p>
        <button onClick={() => void load()} className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-blue-600">
          <Loader2 size={12} className={reloading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-[13px] text-slate-400">
          No runs yet. Runs appear here after a matching record change (retained 30 days).
        </p>
      )}

      {rows.map((j) => {
        const s = STATUS_STYLE[j.status] ?? STATUS_STYLE.pending;
        const isOpen = openId === j.automation_job_id;
        const logs = j.action_logs;
        const failedIdx = logs.findIndex((l) => l.status === 'failed');
        const okCount = logs.filter((l) => l.status === 'succeeded').length;
        const bad = j.status === 'failed' || j.status === 'dead';
        return (
          <div key={j.automation_job_id} className={`overflow-hidden rounded-xl border ${bad ? 'border-red-200' : 'border-slate-200'} bg-white`}>
            {/* run header (click to expand) */}
            <button
              onClick={() => setOpenId(isOpen ? null : j.automation_job_id)}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-slate-50"
            >
              <span className={s.cls}>{s.icon}</span>
              <span className="text-[13px] font-semibold capitalize text-slate-700">{j.status}</span>
              {logs.length > 0 && (
                <span className="text-[12px] text-slate-400">
                  · {okCount}/{logs.length} step{logs.length === 1 ? '' : 's'}
                  {failedIdx >= 0 && <span className="ml-1 font-medium text-red-500">· failed at step {failedIdx + 1} ({actionLabel(logs[failedIdx].action_type as AutomationActionType)})</span>}
                </span>
              )}
              <div className="flex-1" />
              {j.attempts > 1 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">attempt {j.attempts}</span>}
              <span className="text-[12px] text-slate-400">{timeAgo(j.queued_at)}</span>
              <ChevronDown size={15} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
              <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                <div className="mb-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-slate-400">
                  <span>Record {j.record_id?.slice(0, 8)}…</span>
                  <span>Trigger: {j.trigger_event}</span>
                  <span>Queued {new Date(j.queued_at).toLocaleString()}</span>
                  {j.finished_at && <span>Finished {new Date(j.finished_at).toLocaleString()}</span>}
                </div>

                {logs.length === 0 ? (
                  <p className="text-[12px] text-slate-400">No steps recorded{j.error ? ` — ${j.error}` : ''}.</p>
                ) : (
                  <ol className="space-y-0">
                    {logs.map((l, i) => {
                      const ls = STATUS_STYLE[l.status] ?? STATUS_STYLE.pending;
                      const summary = stepOutputSummary(l);
                      const dur = fmtDuration(l.started_at, l.finished_at);
                      const isFail = l.status === 'failed';
                      return (
                        <li key={l.automation_job_action_log_id} className="flex gap-3">
                          {/* rail */}
                          <div className="flex flex-col items-center">
                            <div className={`h-2 w-px ${i === 0 ? 'bg-transparent' : 'bg-slate-200'}`} />
                            <span className={`grid h-6 w-6 place-items-center rounded-full bg-white ring-1 ${isFail ? 'ring-red-300' : 'ring-slate-200'} ${ls.cls}`}>{ls.icon}</span>
                            <div className={`w-px flex-1 ${i === logs.length - 1 ? 'bg-transparent' : 'bg-slate-200'}`} />
                          </div>
                          {/* body */}
                          <div className={`my-1 flex-1 rounded-lg border px-3 py-2 ${isFail ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-400">STEP {(l.sort_order ?? i) + 1}</span>
                              <span className="text-[12.5px] font-medium text-slate-700">{actionLabel(l.action_type as AutomationActionType)}</span>
                              <span className={`text-[11px] font-semibold capitalize ${ls.cls}`}>{l.status}</span>
                              <div className="flex-1" />
                              {dur && <span className="text-[11px] text-slate-400">{dur}</span>}
                            </div>
                            {summary && <p className="mt-0.5 text-[11.5px] text-slate-500">{summary}</p>}
                            {l.error && <p className={`mt-0.5 text-[11.5px] ${isFail ? 'text-red-600' : 'text-slate-400'}`}>{l.error}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {j.error && failedIdx < 0 && <p className="mt-2 text-[12px] text-red-600">{j.error}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
