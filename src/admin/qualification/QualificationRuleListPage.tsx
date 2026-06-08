import { useEffect, useState, useCallback } from 'react';
import {
  Search, RefreshCw, Plus, X, Copy, Trash2,
  ToggleLeft, ToggleRight, ChevronRight,
  Star, StarOff, AlertTriangle, UserCheck,
  Building2, User, Briefcase,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { LeadQualificationRule } from '../../types/leadQualification';
import { CREATION_MODE_META } from '../../types/leadQualification';
import {
  fetchQualificationRules,
  toggleQualificationRule,
  softDeleteQualificationRule,
  cloneQualificationRule,
  createQualificationRule,
  updateQualificationRule,
} from '../../services/leadQualificationService';
import ConfirmDialog from '../components/ConfirmDialog';

interface QualificationRuleListPageProps {
  onOpen: (rule: LeadQualificationRule) => void;
}

export default function QualificationRuleListPage({ onOpen }: QualificationRuleListPageProps) {
  const { showError } = useToast();
  const [rules, setRules] = useState<LeadQualificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeadQualificationRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchQualificationRules();
      setRules(data);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (rule: LeadQualificationRule) => {
    setToggling(rule.lead_qualification_rule_id);
    try {
      await toggleQualificationRule(rule.lead_qualification_rule_id, !rule.is_active);
      setRules((prev) => prev.map((r) =>
        r.lead_qualification_rule_id === rule.lead_qualification_rule_id
          ? { ...r, is_active: !r.is_active }
          : r
      ));
    } finally {
      setToggling(null);
    }
  };

  const handleSetDefault = async (rule: LeadQualificationRule) => {
    setSettingDefault(rule.lead_qualification_rule_id);
    try {
      await updateQualificationRule(rule.lead_qualification_rule_id, { is_default: true });
      setRules((prev) => prev.map((r) => ({
        ...r,
        is_default: r.lead_qualification_rule_id === rule.lead_qualification_rule_id,
      })));
    } finally {
      setSettingDefault(null);
    }
  };

  const handleClone = async (rule: LeadQualificationRule) => {
    setCloning(rule.lead_qualification_rule_id);
    try {
      const cloned = await cloneQualificationRule(rule);
      setRules((prev) => [...prev, cloned]);
    } finally {
      setCloning(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteQualificationRule(deleteTarget.lead_qualification_rule_id);
      setRules((prev) => prev.filter((r) => r.lead_qualification_rule_id !== deleteTarget.lead_qualification_rule_id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleCreated = (rule: LeadQualificationRule) => {
    setRules((prev) => [...prev, rule]);
    setShowNewModal(false);
    onOpen(rule);
  };

  const filtered = rules.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rules..."
              className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw size={14} />
          </button>
          <span className="text-xs text-gray-400">{filtered.length} rule{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={13} />
          New Rule
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-gray-400">Loading rules...</div>
        ) : filtered.length === 0 ? (
          <EmptyState onNew={() => setShowNewModal(true)} />
        ) : (
          <div className="space-y-3">
            {filtered.map((rule) => (
              <RuleCard
                key={rule.lead_qualification_rule_id}
                rule={rule}
                toggling={toggling === rule.lead_qualification_rule_id}
                cloning={cloning === rule.lead_qualification_rule_id}
                settingDefault={settingDefault === rule.lead_qualification_rule_id}
                onOpen={() => onOpen(rule)}
                onToggle={() => handleToggle(rule)}
                onClone={() => handleClone(rule)}
                onSetDefault={() => handleSetDefault(rule)}
                onDelete={() => setDeleteTarget(rule)}
              />
            ))}
          </div>
        )}
      </div>

      {showNewModal && (
        <NewRuleModal onClose={() => setShowNewModal(false)} onCreated={handleCreated} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Rule"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete Rule"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
          destructive
        />
      )}
    </div>
  );
}

// ─── Rule Card ────────────────────────────────────────────────────────────────

interface RuleCardProps {
  rule: LeadQualificationRule;
  toggling: boolean;
  cloning: boolean;
  settingDefault: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onClone: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}

function RuleCard({ rule, toggling, cloning, settingDefault, onOpen, onToggle, onClone, onSetDefault, onDelete }: RuleCardProps) {
  const targets = [
    { icon: <Building2 size={12} />, label: 'Account',     mode: rule.create_account },
    { icon: <User size={12} />,      label: 'Contact',     mode: rule.create_contact },
    { icon: <Briefcase size={12} />, label: 'Opportunity', mode: rule.create_opportunity },
  ] as const;

  return (
    <div
      onClick={onOpen}
      className={`group relative flex items-start gap-4 px-4 py-4 bg-white border rounded-xl transition-all cursor-pointer hover:shadow-sm ${
        rule.is_active ? 'border-gray-200 hover:border-blue-300' : 'border-gray-100 opacity-60'
      } ${rule.is_default ? 'ring-2 ring-blue-500/20' : ''}`}
    >
      {rule.is_default && (
        <div className="absolute top-3 left-3">
          <Star size={11} className="text-amber-400 fill-amber-400" />
        </div>
      )}

      <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <UserCheck size={16} className="text-emerald-600" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-gray-900 truncate">{rule.name}</span>
          {rule.is_default && (
            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-1.5 py-0 font-medium">default</span>
          )}
          {rule.is_system && (
            <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 rounded px-1.5 py-0">system</span>
          )}
        </div>

        {rule.description && (
          <p className="text-xs text-gray-500 mb-2.5 line-clamp-1">{rule.description}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {targets.map((t) => {
            const meta = CREATION_MODE_META[t.mode];
            return (
              <div
                key={t.label}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-medium"
                style={{ backgroundColor: meta.bg, borderColor: meta.color + '40', color: meta.color }}
              >
                {t.icon}
                <span>{t.label}</span>
                <span className="opacity-70">— {meta.label}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
          {rule.inherit_line_of_business && <span className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">Inherits LOB</span>}
          {rule.inherit_products && <span className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">Inherits Products</span>}
          {rule.check_duplicate_account && <span className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">Dup check: Account</span>}
          {rule.check_duplicate_contact && <span className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">Dup check: Contact</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {!rule.is_default && (
          <button
            onClick={onSetDefault}
            disabled={settingDefault}
            title="Set as default rule"
            className="p-1.5 text-gray-300 hover:text-amber-500 transition-colors disabled:opacity-50"
          >
            <StarOff size={13} />
          </button>
        )}
        <button
          onClick={onToggle}
          disabled={toggling}
          title={rule.is_active ? 'Deactivate' : 'Activate'}
          className="p-1.5 transition-colors disabled:opacity-50"
        >
          {rule.is_active
            ? <ToggleRight size={18} className="text-blue-600" />
            : <ToggleLeft size={18} className="text-gray-300" />
          }
        </button>
        <button
          onClick={onClone}
          disabled={cloning}
          title="Clone rule"
          className="p-1.5 text-gray-300 hover:text-gray-600 transition-colors disabled:opacity-50"
        >
          <Copy size={13} />
        </button>
        {!rule.is_system && (
          <button
            onClick={onDelete}
            title="Delete rule"
            className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
        <ChevronRight size={13} className="text-gray-200 group-hover:text-gray-400 transition-colors ml-1" />
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
        <UserCheck size={24} className="text-emerald-300" />
      </div>
      <p className="text-sm font-semibold text-gray-700 mb-1">No qualification rules</p>
      <p className="text-xs text-gray-400 mb-5 max-w-xs">
        Define how Leads are converted — which records to create, how fields map, and which pipeline Opportunities enter.
      </p>
      <button
        onClick={onNew}
        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Plus size={13} />New Rule
      </button>
    </div>
  );
}

// ─── New Rule Modal ───────────────────────────────────────────────────────────

function NewRuleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (r: LeadQualificationRule) => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const rule = await createQualificationRule({
        name: name.trim(),
        description: '',
        is_active: true,
        is_default: false,
        create_account: 'always',
        check_duplicate_account: true,
        create_contact: 'always',
        check_duplicate_contact: true,
        create_opportunity: 'optional',
        default_process_flow_id: null,
        inherit_line_of_business: true,
        inherit_products: false,
      });
      onCreated(rule);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-gray-900">New Qualification Rule</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>
        {error && (
          <div className="mb-4 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />{error}
          </div>
        )}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Rule Name <span className="text-red-500">*</span></label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="e.g. Standard Sales Qualification"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating...' : 'Create & Configure'}
          </button>
        </div>
      </div>
    </div>
  );
}
