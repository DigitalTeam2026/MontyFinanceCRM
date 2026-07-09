import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Zap, ToggleLeft, ToggleRight, Trash2, AlertTriangle, Clock } from 'lucide-react';
import type { AutomationRule, AutomationActionType } from '../../types/automationRule';
import type { EntityDefinition } from '../../types/entity';
import { fetchEntities } from '../../services/entityService';
import {
  fetchAllRules, fetchActions, setRuleEnabled, deleteRule, createRule, getCurrentUserId,
} from '../../services/automationRuleService';
import { triggerSummary, actionsSummary } from './ruleSummary';
import ConfirmDialog from '../components/ConfirmDialog';

interface Props {
  onOpen: (rule: AutomationRule) => void;
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
  const [deleteTarget, setDeleteTarget] = useState<AutomationRule | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

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
      {/* toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className={`${input} w-48`}>
          <option value="">All tables</option>
          {tablesInUse.map((t) => <option key={t} value={t}>{entityLabel(t)}</option>)}
        </select>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rules…" className={`${input} pl-8`} />
        </div>
        <div className="flex-1" />
        <button className={btnPrimary} onClick={() => setShowCreate(true)}><Plus size={15} /> New Rule</button>
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
        <div className="space-y-2.5">
          {filtered.map((r) => (
            <div key={r.automation_rule_id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
              <div className="flex items-start gap-3">
                <button
                  className="flex-1 text-left"
                  onClick={() => onOpen(r)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-slate-800">{r.name}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{entityLabel(r.table_logical_name)}</span>
                    {r.error_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">
                        <AlertTriangle size={11} /> {r.error_count} error{r.error_count > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-slate-500 mt-1">{triggerSummary(r)}</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">
                    {actionsSummary(actionTypesByRule[r.automation_rule_id] ?? [])}
                    {r.last_run_at && (
                      <span className="inline-flex items-center gap-1 ml-3"><Clock size={11} /> last run {new Date(r.last_run_at).toLocaleString()}</span>
                    )}
                  </p>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggle(r)} title={r.enabled ? 'Enabled' : 'Disabled'} className={r.enabled ? 'text-emerald-600' : 'text-slate-400'}>
                    {r.enabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                  </button>
                  <button onClick={() => setDeleteTarget(r)} title="Delete" className="text-slate-400 hover:text-red-600 p-1">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateRuleModal
          entities={entities}
          onClose={() => setShowCreate(false)}
          onCreated={(rule) => { setShowCreate(false); onOpen(rule); }}
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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim() || !table) { setErr('Name and table are required.'); return; }
    setSaving(true);
    setErr(null);
    try {
      const created_by = await getCurrentUserId();
      const rule = await createRule({ name: name.trim(), table_logical_name: table, created_by });
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
        <h3 className="text-[15px] font-semibold text-slate-800 mb-4">New Automation Rule</h3>
        <label className="block text-[12px] font-medium text-slate-600 mb-1">Name</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="e.g. Notify sales on approval" />
        <label className="block text-[12px] font-medium text-slate-600 mb-1 mt-3">Table</label>
        <select value={table} onChange={(e) => setTable(e.target.value)} className={input}>
          <option value="">Select a table…</option>
          {opts.map((e) => <option key={e.entity_definition_id} value={e.logical_name}>{e.display_name}</option>)}
        </select>
        {err && <p className="text-[12px] text-red-600 mt-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
          <button onClick={create} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>{saving ? 'Creating…' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
