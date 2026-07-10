import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Zap, ToggleLeft, ToggleRight, AlertTriangle, Clock,
  Mail, PencilLine, FileSpreadsheet, ListChecks, ArrowRight, MoreVertical,
  Sparkles, Loader2, CheckCircle2,
} from 'lucide-react';
import type { AutomationRule, AutomationActionType } from '../../types/automationRule';
import type { EntityDefinition } from '../../types/entity';
import type { EditorTab } from './RuleEditorPage';
import { fetchEntities } from '../../services/entityService';
import {
  fetchAllRules, fetchActions, setRuleEnabled, deleteRule, createRule, getCurrentUserId, fetchLatestError,
  aiBuildFlow, applyAiFlow, type AiFlowSpec,
} from '../../services/automationRuleService';
import { triggerSummary, actionLabel, timeAgo, RUN_AFTER_META } from './ruleSummary';
import ConfirmDialog from '../components/ConfirmDialog';

type StatusFilter = 'any' | 'on' | 'off' | 'errors';

// Small kebab (⋮) menu — replaces the bare trash icon on each card.
function KebabMenu({ onViewRuns, onDelete }: { onViewRuns: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} title="More" className="p-1 text-slate-400 hover:text-slate-700"><MoreVertical size={16} /></button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button onClick={() => { setOpen(false); onViewRuns(); }} className="block w-full px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50">View runs</button>
          <button onClick={() => { setOpen(false); onDelete(); }} className="block w-full px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50">Delete</button>
        </div>
      )}
    </div>
  );
}

interface Props {
  onOpen: (rule: AutomationRule, tab?: EditorTab) => void;
}

// Icon + accent per action type, reused for the flow chips.
const ACTION_ICON: Record<AutomationActionType, { icon: typeof Mail; cls: string }> = {
  send_email: { icon: Mail, cls: 'text-blue-600' },
  update_field: { icon: PencilLine, cls: 'text-violet-600' },
  generate_document: { icon: FileSpreadsheet, cls: 'text-emerald-600' },
  list_rows: { icon: ListChecks, cls: 'text-sky-600' },
};

function ActionChips({ types }: { types: AutomationActionType[] }) {
  if (types.length === 0) {
    return <span className="text-[12px] text-slate-400">No actions yet</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {types.map((t, i) => {
        const meta = ACTION_ICON[t];
        const Icon = meta?.icon ?? Mail;
        return (
          <span key={i} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
            <Icon size={11} className={meta?.cls ?? 'text-slate-500'} />
            {actionLabel(t)}
          </span>
        );
      })}
    </div>
  );
}

const btnPrimary = 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded';
const input = 'w-full px-2.5 py-1.5 text-[13px] border border-slate-300 rounded outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';

export default function RuleListPage({ onOpen }: Props) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [actionTypesByRule, setActionTypesByRule] = useState<Record<string, AutomationActionType[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('any');
  const [deleteTarget, setDeleteTarget] = useState<AutomationRule | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [errByRule, setErrByRule] = useState<Record<string, string | null>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [rs, es] = await Promise.all([fetchAllRules(), fetchEntities()]);
      setRules(rs);
      setEntities(es);
      // One query per rule is fine at admin scale; group action types for the cards.
      const pairs = await Promise.all(
        rs.map(async (r) => [r.automation_rule_id, (await fetchActions(r.automation_rule_id)).map((a) => a.action_type)] as const),
      );
      setActionTypesByRule(Object.fromEntries(pairs));
      // Latest failure message for rules that have errors (for the inline banner).
      const errPairs = await Promise.all(
        rs.filter((r) => r.error_count > 0)
          .map(async (r) => [r.automation_rule_id, await fetchLatestError(r.automation_rule_id).catch(() => null)] as const),
      );
      setErrByRule(Object.fromEntries(errPairs));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const entityLabel = useMemo(() => {
    const m = new Map(entities.map((e) => [e.logical_name, e.display_name]));
    return (logical: string) => m.get(logical) ?? logical;
  }, [entities]);

  const filtered = rules.filter((r) => {
    if (tableFilter && r.table_logical_name !== tableFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.name} ${entityLabel(r.table_logical_name)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (statusFilter === 'on' && !r.enabled) return false;
    if (statusFilter === 'off' && r.enabled) return false;
    if (statusFilter === 'errors' && r.error_count === 0) return false;
    return true;
  });

  const activeCount = rules.filter((r) => r.enabled).length;
  const errorCount = rules.filter((r) => r.error_count > 0).length;

  const toggle = async (r: AutomationRule) => {
    await setRuleEnabled(r.automation_rule_id, !r.enabled);
    setRules((prev) => prev.map((x) => (x.automation_rule_id === r.automation_rule_id ? { ...x, enabled: !r.enabled } : x)));
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    await deleteRule(deleteTarget.automation_rule_id);
    setDeleteTarget(null);
    void load();
  };

  const tablesInUse = useMemo(
    () => [...new Set(rules.map((r) => r.table_logical_name))],
    [rules],
  );

  return (
    <div className="p-6 max-w-5xl">
      {/* header */}
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-slate-800">Automation rules</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            {rules.length} rule{rules.length === 1 ? '' : 's'} · {activeCount} active
            {errorCount > 0 && <span className="text-red-500"> · {errorCount} need{errorCount === 1 ? 's' : ''} attention</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAi(true)}
            className="inline-flex items-center gap-1.5 rounded border border-violet-200 bg-gradient-to-r from-violet-50 to-blue-50 px-3 py-1.5 text-[13px] font-medium text-violet-700 hover:border-violet-300"
          >
            <Sparkles size={15} /> Build with AI
          </button>
          <button className={btnPrimary} onClick={() => setShowCreate(true)}><Plus size={15} /> New rule</button>
        </div>
      </div>

      {/* toolbar */}
      <div className="mb-5 flex items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rules…" className={`${input} pl-8`} />
        </div>
        <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className={`${input} w-44 shrink-0`}>
          <option value="">All tables</option>
          {tablesInUse.map((t) => <option key={t} value={t}>{entityLabel(t)}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={`${input} w-40 shrink-0`}>
          <option value="any">Any status</option>
          <option value="on">On</option>
          <option value="off">Off</option>
          <option value="errors">Has errors</option>
        </select>
      </div>

      {loading ? (
        <p className="text-[13px] text-slate-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Zap size={30} className="mx-auto mb-3 text-slate-300" />
          <p className="text-[13px]">No automation rules yet.</p>
          <button className={`${btnPrimary} mt-4`} onClick={() => setShowCreate(true)}><Plus size={15} /> Create your first rule</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const types = actionTypesByRule[r.automation_rule_id] ?? [];
            const hasError = r.error_count > 0;
            return (
              <div
                key={r.automation_rule_id}
                className={`group relative bg-white border rounded-xl transition-all hover:shadow-sm ${hasError ? 'border-red-200' : 'border-slate-200 hover:border-slate-300'}`}
              >
                {/* colored status rail */}
                <span className={`absolute inset-y-0 left-0 w-1 rounded-l-xl ${!r.enabled ? 'bg-slate-200' : hasError ? 'bg-red-400' : 'bg-emerald-400'}`} />
                <div className="flex items-start gap-3.5 p-4 pl-5">
                  {/* icon tile */}
                  <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${hasError ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'}`}>
                    <Zap size={17} />
                  </div>

                  <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(r, 'actions')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-slate-800 group-hover:text-blue-700">{r.name}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{entityLabel(r.table_logical_name)}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${r.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${r.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {r.enabled ? 'On' : 'Off'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-slate-500">{triggerSummary(r)}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <ActionChips types={types} />
                      {r.last_run_at && (
                        <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-400">
                          <Clock size={11} /> ran {timeAgo(r.last_run_at)}
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button onClick={() => toggle(r)} title={r.enabled ? 'Disable' : 'Enable'} className={r.enabled ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'}>
                      {r.enabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                    </button>
                    <KebabMenu onViewRuns={() => onOpen(r, 'history')} onDelete={() => setDeleteTarget(r)} />
                  </div>
                </div>

                {/* inline error banner with the actual failure message */}
                {hasError && (
                  <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-500" />
                    <p className="flex-1 text-[12px] text-red-700">
                      Last run failed{errByRule[r.automation_rule_id] ? ` — ${errByRule[r.automation_rule_id]}` : ` (${r.error_count} error${r.error_count > 1 ? 's' : ''})`}
                    </p>
                    <button onClick={() => onOpen(r, 'history')} className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-red-600 hover:underline">
                      View run <ArrowRight size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateRuleModal
          entities={entities}
          onClose={() => setShowCreate(false)}
          onCreated={(rule) => { setShowCreate(false); onOpen(rule); }}
        />
      )}

      {showAi && (
        <AiBuildModal
          entities={entities}
          onClose={() => setShowAi(false)}
          onCreated={(rule) => { setShowAi(false); onOpen(rule); }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete automation rule"
          message={`Permanently delete "${deleteTarget.name}" and its actions? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={doDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function CreateRuleModal({
  entities, onClose, onCreated,
}: { entities: EntityDefinition[]; onClose: () => void; onCreated: (r: AutomationRule) => void }) {
  const [name, setName] = useState('');
  const [table, setTable] = useState('');
  const [trigger, setTrigger] = useState<AutomationRule['trigger_event']>('update');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim() || !table) { setErr('Name and table are required.'); return; }
    setSaving(true);
    setErr(null);
    try {
      const created_by = await getCurrentUserId();
      const rule = await createRule({ name: name.trim(), table_logical_name: table, trigger_event: trigger, created_by });
      onCreated(rule);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create rule');
      setSaving(false);
    }
  };

  // Sorted entity list for the picker.
  const opts = [...entities].sort((a, b) => a.display_name.localeCompare(b.display_name));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[420px] p-5">
        <h3 className="text-[15px] font-semibold text-slate-800 mb-4">New automation rule</h3>
        <label className="block text-[12px] font-medium text-slate-600 mb-1">Rule name</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="e.g. Notify sales on approval" />
        <label className="block text-[12px] font-medium text-slate-600 mb-1 mt-3">Table</label>
        <select value={table} onChange={(e) => setTable(e.target.value)} className={input}>
          <option value="">Select a table…</option>
          {opts.map((e) => <option key={e.entity_definition_id} value={e.logical_name}>{e.display_name}</option>)}
        </select>
        <label className="block text-[12px] font-medium text-slate-600 mb-1 mt-3">Trigger type</label>
        <select value={trigger} onChange={(e) => setTrigger(e.target.value as AutomationRule['trigger_event'])} className={input}>
          <option value="create">Row created</option>
          <option value="update">Row updated / field changes</option>
          <option value="both">Row created or updated</option>
        </select>
        {err && <p className="text-[12px] text-red-600 mt-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
          <button onClick={create} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>{saving ? 'Creating…' : 'Continue'}</button>
        </div>
      </div>
    </div>
  );
}

// Build a whole rule from a plain-language prompt: pick a table, let AI draft the
// trigger + steps, then create the rule and apply the flow in one go. This is the
// list-level entry point (the editor's Actions tab no longer hosts its own copy).
function AiBuildModal({
  entities, onClose, onCreated,
}: { entities: EntityDefinition[]; onClose: () => void; onCreated: (r: AutomationRule) => void }) {
  const [table, setTable] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<AiFlowSpec | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const opts = [...entities].sort((a, b) => a.display_name.localeCompare(b.display_name));

  const generate = async () => {
    if (!table) { setError('Pick a table first.'); return; }
    if (!prompt.trim()) return;
    setLoading(true); setError(null); setSpec(null); setWarnings([]);
    try {
      const r = await aiBuildFlow(table, prompt.trim());
      setSpec(r.spec); setWarnings(r.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI build failed');
    } finally { setLoading(false); }
  };

  const apply = async () => {
    if (!spec || !table) return;
    setApplying(true); setError(null);
    try {
      const created_by = await getCurrentUserId();
      const rule = await createRule({ name: spec.name || 'AI rule', table_logical_name: table, created_by });
      await applyAiFlow(rule, spec);
      onCreated(rule);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply');
      setApplying(false);
    }
  };

  const examples = [
    'When a note is created on this record, email the enabled recipients with the note and a link to open the record.',
    'When status changes to Won, email sales@montyholding.com; if that fails, alert admin@montyholding.com.',
    'When a record is created, generate an Excel export of all rows and email it to finance.',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-[560px] flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100 text-violet-600"><Sparkles size={16} /></span>
          <div>
            <h3 className="text-[15px] font-semibold text-slate-800">Build a rule with AI</h3>
            <p className="text-[11.5px] text-slate-400">Pick a table and describe what should happen — AI drafts the trigger + steps.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label className="block text-[12px] font-medium text-slate-600 mb-1">Table</label>
          <select value={table} onChange={(e) => { setTable(e.target.value); setSpec(null); }} className={input}>
            <option value="">Select a table…</option>
            {opts.map((e) => <option key={e.entity_definition_id} value={e.logical_name}>{e.display_name}</option>)}
          </select>

          <label className="block text-[12px] font-medium text-slate-600 mb-1 mt-3">Describe the flow</label>
          <textarea
            rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            className={input} placeholder="e.g. When a note is created on this opportunity, email the team the note with a link to open the opportunity…"
          />
          {!spec && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] font-medium text-slate-400">Try:</p>
              {examples.map((ex) => (
                <button key={ex} onClick={() => setPrompt(ex)} className="block w-full rounded border border-slate-200 bg-slate-50/60 px-2 py-1 text-left text-[11.5px] text-slate-500 hover:border-slate-300">{ex}</button>
              ))}
            </div>
          )}

          {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</p>}

          {spec && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-[12.5px] font-medium text-slate-700">{spec.summary || spec.name}</p>
              <div className="mt-2 flex items-center gap-2 text-[12px] text-slate-600">
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-700">Trigger</span>
                {triggerSummary(spec.trigger)}
              </div>
              <div className="mt-2 space-y-1">
                {spec.actions.map((a, i) => {
                  const meta = RUN_AFTER_META[a.run_after] ?? RUN_AFTER_META.success;
                  return (
                    <div key={i} className="flex items-center gap-2 text-[12px] text-slate-600">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-700 text-[10px] font-bold text-white">{i + 1}</span>
                      {actionLabel(a.action_type)}
                      {i > 0 && <span className={`rounded-full border px-1.5 py-0 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>}
                    </div>
                  );
                })}
              </div>
              {warnings.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-[11px] text-amber-600">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              )}
              <p className="mt-2 text-[11px] text-slate-400">Creates a new rule with this trigger and these steps. Review each step afterwards.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-100">Cancel</button>
          {!spec ? (
            <button onClick={generate} disabled={loading || !table || !prompt.trim()} className={`${btnPrimary} disabled:opacity-50`}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Generate
            </button>
          ) : (
            <>
              <button onClick={generate} disabled={loading} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-50">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Regenerate
              </button>
              <button onClick={apply} disabled={applying} className={`${btnPrimary} disabled:opacity-50`}>
                {applying ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Create rule
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
