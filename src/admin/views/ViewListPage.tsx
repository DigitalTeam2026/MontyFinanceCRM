import { useEffect, useState } from 'react';
import {
  Plus, RefreshCw, List, Pencil, Trash2, ChevronDown,
  Star, StarOff, Shield, Wrench, Copy, Lock, Search,
  Filter, ArrowUpDown, Columns3, LayoutGrid, User, X, Download,
} from 'lucide-react';
import type { EntityDefinition } from '../../types/entity';
import type { ViewDefinition, ViewType } from '../../types/view';
import { fetchEntities } from '../../services/entityService';
import {
  fetchViewsForEntity,
  createView,
  softDeleteView,
  setDefaultView,
  cloneView,
} from '../../services/viewService';
import ConfirmDialog from '../components/ConfirmDialog';

const VIEW_TYPE_META: Record<ViewType, { label: string; color: string; desc: string }> = {
  public: {
    label: 'Public',
    color: 'bg-blue-50 text-blue-600 border-blue-200',
    desc: 'Visible to all users',
  },
  personal: {
    label: 'Personal',
    color: 'bg-amber-50 text-amber-600 border-amber-200',
    desc: 'Visible only to the creator',
  },
  system: {
    label: 'System',
    color: 'bg-slate-100 text-slate-500 border-slate-300',
    desc: 'Built-in platform view',
  },
};

type CategoryTab = 'all' | 'system' | 'custom';

interface ViewListPageProps {
  onOpen: (view: ViewDefinition, entityId: string) => void;
  preselectedEntityId?: string;
}

export default function ViewListPage({ onOpen, preselectedEntityId }: ViewListPageProps) {
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState(preselectedEntityId ?? '');
  const [views, setViews] = useState<ViewDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ViewDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'public' | 'personal'>('public');
  const [cloneTarget, setCloneTarget] = useState<ViewDefinition | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    fetchEntities()
      .then((ents) => {
        setEntities(ents);
        if (!preselectedEntityId && ents.length > 0) setSelectedEntityId(ents[0].entity_definition_id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedEntityId) return;
    setViewsLoading(true);
    setError(null);
    fetchViewsForEntity(selectedEntityId)
      .then(setViews)
      .catch((e) => setError(e.message))
      .finally(() => setViewsLoading(false));
  }, [selectedEntityId]);

  const systemCount = views.filter((v) => v.is_system).length;
  const customCount = views.filter((v) => !v.is_system).length;

  const filtered = views.filter((v) => {
    const matchSearch =
      !search ||
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCat =
      categoryTab === 'all' ||
      (categoryTab === 'system' && v.is_system) ||
      (categoryTab === 'custom' && !v.is_system);
    return matchSearch && matchCat;
  });

  const handleCreate = async () => {
    if (!newName.trim() || !selectedEntityId) return;
    try {
      const v = await createView({
        entity_definition_id: selectedEntityId,
        name: newName.trim(),
        view_type: newType,
      });
      setViews((prev) => [...prev, v]);
      setCreating(false);
      setNewName('');
      onOpen(v, selectedEntityId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteView(deleteTarget.view_id);
      setViews((prev) => prev.filter((v) => v.view_id !== deleteTarget.view_id));
      setDeleteTarget(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (view: ViewDefinition) => {
    try {
      await setDefaultView(view.view_id, selectedEntityId);
      setViews((prev) => prev.map((v) => ({ ...v, is_default: v.view_id === view.view_id })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleClone = async () => {
    if (!cloneTarget || !cloneName.trim()) return;
    setCloning(true);
    try {
      const cloned = await cloneView(cloneTarget.view_id, cloneName.trim());
      setViews((prev) => [...prev, cloned]);
      setCloneTarget(null);
      setCloneName('');
      onOpen(cloned, selectedEntityId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Clone failed');
    } finally {
      setCloning(false);
    }
  };

  const openCloneModal = (v: ViewDefinition) => {
    setCloneTarget(v);
    setCloneName(`${v.name} (Copy)`);
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
    <div className="flex-1 flex flex-col min-h-0 bg-[#fafbfc]">
      {/* Command Bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-2 flex items-center gap-1.5 shrink-0">
        <CmdBtn primary onClick={() => setCreating(true)} icon={<Plus size={13} />} disabled={!selectedEntityId}>
          New view
        </CmdBtn>
        <CmdSep />
        <CmdBtn icon={<RefreshCw size={12} className={viewsLoading ? 'animate-spin' : ''} />} onClick={() => setSelectedEntityId(selectedEntityId)}>
          Refresh
        </CmdBtn>
        <CmdBtn icon={<Download size={12} />}>Export</CmdBtn>
        <div className="flex-1" />
        <span className="text-[11px] text-slate-400 mr-2">{filtered.length} view{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filter Chips + Entity Selector + Search */}
      <div className="bg-white border-b border-slate-100 px-5 py-2 flex items-center gap-3 shrink-0">
        <div className="relative">
          <select
            value={selectedEntityId}
            onChange={(e) => { setSelectedEntityId(e.target.value); setCategoryTab('all'); setSearch(''); }}
            className="appearance-none pl-2.5 pr-7 py-1.5 text-[12px] font-medium border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700"
          >
            {entities.map((e) => (
              <option key={e.entity_definition_id} value={e.entity_definition_id}>{e.display_name}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        <div className="w-px h-5 bg-slate-200" />

        <div className="flex items-center gap-1">
          <Filter size={12} className="text-slate-400 mr-1" />
          {([
            { id: 'all' as const, label: 'All', count: views.length },
            { id: 'system' as const, label: 'System', count: systemCount, icon: <Shield size={10} /> },
            { id: 'custom' as const, label: 'Custom', count: customCount, icon: <Wrench size={10} /> },
          ]).map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryTab(c.id)}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                categoryTab === c.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.icon}
              {c.label}
              <span className={`text-[10px] ${categoryTab === c.id ? 'text-blue-200' : 'text-slate-400'}`}>
                {c.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search views..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 py-1.5 text-[12px] border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 w-52 placeholder:text-slate-400 transition"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {error && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-300 text-red-700 text-[12px] rounded">{error}</div>
        )}

        {viewsLoading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw size={16} className="animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <LayoutGrid size={24} className="text-slate-300 mb-2" />
            <p className="text-[12px] text-slate-500">
              {search
                ? 'No views match your search'
                : categoryTab === 'custom'
                  ? selectedEntity ? `No custom views for ${selectedEntity.display_name} yet` : 'Select an entity'
                  : 'No views found'}
            </p>
            {!search && selectedEntityId && categoryTab !== 'system' && (
              <button onClick={() => setCreating(true)} className="mt-3 text-[12px] text-blue-600 hover:underline">
                Create a custom view
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((view) => {
              const typeMeta = VIEW_TYPE_META[view.view_type] ?? VIEW_TYPE_META.public;
              const isSystem = view.is_system;
              const canDelete = view.is_deletable !== false && !isSystem;
              const colCount = view.column_config?.length ?? 0;
              const hasFilter = !!view.filter_json;
              const sortCount = view.sort_json?.length ?? 0;

              return (
                <div
                  key={view.view_id}
                  className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-all flex flex-col"
                >
                  {/* Card header */}
                  <div className={`px-3 py-2 flex items-center gap-2 border-b border-slate-100 ${isSystem ? 'bg-slate-50/80' : 'bg-white'}`}>
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${typeMeta.color}`}>
                      <List size={9} />
                      {typeMeta.label}
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
                  <div className="px-3 py-2.5 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-[13px] font-semibold text-slate-800 leading-tight truncate flex-1">{view.name}</p>
                      {view.is_default && (
                        <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />
                      )}
                    </div>
                    {view.description && (
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{view.description}</p>
                    )}

                    {/* Metadata chips */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {colCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          <Columns3 size={9} />
                          {colCount} col{colCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {hasFilter && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          <Filter size={9} />
                          Filtered
                        </span>
                      )}
                      {sortCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          <ArrowUpDown size={9} />
                          {sortCount} sort
                        </span>
                      )}
                      {view.is_default && (
                        <span className="text-[10px] text-amber-600 font-medium">Default</span>
                      )}
                    </div>
                  </div>

                  {/* Card actions */}
                  <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-1.5">
                    <button
                      onClick={() => onOpen(view, selectedEntityId)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                    >
                      <Pencil size={10} />
                      {isSystem ? 'Open' : 'Design'}
                    </button>
                    <button
                      onClick={() => handleSetDefault(view)}
                      title={view.is_default ? 'Default view' : 'Set as default'}
                      className={`p-1.5 rounded transition-colors ${
                        view.is_default
                          ? 'text-amber-400 bg-amber-50'
                          : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                      }`}
                    >
                      {view.is_default
                        ? <Star size={12} className="fill-amber-400" />
                        : <StarOff size={12} />}
                    </button>
                    <button
                      onClick={() => openCloneModal(view)}
                      title="Clone this view"
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Copy size={12} />
                    </button>
                    {canDelete ? (
                      <button
                        onClick={() => setDeleteTarget(view)}
                        title="Delete"
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : (
                      <div
                        className="p-1.5 text-slate-200 cursor-not-allowed"
                        title={isSystem ? 'System views cannot be deleted' : 'This view cannot be deleted'}
                      >
                        <Lock size={12} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New View Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setCreating(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-5">
            <h3 className="text-[13px] font-semibold text-slate-800 mb-4">Create Custom View</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">View Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`e.g. High Value ${selectedEntity?.display_name ?? 'Lead'}s`}
                  className="w-full px-3 py-2 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Visibility</label>
                <div className="space-y-1.5">
                  {(['public', 'personal'] as const).map((type) => {
                    const meta = VIEW_TYPE_META[type];
                    return (
                      <div
                        key={type}
                        onClick={() => setNewType(type)}
                        className={`flex items-center gap-3 p-2.5 rounded border cursor-pointer transition-all ${
                          newType === type ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={`p-1.5 rounded border text-[10px] font-medium ${meta.color}`}>
                          <List size={11} />
                        </span>
                        <div>
                          <p className="text-[12px] font-semibold text-slate-700">{meta.label}</p>
                          <p className="text-[10px] text-slate-400">{meta.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setCreating(false); setNewName(''); }}
                className="flex-1 py-2 text-[12px] border border-slate-300 rounded text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="flex-1 py-2 text-[12px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded transition-colors"
              >
                Create & Design
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Modal */}
      {cloneTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { setCloneTarget(null); setCloneName(''); }} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-[13px] font-semibold text-slate-800 mb-1">Clone View</h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Creates an editable copy of <strong className="text-slate-600">{cloneTarget.name}</strong>
            </p>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">New View Name</label>
            <input
              type="text"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              className="w-full px-3 py-2 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleClone()}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setCloneTarget(null); setCloneName(''); }}
                className="flex-1 py-2 text-[12px] border border-slate-300 rounded text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClone}
                disabled={!cloneName.trim() || cloning}
                className="flex-1 py-2 text-[12px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded transition-colors"
              >
                {cloning ? 'Cloning...' : 'Clone & Open'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Custom View"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete View'}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}
    </div>
  );
}

function CmdBtn({ children, onClick, icon, primary, disabled }: {
  children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; primary?: boolean; disabled?: boolean;
}) {
  const base = 'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded transition-all disabled:opacity-50';
  const style = primary
    ? `${base} bg-blue-600 hover:bg-blue-700 text-white shadow-sm`
    : `${base} text-slate-600 hover:bg-slate-100`;
  return <button className={style} onClick={onClick} disabled={disabled}>{icon}{children}</button>;
}

function CmdSep() {
  return <div className="w-px h-5 bg-slate-200 mx-1" />;
}
