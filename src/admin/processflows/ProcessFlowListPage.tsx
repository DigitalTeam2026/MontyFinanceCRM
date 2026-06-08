import { useEffect, useState } from 'react';
import {
  Plus, Search, GitMerge, Pencil, Trash2, RefreshCw,
  CheckCircle2, XCircle, Lock, ChevronRight, Circle,
  Flag, Layers, User,
} from 'lucide-react';
import type { ProcessFlow } from '../../types/processFlow';
import type { EntityDefinition } from '../../types/entity';
import { fetchProcessFlows, softDeleteProcessFlow } from '../../services/processFlowService';
import { fetchEntities } from '../../services/entityService';
import ConfirmDialog from '../components/ConfirmDialog';
import ProcessFlowFormModal from './ProcessFlowFormModal';

interface ProcessFlowListPageProps {
  onOpen: (flow: ProcessFlow) => void;
}

type FilterTab = 'all' | 'system' | 'custom';

export default function ProcessFlowListPage({ onOpen }: ProcessFlowListPageProps) {
  const [flows, setFlows] = useState<ProcessFlow[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [deleteTarget, setDeleteTarget] = useState<ProcessFlow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [flowData, entityData] = await Promise.all([fetchProcessFlows(), fetchEntities()]);
      setFlows(flowData);
      setEntities(entityData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const entityMap = Object.fromEntries(entities.map((e) => [e.entity_definition_id, e]));

  const systemCount = flows.filter((f) => f.is_system).length;
  const customCount = flows.filter((f) => !f.is_system).length;

  const filtered = flows.filter((f) => {
    const entity = entityMap[f.entity_definition_id];
    const matchesSearch =
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (entity?.display_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      f.line_of_business.toLowerCase().includes(search.toLowerCase());
    const matchesTab =
      filterTab === 'all' ||
      (filterTab === 'system' && f.is_system) ||
      (filterTab === 'custom' && !f.is_system);
    return matchesSearch && matchesTab;
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteProcessFlow(deleteTarget.process_flow_id);
      setFlows((prev) => prev.filter((f) => f.process_flow_id !== deleteTarget.process_flow_id));
      setDeleteTarget(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const TABS: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: flows.length },
    { id: 'system', label: 'System', count: systemCount },
    { id: 'custom', label: 'Custom', count: customCount },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-white">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Business Process Flows</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Define lifecycle pipelines and stage progressions for your entities
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          New Process Flow
        </button>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between px-6 pt-4 pb-0 bg-white border-b border-gray-200">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                filterTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                filterTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 pb-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search flows..."
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Loading process flows...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-48 text-red-500 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <GitMerge size={32} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">No process flows found</p>
            <p className="text-xs mt-1">Create a flow to define lifecycle stages for an entity</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((flow) => {
              const entity = entityMap[flow.entity_definition_id];
              return (
                <ProcessFlowCard
                  key={flow.process_flow_id}
                  flow={flow}
                  entityName={entity?.display_name}
                  onOpen={onOpen}
                  onDelete={() => setDeleteTarget(flow)}
                />
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <ProcessFlowFormModal
          entities={entities}
          onClose={() => setShowCreateModal(false)}
          onCreated={(newFlow) => {
            setShowCreateModal(false);
            onOpen(newFlow);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Process Flow"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This will also delete all associated stages and transitions.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
          destructive
        />
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

interface ProcessFlowCardProps {
  flow: ProcessFlow;
  entityName?: string;
  onOpen: (flow: ProcessFlow) => void;
  onDelete?: () => void;
}

function ProcessFlowCard({ flow, entityName, onOpen, onDelete }: ProcessFlowCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all group">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <GitMerge size={18} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-gray-900 text-sm">{flow.name}</span>
              {flow.is_system && (
                <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                  <Lock size={10} />
                  System
                </span>
              )}
              <span className={`flex items-center gap-1 text-xs rounded px-1.5 py-0.5 border font-medium ${
                flow.is_system
                  ? 'text-slate-600 bg-slate-100 border-slate-300'
                  : 'text-blue-700 bg-blue-50 border-blue-200'
              }`}>
                {flow.is_system ? <Lock size={10} /> : <User size={10} />}
                {flow.is_system ? 'System' : 'User'}
              </span>
              {flow.is_active ? (
                <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                  <CheckCircle2 size={10} />
                  Active
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                  <XCircle size={10} />
                  Inactive
                </span>
              )}
            </div>
            {flow.description && (
              <p className="text-xs text-gray-500 mb-2 line-clamp-1">{flow.description}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-gray-400">
              {entityName && (
                <span className="flex items-center gap-1">
                  <Layers size={11} />
                  {entityName}
                </span>
              )}
              {flow.line_of_business && (
                <span className="flex items-center gap-1">
                  <Flag size={11} />
                  {flow.line_of_business}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Circle size={9} />
                Stage field: <code className="font-mono text-gray-500">{flow.stage_field}</code>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={() => onOpen(flow)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Pencil size={12} />
            Configure
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
