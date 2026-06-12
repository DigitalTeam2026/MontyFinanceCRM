import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState, useCallback } from 'react';
import {
  Search, RefreshCw, Plus, X, Copy, Trash2,
  ToggleLeft, ToggleRight, AlertTriangle, ChevronRight,
  Filter, ShieldAlert, AlertCircle,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { DuplicateDetectionRule } from '../../types/duplicateDetection';
import { BEHAVIOR_META, TRIGGER_LABELS } from '../../types/duplicateDetection';
import {
  fetchDuplicateRules,
  toggleDuplicateRule,
  softDeleteDuplicateRule,
  cloneDuplicateRule,
  createDuplicateRule,
} from '../../services/duplicateDetectionService';
import ConfirmDialog from '../components/ConfirmDialog';

const KNOWN_ENTITIES = [
  { logical_name: 'account',     display_name: 'Account' },
  { logical_name: 'contact',     display_name: 'Contact' },
  { logical_name: 'lead',        display_name: 'Lead' },
  { logical_name: 'opportunity', display_name: 'Opportunity' },
  { logical_name: 'case',        display_name: 'Case' },
];

interface DuplicateRulesListPageProps {
  onOpen: (rule: DuplicateDetectionRule) => void;
}

export default function DuplicateRulesListPage({ onOpen }: DuplicateRulesListPageProps) {
  const { showError } = useToast();
  const [rules, setRules] = useState<DuplicateDetectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterActive, setFilterActive] = useState<'' | 'active' | 'inactive'>('');
  const [filterBehavior, setFilterBehavior] = useState<'' | 'warn' | 'block'>('');

  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DuplicateDetectionRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDuplicateRules();
      setRules(data);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (rule: DuplicateDetectionRule) => {
    setToggling(rule.duplicate_rule_id);
    try {
      await toggleDuplicateRule(rule.duplicate_rule_id, !rule.is_active);
      setRules((prev) => prev.map((r) =>
        r.duplicate_rule_id === rule.duplicate_rule_id ? { ...r, is_active: !r.is_active } : r
      ));
    } finally {
      setToggling(null);
    }
  };

  const handleClone = async (rule: DuplicateDetectionRule) => {
    setCloning(rule.duplicate_rule_id);
    try {
      const cloned = await cloneDuplicateRule(rule);
      setRules((prev) => [...prev, cloned]);
    } finally {
      setCloning(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteDuplicateRule(deleteTarget.duplicate_rule_id);
      setRules((prev) => prev.filter((r) => r.duplicate_rule_id !== deleteTarget.duplicate_rule_id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleCreated = (rule: DuplicateDetectionRule) => {
    setRules((prev) => [...prev, rule]);
    setShowNewModal(false);
    onOpen(rule);
  };

  const filtered = rules.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q) || r.entity_logical_name.toLowerCase().includes(q);
    const matchEntity = !filterEntity || r.entity_logical_name === filterEntity;
    const matchActive = !filterActive || (filterActive === 'active' ? r.is_active : !r.is_active);
    const matchBehavior = !filterBehavior || r.behavior === filterBehavior;
    return matchSearch && matchEntity && matchActive && matchBehavior;
  });

  const grouped = KNOWN_ENTITIES.reduce<Record<string, DuplicateDetectionRule[]>>((acc, e) => {
    const entityRules = filtered.filter((r) => r.entity_logical_name === e.logical_name);
    if (entityRules.length > 0) acc[e.logical_name] = entityRules;
    return acc;
  }, {});
  const otherRules = filtered.filter((r) => !KNOWN_ENTITIES.some((e) => e.logical_name === r.entity_logical_name));
  if (otherRules.length > 0) grouped['__other__'] = otherRules;

  const hasFilters = search || filterEntity || filterActive || filterBehavior;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white space-y-2.5">
        <div className="flex items-center justify-between">
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
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{filtered.length} rule{filtered.length !== 1 ? 's' : ''}</span>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={13} />
              New Rule
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={12} className="text-gray-400 flex-shrink-0" />
          <FilterSelect
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
            className="py-1 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="">All Entities</option>
            {KNOWN_ENTITIES.map((e) => <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>)}
          </FilterSelect>
          <FilterSelect
            value={filterBehavior}
            onChange={(e) => setFilterBehavior(e.target.value as '' | 'warn' | 'block')}
            className="py-1 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="">All Behaviors</option>
            <option value="warn">Warning</option>
            <option value="block">Block</option>
          </FilterSelect>
          <FilterSelect
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value as '' | 'active' | 'inactive')}
            className="py-1 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="">Active + Inactive</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </FilterSelect>
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setFilterEntity(''); setFilterActive(''); setFilterBehavior(''); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              <X size={11} />Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-gray-400">Loading rules...</div>
        ) : filtered.length === 0 ? (
          <EmptyState hasFilters={!!hasFilters} onNew={() => setShowNewModal(true)} />
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([entityKey, entityRules]) => {
              const entityMeta = KNOWN_ENTITIES.find((e) => e.logical_name === entityKey);
              return (
                <div key={entityKey}>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                    {entityMeta?.display_name ?? entityKey}
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400 normal-case font-medium">{entityRules.length} rule{entityRules.length !== 1 ? 's' : ''}</span>
                  </h3>
                  <div className="space-y-2">
                    {entityRules.map((rule) => (
                      <RuleCard
                        key={rule.duplicate_rule_id}
                        rule={rule}
                        toggling={toggling === rule.duplicate_rule_id}
                        cloning={cloning === rule.duplicate_rule_id}
                        onOpen={() => onOpen(rule)}
                        onToggle={() => handleToggle(rule)}
                        onClone={() => handleClone(rule)}
                        onDelete={() => setDeleteTarget(rule)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showNewModal && (
        <NewRuleModal
          onClose={() => setShowNewModal(false)}
          onCreated={handleCreated}
        />
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
  rule: DuplicateDetectionRule;
  toggling: boolean;
  cloning: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onClone: () => void;
  onDelete: () => void;
}

function RuleCard({ rule, toggling, cloning, onOpen, onToggle, onClone, onDelete }: RuleCardProps) {
  const bMeta = BEHAVIOR_META[rule.behavior];
  const activeTriggers = TRIGGER_LABELS.filter((t) => rule[t.key]);

  return (
    <div
      className={`group relative flex items-start gap-4 px-4 py-3.5 bg-white border rounded-xl transition-all cursor-pointer hover:shadow-sm ${
        rule.is_active ? 'border-gray-200 hover:border-blue-300' : 'border-gray-100 opacity-60'
      }`}
      onClick={onOpen}
    >
      {/* Behavior icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: bMeta.bg }}
      >
        {rule.behavior === 'block'
          ? <ShieldAlert size={15} style={{ color: bMeta.color }} />
          : <AlertCircle size={15} style={{ color: bMeta.color }} />
        }
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-gray-800 truncate">{rule.name}</span>
          {rule.is_system && (
            <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 rounded px-1.5 py-0">system</span>
          )}
          <span
            className="text-[10px] font-medium rounded-full px-2 py-0.5"
            style={{ backgroundColor: bMeta.bg, color: bMeta.color }}
          >
            {bMeta.label}
          </span>
        </div>

        {rule.description && (
          <p className="text-xs text-gray-500 mb-2 line-clamp-1">{rule.description}</p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {rule.exact_match_fields.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Exact:</span>
              <div className="flex gap-1">
                {rule.exact_match_fields.map((f) => (
                  <code key={f} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{f}</code>
                ))}
              </div>
            </div>
          )}
          {rule.fuzzy_match_fields.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Fuzzy:</span>
              <div className="flex gap-1">
                {rule.fuzzy_match_fields.map((f) => (
                  <code key={f.field} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
                    {f.field} ≥{f.threshold}%
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>

        {activeTriggers.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Triggers:</span>
            {activeTriggers.map((t) => (
              <span key={t.key} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5">{t.label}</span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggle}
          disabled={toggling}
          title={rule.is_active ? 'Deactivate' : 'Activate'}
          className="p-1.5 text-gray-300 hover:text-blue-600 transition-colors disabled:opacity-50"
        >
          {rule.is_active
            ? <ToggleRight size={18} className="text-blue-600" />
            : <ToggleLeft size={18} />
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

function EmptyState({ hasFilters, onNew }: { hasFilters: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <ShieldAlert size={24} className="text-gray-300" />
      </div>
      <p className="text-sm font-semibold text-gray-700 mb-1">
        {hasFilters ? 'No rules match your filters' : 'No duplicate detection rules'}
      </p>
      <p className="text-xs text-gray-400 mb-5 max-w-xs">
        {hasFilters
          ? 'Try adjusting your filters or search term'
          : 'Create rules to detect and prevent duplicate records across your CRM entities'
        }
      </p>
      {!hasFilters && (
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={13} />New Rule
        </button>
      )}
    </div>
  );
}

// ─── New Rule Modal ───────────────────────────────────────────────────────────

interface NewRuleModalProps {
  onClose: () => void;
  onCreated: (rule: DuplicateDetectionRule) => void;
}

function NewRuleModal({ onClose, onCreated }: NewRuleModalProps) {
  const [entity, setEntity] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!entity || !name.trim()) { setError('Entity and name are required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const rule = await createDuplicateRule({
        entity_logical_name: entity,
        name: name.trim(),
        description: '',
        is_active: true,
        behavior: 'warn',
        exact_match_fields: [],
        fuzzy_match_fields: [],
        run_on_create: true,
        run_on_update: true,
        run_on_import: true,
        run_on_lead_qualify: false,
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
          <h2 className="text-sm font-bold text-gray-900">New Duplicate Detection Rule</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />{error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Target Entity <span className="text-red-500">*</span></label>
            <FilterSelect
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              <option value="">Select an entity...</option>
              {KNOWN_ENTITIES.map((e) => <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>)}
            </FilterSelect>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Rule Name <span className="text-red-500">*</span></label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Contact — Email exact match"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={saving || !entity || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating...' : 'Create & Configure'}
          </button>
        </div>
      </div>
    </div>
  );
}
