import FilterSelect from '../../app/components/FilterSelect';
import { useState, useEffect } from 'react';
import {
  Plus, Search, Trash2, Copy, ToggleLeft, ToggleRight, Loader2,
  ShieldAlert, ChevronRight, History,
} from 'lucide-react';
import {
  fetchDigitalRules,
  softDeleteDigitalRule,
  cloneDigitalRule,
  updateDigitalRule,
  fetchDigitalRuleWithDetails,
  fetchExecutionLogs,
} from '../../services/digitalRuleService';
import type { DigitalRule, DigitalRuleExecutionLog } from '../../types/digitalRule';
import { TRIGGER_EVENT_META, KNOWN_ENTITIES, CATEGORY_META } from '../../types/digitalRule';
import type { RuleCategory } from '../../types/digitalRule';
import ConfirmDialog from '../components/ConfirmDialog';

interface Props {
  onNew: () => void;
  onEdit: (rule: DigitalRule) => void;
}

export default function DigitalRuleListPage({ onNew, onEdit }: Props) {
  const [rules, setRules] = useState<DigitalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DigitalRule | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<DigitalRuleExecutionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRules(await fetchDigitalRules()); } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (rule: DigitalRule) => {
    await updateDigitalRule(rule.digital_rule_id, { ...rule, is_active: !rule.is_active });
    await load();
  };

  const handleClone = async (rule: DigitalRule) => {
    const full = await fetchDigitalRuleWithDetails(rule.digital_rule_id);
    await cloneDigitalRule(full);
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await softDeleteDigitalRule(deleteTarget.digital_rule_id);
    setDeleteTarget(null);
    await load();
  };

  const handleShowLogs = async () => {
    setShowLogs(true);
    setLogsLoading(true);
    try { setLogs(await fetchExecutionLogs()); } catch { /* ignore */ }
    setLogsLoading(false);
  };

  const entityLabel = (name: string) =>
    KNOWN_ENTITIES.find((e) => e.logical_name === name)?.display_name ?? name;

  const filtered = rules.filter((r) => {
    if (filterEntity && r.entity_logical_name !== filterEntity) return false;
    if (filterCategory && (r.category ?? 'delete') !== filterCategory) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (showLogs) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-slate-800">Execution Log</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Every delete rule execution is logged here</p>
          </div>
          <button onClick={() => setShowLogs(false)} className="text-[12px] text-blue-600 hover:text-blue-800 font-medium">
            Back to Rules
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">
          {logsLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-[13px]">No executions logged yet</div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5">Rule</th>
                    <th className="px-4 py-2.5">Entity</th>
                    <th className="px-4 py-2.5">Action</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.log_id} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{l.rule_name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{entityLabel(l.entity_logical_name)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{l.action_taken}</td>
                      <td className="px-4 py-2.5">
                        {l.success ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-medium border border-emerald-200">Success</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 rounded-full text-[10px] font-medium border border-red-200" title={l.error_message ?? ''}>Failed</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{new Date(l.executed_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search rules..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-[12px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
            />
          </div>
          <FilterSelect
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-[12px] border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="">All Categories</option>
            {(Object.keys(CATEGORY_META) as RuleCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_META[c].label}</option>
            ))}
          </FilterSelect>
          <FilterSelect
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
            className="text-[12px] border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="">All Entities</option>
            {KNOWN_ENTITIES.map((e) => (
              <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>
            ))}
          </FilterSelect>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShowLogs}
            className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
          >
            <History size={13} />
            Execution Log
          </button>
          <button
            onClick={onNew}
            className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow-sm"
          >
            <Plus size={13} />
            New Rule
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <ShieldAlert size={20} className="text-slate-400" />
            </div>
            <p className="text-[13px] text-slate-500">No digital rules found</p>
            <p className="text-[11px] text-slate-400 mt-1">Create rules to control delete behavior, lifecycle transitions, and automation for your entities</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((rule) => (
              <div
                key={rule.digital_rule_id}
                className="bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-sm transition group"
              >
                <div className="px-5 py-3.5 flex items-center gap-4">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(rule)}>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-[13px] font-semibold text-slate-800 truncate">{rule.name}</h3>
                      {rule.is_system && (
                        <span className="shrink-0 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[9px] font-semibold uppercase tracking-wide border border-blue-200">System</span>
                      )}
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide border ${rule.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide border ${
                        (rule.category ?? 'delete') === 'lifecycle' ? 'bg-teal-50 text-teal-700 border-teal-200' :
                        (rule.category ?? 'delete') === 'automation' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-slate-50 text-slate-600 border-slate-200'
                      }`}>
                        {CATEGORY_META[(rule.category ?? 'delete') as RuleCategory]?.label ?? rule.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[11px] text-slate-500">
                        <span className="font-medium text-slate-600">{entityLabel(rule.entity_logical_name)}</span>
                      </span>
                      <span className="text-[10px] text-slate-400">|</span>
                      <span className="text-[11px] text-slate-500">
                        {TRIGGER_EVENT_META[rule.trigger_event]?.label ?? rule.trigger_event}
                      </span>
                      <span className="text-[10px] text-slate-400">|</span>
                      <span className="text-[11px] text-slate-500">
                        Priority: {rule.priority}
                      </span>
                    </div>
                    {rule.description && (
                      <p className="text-[11px] text-slate-400 mt-1 truncate">{rule.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleToggle(rule)}
                      title={rule.is_active ? 'Deactivate' : 'Activate'}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                    >
                      {rule.is_active ? <ToggleRight size={15} className="text-emerald-500" /> : <ToggleLeft size={15} />}
                    </button>
                    <button
                      onClick={() => handleClone(rule)}
                      title="Clone"
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                    >
                      <Copy size={13} />
                    </button>
                    {!rule.is_system && (
                      <button
                        onClick={() => setDeleteTarget(rule)}
                        title="Delete"
                        className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => onEdit(rule)}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Digital Rule"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}
    </div>
  );
}
