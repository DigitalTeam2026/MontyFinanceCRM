import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Mail, PencilLine, FileSpreadsheet, ListChecks, KeyRound, Braces, ToggleLeft, ToggleRight, CheckCircle2, XCircle, MinusCircle, Zap, ChevronDown, Loader2, ArrowDown, Clock, CalendarClock, RotateCw, Eye, X, Filter, Check, GitBranch, GripVertical } from 'lucide-react';
import type {
  AutomationRule, AutomationRuleAction, AutomationOperator, AutomationTriggerEvent,
  AutomationActionType, AutomationBranch, AutomationCondition, SendEmailConfig, UpdateFieldConfig,
  GenerateDocumentConfig, ListRowsConfig, ListRowsFilter, ListRowsOperator, GetRowConfig, AutomationRunHistoryRow,
  AutomationRunAfter, AutomationActionRunCondition, ConditionConfig, AutomationJobActionLog, ScheduleConfig, ScheduleFrequency, ExportViewEmailConfig,
  RelatedExportEmailConfig, RelatedExportSource, RelatedExportColumn,
  FieldMapping, CreateRelatedRecordConfig, UpdateRelatedRecordConfig, RelatedMatchMode,
} from '../../types/automationRule';
import type { ViewDefinition } from '../../types/view';
import type { FieldDefinition } from '../../types/field';
import type { EntityDefinition } from '../../types/entity';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { fetchEntities } from '../../services/entityService';
import {
  fetchRuleById, updateRule, setRuleEnabled, fetchActions, createAction, updateAction, moveAction,
  deleteAction, fetchRunHistory, fetchFieldChoices, computeNextRunAt, fetchRelatedSourceOptions, rerunRun,
  type ChoiceOption, type RelatedSourceOptions,
} from '../../services/automationRuleService';
import { fetchViewsForEntityLogical } from '../../services/viewService';
import { invalidateRuleCache } from '../../app/services/automation/dispatch';
import { fetchEmailAccountOptions, type EmailAccountOption } from '../../services/automationEmailAccountService';
import { validateActionConfig, validateRuleTokens } from '../../app/services/automation/actionValidation';
import { operatorLabel, actionLabel, triggerSummary, scheduleSummary, RUN_AFTER_META, timeAgo } from './ruleSummary';
import ConditionValueInput from '../../app/components/ConditionValueInput';
import Combobox, { type ComboOption } from '../components/Combobox';

export type EditorTab = 'trigger' | 'actions' | 'history';

/** Steps (list_rows / get_row) defined before a given action — for token pickers + refs. */
interface EarlierStep { name: string; columns: string[]; single?: boolean }
function earlierStepsBefore(actions: AutomationRuleAction[], index: number): EarlierStep[] {
  const out: EarlierStep[] = [];
  for (let i = 0; i < index; i++) {
    const a = actions[i];
    if (a.action_type === 'list_rows' || a.action_type === 'get_row') {
      const cfg = a.config as unknown as ListRowsConfig | GetRowConfig;
      if (cfg.step_name) out.push({ name: cfg.step_name, columns: Array.isArray(cfg.columns) ? cfg.columns : [], single: a.action_type === 'get_row' });
    }
  }
  return out;
}

// Field types whose display value differs from the stored id/code, so the picker
// also offers a "· id" (raw) token — the value you match/look up on.
const RAW_TOKEN_TYPES = new Set(['lookup', 'owner', 'customer', 'choice', 'multi_choice', 'option_set', 'multi_option_set']);

interface TokenItem { label: string; value: string; hint?: string }
interface TokenGroup { title: string; items: TokenItem[] }

// "Dynamic content" picker (Power-Automate style): pick a value from the trigger
// record or from any earlier step (get_row / list_rows) in this same flow. Lookup
// fields also expose a "· id" token — the raw id used to match/look up.
function TokenMenu({ recordFields, steps, onPick, open: openProp, onOpenChange }: { recordFields: FieldDefinition[]; steps: EarlierStep[]; onPick: (t: string) => void; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  // Controlled when `open`/`onOpenChange` are supplied (lets a parent keep only one
  // menu open at a time); otherwise falls back to its own internal state.
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = (v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(open) : v;
    if (onOpenChange) onOpenChange(next); else setOpenInternal(next);
  };
  const [q, setQ] = useState('');

  const groups: TokenGroup[] = [];

  const recItems: TokenItem[] = [{ label: 'Record link', value: '{{record.url}}', hint: 'record.url' }];
  for (const f of [...recordFields].sort((a, b) => a.display_name.localeCompare(b.display_name))) {
    recItems.push({ label: f.display_name, value: `{{record.${f.logical_name}}}`, hint: f.logical_name });
    const t = (f.field_type?.name ?? '').toLowerCase();
    if (RAW_TOKEN_TYPES.has(t)) {
      recItems.push({ label: `${f.display_name} · id`, value: `{{record.raw.${f.logical_name}}}`, hint: `${f.logical_name} · raw id` });
    }
  }
  groups.push({ title: 'Trigger record', items: recItems });

  // One group per earlier step = one fetched entity's columns.
  for (const s of steps) {
    const items: TokenItem[] = [];
    if (s.single) {
      for (const c of s.columns) {
        items.push({ label: c, value: `{{steps.${s.name}.first(${c})}}` });
        items.push({ label: `${c} · id`, value: `{{steps.${s.name}.raw(${c})}}`, hint: 'raw id' });
      }
      if (s.columns.length === 0) items.push({ label: 'row (table)', value: `{{steps.${s.name}.rows}}` });
    } else {
      for (const c of s.columns) {
        items.push({ label: `${c} (joined)`, value: `{{steps.${s.name}.join(${c}, ';')}}` });
      }
      items.push({ label: 'rows (table)', value: `{{steps.${s.name}.rows}}` });
    }
    items.push({ label: 'count', value: `{{steps.${s.name}.count}}` });
    groups.push({ title: `Step: ${s.name}`, items });
  }

  const ql = q.trim().toLowerCase();
  const filtered = ql
    ? groups
        // Matching the GROUP TITLE (entity/step name) keeps all its fields; otherwise
        // keep only the fields that match — so you can search by entity OR by field.
        .map((g) => (g.title.toLowerCase().includes(ql)
          ? g
          : { ...g, items: g.items.filter((it) => `${it.label} ${it.hint ?? ''} ${it.value}`.toLowerCase().includes(ql)) }))
        .filter((g) => g.items.length)
    : groups;

  return (
    <span className="relative inline-block">
      <button type="button" title="Insert dynamic content" onClick={() => { setOpen((v) => !v); setQ(''); }} className="text-slate-400 hover:text-blue-600 p-1"><Braces size={14} /></button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dynamic content…" className="w-full rounded border border-slate-200 px-2 py-1 text-[12px] outline-none focus:border-blue-400" />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-[12px] text-slate-400">No matches.</p>}
            {filtered.map((g) => (
              <div key={g.title}>
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{g.title}</p>
                {g.items.map((it) => (
                  <button key={it.value} type="button" onClick={() => { onPick(it.value); setOpen(false); setQ(''); }} className="block w-full px-3 py-1 text-left hover:bg-slate-50">
                    <span className="text-[12px] text-slate-700">{it.label}</span>
                    {it.hint && <span className="ml-1.5 font-mono text-[10px] text-slate-400">{it.hint}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

// Renders the email body HTML in an isolated iframe so authors can eyeball the
// design without sending. Tokens ({{record.*}}, {{steps.*}}) stay literal — this
// previews layout/styling, not the merged values, which only exist at run time.
function HtmlPreviewButton({ html }: { html: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
        title="Preview the email design"
      >
        <Eye size={13} /> Preview
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5">
              <Eye size={15} className="text-blue-600" />
              <span className="text-[13px] font-semibold text-slate-700">Email preview</span>
              <span className="text-[11px] text-slate-400">Tokens like {'{{record.*}}'} show as-is</span>
              <div className="flex-1" />
              <button type="button" onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>
            {html.trim()
              ? <iframe title="Email preview" sandbox="" className="flex-1 w-full bg-white" srcDoc={html} />
              : <div className="flex flex-1 items-center justify-center text-[13px] text-slate-400">Body is empty — nothing to preview.</div>}
          </div>
        </div>
      )}
    </>
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

// A native <select multiple> traps the mouse wheel: while the cursor is over it
// the wheel scrolls the list's own overflow, and once the list is at its top or
// bottom boundary the element swallows the event instead of letting the page
// scroll — so a wide listbox becomes a "dead zone" you can't scroll past. Chain
// the wheel to the nearest scrollable ancestor whenever the list itself can't
// scroll further in the wheel direction.
function chainWheel(e: React.WheelEvent<HTMLSelectElement>) {
  const el = e.currentTarget;
  const canScroll = el.scrollHeight > el.clientHeight;
  const atTop = el.scrollTop <= 0;
  const atBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 1;
  if (canScroll && !((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom))) return;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) {
      p.scrollTop += e.deltaY;
      e.preventDefault();
      return;
    }
  }
}

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

  const isSchedule = rule?.trigger_type === 'schedule';

  const save = async () => {
    if (!rule) return;
    setSaving(true);
    try {
      if (rule.trigger_type === 'schedule') {
        // Recompute the next fire time from the (possibly edited) schedule so a
        // change takes effect immediately rather than on the old cadence.
        const next = rule.schedule_config ? computeNextRunAt(rule.schedule_config) : null;
        await updateRule(rule.automation_rule_id, {
          name: rule.name,
          description: rule.description,
          schedule_config: rule.schedule_config,
          next_run_at: next,
        });
      } else {
        await updateRule(rule.automation_rule_id, {
          name: rule.name,
          description: rule.description,
          table_logical_name: rule.table_logical_name,
          trigger_event: rule.trigger_event,
          field_logical_name: rule.field_logical_name,
          operator: rule.operator,
          trigger_value: rule.trigger_value,
          conditions: rule.conditions,
        });
      }
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
            {t === 'trigger' ? (isSchedule ? 'Schedule' : 'Trigger') : t === 'actions' ? `Actions (${actions.length})` : 'Run history'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        {tab === 'trigger' && (
          isSchedule
            ? <ScheduleTab rule={rule} patch={patch} />
            : <TriggerTab rule={rule} fields={fields} kind={kind} choices={choices} patch={patch} />
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
  // Full entity list for the trigger Table picker (change which entity fires the rule).
  const [allEntityOpts, setAllEntityOpts] = useState<ComboOption[]>([]);
  useEffect(() => {
    void fetchEntities().then((es) => {
      const sorted = [...es].sort((a, b) => a.display_name.localeCompare(b.display_name));
      setAllEntityOpts(sorted.map((e) => ({ value: e.logical_name, label: e.display_name })));
      if (isEntityRef) setEntityOpts(sorted.map((e) => ({ value: e.logical_name, label: e.display_name })));
    });
  }, [isEntityRef]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className={card}>
        <p className="text-[13px] font-semibold text-slate-700 mb-3">WHEN</p>
        <div className="mb-3">
          <label className={lbl}>Table (which records fire this rule)</label>
          <Combobox
            options={allEntityOpts}
            value={rule.table_logical_name}
            onChange={(v) => { if (v && v !== rule.table_logical_name) patch({ table_logical_name: v, field_logical_name: null, trigger_value: null, conditions: [] }); }}
            placeholder="Select a table…"
            searchPlaceholder="Search tables…"
          />
          <p className="mt-1 text-[11px] text-slate-400">Changing the table resets the trigger field &amp; conditions. Review your actions afterward.</p>
        </div>
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
              <label className={lbl}>Value{rule.operator === 'is_any_of' ? ' (pick one or more)' : ''}</label>
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

// ── Schedule tab (recurring flows) ────────────────────────────────────────────

const WEEKDAY_OPTS = [
  { v: 0, l: 'Sunday' }, { v: 1, l: 'Monday' }, { v: 2, l: 'Tuesday' }, { v: 3, l: 'Wednesday' },
  { v: 4, l: 'Thursday' }, { v: 5, l: 'Friday' }, { v: 6, l: 'Saturday' },
];
const FREQ_OPTS: { v: ScheduleFrequency; l: string }[] = [
  { v: 'hourly', l: 'Hourly' }, { v: 'daily', l: 'Daily' }, { v: 'weekly', l: 'Weekly' }, { v: 'monthly', l: 'Monthly' },
];

function ScheduleTab({
  rule, patch,
}: { rule: AutomationRule; patch: (p: Partial<AutomationRule>) => void }) {
  const cfg: ScheduleConfig = rule.schedule_config ?? { frequency: 'daily', hour: 8, minute: 0 };
  const setCfg = (p: Partial<ScheduleConfig>) => patch({ schedule_config: { ...cfg, ...p } });

  // time-of-day <input type=time> ⇄ {hour, minute}
  const timeStr = `${String(cfg.hour ?? 8).padStart(2, '0')}:${String(cfg.minute ?? 0).padStart(2, '0')}`;
  const onTime = (v: string) => {
    const [h, m] = v.split(':').map((x) => Number(x));
    setCfg({ hour: Number.isFinite(h) ? h : 0, minute: Number.isFinite(m) ? m : 0 });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className={card}>
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock size={16} className="text-blue-600" />
          <p className="text-[13px] font-semibold text-slate-700">Run this flow on a schedule</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Frequency</label>
            <select className={input} value={cfg.frequency} onChange={(e) => setCfg({ frequency: e.target.value as ScheduleFrequency })}>
              {FREQ_OPTS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
            </select>
          </div>

          {cfg.frequency === 'hourly' ? (
            <div>
              <label className={lbl}>At minute (0–59)</label>
              <input type="number" min={0} max={59} className={input} value={cfg.minute ?? 0}
                onChange={(e) => setCfg({ minute: Math.min(59, Math.max(0, Number(e.target.value) || 0)) })} />
            </div>
          ) : (
            <div>
              <label className={lbl}>At time</label>
              <input type="time" className={input} value={timeStr} onChange={(e) => onTime(e.target.value)} />
            </div>
          )}

          {cfg.frequency === 'weekly' && (
            <div>
              <label className={lbl}>Day of week</label>
              <select className={input} value={cfg.weekday ?? 1} onChange={(e) => setCfg({ weekday: Number(e.target.value) })}>
                {WEEKDAY_OPTS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
              </select>
            </div>
          )}
          {cfg.frequency === 'monthly' && (
            <div>
              <label className={lbl}>Day of month (1–31)</label>
              <input type="number" min={1} max={31} className={input} value={cfg.monthday ?? 1}
                onChange={(e) => setCfg({ monthday: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
              <p className="mt-1 text-[11px] text-slate-400">Clamped to the last day in shorter months.</p>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
          <Clock size={14} className="text-slate-400" />
          <span className="font-medium text-slate-700">{scheduleSummary(cfg)}</span>
          {rule.next_run_at && <span className="text-slate-400">· next run {new Date(rule.next_run_at).toLocaleString()}</span>}
        </div>
        <p className="mt-2 text-[11.5px] text-slate-400">
          Times use the server's local timezone. Add an <strong>Export view &amp; email</strong> step in Actions to mail a spreadsheet on this schedule.
        </p>
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
          onWheel={chainWheel}
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
    const arr = (Array.isArray(value) ? value : []).map(String);
    // Choice field → friendly multi-select of the option labels, so one flow can
    // fire on "Approved OR Rejected OR …" without typing raw codes or making two rules.
    if (kind === 'choice' && choices.length) {
      const toggle = (v: string) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
      return (
        <div className="flex flex-wrap gap-1.5 rounded-md border border-slate-200 bg-white p-2">
          {choices.map((c) => {
            const on = arr.includes(String(c.value));
            return (
              <button
                type="button"
                key={c.value}
                onClick={() => toggle(String(c.value))}
                className={`rounded-full border px-2.5 py-1 text-[12px] transition ${on ? 'border-blue-500 bg-blue-50 font-medium text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                {on ? '✓ ' : ''}{c.label}
              </button>
            );
          })}
        </div>
      );
    }
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
  get_row: { step_name: '', source_table: '', match_field: '', match_value: '', columns: [] },
  send_email: { to_static: [], to_fields: [], to: '', cc: '', subject: '', body: '' },
  update_field: { target: 'record', field: '', value: '' },
  generate_document: { format: 'xlsx', filename: 'export', scope: 'record', columns: [] },
  export_view_email: { view_id: '', format: 'xlsx', to: '', cc: '', subject: '', body: '', filename: '', skip_if_empty: false },
  related_export_email: { report_name: '', sources: [{ id: 'record', kind: 'record', label: 'This record', entity_logical: '' }], columns: [], format: 'xlsx', to: '', cc: '', subject: '', body: '', filename: '', skip_if_empty: false },
  create_related_record: { target_entity: '', match_field: '', match_mode: 'record_id', dedupe: true, dedupe_match: [], mappings: [] },
  update_related_record: { target_entity: '', match_field: '', match_mode: 'record_id', match_first: false, mappings: [] },
  condition: { left: '', operator: 'equals', right: '' },
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

// "Only run if" gate — an optional per-step field-to-field condition that lets a
// flow branch. Compares two token templates (e.g. {{record.owner_id}} vs
// {{steps.Opp.raw(ownerid)}}); the step is skipped when the comparison fails.
const RC_OPERATORS: { value: AutomationActionRunCondition['operator']; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];
const rcNeedsRight = (op: AutomationActionRunCondition['operator']) => op === 'equals' || op === 'not_equals';

function OnlyRunIfControl({ action, fields, steps, onChange }: { action: AutomationRuleAction; fields: FieldDefinition[]; steps: EarlierStep[]; onChange: () => void }) {
  const rc = action.run_condition ?? null;
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(rc?.left ?? '');
  const [op, setOp] = useState<AutomationActionRunCondition['operator']>(rc?.operator ?? 'equals');
  const [right, setRight] = useState(rc?.right ?? '');
  const [busy, setBusy] = useState(false);
  const [tokenMenu, setTokenMenu] = useState<'left' | 'right' | null>(null);

  const save = async () => {
    setBusy(true);
    try {
      const next: AutomationActionRunCondition | null = left.trim()
        ? { left: left.trim(), operator: op, right: rcNeedsRight(op) ? right.trim() : '' }
        : null;
      await updateAction(action.automation_rule_action_id, { run_condition: next });
      onChange();
      setOpen(false);
    } finally { setBusy(false); }
  };
  const clear = async () => {
    setBusy(true);
    try {
      await updateAction(action.automation_rule_action_id, { run_condition: null });
      setLeft(''); setRight(''); setOp('equals');
      onChange();
      setOpen(false);
    } finally { setBusy(false); }
  };

  const summary = rc
    ? `Only if ${rc.left} ${RC_OPERATORS.find((o) => o.value === rc.operator)?.label ?? rc.operator}${rcNeedsRight(rc.operator) ? ` ${rc.right}` : ''}`
    : 'Only run if…';

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Run this step only when a condition holds (lets the flow branch)"
        className={`inline-flex max-w-[280px] items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
          rc ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-dashed border-slate-300 bg-white text-slate-500 hover:border-violet-400 hover:text-violet-600'
        }`}
      >
        <Filter size={11} className="shrink-0" />
        <span className="truncate">{summary}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[320px] rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-1.5 text-[11px] font-semibold text-slate-600">Run this step only if</p>
          <div className="mb-1.5 flex items-center gap-1">
            <input
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              placeholder="{{record.owner_id}}"
              className="w-full rounded-md border border-slate-300 px-2 py-1 font-mono text-[11.5px] outline-none focus:border-violet-400"
            />
            <TokenMenu recordFields={fields} steps={steps} onPick={(t) => setLeft((v) => `${v}${t}`)} open={tokenMenu === 'left'} onOpenChange={(o) => setTokenMenu(o ? 'left' : null)} />
          </div>
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as AutomationActionRunCondition['operator'])}
            className="mb-1.5 w-full cursor-pointer rounded-md border border-slate-300 px-2 py-1 text-[11.5px] outline-none focus:border-violet-400"
          >
            {RC_OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {rcNeedsRight(op) && (
            <div className="mb-2 flex items-center gap-1">
              <input
                value={right}
                onChange={(e) => setRight(e.target.value)}
                placeholder="{{steps.Opp.raw(ownerid)}}"
                className="w-full rounded-md border border-slate-300 px-2 py-1 font-mono text-[11.5px] outline-none focus:border-violet-400"
              />
              <TokenMenu recordFields={fields} steps={steps} onPick={(t) => setRight((v) => `${v}${t}`)} open={tokenMenu === 'right'} onOpenChange={(o) => setTokenMenu(o ? 'right' : null)} />
            </div>
          )}
          <p className="mb-2 text-[10.5px] leading-snug text-slate-400">
            Both sides accept tokens (record fields, earlier steps). Compared as text.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => void save()} disabled={busy} className="rounded-md bg-violet-600 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-violet-700 disabled:opacity-50">Save</button>
            {rc && <button onClick={() => void clear()} disabled={busy} className="rounded-md border border-slate-300 px-2.5 py-1 text-[11.5px] text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50">Remove</button>}
            <button onClick={() => setOpen(false)} className="ml-auto text-[11.5px] text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionsTab({
  rule, ruleId, fields, actions, onChange,
}: { rule: AutomationRule; ruleId: string; fields: FieldDefinition[]; actions: AutomationRuleAction[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Close the add-step menu on Escape or an outside click.
  useEffect(() => {
    if (!adding) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAdding(false); };
    const onClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setAdding(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [adding]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const isSchedule = rule.trigger_type === 'schedule';

  // ── Build the action TREE from the flat list ──────────────────────────────
  // sort_order orders siblings WITHIN a group (same parent_action_id + branch).
  const groupKey = (parentId: string | null, branch: AutomationBranch | null) => `${parentId ?? '_'}:${branch ?? '_'}`;
  const groups = new Map<string, AutomationRuleAction[]>();
  for (const a of actions) {
    const k = groupKey(a.parent_action_id ?? null, a.branch ?? null);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(a);
  }
  for (const arr of groups.values()) arr.sort((x, y) => x.sort_order - y.sort_order);
  const childrenOf = (parentId: string | null, branch: AutomationBranch | null) => groups.get(groupKey(parentId, branch)) ?? [];
  const topLevel = childrenOf(null, null);

  // Pre-order (execution-order) flatten — drives step numbering, token scoping,
  // and cross-action token validation now that array order isn't execution order.
  const flat: AutomationRuleAction[] = [];
  const walkFlat = (list: AutomationRuleAction[]) => {
    for (const a of list) {
      flat.push(a);
      if (a.action_type === 'condition') { walkFlat(childrenOf(a.automation_rule_action_id, 'yes')); walkFlat(childrenOf(a.automation_rule_action_id, 'no')); }
    }
  };
  walkFlat(topLevel);
  const numberOf = new Map(flat.map((a, i) => [a.automation_rule_action_id, i + 1]));
  const stepsBefore = (id: string) => earlierStepsBefore(flat, flat.findIndex((a) => a.automation_rule_action_id === id));

  const tokenProblems = validateRuleTokens(flat);
  const hasFailureBranch = actions.some((a) => a.run_after === 'failure' || a.run_after === 'always');

  // Descendant ids of a condition — used to block dropping a node into itself.
  const descendantsOf = (id: string): Set<string> => {
    const out = new Set<string>();
    const walk = (pid: string) => { for (const a of actions) if ((a.parent_action_id ?? null) === pid) { out.add(a.automation_rule_action_id); walk(a.automation_rule_action_id); } };
    walk(id);
    return out;
  };

  const add = async (type: AutomationActionType, placement?: { parent_action_id: string | null; branch: AutomationBranch | null }) => {
    setAdding(false);
    const sibs = childrenOf(placement?.parent_action_id ?? null, placement?.branch ?? null);
    await createAction(ruleId, type, DEFAULT_CONFIG[type], sibs.length, placement ?? undefined);
    onChange();
  };

  const setRunAfter = async (a: AutomationRuleAction, ra: AutomationRunAfter) => {
    setBusyId(a.automation_rule_action_id);
    try { await updateAction(a.automation_rule_action_id, { run_after: ra }); onChange(); }
    finally { setBusyId(null); }
  };

  // Drop `dragId` into a group, positioned before `beforeId` (or appended if null).
  const drop = async (destParent: string | null, destBranch: AutomationBranch | null, beforeId: string | null) => {
    const id = dragId;
    setDragId(null); setDropTarget(null);
    if (!id || id === beforeId) return;
    if (id === destParent) return;                          // can't nest under itself
    if (destParent && descendantsOf(id).has(destParent)) return; // nor under its own descendant
    const sibs = childrenOf(destParent, destBranch).map((a) => a.automation_rule_action_id).filter((x) => x !== id);
    const at = beforeId ? sibs.indexOf(beforeId) : sibs.length;
    const insertAt = at < 0 ? sibs.length : at;
    const finalOrder = [...sibs.slice(0, insertAt), id, ...sibs.slice(insertAt)];
    await moveAction(id, { parent_action_id: destParent, branch: destBranch }, finalOrder);
    onChange();
  };

  const renderCard = (a: AutomationRuleAction) => {
    const steps = stepsBefore(a.automation_rule_action_id);
    if (a.action_type === 'condition') {
      return (
        <ConditionActionCard
          action={a} fields={fields} steps={steps} onChange={onChange}
          yesSlot={renderList(a.automation_rule_action_id, 'yes')}
          noSlot={renderList(a.automation_rule_action_id, 'no')}
        />
      );
    }
    if (a.action_type === 'export_view_email') return <ExportViewEmailActionCard action={a} tableLogicalName={rule.table_logical_name} onChange={onChange} />;
    if (a.action_type === 'related_export_email') return <RelatedExportEmailActionCard action={a} tableLogicalName={rule.table_logical_name} onChange={onChange} />;
    if (a.action_type === 'create_related_record' || a.action_type === 'update_related_record') return <RelatedWriteActionCard action={a} triggerFields={fields} tableLogicalName={rule.table_logical_name} onChange={onChange} />;
    if (a.action_type === 'list_rows') return <ListRowsActionCard action={a} recordFields={fields} steps={steps} onChange={onChange} />;
    if (a.action_type === 'get_row') return <GetRowActionCard action={a} recordFields={fields} steps={steps} onChange={onChange} />;
    if (a.action_type === 'update_field') return <UpdateFieldActionCard action={a} fields={fields} steps={steps} onChange={onChange} />;
    if (a.action_type === 'generate_document') return <GenerateDocumentActionCard action={a} fields={fields} onChange={onChange} />;
    return <SendEmailActionCard action={a} fields={fields} steps={steps} onChange={onChange} />;
  };

  // Recursively render a sibling group (top level, or one branch of a Condition),
  // ending with that group's own "Add step" control (which adds INTO the group).
  function renderList(parentId: string | null, branch: AutomationBranch | null): ReactNode {
    const list = childrenOf(parentId, branch);
    return (
      <div>
        {list.map((a, i) => {
          const isCond = a.action_type === 'condition';
          const targetKey = a.automation_rule_action_id;
          return (
            <div key={a.automation_rule_action_id}>
              <FlowConnector>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {i > 0 && (
                    <RunAfterSelect
                      value={a.run_after ?? 'success'}
                      busy={busyId === a.automation_rule_action_id}
                      onChange={(ra) => setRunAfter(a, ra)}
                    />
                  )}
                  <OnlyRunIfControl action={a} fields={fields} steps={stepsBefore(a.automation_rule_action_id)} onChange={onChange} />
                </div>
              </FlowConnector>
              {/* drop-before target */}
              <div
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropTarget(targetKey); } }}
                onDrop={(e) => { e.preventDefault(); void drop(parentId, branch, a.automation_rule_action_id); }}
                className={`relative rounded-xl transition-shadow ${dropTarget === targetKey && dragId ? 'ring-2 ring-blue-400' : ''} ${dragId === a.automation_rule_action_id ? 'opacity-40' : ''}`}
              >
                <span className="absolute -left-2.5 -top-2.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-slate-700 text-[11px] font-bold text-white shadow ring-2 ring-white">
                  {numberOf.get(a.automation_rule_action_id)}
                </span>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => { e.stopPropagation(); setDragId(a.automation_rule_action_id); }}
                  onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                  title="Drag to reorder / move into a branch"
                  className="absolute -left-2.5 top-5 z-10 cursor-grab rounded bg-white p-0.5 text-slate-300 shadow-sm ring-1 ring-slate-200 hover:text-slate-500 active:cursor-grabbing"
                >
                  <GripVertical size={13} />
                </button>
                {!isCond && (
                  <div className="px-4 pt-2"><ActionLabelInput action={a} onChange={onChange} /></div>
                )}
                {renderCard(a)}
              </div>
            </div>
          );
        })}

        {/* End-of-list connector + Add step (drops here to append) */}
        <FlowConnector />
        <div
          onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropTarget(`${groupKey(parentId, branch)}:end`); } }}
          onDrop={(e) => { e.preventDefault(); void drop(parentId, branch, null); }}
          className={`flex justify-center rounded-lg transition-shadow ${dropTarget === `${groupKey(parentId, branch)}:end` && dragId ? 'ring-2 ring-blue-400' : ''}`}
        >
          <AddStepButton isSchedule={isSchedule} onAdd={(t) => void add(t, { parent_action_id: parentId, branch })} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      {tokenProblems.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-[12px] font-medium text-amber-800">Token / step reference issues:</p>
          <ul className="list-inside list-disc text-[12px] text-amber-700">{tokenProblems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      {/* Top toolbar — Add step is always reachable without scrolling to the bottom */}
      <div className="mb-3 flex justify-start" ref={addMenuRef}>
        <AddStepButton isSchedule={isSchedule} onAdd={(t) => void add(t)} open={adding} onOpenChange={setAdding} openUp={false} />
      </div>

      {/* Trigger node — the flow's starting point */}
      <div
        onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropTarget('trigger'); } }}
        onDrop={(e) => { e.preventDefault(); void drop(null, null, topLevel[0]?.automation_rule_action_id ?? null); }}
        className={`flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 ${dropTarget === 'trigger' && dragId ? 'ring-2 ring-blue-400' : ''}`}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-600">
          {isSchedule ? <CalendarClock size={17} /> : <Zap size={17} />}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">{isSchedule ? 'Schedule' : 'Trigger'}</p>
          <p className="text-[13px] font-medium text-slate-800">{isSchedule ? scheduleSummary(rule.schedule_config) : triggerSummary(rule)}</p>
        </div>
      </div>

      {actions.length === 0
        ? renderList(null, null)
        : renderList(null, null)}

      {hasFailureBranch && (
        <p className="mt-4 text-center text-[11.5px] text-slate-400">
          Steps with an <span className="font-semibold text-red-500">On failure</span> / <span className="font-semibold text-slate-500">Always</span> branch let the flow react to an earlier step's error (e.g. send an alert).
        </p>
      )}
    </div>
  );
}

// Reusable "Add step" pill + type menu (used at the top level and inside each
// Condition branch). Optionally controlled (open/onOpenChange) so the top-level
// toolbar can share the Escape/outside-click handling in ActionsTab.
function AddStepButton({
  isSchedule, onAdd, open: openProp, onOpenChange, openUp = true,
}: { isSchedule: boolean; onAdd: (t: AutomationActionType) => void; open?: boolean; onOpenChange?: (o: boolean) => void; openUp?: boolean }) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = (v: boolean) => { if (onOpenChange) onOpenChange(v); else setOpenInternal(v); };
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addableTypes: AutomationActionType[] = isSchedule
    ? ['export_view_email', 'send_email', 'list_rows', 'get_row', 'condition']
    : ['get_row', 'list_rows', 'send_email', 'update_field', 'create_related_record', 'update_related_record', 'related_export_email', 'generate_document', 'export_view_email', 'condition'];

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-white px-4 py-1.5 text-[13px] text-slate-600 hover:border-blue-400 hover:text-blue-600"
        onClick={() => setOpen(!open)}
      >
        <Plus size={15} /> Add step
      </button>
      {open && (
        <div className={`absolute left-0 z-20 max-h-72 w-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>
          {addableTypes.map((t) => (
            <button
              key={t}
              onClick={() => { onAdd(t); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
            >
              {t === 'condition' ? <GitBranch size={13} className="text-violet-500" /> : <span className="w-[13px]" />}
              {actionLabel(t)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// A Condition step: an inline comparison editor (left / operator / right, with
// token pickers) and two branch containers — steps in "If yes" run when the
// comparison passes, steps in "If no" when it fails. Branches nest arbitrarily.
function ConditionActionCard({
  action, fields, steps, onChange, yesSlot, noSlot,
}: { action: AutomationRuleAction; fields: FieldDefinition[]; steps: EarlierStep[]; onChange: () => void; yesSlot: ReactNode; noSlot: ReactNode }) {
  const cfg = action.config as unknown as ConditionConfig;
  const [left, setLeft] = useState(cfg.left ?? '');
  const [op, setOp] = useState<AutomationActionRunCondition['operator']>(cfg.operator ?? 'equals');
  const [right, setRight] = useState(cfg.right ?? '');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tokenMenu, setTokenMenu] = useState<'left' | 'right' | null>(null);

  const save = async () => {
    setBusy(true);
    try {
      await updateAction(action.automation_rule_action_id, {
        config: { left: left.trim(), operator: op, right: rcNeedsRight(op) ? right.trim() : '' },
      });
      setDirty(false); onChange();
    } finally { setBusy(false); }
  };
  const remove = async () => { await deleteAction(action.automation_rule_action_id); onChange(); };

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <GitBranch size={15} className="text-violet-600" />
        <span className="text-[13px] font-semibold text-slate-700">{action.label?.trim() || 'Condition'}</span>
        <div className="flex-1" />
        {dirty && <button onClick={() => void save()} disabled={busy} className={btnPrimary}><Save size={14} /> Save</button>}
        <button onClick={() => void remove()} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
      </div>

      <ActionLabelInput action={action} onChange={onChange} />

      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        <div className="flex items-center gap-1">
          <input
            value={left}
            onChange={(e) => { setLeft(e.target.value); setDirty(true); }}
            placeholder="{{record.owner_id}}"
            className="w-full rounded-md border border-slate-300 px-2 py-1 font-mono text-[11.5px] outline-none focus:border-violet-400"
          />
          <TokenMenu recordFields={fields} steps={steps} onPick={(t) => { setLeft((v) => `${v}${t}`); setDirty(true); }} open={tokenMenu === 'left'} onOpenChange={(o) => setTokenMenu(o ? 'left' : null)} />
        </div>
        <select
          value={op}
          onChange={(e) => { setOp(e.target.value as AutomationActionRunCondition['operator']); setDirty(true); }}
          className="cursor-pointer rounded-md border border-slate-300 px-2 py-1 text-[11.5px] outline-none focus:border-violet-400"
        >
          {RC_OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {rcNeedsRight(op) ? (
          <div className="flex items-center gap-1">
            <input
              value={right}
              onChange={(e) => { setRight(e.target.value); setDirty(true); }}
              placeholder="{{steps.Opp.raw(ownerid)}}"
              className="w-full rounded-md border border-slate-300 px-2 py-1 font-mono text-[11.5px] outline-none focus:border-violet-400"
            />
            <TokenMenu recordFields={fields} steps={steps} onPick={(t) => { setRight((v) => `${v}${t}`); setDirty(true); }} open={tokenMenu === 'right'} onOpenChange={(o) => setTokenMenu(o ? 'right' : null)} />
          </div>
        ) : <div />}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700"><Check size={13} /> If yes</p>
          {yesSlot}
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50/40 p-2">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-red-600"><X size={13} /> If no</p>
          {noSlot}
        </div>
      </div>
    </div>
  );
}

// Compact editable per-action label — a human title so big flows stay readable
// (e.g. "Get Opportunity User"). Distinct from a step's {{steps.<name>}} ref.
function ActionLabelInput({ action, onChange }: { action: AutomationRuleAction; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(action.label ?? '');
  useEffect(() => { setVal(action.label ?? ''); }, [action.label]);

  const save = async () => {
    setEditing(false);
    const next = val.trim();
    if ((action.label ?? '') === next) return;
    await updateAction(action.automation_rule_action_id, { label: next || null });
    onChange();
  };

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[11.5px] text-slate-400 hover:text-blue-600" title="Give this step a name">
        <PencilLine size={11} />
        {action.label?.trim() ? <span className="font-medium text-slate-600">{action.label}</span> : <span>Label this step…</span>}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setVal(action.label ?? ''); setEditing(false); } }}
      placeholder="e.g. Get Opportunity User"
      className="w-full max-w-[280px] rounded-md border border-slate-300 px-2 py-1 text-[12px] outline-none focus:border-blue-400"
    />
  );
}

function GetRowActionCard({
  action, recordFields, steps, onChange,
}: { action: AutomationRuleAction; recordFields: FieldDefinition[]; steps: EarlierStep[]; onChange: () => void }) {
  const cfg = action.config as unknown as GetRowConfig;
  const [local, setLocal] = useState<GetRowConfig>({
    step_name: cfg.step_name ?? '', source_table: cfg.source_table ?? '',
    match_field: cfg.match_field ?? '', match_value: cfg.match_value ?? '', columns: cfg.columns ?? [],
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

  const set = (p: Partial<GetRowConfig>) => { setLocal((l) => ({ ...l, ...p })); setDirty(true); };
  const save = async () => {
    const problems = validateActionConfig('get_row', local as unknown as Record<string, unknown>);
    setErrs(problems);
    if (problems.length) return;
    await updateAction(action.automation_rule_action_id, { config: local });
    setDirty(false); onChange();
  };
  const remove = async () => { await deleteAction(action.automation_rule_action_id); onChange(); };

  const sortedSrc = [...srcFields].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const sortedEnt = [...entities].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const matchValue = local.match_value == null ? '' : String(local.match_value);
  const stepRef = local.step_name || 'name';

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-3">
        <KeyRound size={15} className="text-blue-600" />
        <span className="text-[13px] font-semibold text-slate-700">Get row by ID</span>
        <div className="flex-1" />
        {dirty && <button onClick={save} className={btnPrimary}><Save size={14} /> Save action</button>}
        <button onClick={remove} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Step name (referenced as {'{{steps.<name>…}}'})</label>
          <input className={input} value={local.step_name} onChange={(e) => set({ step_name: e.target.value })} placeholder="owner" />
        </div>
        <div>
          <label className={lbl}>Table to read from</label>
          <Combobox
            options={sortedEnt.map((e) => ({ value: e.logical_name, label: e.display_name }))}
            value={local.source_table}
            onChange={(v) => set({ source_table: v, match_field: '', columns: [] })}
            placeholder="Select…"
            searchPlaceholder="Search tables…"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <label className={lbl}>Match on column</label>
          <select className={input} value={local.match_field ?? ''} onChange={(e) => set({ match_field: e.target.value })} disabled={!local.source_table}>
            <option value="">(the id / primary key)</option>
            {sortedSrc.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>= value to look up</label>
          <div className="flex items-center gap-1">
            <input className={input} value={matchValue} onChange={(e) => set({ match_value: e.target.value })} placeholder="{{record.raw.owner_id}} — or type a value" />
            <TokenMenu recordFields={recordFields} steps={steps} onPick={(t) => set({ match_value: `${matchValue}${t}` })} />
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Pick a value from the trigger record or an earlier step (the <b>·&nbsp;id</b> option when matching a lookup), or type it in.</p>
        </div>
      </div>

      <label className={`${lbl} mt-3`}>Columns to expose (none = all)</label>
      <select multiple className={`${input} h-24`} value={local.columns} onWheel={chainWheel} onChange={(e) => set({ columns: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
        {sortedSrc.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
      </select>
      <p className="mt-1 text-[11px] text-slate-400">
        Use later as <code className="text-slate-500">{`{{steps.${stepRef}.first(email)}}`}</code> (single value) or <code className="text-slate-500">{`{{steps.${stepRef}.rows}}`}</code> (table).
      </p>

      {errs.length > 0 && <ul className="mt-2 text-[12px] text-red-600 list-disc list-inside">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
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
          <select multiple className={`${input} h-24`} value={local.columns} onWheel={chainWheel} onChange={(e) => set({ columns: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
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
    send_to_owner: cfg.send_to_owner ?? false,
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

      <label className="flex items-center gap-2 mt-3 text-[12px] text-slate-600">
        <input type="checkbox" checked={!!local.send_to_owner} onChange={(e) => set({ send_to_owner: e.target.checked })} />
        Send to the owner of the record that triggered this rule
      </label>

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

      <div className="flex items-center justify-between">
        <label className={`${lbl} mt-3`}>Body (HTML; values are escaped)</label>
        <HtmlPreviewButton html={local.body} />
      </div>
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

// Small token inserter for the schedule export (no trigger record — only the
// {{export.*}} tokens the worker exposes for a view export).
function ExportTokenMenu({ onPick }: { onPick: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const tokens = [
    { label: 'export.count', value: '{{export.count}}' },
    { label: 'export.view', value: '{{export.view}}' },
  ];
  return (
    <span className="relative inline-block">
      <button type="button" title="Insert token" onClick={() => setOpen((v) => !v)} className="p-1 text-slate-400 hover:text-blue-600"><Braces size={14} /></button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {tokens.map((t) => (
            <button key={t.value} type="button" onClick={() => { onPick(t.value); setOpen(false); }} className="block w-full px-3 py-1 text-left font-mono text-[12px] text-slate-700 hover:bg-slate-50">{t.label}</button>
          ))}
        </div>
      )}
    </span>
  );
}

function ExportViewEmailActionCard({
  action, tableLogicalName, onChange,
}: { action: AutomationRuleAction; tableLogicalName: string; onChange: () => void }) {
  const cfg = action.config as unknown as ExportViewEmailConfig;
  const [local, setLocal] = useState<ExportViewEmailConfig>({
    source_entity: cfg.source_entity ?? tableLogicalName,
    view_id: cfg.view_id ?? '', format: cfg.format ?? 'xlsx', to: cfg.to ?? '', cc: cfg.cc ?? '',
    subject: cfg.subject ?? '', body: cfg.body ?? '', filename: cfg.filename ?? '',
    email_account_id: cfg.email_account_id ?? null, skip_if_empty: cfg.skip_if_empty ?? false,
    to_user_ids: cfg.to_user_ids ?? [],
  });
  const [dirty, setDirty] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [views, setViews] = useState<ViewDefinition[]>([]);
  const [accounts, setAccounts] = useState<EmailAccountOption[]>([]);

  const entityLogical = local.source_entity ?? tableLogicalName;
  useEffect(() => { void fetchEntities().then(setEntities).catch(() => setEntities([])); }, []);
  useEffect(() => { void fetchViewsForEntityLogical(entityLogical).then(setViews).catch(() => setViews([])); }, [entityLogical]);
  useEffect(() => { void fetchEmailAccountOptions().then((a) => setAccounts(a.filter((x) => x.enabled))).catch(() => {}); }, []);

  const set = (p: Partial<ExportViewEmailConfig>) => { setLocal((l) => ({ ...l, ...p })); setDirty(true); };
  const entityOptions: ComboOption[] = [...entities]
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .map((e) => ({ value: e.logical_name, label: e.display_name }));
  const save = async () => {
    const problems = validateActionConfig('export_view_email', local as unknown as Record<string, unknown>);
    setErrs(problems);
    if (problems.length) return;
    await updateAction(action.automation_rule_action_id, { config: local });
    setDirty(false); onChange();
  };
  const remove = async () => { await deleteAction(action.automation_rule_action_id); onChange(); };

  const viewOptions: ComboOption[] = [...views]
    .sort((a, b) => a.view_type.localeCompare(b.view_type) || a.name.localeCompare(b.name))
    .map((v) => ({ value: v.view_id, label: v.name, group: v.view_type === 'personal' ? 'My views' : 'Shared views', hint: v.view_type }));

  return (
    <div className={card}>
      <div className="mb-3 flex items-center gap-2">
        <FileSpreadsheet size={15} className="text-blue-600" />
        <span className="text-[13px] font-semibold text-slate-700">Export view &amp; email</span>
        <div className="flex-1" />
        {dirty && <button onClick={save} className={btnPrimary}><Save size={14} /> Save action</button>}
        <button onClick={remove} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Entity</label>
          <Combobox
            options={entityOptions}
            value={entityLogical}
            onChange={(v) => set({ source_entity: v, view_id: '' })}
            placeholder="Select an entity…"
            searchPlaceholder="Search entities…"
          />
          <p className="mt-1 text-[11px] text-slate-400">Pick the table, then a view from it.</p>
        </div>
        <div>
          <label className={lbl}>View to export</label>
          <Combobox
            options={viewOptions}
            value={local.view_id}
            onChange={(v) => set({ view_id: v })}
            placeholder={views.length ? 'Select a view…' : 'No views on this entity'}
            searchPlaceholder="Search views…"
          />
          <p className="mt-1 text-[11px] text-slate-400">Exports the view's columns + filters.</p>
        </div>
        <div>
          <label className={lbl}>File format</label>
          <select className={input} value={local.format} onChange={(e) => set({ format: e.target.value as 'xlsx' | 'csv' })}>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
        </div>
        <div>
          <label className={lbl}>File name (optional)</label>
          <input className={input} value={local.filename ?? ''} onChange={(e) => set({ filename: e.target.value })} placeholder="{{export.view}}" />
        </div>
      </div>

      <label className={`${lbl} mt-3`}>Send from</label>
      <select className={input} value={local.email_account_id ?? ''} onChange={(e) => set({ email_account_id: e.target.value || null })}>
        <option value="">{`Default account${accounts.find((a) => a.is_default) ? ` (${accounts.find((a) => a.is_default)!.from_address})` : ''}`}</option>
        {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name} — {a.from_address}</option>)}
      </select>

      <label className={`${lbl} mt-3`}>To — addresses (split on ; ,)</label>
      <div className="flex items-center gap-1">
        <input className={input} value={local.to ?? ''} onChange={(e) => set({ to: e.target.value })} placeholder="sales@co.com; habib@co.com" />
      </div>

      <label className={`${lbl} mt-3`}>Cc</label>
      <input className={input} value={local.cc ?? ''} onChange={(e) => set({ cc: e.target.value })} placeholder="manager@co.com" />

      <label className={`${lbl} mt-3`}>Subject</label>
      <div className="flex items-center gap-1">
        <input className={input} value={local.subject ?? ''} onChange={(e) => set({ subject: e.target.value })} placeholder="{{export.view}} — {{export.count}} rows" />
        <ExportTokenMenu onPick={(t) => set({ subject: `${local.subject ?? ''}${t}` })} />
      </div>

      <div className="flex items-center justify-between">
        <label className={`${lbl} mt-3`}>Body (HTML)</label>
        <HtmlPreviewButton html={local.body ?? ''} />
      </div>
      <div className="flex items-start gap-1">
        <textarea className={`${input} font-mono`} rows={4} value={local.body ?? ''} onChange={(e) => set({ body: e.target.value })} placeholder="<p>Attached: {{export.view}} ({{export.count}} rows).</p>" />
        <ExportTokenMenu onPick={(t) => set({ body: `${local.body ?? ''}${t}` })} />
      </div>

      <label className="mt-3 flex items-center gap-2 text-[12px] text-slate-600">
        <input type="checkbox" checked={!!local.skip_if_empty} onChange={(e) => set({ skip_if_empty: e.target.checked })} />
        Don't send when the view has no rows
      </label>

      {errs.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-[12px] text-red-600">{errs.map((e) => <li key={e}>{e}</li>)}</ul>
      )}
    </div>
  );
}

// Build a report by walking the trigger record's relationships (parents via N:1
// lookups, one child list that expands rows), pick columns across all of them,
// export to Excel/CSV and email it. Event flows only.
function RelatedExportEmailActionCard({
  action, tableLogicalName, onChange,
}: { action: AutomationRuleAction; tableLogicalName: string; onChange: () => void }) {
  const cfg = action.config as unknown as RelatedExportEmailConfig;
  const initSources: RelatedExportSource[] = (Array.isArray(cfg.sources) && cfg.sources.length
    ? cfg.sources
    : [{ id: 'record', kind: 'record', label: 'This record', entity_logical: tableLogicalName }]
  ).map((s) => (s.id === 'record' ? { ...s, entity_logical: tableLogicalName } : s));

  const [local, setLocal] = useState<RelatedExportEmailConfig>({
    report_name: cfg.report_name ?? '', sources: initSources, columns: Array.isArray(cfg.columns) ? cfg.columns : [],
    format: cfg.format ?? 'xlsx', to: cfg.to ?? '', cc: cfg.cc ?? '', subject: cfg.subject ?? '', body: cfg.body ?? '',
    filename: cfg.filename ?? '', email_account_id: cfg.email_account_id ?? null, skip_if_empty: cfg.skip_if_empty ?? false,
    to_user_ids: cfg.to_user_ids ?? [],
  });
  const [dirty, setDirty] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<EmailAccountOption[]>([]);
  const [fieldsByEntity, setFieldsByEntity] = useState<Record<string, FieldDefinition[]>>({});
  const [entIdByLogical, setEntIdByLogical] = useState<Record<string, string>>({});
  // Add-source panel state.
  const [addFrom, setAddFrom] = useState<string>('record');
  const [opts, setOpts] = useState<RelatedSourceOptions>({ parents: [], children: [] });

  const set = (p: Partial<RelatedExportEmailConfig>) => { setLocal((l) => ({ ...l, ...p })); setDirty(true); };

  useEffect(() => { void fetchEmailAccountOptions().then((a) => setAccounts(a.filter((x) => x.enabled))).catch(() => {}); }, []);
  useEffect(() => { void fetchEntities().then((es) => setEntIdByLogical(Object.fromEntries(es.map((e) => [e.logical_name, e.entity_definition_id])))).catch(() => {}); }, []);

  // Load fields for every entity referenced by a source (for the column field pickers).
  const sourceEntities = useMemo(() => [...new Set(local.sources.map((s) => s.entity_logical).filter(Boolean))], [local.sources]);
  useEffect(() => {
    if (Object.keys(entIdByLogical).length === 0) return;
    void (async () => {
      const next: Record<string, FieldDefinition[]> = {};
      for (const logical of sourceEntities) {
        if (fieldsByEntity[logical]) { next[logical] = fieldsByEntity[logical]; continue; }
        const id = entIdByLogical[logical];
        if (id) next[logical] = await fetchFieldsForEntity(id).catch(() => []);
      }
      setFieldsByEntity((prev) => ({ ...prev, ...next }));
    })();
  }, [sourceEntities, entIdByLogical]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load add-source options for the chosen "from" source's entity.
  const fromSource = local.sources.find((s) => s.id === addFrom) ?? local.sources[0];
  useEffect(() => {
    if (!fromSource?.entity_logical) { setOpts({ parents: [], children: [] }); return; }
    void fetchRelatedSourceOptions(fromSource.entity_logical).then(setOpts).catch(() => setOpts({ parents: [], children: [] }));
  }, [fromSource?.entity_logical]);

  const save = async () => {
    const problems = validateActionConfig('related_export_email', local as unknown as Record<string, unknown>);
    setErrs(problems);
    if (problems.length) return;
    await updateAction(action.automation_rule_action_id, { config: local });
    setDirty(false); onChange();
  };
  const remove = async () => { await deleteAction(action.automation_rule_action_id); onChange(); };

  const hasChild = local.sources.some((s) => s.kind === 'child');
  const nonChildSources = local.sources.filter((s) => s.kind !== 'child');

  const addSource = (encoded: string) => {
    if (!encoded || !fromSource) return;
    const [kind, rest] = encoded.split(':');
    if (kind === 'parent') {
      const p = opts.parents.find((x) => x.lookup_field === rest);
      if (!p) return;
      const basePath = fromSource.kind === 'parent' ? (fromSource.lookup_path ?? []) : [];
      const src: RelatedExportSource = {
        id: `s${Date.now()}`, kind: 'parent', label: p.label, entity_logical: p.target_entity_logical,
        lookup_path: [...basePath, p.lookup_field],
      };
      set({ sources: [...local.sources, src] });
    } else if (kind === 'child') {
      if (hasChild) return;
      const [childEntity, fk] = (rest ?? '').split('|');
      const co = opts.children.find((x) => x.child_entity_logical === childEntity && x.child_fk_physical === fk);
      if (!co) return;
      const src: RelatedExportSource = {
        id: `s${Date.now()}`, kind: 'child', label: co.label, entity_logical: co.child_entity_logical,
        anchor_source_id: fromSource.id, child_entity_logical: co.child_entity_logical, child_fk_physical: co.child_fk_physical, limit: 500,
      };
      set({ sources: [...local.sources, src] });
    }
  };

  const removeSource = (id: string) => set({
    sources: local.sources.filter((s) => s.id !== id && s.anchor_source_id !== id),
    columns: local.columns.filter((c) => c.source_id !== id),
  });

  const setCol = (i: number, p: Partial<RelatedExportColumn>) => set({ columns: local.columns.map((c, idx) => (idx === i ? { ...c, ...p } : c)) });
  const addCol = () => set({ columns: [...local.columns, { source_id: 'record', field: '', header: '' }] });
  const rmCol = (i: number) => set({ columns: local.columns.filter((_, idx) => idx !== i) });

  const sourceLabel = (id: string) => local.sources.find((s) => s.id === id)?.label ?? id;
  const fieldOptionsFor = (sourceId: string): ComboOption[] => {
    const src = local.sources.find((s) => s.id === sourceId);
    const fs = src ? fieldsByEntity[src.entity_logical] ?? [] : [];
    return fieldsToOptions(fs);
  };

  const addOptions: ComboOption[] = [
    ...opts.parents.map((p) => ({ value: `parent:${p.lookup_field}`, label: p.label, group: 'Related record (one)' })),
    ...opts.children.map((c) => ({ value: `child:${c.child_entity_logical}|${c.child_fk_physical}`, label: c.label, group: 'Child list (expands rows)', hint: hasChild ? 'one allowed' : undefined })),
  ];

  return (
    <div className={card}>
      <div className="mb-3 flex items-center gap-2">
        <FileSpreadsheet size={15} className="text-teal-600" />
        <span className="text-[13px] font-semibold text-slate-700">Related export &amp; email</span>
        <div className="flex-1" />
        {dirty && <button onClick={save} className={btnPrimary}><Save size={14} /> Save action</button>}
        <button onClick={remove} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
      </div>

      {/* Data sources */}
      <label className={lbl}>Data sources (from the trigger record)</label>
      <div className="space-y-1.5">
        {local.sources.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${s.kind === 'record' ? 'bg-blue-100 text-blue-700' : s.kind === 'child' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
              {s.kind === 'record' ? 'Record' : s.kind === 'child' ? 'List' : 'Related'}
            </span>
            <span className="flex-1 truncate text-[12.5px] text-slate-700">{s.kind === 'record' ? `This ${s.entity_logical}` : s.label}</span>
            {s.kind !== 'record' && <button onClick={() => removeSource(s.id)} className="p-0.5 text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>}
          </div>
        ))}
      </div>

      {/* Add a related source */}
      <div className="mt-2 flex items-end gap-2">
        <div className="w-40">
          <label className="mb-0.5 block text-[11px] text-slate-500">From</label>
          <select className={input} value={addFrom} onChange={(e) => setAddFrom(e.target.value)}>
            {nonChildSources.map((s) => <option key={s.id} value={s.id}>{s.kind === 'record' ? `This ${s.entity_logical}` : s.label}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-0.5 block text-[11px] text-slate-500">Add related record / list</label>
          <Combobox
            options={addOptions}
            value=""
            onChange={addSource}
            placeholder={addOptions.length ? 'Pick a relationship…' : 'No relationships'}
            searchPlaceholder="Search relationships…"
          />
        </div>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Follow a lookup to a related record, or add one child list to get a row per child. Chain by picking a related record as the “From”.</p>

      {/* Columns */}
      <label className={`${lbl} mt-3`}>Report columns</label>
      <div className="space-y-2">
        {local.columns.map((c, i) => (
          <div key={i} className="grid grid-cols-[130px_1fr_120px_auto] items-center gap-2">
            <select className={input} value={c.source_id} onChange={(e) => setCol(i, { source_id: e.target.value, field: '' })}>
              {local.sources.map((s) => <option key={s.id} value={s.id}>{s.kind === 'record' ? `This ${s.entity_logical}` : s.label.split(' (')[0]}</option>)}
            </select>
            <Combobox
              options={fieldOptionsFor(c.source_id)}
              value={c.field}
              onChange={(v) => setCol(i, { field: v })}
              placeholder="Select field…"
              searchPlaceholder="Search fields…"
            />
            <input className={input} value={c.header ?? ''} onChange={(e) => setCol(i, { header: e.target.value })} placeholder="Header" title={`Column header (default: field name from ${sourceLabel(c.source_id)})`} />
            <button onClick={() => rmCol(i)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <button onClick={addCol} className="mt-2 inline-flex items-center gap-1.5 rounded border border-dashed border-slate-300 px-2.5 py-1 text-[12px] text-slate-600 hover:border-slate-400">
        <Plus size={14} /> Add column
      </button>

      {/* Output + email */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Report name</label>
          <input className={input} value={local.report_name ?? ''} onChange={(e) => set({ report_name: e.target.value })} placeholder="Approval report" />
        </div>
        <div>
          <label className={lbl}>File format</label>
          <select className={input} value={local.format} onChange={(e) => set({ format: e.target.value as 'xlsx' | 'csv' })}>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
        </div>
      </div>

      <label className={`${lbl} mt-3`}>Send from</label>
      <select className={input} value={local.email_account_id ?? ''} onChange={(e) => set({ email_account_id: e.target.value || null })}>
        <option value="">{`Default account${accounts.find((a) => a.is_default) ? ` (${accounts.find((a) => a.is_default)!.from_address})` : ''}`}</option>
        {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name} — {a.from_address}</option>)}
      </select>

      <label className={`${lbl} mt-3`}>To — addresses (split on ; ,)</label>
      <input className={input} value={local.to ?? ''} onChange={(e) => set({ to: e.target.value })} placeholder="ops@co.com; {{record.owner_email}}" />
      <label className={`${lbl} mt-3`}>Cc</label>
      <input className={input} value={local.cc ?? ''} onChange={(e) => set({ cc: e.target.value })} placeholder="manager@co.com" />

      <label className={`${lbl} mt-3`}>Subject</label>
      <input className={input} value={local.subject ?? ''} onChange={(e) => set({ subject: e.target.value })} placeholder="{{record.topic}} — approval report ({{export.count}} rows)" />
      <div className="flex items-center justify-between">
        <label className={`${lbl} mt-3`}>Body (HTML)</label>
        <HtmlPreviewButton html={local.body ?? ''} />
      </div>
      <textarea className={`${input} font-mono`} rows={4} value={local.body ?? ''} onChange={(e) => set({ body: e.target.value })} placeholder="<p>Attached: {{export.count}} rows. {{record.url}}</p>" />

      <label className="mt-3 flex items-center gap-2 text-[12px] text-slate-600">
        <input type="checkbox" checked={!!local.skip_if_empty} onChange={(e) => set({ skip_if_empty: e.target.checked })} />
        Don't send when the report has no rows
      </label>

      {errs.length > 0 && <ul className="mt-2 list-inside list-disc text-[12px] text-red-600">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
    </div>
  );
}

// Create or update a record in a RELATED (child) table — a table X that has a
// lookup to the trigger entity. Fields are mapped from the trigger record or set
// manually. Create supports a dedupe guard (skip if a linked record already exists).
function RelatedWriteActionCard({
  action, triggerFields, tableLogicalName, onChange,
}: { action: AutomationRuleAction; triggerFields: FieldDefinition[]; tableLogicalName: string; onChange: () => void }) {
  const isCreate = action.action_type === 'create_related_record';
  const cfg = action.config as unknown as (CreateRelatedRecordConfig & UpdateRelatedRecordConfig);
  const [local, setLocal] = useState<CreateRelatedRecordConfig & UpdateRelatedRecordConfig>({
    target_entity: cfg.target_entity ?? '', match_field: cfg.match_field ?? '',
    match_mode: cfg.match_mode ?? 'record_id', match_value: cfg.match_value ?? '',
    link_field_physical: cfg.link_field_physical, // kept for migration on load
    dedupe: cfg.dedupe ?? true, dedupe_match: cfg.dedupe_match ?? [], match_first: cfg.match_first ?? false,
    mappings: Array.isArray(cfg.mappings) ? cfg.mappings : [],
  });
  const [dirty, setDirty] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [targetFields, setTargetFields] = useState<FieldDefinition[]>([]);
  const [entIdByLogical, setEntIdByLogical] = useState<Record<string, string>>({});

  const set = (p: Partial<typeof local>) => { setLocal((l) => ({ ...l, ...p })); setDirty(true); };

  useEffect(() => { void fetchEntities().then((es) => { setEntities(es); setEntIdByLogical(Object.fromEntries(es.map((e) => [e.logical_name, e.entity_definition_id]))); }).catch(() => {}); }, []);
  useEffect(() => {
    const id = entIdByLogical[local.target_entity];
    if (id) void fetchFieldsForEntity(id).then(setTargetFields).catch(() => setTargetFields([]));
    else setTargetFields([]);
  }, [local.target_entity, entIdByLogical]);

  // Migrate a legacy config (link_field_physical, no match_field) once fields load.
  useEffect(() => {
    if (local.match_field || !local.link_field_physical || targetFields.length === 0) return;
    const f = targetFields.find((x) => x.physical_column_name === local.link_field_physical);
    if (f) setLocal((l) => ({ ...l, match_field: f.logical_name, match_mode: l.match_mode ?? 'record_id' }));
  }, [targetFields]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const problems = validateActionConfig(action.action_type, local as unknown as Record<string, unknown>);
    setErrs(problems);
    if (problems.length) return;
    const base = {
      target_entity: local.target_entity, match_field: local.match_field, match_mode: local.match_mode,
      match_value: local.match_mode === 'record_id' ? undefined : local.match_value, mappings: local.mappings,
    };
    const payload = isCreate
      ? { ...base, dedupe: local.dedupe, dedupe_match: local.dedupe_match }
      : { ...base, match_first: local.match_first };
    await updateAction(action.automation_rule_action_id, { config: payload });
    setDirty(false); onChange();
  };
  const remove = async () => { await deleteAction(action.automation_rule_action_id); onChange(); };

  const entityOpts: ComboOption[] = [...entities].sort((a, b) => a.display_name.localeCompare(b.display_name)).map((e) => ({ value: e.logical_name, label: e.display_name }));
  const targetOpts = fieldsToOptions(targetFields);
  const sourceOpts = fieldsToOptions(triggerFields);
  const setMap = (i: number, p: Partial<FieldMapping>) => set({ mappings: local.mappings.map((m, idx) => (idx === i ? { ...m, ...p } : m)) });
  const addMap = () => set({ mappings: [...local.mappings, { target_field: '', mode: 'field', value: '' }] });
  const rmMap = (i: number) => set({ mappings: local.mappings.filter((_, idx) => idx !== i) });

  return (
    <div className={card}>
      <div className="mb-3 flex items-center gap-2">
        {isCreate ? <Plus size={15} className="text-indigo-600" /> : <PencilLine size={15} className="text-indigo-600" />}
        <span className="text-[13px] font-semibold text-slate-700">{isCreate ? 'Create related record' : 'Update related record'}</span>
        <div className="flex-1" />
        {dirty && <button onClick={save} className={btnPrimary}><Save size={14} /> Save action</button>}
        <button onClick={remove} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
      </div>

      <label className={lbl}>Table {isCreate ? 'to insert into' : 'to update'}</label>
      <Combobox
        options={entityOpts}
        value={local.target_entity}
        onChange={(v) => set({ target_entity: v, match_field: '', dedupe_match: [] })}
        placeholder="Pick a table…"
        searchPlaceholder="Search tables…"
      />

      {/* Match: which field on the target links to the trigger, and what it equals */}
      <label className={`${lbl} mt-3`}>{isCreate ? 'Link field (set on the new record)' : 'Match — update rows WHERE'}</label>
      <div className="grid grid-cols-[1fr_150px_1fr] items-center gap-2">
        <Combobox options={targetOpts} value={local.match_field} onChange={(v) => set({ match_field: v })} placeholder={`Field on ${local.target_entity || 'table'}…`} searchPlaceholder="Search fields…" />
        <select className={input} value={local.match_mode} onChange={(e) => set({ match_mode: e.target.value as RelatedMatchMode, match_value: '' })}>
          <option value="record_id">= this record's id</option>
          <option value="field">= a field's value</option>
          <option value="static">= a manual value</option>
        </select>
        {local.match_mode === 'record_id'
          ? <span className="truncate text-[12px] text-slate-400">the {tableLogicalName} that triggered</span>
          : local.match_mode === 'field'
            ? <Combobox options={sourceOpts} value={local.match_value ?? ''} onChange={(v) => set({ match_value: v })} placeholder="Source field…" searchPlaceholder="Search fields…" />
            : <ConditionValueInput
                field={targetFields.find((f) => f.logical_name === local.match_field) ?? null}
                value={local.match_value ?? ''}
                onChange={(v) => set({ match_value: v })}
                variant="boxed"
                placeholder="Value or {{token}}"
              />}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        e.g. <strong>{local.match_field || 'opportunity'}</strong> = the {tableLogicalName}'s id {isCreate ? '(links the new record)' : '(which rows to update)'}.
      </p>

      <label className={`${lbl} mt-3`}>Field values</label>
      <div className="space-y-2">
        {local.mappings.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_1fr_auto] items-center gap-2">
            <Combobox options={targetOpts} value={m.target_field} onChange={(v) => setMap(i, { target_field: v })} placeholder="Target field…" searchPlaceholder="Search fields…" />
            <select className={input} value={m.mode} onChange={(e) => setMap(i, { mode: e.target.value as FieldMapping['mode'], value: '' })}>
              <option value="field">From this record</option>
              <option value="static">Manual value</option>
            </select>
            {m.mode === 'field'
              ? <Combobox options={sourceOpts} value={m.value} onChange={(v) => setMap(i, { value: v })} placeholder="Source field…" searchPlaceholder="Search fields…" />
              : <ConditionValueInput
                  field={targetFields.find((f) => f.logical_name === m.target_field) ?? null}
                  value={m.value}
                  onChange={(v) => setMap(i, { value: v })}
                  variant="boxed"
                  placeholder="Value or {{token}}"
                />}
            <button onClick={() => rmMap(i)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <button onClick={addMap} className="mt-2 inline-flex items-center gap-1.5 rounded border border-dashed border-slate-300 px-2.5 py-1 text-[12px] text-slate-600 hover:border-slate-400">
        <Plus size={14} /> Add field
      </button>

      {isCreate ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <label className="flex items-center gap-2 text-[12px] text-slate-600">
            <input type="checkbox" checked={!!local.dedupe} onChange={(e) => set({ dedupe: e.target.checked })} />
            Don't create if a linked record already exists (idempotent — safe for No→Yes→No→Yes)
          </label>
          {local.dedupe && (
            <div className="mt-2">
              <label className="mb-0.5 block text-[11px] text-slate-500">Also match on these fields (optional — else match on the link only)</label>
              <select multiple className={`${input} h-16`} value={local.dedupe_match ?? []}
                onChange={(e) => set({ dedupe_match: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
                {targetFields.map((f) => <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>)}
              </select>
            </div>
          )}
        </div>
      ) : (
        <label className="mt-3 flex items-center gap-2 text-[12px] text-slate-600">
          <input type="checkbox" checked={!!local.match_first} onChange={(e) => set({ match_first: e.target.checked })} />
          Only update the first matching record (else all linked records)
        </label>
      )}

      {errs.length > 0 && <ul className="mt-2 list-inside list-disc text-[12px] text-red-600">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
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

  // Value editor: "Set a value" is typed by the chosen Field to set (choice → dropdown,
  // Yes/No, lookup picker…); "Copy from a field" pulls the current value of another field
  // on the triggering record, stored as a {{record.<field>}} token the worker resolves.
  const targetField = fields.find((f) => f.logical_name === local.field) ?? null;
  const fieldOpts = sortedFields.map((f) => ({ value: f.logical_name, label: f.display_name }));
  // "Copy from a field" stores the RAW token so a code/id (choice, lookup) copies as
  // its stored value, not its display label. Accept the plain {{record.x}} form too
  // (legacy / hand-typed) when detecting the current source field.
  const FROM_RE = /^\{\{\s*record\.(?:raw\.)?([\w.]+)\s*\}\}$/;
  const currentFrom = (FROM_RE.exec(String(local.value ?? '')) ?? [])[1] ?? '';
  const [valueMode, setValueMode] = useState<'set' | 'from'>(currentFrom ? 'from' : 'set');
  const isChoiceLike = ['choice', 'multi_choice', 'boolean', 'lookup', 'owner', 'customer', 'statecode', 'statusreason']
    .includes((targetField?.field_type?.name ?? '').toLowerCase());

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
        <div className="col-span-2">
          <label className={lbl}>Value</label>
          <div className="flex items-center gap-2">
            <select
              className={`${input} w-44 shrink-0`}
              value={valueMode}
              onChange={(e) => { setValueMode(e.target.value as 'set' | 'from'); set({ value: '' }); }}
            >
              <option value="set">Set a value</option>
              <option value="from">Copy from a field</option>
            </select>
            {valueMode === 'from' ? (
              <Combobox
                options={fieldOpts}
                value={currentFrom}
                onChange={(v) => set({ value: v ? `{{record.raw.${v}}}` : '' })}
                placeholder="Field on this record…"
                searchPlaceholder="Search fields…"
              />
            ) : (
              <div className="flex flex-1 items-center gap-1">
                <div className="flex-1">
                  <ConditionValueInput
                    field={targetField}
                    value={local.value == null ? '' : String(local.value)}
                    onChange={(v) => set({ value: v })}
                    variant="boxed"
                    placeholder="e.g. Won or {{record.owner}}"
                  />
                </div>
                <TokenMenu recordFields={fields} steps={steps} onPick={(t) => set({ value: `${local.value ?? ''}${t}` })} />
              </div>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {valueMode === 'from'
              ? 'Copies that field’s current value from the record that triggered the flow.'
              : !local.field
                ? 'Pick the field to set first, then choose its value.'
                : isChoiceLike
                  ? 'Pick from the field’s options, or type a {{token}}.'
                  : 'A fixed value, or a {{token}} pulled from the record.'}
          </p>
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

// Local calendar-day key (YYYY-MM-DD) used to group runs and to compare against
// the date-filter inputs (which are also YYYY-MM-DD, so string compare is safe).
function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayLabelOf(key: string): string {
  const today = dayKeyOf(new Date().toISOString());
  const yst = new Date(); yst.setDate(yst.getDate() - 1);
  if (key === today) return 'Today';
  if (key === dayKeyOf(yst.toISOString())) return 'Yesterday';
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

// One evaluated condition inside a synthetic 'condition_check' step (see worker
// evaluateConditions). Lets the run history show WHY a run was skipped, n8n-style.
type ConditionTrace = { field: string; operator: string; expected: unknown; actual: unknown; pass: boolean };
const COND_OP_LABEL: Record<string, string> = {
  equals: 'equals', not_equals: 'is not', is_empty: 'is empty', is_not_empty: 'is not empty',
};
const condOpLabel = (op: string) => COND_OP_LABEL[op] ?? op;
function fmtCondVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '∅';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return `[${v.join(', ')}]`;
  return String(v);
}

// Short one-line summary of an action's output, per action type.
function stepOutputSummary(l: AutomationJobActionLog): string | null {
  const out = (l.output ?? {}) as Record<string, unknown>;
  if ((l.action_type === 'list_rows' || l.action_type === 'get_row') && out.count != null) return `${out.count} row${out.count === 1 ? '' : 's'}`;
  if (l.action_type === 'send_email') {
    const recips = [...(Array.isArray(out.to) ? out.to as string[] : []), ...(Array.isArray(out.cc) ? out.cc as string[] : [])];
    if (recips.length) return `to ${recips.slice(0, 3).join(', ')}${recips.length > 3 ? ` +${recips.length - 3}` : ''}${out.transport ? ` · ${out.transport}` : ''}`;
  }
  if (l.action_type === 'update_field' && out.field) return `${out.field} = ${String(out.value ?? '')}`.slice(0, 60);
  if (l.action_type === 'generate_document' && out.document_path) return String(out.document_path).split('/').pop() ?? null;
  if (l.action_type === 'export_view_email' || l.action_type === 'related_export_email') {
    const parts: string[] = [];
    if (out.row_count != null) parts.push(`${out.row_count} row${out.row_count === 1 ? '' : 's'}`);
    if (out.filename) parts.push(String(out.filename));
    if (out.transport) parts.push(String(out.transport));
    return parts.length ? parts.join(' · ') : null;
  }
  if (l.action_type === 'create_related_record' && out.created_id) return `created ${out.target} ${String(out.created_id).slice(0, 8)}…`;
  if (l.action_type === 'update_related_record' && out.updated != null) return `updated ${out.updated} ${out.target} row${out.updated === 1 ? '' : 's'}`;
  return null;
}

function HistoryTab({ ruleId }: { ruleId: string }) {
  const [rows, setRows] = useState<AutomationRunHistoryRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [rerunId, setRerunId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = useCallback(async () => {
    setReloading(true);
    try { setRows(await fetchRunHistory(ruleId)); } finally { setReloading(false); }
  }, [ruleId]);
  useEffect(() => { void load(); }, [load]);

  const rerun = async (j: AutomationRunHistoryRow) => {
    setRerunId(j.automation_job_id);
    try {
      await rerunRun(j);
      setToast('Re-run queued — it runs with the current flow config.');
      setTimeout(() => setToast(null), 3500);
      await load();               // show the new pending job immediately
      setTimeout(() => void load(), 2500); // catch it completing
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Re-run failed to queue.');
      setTimeout(() => setToast(null), 3500);
    } finally {
      setRerunId(null);
    }
  };

  if (!rows) return <p className="text-[13px] text-slate-500">Loading…</p>;

  // Apply the date-range filter (inclusive), then bucket by local calendar day.
  const filtered = rows.filter((j) => {
    const key = dayKeyOf(j.queued_at);
    if (fromDate && key < fromDate) return false;
    if (toDate && key > toDate) return false;
    return true;
  });
  const groups: { key: string; label: string; runs: AutomationRunHistoryRow[] }[] = [];
  for (const j of filtered) {
    const key = dayKeyOf(j.queued_at);
    const g = groups.length && groups[groups.length - 1].key === key ? groups[groups.length - 1] : null;
    if (g) g.runs.push(j);
    else groups.push({ key, label: dayLabelOf(key), runs: [j] });
  }
  const filterActive = !!(fromDate || toDate);

  return (
    <div className="mx-auto max-w-3xl space-y-2">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-slate-400">
          {filtered.length} run{filtered.length === 1 ? '' : 's'}{filterActive ? ` of ${rows.length}` : ''} · click a run to see each step
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[12px] text-slate-500">
            <span>From</span>
            <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-slate-300 px-1.5 py-0.5 text-[12px] outline-none focus:border-blue-400" />
            <span>to</span>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-slate-300 px-1.5 py-0.5 text-[12px] outline-none focus:border-blue-400" />
            {filterActive && (
              <button onClick={() => { setFromDate(''); setToDate(''); }} title="Clear date filter"
                className="ml-0.5 text-slate-400 hover:text-red-600"><X size={13} /></button>
            )}
          </div>
          <button onClick={() => void load()} className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-blue-600">
            <Loader2 size={12} className={reloading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-[13px] text-slate-400">
          No runs yet. Runs appear here after a matching record change (retained 30 days).
        </p>
      )}

      {rows.length > 0 && filtered.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-[13px] text-slate-400">
          No runs in the selected date range.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-slate-50/80 px-1 py-1 backdrop-blur">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.label}</span>
            <span className="text-[11px] text-slate-400">{group.runs.length} run{group.runs.length === 1 ? '' : 's'}</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          {group.runs.map((j) => {
        const s = STATUS_STYLE[j.status] ?? STATUS_STYLE.pending;
        const isOpen = openId === j.automation_job_id;
        const logs = j.action_logs;
        // Real action steps only — the synthetic 'condition_check' node is shown in
        // the timeline but excluded from the "X/Y steps" tally and step numbering.
        const realLogs = logs.filter((l) => l.action_type !== 'condition_check');
        const failedIdx = realLogs.findIndex((l) => l.status === 'failed');
        const okCount = realLogs.filter((l) => l.status === 'succeeded').length;
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
              {realLogs.length > 0 && (
                <span className="text-[12px] text-slate-400">
                  · {okCount}/{realLogs.length} step{realLogs.length === 1 ? '' : 's'}
                  {failedIdx >= 0 && <span className="ml-1 font-medium text-red-500">· failed at step {failedIdx + 1} ({actionLabel(realLogs[failedIdx].action_type as AutomationActionType)})</span>}
                </span>
              )}
              {j.status === 'skipped' && realLogs.length === 0 && (
                <span className="text-[12px] text-amber-500">· conditions not met</span>
              )}
              <div className="flex-1" />
              {j.attempts > 1 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">attempt {j.attempts}</span>}
              <span className="text-[12px] text-slate-400">{timeAgo(j.queued_at)}</span>
              <ChevronDown size={15} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
              <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11.5px] text-slate-400">
                  <span>Record {j.record_id?.slice(0, 8)}…</span>
                  <span>Trigger: {j.trigger_event}</span>
                  <span>Queued {new Date(j.queued_at).toLocaleString()}</span>
                  {j.finished_at && <span>Finished {new Date(j.finished_at).toLocaleString()}</span>}
                  <div className="flex-1" />
                  <button
                    onClick={() => void rerun(j)}
                    disabled={rerunId === j.automation_job_id}
                    title="Queue this run again using the flow's current configuration"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-slate-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                  >
                    <RotateCw size={12} className={rerunId === j.automation_job_id ? 'animate-spin' : ''} /> Re-run
                  </button>
                </div>

                {logs.length === 0 ? (
                  <p className="text-[12px] text-slate-400">No steps recorded{j.error ? ` — ${j.error}` : ''}.</p>
                ) : (
                  <ol className="space-y-0">
                    {logs.map((l, i) => {
                      // Synthetic condition-gate node: list every condition with
                      // its expected vs. actual value so a skipped run is legible.
                      if (l.action_type === 'condition_check') {
                        const conds = ((l.output as Record<string, unknown> | null)?.conditions as ConditionTrace[] | undefined) ?? [];
                        const allPass = l.status !== 'skipped';
                        return (
                          <li key={l.automation_job_action_log_id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="h-2 w-px bg-transparent" />
                              <span className={`grid h-6 w-6 place-items-center rounded-full bg-white ring-1 ${allPass ? 'text-emerald-600 ring-slate-200' : 'text-amber-600 ring-amber-300'}`}><Filter size={13} /></span>
                              <div className={`w-px flex-1 ${i === logs.length - 1 ? 'bg-transparent' : 'bg-slate-200'}`} />
                            </div>
                            <div className={`my-1 flex-1 rounded-lg border px-3 py-2 ${allPass ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50'}`}>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400">CONDITIONS</span>
                                <span className={`text-[11px] font-semibold ${allPass ? 'text-emerald-600' : 'text-amber-600'}`}>{allPass ? 'all met' : 'not met — run skipped'}</span>
                              </div>
                              <ul className="mt-1 space-y-0.5">
                                {conds.map((c, ci) => (
                                  <li key={ci} className="flex flex-wrap items-center gap-x-1.5 text-[11.5px]">
                                    {c.pass ? <Check size={12} className="shrink-0 text-emerald-500" /> : <X size={12} className="shrink-0 text-amber-500" />}
                                    <span className="font-medium text-slate-600">{c.field}</span>
                                    <span className="text-slate-400">{condOpLabel(c.operator)}</span>
                                    {c.operator !== 'is_empty' && c.operator !== 'is_not_empty' && (
                                      <span className="font-medium text-slate-700">{fmtCondVal(c.expected)}</span>
                                    )}
                                    <span className="text-slate-300">·</span>
                                    <span className={c.pass ? 'text-slate-400' : 'text-amber-700'}>actual {fmtCondVal(c.actual)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </li>
                        );
                      }
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
      ))}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded bg-slate-800 px-4 py-2 text-[13px] text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}
