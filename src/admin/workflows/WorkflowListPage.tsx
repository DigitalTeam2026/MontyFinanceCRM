import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState } from 'react';
import {
  Plus, RefreshCw, Zap, Pencil, Trash2, ToggleLeft, ToggleRight, AlertCircle, PlayCircle, CheckCircle2, PlusCircle, Clock, Play, GitBranch, Shield, Wrench, Copy, Lock, Search, LayoutGrid, User } from 'lucide-react';
import type { EntityDefinition } from '../../types/entity';
import type { WorkflowDefinition, WorkflowTriggerType } from '../../types/workflow';
import { TRIGGER_META } from '../../types/workflow';
import { fetchEntities } from '../../services/entityService';
import {
  fetchWorkflowsForEntity,
  createWorkflow,
  softDeleteWorkflow,
  toggleWorkflowActive,
  cloneWorkflow,
} from '../../services/workflowService';
import ConfirmDialog from '../components/ConfirmDialog';

const TRIGGER_ICONS: Record<WorkflowTriggerType, React.ReactNode> = {
  on_create:        <PlusCircle size={10} />,
  on_update:        <Pencil size={10} />,
  on_delete:        <Trash2 size={10} />,
  on_status_change: <GitBranch size={10} />,
  scheduled:        <Clock size={10} />,
  manual:           <Play size={10} />,
};

type CategoryTab = 'all' | 'system' | 'custom';

interface WorkflowListPageProps {
  onOpen: (wf: WorkflowDefinition) => void;
}

export default function WorkflowListPage({ onOpen }: WorkflowListPageProps) {
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [wfLoading, setWfLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newTrigger, setNewTrigger] = useState<WorkflowTriggerType>('on_create');
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('all');
  const [search, setSearch] = useState('');
  const [cloneTarget, setCloneTarget] = useState<WorkflowDefinition | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    fetchEntities()
      .then((ents) => {
        setEntities(ents);
        if (ents.length > 0) setSelectedEntityId(ents[0].entity_definition_id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedEntityId) return;
    setWfLoading(true);
    setError(null);
    fetchWorkflowsForEntity(selectedEntityId)
      .then(setWorkflows)
      .catch((e) => setError(e.message))
      .finally(() => setWfLoading(false));
  }, [selectedEntityId]);

  const systemCount = workflows.filter((w) => w.is_system).length;
  const customCount = workflows.filter((w) => !w.is_system).length;

  const filtered = workflows.filter((w) => {
    const matchSearch =
      !search ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      (w.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCat =
      categoryTab === 'all' ||
      (categoryTab === 'system' && w.is_system) ||
      (categoryTab === 'custom' && !w.is_system);
    return matchSearch && matchCat;
  });

  const activeFiltered = filtered.filter((w) => w.is_active);
  const draftFiltered = filtered.filter((w) => !w.is_active);

  const handleCreate = async () => {
    if (!newName.trim() || !selectedEntityId) return;
    try {
      const wf = await createWorkflow({
        entity_definition_id: selectedEntityId,
        name: newName.trim(),
        trigger_type: newTrigger,
      });
      setWorkflows((prev) => [...prev, wf]);
      setCreating(false);
      setNewName('');
      onOpen(wf);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteWorkflow(deleteTarget.workflow_id);
      setWorkflows((prev) => prev.filter((w) => w.workflow_id !== deleteTarget.workflow_id));
      setDeleteTarget(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async (wf: WorkflowDefinition) => {
    if (wf.is_system) return;
    try {
      await toggleWorkflowActive(wf.workflow_id, !wf.is_active);
      setWorkflows((prev) => prev.map((w) =>
        w.workflow_id === wf.workflow_id ? { ...w, is_active: !wf.is_active } : w
      ));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  const openCloneModal = (wf: WorkflowDefinition) => {
    setCloneTarget(wf);
    setCloneName(`${wf.name} (Copy)`);
  };

  const handleClone = async () => {
    if (!cloneTarget || !cloneName.trim()) return;
    setCloning(true);
    try {
      const cloned = await cloneWorkflow(cloneTarget.workflow_id, cloneName.trim());
      setWorkflows((prev) => [...prev, cloned]);
      setCloneTarget(null);
      setCloneName('');
      onOpen(cloned);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Clone failed');
    } finally {
      setCloning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={16} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const selectedEntity = entities.find((e) => e.entity_definition_id === selectedEntityId);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f3f4f6]">
      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 shrink-0">
        <div className="relative">
          <FilterSelect
            value={selectedEntityId}
            onChange={(e) => { setSelectedEntityId(e.target.value); setCategoryTab('all'); setSearch(''); }}
            className="appearance-none pl-2.5 pr-7 py-1.5 text-[12px] font-medium border border-slate-300 rounded bg-white focus:outline-none focus:border-blue-400 text-slate-700"
          >
            {entities.map((e) => (
              <option key={e.entity_definition_id} value={e.entity_definition_id}>{e.display_name}</option>
            ))}
          </FilterSelect>
          </div>

        <div className="w-px h-5 bg-slate-200" />

        <button
          onClick={() => setCreating(true)}
          disabled={!selectedEntityId}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium rounded transition-colors disabled:opacity-40"
        >
          <Plus size={13} /> New Custom Workflow
        </button>

        <div className="flex-1" />

        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search workflows..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 pr-3 py-1.5 text-[12px] border border-slate-300 rounded bg-white focus:outline-none focus:border-blue-400 w-52 placeholder:text-slate-400"
          />
        </div>
        <span className="text-[11px] text-slate-400 whitespace-nowrap">{filtered.length} workflow{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Category Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex items-center shrink-0">
        <TabBtn active={categoryTab === 'all'} onClick={() => setCategoryTab('all')} count={workflows.length}>
          All Workflows
        </TabBtn>
        <TabBtn active={categoryTab === 'system'} onClick={() => setCategoryTab('system')} count={systemCount} icon={<Shield size={11} />} color="slate">
          System
        </TabBtn>
        <TabBtn active={categoryTab === 'custom'} onClick={() => setCategoryTab('custom')} count={customCount} icon={<Wrench size={11} />} color="amber">
          Custom
        </TabBtn>
        {categoryTab === 'system' && (
          <span className="ml-auto text-[11px] text-slate-400 py-2">
            System workflows can be opened and cloned but not deleted.
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {error && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-300 text-red-700 text-[12px] rounded">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        {wfLoading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw size={16} className="animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <LayoutGrid size={24} className="text-slate-300 mb-2" />
            <p className="text-[12px] text-slate-500">
              {search
                ? 'No workflows match your search'
                : categoryTab === 'custom'
                  ? selectedEntity ? `No custom workflows for ${selectedEntity.display_name} yet` : 'Select an entity'
                  : 'No workflows found'}
            </p>
            {!search && selectedEntityId && categoryTab !== 'system' && (
              <button onClick={() => setCreating(true)} className="mt-3 text-[12px] text-blue-600 hover:underline">
                Create a custom workflow
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {activeFiltered.length > 0 && (
              <WfSection
                title="Active"
                workflows={activeFiltered}
                onOpen={onOpen}
                onDelete={setDeleteTarget}
                onToggle={handleToggle}
                onClone={openCloneModal}
              />
            )}
            {draftFiltered.length > 0 && (
              <WfSection
                title="Draft / Inactive"
                workflows={draftFiltered}
                onOpen={onOpen}
                onDelete={setDeleteTarget}
                onToggle={handleToggle}
                onClone={openCloneModal}
                muted
              />
            )}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setCreating(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="text-[13px] font-semibold text-slate-800 mb-4">Create Custom Workflow</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Workflow Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`e.g. High Value ${selectedEntity?.display_name ?? 'Record'} Alert`}
                  className="w-full px-3 py-2 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Trigger</label>
                <div className="space-y-1.5">
                  {(Object.entries(TRIGGER_META) as [WorkflowTriggerType, typeof TRIGGER_META[WorkflowTriggerType]][]).map(([type, meta]) => (
                    <button
                      key={type}
                      onClick={() => setNewTrigger(type)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] text-left transition-all border-2 ${
                        newTrigger === type ? meta.color : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
                      }`}
                    >
                      <span>{TRIGGER_ICONS[type]}</span>
                      <div className="flex-1">
                        <span className="font-semibold">{meta.label}</span>
                        <span className="text-[10px] text-slate-400 ml-2">{meta.desc}</span>
                      </div>
                      {newTrigger === type && <div className="w-2 h-2 rounded-full bg-current shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setCreating(false); setNewName(''); }} className="flex-1 py-2 text-[12px] border border-slate-300 rounded text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={!newName.trim()} className="flex-1 py-2 text-[12px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded transition-colors">Create & Design</button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Modal */}
      {cloneTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { setCloneTarget(null); setCloneName(''); }} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-[13px] font-semibold text-slate-800 mb-1">Clone Workflow</h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Creates an editable copy of <strong className="text-slate-600">{cloneTarget.name}</strong> including all steps.
            </p>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">New Workflow Name</label>
            <input
              type="text"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              className="w-full px-3 py-2 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleClone()}
            />
            <div className="flex gap-2">
              <button onClick={() => { setCloneTarget(null); setCloneName(''); }} className="flex-1 py-2 text-[12px] border border-slate-300 rounded text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleClone} disabled={!cloneName.trim() || cloning} className="flex-1 py-2 text-[12px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded transition-colors">
                {cloning ? 'Cloning...' : 'Clone & Open'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Custom Workflow"
          message={`Delete "${deleteTarget.name}"? All steps will be permanently removed.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete Workflow'}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}
    </div>
  );
}

function WfSection({
  title,
  workflows,
  onOpen,
  onDelete,
  onToggle,
  onClone,
  muted,
}: {
  title: string;
  workflows: WorkflowDefinition[];
  onOpen: (w: WorkflowDefinition) => void;
  onDelete: (w: WorkflowDefinition) => void;
  onToggle: (w: WorkflowDefinition) => void;
  onClone: (w: WorkflowDefinition) => void;
  muted?: boolean;
}) {
  return (
    <div>
      <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${muted ? 'text-slate-400' : 'text-slate-500'}`}>
        {title}
      </p>
      <div className="space-y-2">
        {workflows.map((wf) => (
          <WfCard
            key={wf.workflow_id}
            wf={wf}
            onOpen={() => onOpen(wf)}
            onDelete={() => onDelete(wf)}
            onToggle={() => onToggle(wf)}
            onClone={() => onClone(wf)}
            muted={muted}
          />
        ))}
      </div>
    </div>
  );
}

function WfCard({
  wf,
  onOpen,
  onDelete,
  onToggle,
  onClone,
  muted,
}: {
  wf: WorkflowDefinition;
  onOpen: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onClone: () => void;
  muted?: boolean;
}) {
  const isSystem = wf.is_system;
  const canDelete = wf.is_deletable !== false && !isSystem;
  const triggerMeta = TRIGGER_META[wf.trigger_type];

  return (
    <div className={`bg-white border rounded-xl overflow-hidden hover:shadow-sm transition-all ${muted ? 'border-slate-200 opacity-60' : 'border-slate-200 hover:border-slate-300'}`}>
      {/* Card header */}
      <div className={`px-3 py-2 flex items-center gap-2 border-b border-slate-100 ${isSystem ? 'bg-slate-50/80' : 'bg-white'}`}>
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${
          wf.is_active ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-100 border-slate-300 text-slate-400'
        }`}>
          <Zap size={9} />
          {wf.is_active ? 'Active' : 'Draft'}
        </span>

        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${triggerMeta.color}`}>
          {TRIGGER_ICONS[wf.trigger_type]}
          <span className="ml-0.5">{triggerMeta.label}</span>
        </span>

        {isSystem ? (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-100 border-slate-300 text-slate-500">
            <Shield size={9} />
            System
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium bg-amber-50 border-amber-200 text-amber-600">
            <Wrench size={9} />
            Custom
          </span>
        )}
        <span className={`ml-auto inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${
          isSystem
            ? 'bg-slate-100 border-slate-300 text-slate-600'
            : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          {isSystem ? <Lock size={9} /> : <User size={9} />}
          {isSystem ? 'System' : 'User'}
        </span>
      </div>

      {/* Card body */}
      <div className="px-3 py-2.5">
        <p className="text-[13px] font-semibold text-slate-800 leading-tight truncate mb-0.5">{wf.name}</p>
        {wf.description && (
          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{wf.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {wf.is_active ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
              <CheckCircle2 size={9} /> Running
            </span>
          ) : (
            <span className="text-[10px] text-slate-400">Not running</span>
          )}
          {wf.run_count > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              <PlayCircle size={9} /> {wf.run_count.toLocaleString()} run{wf.run_count !== 1 ? 's' : ''}
            </span>
          )}
          {wf.last_triggered_at && (
            <span className="text-[10px] text-slate-400">
              Last: {new Date(wf.last_triggered_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Card actions */}
      <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-1.5">
        <button
          onClick={onOpen}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
        >
          <Pencil size={10} />
          {isSystem ? 'Open' : 'Design'}
        </button>
        {!isSystem && (
          <button
            onClick={onToggle}
            title={wf.is_active ? 'Deactivate' : 'Activate'}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
          >
            {wf.is_active
              ? <ToggleRight size={15} className="text-emerald-500" />
              : <ToggleLeft size={15} />}
          </button>
        )}
        <button
          onClick={onClone}
          title="Clone this workflow"
          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Copy size={12} />
        </button>
        {canDelete ? (
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          >
            <Trash2 size={12} />
          </button>
        ) : (
          <div
            className="p-1.5 text-slate-200 cursor-not-allowed"
            title={isSystem ? 'System workflows cannot be deleted' : 'This workflow cannot be deleted'}
          >
            <Lock size={12} />
          </div>
        )}
      </div>
    </div>
  );
}

interface TabBtnProps {
  active: boolean;
  onClick: () => void;
  count: number;
  icon?: React.ReactNode;
  color?: 'slate' | 'amber';
  children: React.ReactNode;
}

function TabBtn({ active, onClick, count, icon, color = 'slate', children }: TabBtnProps) {
  const countColors = {
    slate: active ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500',
    amber: active ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium border-b-2 transition-colors ${
        active ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      {icon}
      {children}
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${countColors[color]}`}>
        {count}
      </span>
    </button>
  );
}
