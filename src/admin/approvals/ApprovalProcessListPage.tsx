import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState, useCallback } from 'react';
import {
  Search, RefreshCw, Plus, X, Copy, Trash2,
  ToggleLeft, ToggleRight, ChevronRight,
  AlertTriangle, CheckSquare, Layers, ArrowRight,
  GitMerge,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { ApprovalProcess } from '../../types/approvalProcess';
import { STEP_EXECUTION_MODE_META, KNOWN_ENTITIES } from '../../types/approvalProcess';
import {
  fetchApprovalProcesses,
  updateApprovalProcess,
  softDeleteApprovalProcess,
  cloneApprovalProcess,
  createApprovalProcess,
} from '../../services/approvalProcessService';
import ConfirmDialog from '../components/ConfirmDialog';

interface ApprovalProcessListPageProps {
  onOpen: (proc: ApprovalProcess) => void;
}

export default function ApprovalProcessListPage({ onOpen }: ApprovalProcessListPageProps) {
  const { showError } = useToast();
  const [processes, setProcesses] = useState<ApprovalProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApprovalProcess | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProcesses(await fetchApprovalProcesses());
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (proc: ApprovalProcess) => {
    setToggling(proc.approval_process_id);
    try {
      await updateApprovalProcess(proc.approval_process_id, { is_active: !proc.is_active });
      setProcesses((prev) => prev.map((p) =>
        p.approval_process_id === proc.approval_process_id ? { ...p, is_active: !p.is_active } : p
      ));
    } finally { setToggling(null); }
  };

  const handleClone = async (proc: ApprovalProcess) => {
    setCloning(proc.approval_process_id);
    try {
      const cloned = await cloneApprovalProcess(proc);
      setProcesses((prev) => [...prev, cloned]);
    } finally { setCloning(null); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteApprovalProcess(deleteTarget.approval_process_id);
      setProcesses((prev) => prev.filter((p) => p.approval_process_id !== deleteTarget.approval_process_id));
      setDeleteTarget(null);
    } finally { setDeleting(false); }
  };

  const handleCreated = (proc: ApprovalProcess) => {
    setProcesses((prev) => [...prev, proc]);
    setShowNewModal(false);
    onOpen(proc);
  };

  const entityCounts = KNOWN_ENTITIES.map((e) => ({
    ...e,
    count: processes.filter((p) => p.entity_logical_name === e.logical_name).length,
  })).filter((e) => e.count > 0);

  const filtered = processes.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    const matchEntity = !entityFilter || p.entity_logical_name === entityFilter;
    return matchSearch && matchEntity;
  });

  const activeCount = processes.filter((p) => p.is_active).length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search processes..."
              className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <FilterSelect
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="">All entities</option>
            {entityCounts.map((e) => (
              <option key={e.logical_name} value={e.logical_name}>{e.display_name} ({e.count})</option>
            ))}
          </FilterSelect>
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw size={14} />
          </button>
          <span className="text-xs text-gray-400">{filtered.length} process{filtered.length !== 1 ? 'es' : ''}</span>
          <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">{activeCount} active</span>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
        >
          <Plus size={13} />New Process
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-gray-400">Loading approval processes...</div>
        ) : filtered.length === 0 ? (
          <EmptyState onNew={() => setShowNewModal(true)} />
        ) : (
          <div className="space-y-3">
            {filtered.map((proc) => (
              <ProcessCard
                key={proc.approval_process_id}
                proc={proc}
                toggling={toggling === proc.approval_process_id}
                cloning={cloning === proc.approval_process_id}
                onOpen={() => onOpen(proc)}
                onToggle={() => handleToggle(proc)}
                onClone={() => handleClone(proc)}
                onDelete={() => setDeleteTarget(proc)}
              />
            ))}
          </div>
        )}
      </div>

      {showNewModal && (
        <NewProcessModal onClose={() => setShowNewModal(false)} onCreated={handleCreated} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Approval Process"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete Process"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
          destructive
        />
      )}
    </div>
  );
}

// ─── Process Card ─────────────────────────────────────────────────────────────

function ProcessCard({ proc, toggling, cloning, onOpen, onToggle, onClone, onDelete }: {
  proc: ApprovalProcess;
  toggling: boolean;
  cloning: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  const modeMeta = STEP_EXECUTION_MODE_META[proc.step_execution_mode];
  const entityLabel = KNOWN_ENTITIES.find((e) => e.logical_name === proc.entity_logical_name)?.display_name ?? proc.entity_logical_name;

  return (
    <div
      onClick={onOpen}
      className={`group relative flex items-start gap-4 px-4 py-4 bg-white border rounded-xl cursor-pointer transition-all hover:shadow-sm ${
        proc.is_active ? 'border-gray-200 hover:border-blue-300' : 'border-gray-100 opacity-60'
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <CheckSquare size={18} className="text-blue-500" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 truncate">{proc.name}</span>
          {proc.is_system && (
            <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 rounded px-1.5">system</span>
          )}
          <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-1.5 font-medium">{entityLabel}</span>
        </div>

        {proc.description && (
          <p className="text-xs text-gray-500 mb-2.5 line-clamp-1">{proc.description}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {/* Execution mode badge */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-semibold ${
            proc.step_execution_mode === 'sequential'
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            {proc.step_execution_mode === 'sequential' ? <ArrowRight size={10} /> : <Layers size={10} />}
            {modeMeta.label}
          </div>

          {/* Placeholder step count (0 until details loaded) */}
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <GitMerge size={10} />
            <span>Configure steps in editor</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggle}
          disabled={toggling}
          title={proc.is_active ? 'Deactivate' : 'Activate'}
          className="p-1.5 transition-colors disabled:opacity-50"
        >
          {proc.is_active
            ? <ToggleRight size={18} className="text-blue-600" />
            : <ToggleLeft size={18} className="text-gray-300" />}
        </button>
        <button onClick={onClone} disabled={cloning} title="Clone" className="p-1.5 text-gray-300 hover:text-gray-600 transition-colors disabled:opacity-50">
          <Copy size={13} />
        </button>
        {!proc.is_system && (
          <button onClick={onDelete} title="Delete" className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
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
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
        <CheckSquare size={24} className="text-blue-300" />
      </div>
      <p className="text-sm font-semibold text-gray-700 mb-1">No approval processes</p>
      <p className="text-xs text-gray-400 mb-5 max-w-xs">
        Define approval workflows that trigger based on entity, product, amount, stage, or business unit.
      </p>
      <button onClick={onNew} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
        <Plus size={13} />New Process
      </button>
    </div>
  );
}

// ─── New Process Modal ────────────────────────────────────────────────────────

function NewProcessModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: ApprovalProcess) => void }) {
  const [name, setName] = useState('');
  const [entity, setEntity] = useState('opportunity');
  const [mode, setMode] = useState<'sequential' | 'parallel'>('sequential');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const proc = await createApprovalProcess({
        name: name.trim(),
        description: '',
        entity_logical_name: entity,
        step_execution_mode: mode,
        is_active: true,
      });
      onCreated(proc);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-gray-900">New Approval Process</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"><X size={16} /></button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />{error}
          </div>
        )}

        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Process Name <span className="text-red-500">*</span></label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="e.g. High-Value Deal Approval"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Entity</label>
            <FilterSelect
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              {KNOWN_ENTITIES.map((e) => <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>)}
            </FilterSelect>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Execution Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {(['sequential', 'parallel'] as const).map((m) => {
                const meta = STEP_EXECUTION_MODE_META[m];
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all ${
                      mode === m ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-xs font-semibold text-gray-800">{meta.label}</span>
                    <span className="text-[10px] text-gray-500 leading-tight">{meta.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
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
