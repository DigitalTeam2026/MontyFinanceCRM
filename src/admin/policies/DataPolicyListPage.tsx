import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState, useCallback } from 'react';
import {
  Search, RefreshCw, Plus, X, Copy, Trash2,
  ToggleLeft, ToggleRight, ChevronRight,
  ShieldAlert, AlertCircle, Info,
  MonitorSmartphone, DatabaseZap,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { DataPolicy, PolicyCategory } from '../../types/dataPolicy';
import {
  POLICY_CATEGORY_META, ENFORCEMENT_LEVEL_META, KNOWN_ENTITIES,
  TRIGGER_EVENT_META,
} from '../../types/dataPolicy';
import {
  fetchDataPolicies,
  updateDataPolicy,
  softDeleteDataPolicy,
  cloneDataPolicy,
  createDataPolicy,
} from '../../services/dataPolicyService';
import ConfirmDialog from '../components/ConfirmDialog';

interface DataPolicyListPageProps {
  onOpen: (policy: DataPolicy) => void;
}

export default function DataPolicyListPage({ onOpen }: DataPolicyListPageProps) {
  const { showError } = useToast();
  const [policies, setPolicies] = useState<DataPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PolicyCategory | ''>('');
  const [entityFilter, setEntityFilter] = useState('');

  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DataPolicy | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPolicies(await fetchDataPolicies()); }
    catch (e: unknown) { showError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (policy: DataPolicy) => {
    setToggling(policy.data_policy_id);
    try {
      await updateDataPolicy(policy.data_policy_id, { is_active: !policy.is_active });
      setPolicies((prev) => prev.map((p) =>
        p.data_policy_id === policy.data_policy_id ? { ...p, is_active: !p.is_active } : p
      ));
    } finally { setToggling(null); }
  };

  const handleClone = async (policy: DataPolicy) => {
    setCloning(policy.data_policy_id);
    try {
      const cloned = await cloneDataPolicy(policy);
      setPolicies((prev) => [...prev, cloned]);
    } finally { setCloning(null); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteDataPolicy(deleteTarget.data_policy_id);
      setPolicies((prev) => prev.filter((p) => p.data_policy_id !== deleteTarget.data_policy_id));
      setDeleteTarget(null);
    } finally { setDeleting(false); }
  };

  const handleCreated = (p: DataPolicy) => {
    setPolicies((prev) => [...prev, p]);
    setShowNewModal(false);
    onOpen(p);
  };

  const categories = (Object.keys(POLICY_CATEGORY_META) as PolicyCategory[]).filter(
    (c) => policies.some((p) => p.policy_category === c)
  );

  const filtered = policies.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    const matchCat = !categoryFilter || p.policy_category === categoryFilter;
    const matchEntity = !entityFilter || p.entity_logical_name === entityFilter;
    return matchSearch && matchCat && matchEntity;
  });

  const grouped = (Object.keys(POLICY_CATEGORY_META) as PolicyCategory[]).reduce<Record<PolicyCategory, DataPolicy[]>>(
    (acc, cat) => {
      acc[cat] = filtered.filter((p) => p.policy_category === cat);
      return acc;
    },
    {} as Record<PolicyCategory, DataPolicy[]>
  );

  const activeCount = policies.filter((p) => p.is_active).length;

  const backendEnforcedCount = policies.filter(
    (p) => p.is_active && p.enforcement_level === 'error'
  ).length;

  return (
    <div className="flex flex-col h-full">
      {/* Architecture Banner */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-start gap-6">
          <div className="flex items-start gap-2.5 flex-1">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <DatabaseZap size={14} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-0.5">
                Backend Enforcement Active
                {backendEnforcedCount > 0 && (
                  <span className="ml-2 normal-case font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    {backendEnforcedCount} polic{backendEnforcedCount !== 1 ? 'ies' : 'y'} enforced at DB level
                  </span>
                )}
              </p>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Policies with <span className="font-semibold text-red-600">Error</span> level and a <span className="font-semibold text-gray-700">Block Save</span> enforcement action are enforced by database triggers.
                They block saves on INSERT and UPDATE — including API calls, bulk imports, and direct database writes. They cannot be bypassed.
              </p>
            </div>
          </div>
          <div className="w-px self-stretch bg-gray-100 flex-shrink-0" />
          <div className="flex items-start gap-2.5 flex-1">
            <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <MonitorSmartphone size={14} className="text-blue-500" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-0.5">UX-Only Enforcement</p>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                <span className="font-semibold text-amber-600">Warning</span> and <span className="font-semibold text-blue-600">Info</span> level policies, plus non-blocking enforcement types
                (show message, require field, lock field), are handled client-side only — they guide users but do not block API or import paths.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search policies..."
              className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <FilterSelect
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as PolicyCategory | '')}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{POLICY_CATEGORY_META[c].label}</option>
            ))}
          </FilterSelect>
          <FilterSelect
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="">All entities</option>
            {KNOWN_ENTITIES.map((e) => (
              <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>
            ))}
          </FilterSelect>
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw size={14} />
          </button>
          <span className="text-xs text-gray-400">{filtered.length} polic{filtered.length !== 1 ? 'ies' : 'y'}</span>
          <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">{activeCount} active</span>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
        >
          <Plus size={13} />New Policy
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-gray-400">Loading policies...</div>
        ) : filtered.length === 0 ? (
          <EmptyState onNew={() => setShowNewModal(true)} />
        ) : (
          <div className="space-y-6">
            {(Object.keys(POLICY_CATEGORY_META) as PolicyCategory[]).map((cat) => {
              const items = grouped[cat];
              if (items.length === 0) return null;
              const meta = POLICY_CATEGORY_META[cat];
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: meta.color }}
                    />
                    <span className="text-xs font-bold text-gray-700">{meta.label}</span>
                    <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5">{items.length}</span>
                    <span className="text-[10px] text-gray-400">{meta.description}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((policy) => (
                      <PolicyCard
                        key={policy.data_policy_id}
                        policy={policy}
                        toggling={toggling === policy.data_policy_id}
                        cloning={cloning === policy.data_policy_id}
                        onOpen={() => onOpen(policy)}
                        onToggle={() => handleToggle(policy)}
                        onClone={() => handleClone(policy)}
                        onDelete={() => setDeleteTarget(policy)}
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
        <NewPolicyModal onClose={() => setShowNewModal(false)} onCreated={handleCreated} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Data Policy"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete Policy"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
          destructive
        />
      )}
    </div>
  );
}

// ─── Policy Card ──────────────────────────────────────────────────────────────

function PolicyCard({ policy, toggling, cloning, onOpen, onToggle, onClone, onDelete }: {
  policy: DataPolicy;
  toggling: boolean;
  cloning: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  const catMeta = POLICY_CATEGORY_META[policy.policy_category];
  const levelMeta = ENFORCEMENT_LEVEL_META[policy.enforcement_level];
  const entityLabel = KNOWN_ENTITIES.find((e) => e.logical_name === policy.entity_logical_name)?.display_name ?? policy.entity_logical_name;
  const isDbEnforced = policy.enforcement_level === 'error';

  const LevelIcon = policy.enforcement_level === 'error' ? ShieldAlert : policy.enforcement_level === 'warning' ? AlertCircle : Info;

  return (
    <div
      onClick={onOpen}
      className={`group flex items-start gap-3.5 px-4 py-3.5 bg-white border rounded-xl cursor-pointer transition-all hover:shadow-sm ${
        policy.is_active ? 'border-gray-200 hover:border-blue-300' : 'border-gray-100 opacity-60'
      }`}
    >
      <div
        className="w-2 self-stretch rounded-full flex-shrink-0 mt-0.5"
        style={{ backgroundColor: catMeta.color + '30', border: `1.5px solid ${catMeta.color}40` }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 truncate">{policy.name}</span>
          {policy.is_system && (
            <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 rounded px-1.5">system</span>
          )}
        </div>
        {policy.description && (
          <p className="text-xs text-gray-500 mb-2 line-clamp-1">{policy.description}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] bg-gray-50 border border-gray-200 text-gray-600 rounded-full px-2 py-0.5">{entityLabel}</span>
          <span
            className="text-[10px] font-semibold rounded-full px-2 py-0.5 flex items-center gap-1"
            style={{ backgroundColor: levelMeta.bg.replace('bg-', ''), color: levelMeta.color }}
          >
            <span className={`inline-flex ${levelMeta.bg} ${levelMeta.border} border rounded-full px-1.5 py-0.5 text-[10px] font-semibold items-center gap-0.5`}
              style={{ color: levelMeta.color }}>
              <LevelIcon size={9} />{levelMeta.label}
            </span>
          </span>
          {isDbEnforced && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 rounded px-1.5 py-0.5">
              <DatabaseZap size={9} /> DB Enforced
            </span>
          )}
          {policy.trigger_on.map((t) => (
            <span key={t} className="text-[10px] bg-gray-50 border border-gray-200 text-gray-500 rounded px-1.5 py-0.5">
              {TRIGGER_EVENT_META[t]?.label ?? t}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={onToggle} disabled={toggling} className="p-1.5 transition-colors disabled:opacity-50">
          {policy.is_active
            ? <ToggleRight size={18} className="text-blue-600" />
            : <ToggleLeft size={18} className="text-gray-300" />}
        </button>
        <button onClick={onClone} disabled={cloning} className="p-1.5 text-gray-300 hover:text-gray-600 transition-colors disabled:opacity-50">
          <Copy size={13} />
        </button>
        {!policy.is_system && (
          <button onClick={onDelete} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
            <Trash2 size={13} />
          </button>
        )}
        <ChevronRight size={13} className="text-gray-200 group-hover:text-gray-400 ml-1 transition-colors" />
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
        <ShieldAlert size={24} className="text-blue-300" />
      </div>
      <p className="text-sm font-semibold text-gray-700 mb-1">No data policies</p>
      <p className="text-xs text-gray-400 mb-5 max-w-xs">
        Define reusable governance rules — uniqueness, format, mandatory, relational, and lock policies — independent of any form.
      </p>
      <button onClick={onNew} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
        <Plus size={13} />New Policy
      </button>
    </div>
  );
}

// ─── New Policy Modal ─────────────────────────────────────────────────────────

function NewPolicyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: DataPolicy) => void }) {
  const { showError } = useToast();
  const [name, setName] = useState('');
  const [entity, setEntity] = useState('opportunity');
  const [category, setCategory] = useState<PolicyCategory>('custom');
  const [level, setLevel] = useState<'error' | 'warning' | 'info'>('error');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { showError('Name is required.'); return; }
    setSaving(true);
    try {
      const p = await createDataPolicy({
        name: name.trim(),
        description: '',
        entity_logical_name: entity,
        policy_category: category,
        enforcement_level: level,
        trigger_on: ['create', 'update'],
        is_active: true,
      });
      onCreated(p);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to create');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-gray-900">New Data Policy</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"><X size={16} /></button>
        </div>

        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Policy Name <span className="text-red-500">*</span></label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="e.g. Email Uniqueness"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Entity</label>
              <FilterSelect value={entity} onChange={(e) => setEntity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                {KNOWN_ENTITIES.map((e) => <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>)}
              </FilterSelect>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Category</label>
              <FilterSelect value={category} onChange={(e) => setCategory(e.target.value as PolicyCategory)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                {(Object.entries(POLICY_CATEGORY_META) as [PolicyCategory, typeof POLICY_CATEGORY_META[PolicyCategory]][]).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </FilterSelect>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Enforcement Level</label>
            <div className="grid grid-cols-3 gap-2">
              {(['error', 'warning', 'info'] as const).map((lvl) => {
                const meta = ENFORCEMENT_LEVEL_META[lvl];
                return (
                  <button key={lvl} onClick={() => setLevel(lvl)}
                    className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all ${
                      level === lvl ? 'border-current' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={level === lvl ? { borderColor: meta.color } : {}}
                  >
                    <span className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-[10px] text-gray-500 leading-tight">{meta.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors">Cancel</button>
          <button onClick={handleCreate} disabled={saving || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Creating...' : 'Create & Configure'}
          </button>
        </div>
      </div>
    </div>
  );
}
