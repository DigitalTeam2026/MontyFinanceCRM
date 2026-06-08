import { useEffect, useState } from 'react';
import {
  Plus, RefreshCw, FileText, Zap, Eye, Pencil, Trash2, ChevronDown,
  CheckCircle, Shield, Wrench, Copy, Lock, Search, LayoutGrid, User,
  Filter, X, Download,
} from 'lucide-react';
import type { EntityDefinition } from '../../types/entity';
import type { FormDefinition, FormType } from '../../types/form';
import { fetchEntities } from '../../services/entityService';
import { fetchFormsForEntity, createForm, softDeleteForm, cloneForm } from '../../services/formService';
import ConfirmDialog from '../components/ConfirmDialog';

const FORM_TYPE_META: Record<FormType, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  main: {
    label: 'Main Form',
    icon: <FileText size={12} />,
    color: 'bg-blue-50 text-blue-600 border-blue-200',
    desc: 'Primary data entry and viewing form',
  },
  quick_create: {
    label: 'Quick Create',
    icon: <Zap size={12} />,
    color: 'bg-amber-50 text-amber-600 border-amber-200',
    desc: 'Lightweight creation form with key fields',
  },
  quick_view: {
    label: 'Quick View',
    icon: <Eye size={12} />,
    color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    desc: 'Read-only summary in a flyout panel',
  },
};

type CategoryTab = 'all' | 'system' | 'custom';

interface FormListPageProps {
  onOpen: (form: FormDefinition, entityId: string) => void;
  preselectedEntityId?: string;
}

export default function FormListPage({ onOpen, preselectedEntityId }: FormListPageProps) {
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState(preselectedEntityId ?? '');
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [formsLoading, setFormsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<FormDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [newFormType, setNewFormType] = useState<FormType>('main');
  const [cloneTarget, setCloneTarget] = useState<FormDefinition | null>(null);
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
    setFormsLoading(true);
    setError(null);
    fetchFormsForEntity(selectedEntityId)
      .then(setForms)
      .catch((e) => setError(e.message))
      .finally(() => setFormsLoading(false));
  }, [selectedEntityId]);

  const systemCount = forms.filter((f) => f.is_system).length;
  const customCount = forms.filter((f) => !f.is_system).length;

  const filtered = forms.filter((f) => {
    const matchSearch =
      !search ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      FORM_TYPE_META[f.form_type]?.label.toLowerCase().includes(search.toLowerCase());
    const matchCat =
      categoryTab === 'all' ||
      (categoryTab === 'system' && f.is_system) ||
      (categoryTab === 'custom' && !f.is_system);
    return matchSearch && matchCat;
  });

  const handleCreate = async () => {
    if (!newFormName.trim() || !selectedEntityId) return;
    try {
      const form = await createForm({
        entity_definition_id: selectedEntityId,
        name: newFormName.trim(),
        form_type: newFormType,
      });
      setForms((prev) => [...prev, form]);
      setCreating(false);
      setNewFormName('');
      onOpen(form, selectedEntityId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteForm(deleteTarget.form_id);
      setForms((prev) => prev.filter((f) => f.form_id !== deleteTarget.form_id));
      setDeleteTarget(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleClone = async () => {
    if (!cloneTarget || !cloneName.trim()) return;
    setCloning(true);
    try {
      const cloned = await cloneForm(cloneTarget.form_id, cloneName.trim());
      setForms((prev) => [...prev, cloned]);
      setCloneTarget(null);
      setCloneName('');
      onOpen(cloned, selectedEntityId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Clone failed');
    } finally {
      setCloning(false);
    }
  };

  const openCloneModal = (form: FormDefinition) => {
    setCloneTarget(form);
    setCloneName(`${form.name} (Copy)`);
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
          New form
        </CmdBtn>
        <CmdSep />
        <CmdBtn icon={<RefreshCw size={12} className={formsLoading ? 'animate-spin' : ''} />} onClick={() => setSelectedEntityId(selectedEntityId)}>
          Refresh
        </CmdBtn>
        <CmdBtn icon={<Download size={12} />}>Export</CmdBtn>
        <div className="flex-1" />
        <span className="text-[11px] text-slate-400 mr-2">{filtered.length} form{filtered.length !== 1 ? 's' : ''}</span>
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
            { id: 'all' as const, label: 'All', count: forms.length },
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
            placeholder="Search forms..."
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

        {formsLoading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw size={16} className="animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <LayoutGrid size={24} className="text-slate-300 mb-2" />
            <p className="text-[12px] text-slate-500">
              {search
                ? 'No forms match your search'
                : categoryTab === 'custom'
                  ? selectedEntity ? `No custom forms for ${selectedEntity.display_name} yet` : 'Select an entity'
                  : 'No forms found'}
            </p>
            {!search && selectedEntityId && categoryTab !== 'system' && (
              <button onClick={() => setCreating(true)} className="mt-3 text-[12px] text-blue-600 hover:underline">
                Create a custom form
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((form) => {
              const meta = FORM_TYPE_META[form.form_type] ?? FORM_TYPE_META.main;
              const isSystem = form.is_system;
              const canDelete = form.is_deletable !== false && !isSystem;
              return (
                <div
                  key={form.form_id}
                  className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-all group flex flex-col"
                >
                  <div className={`px-3 py-2 flex items-center gap-2 border-b border-slate-100 ${isSystem ? 'bg-slate-50/80' : 'bg-white'}`}>
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${meta.color}`}>
                      {meta.icon}
                      {meta.label}
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

                  <div className="px-3 py-2.5 flex-1">
                    <p className="text-[13px] font-semibold text-slate-800 leading-tight">{form.name}</p>
                    {form.description && (
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">{form.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {form.is_published ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                          <CheckCircle size={9} /> Published
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-500">Draft</span>
                      )}
                      {form.is_default && (
                        <span className="text-[10px] text-blue-500 font-medium">Default</span>
                      )}
                    </div>
                  </div>

                  <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-1.5">
                    <button
                      onClick={() => onOpen(form, selectedEntityId)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                    >
                      <Pencil size={10} />
                      {isSystem ? 'Open' : 'Design'}
                    </button>
                    <button
                      onClick={() => openCloneModal(form)}
                      title="Clone this form"
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Copy size={12} />
                    </button>
                    {canDelete ? (
                      <button
                        onClick={() => setDeleteTarget(form)}
                        title="Delete"
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : (
                      <div
                        className="p-1.5 text-slate-200 cursor-not-allowed"
                        title={isSystem ? 'System forms cannot be deleted' : 'This form cannot be deleted'}
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

      {/* New Form Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setCreating(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-5">
            <h3 className="text-[13px] font-semibold text-slate-800 mb-4">Create Custom Form</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Form Name</label>
                <input
                  type="text"
                  value={newFormName}
                  onChange={(e) => setNewFormName(e.target.value)}
                  placeholder={`e.g. ${selectedEntity?.display_name ?? 'Lead'} Sales Form`}
                  className="w-full px-3 py-2 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Form Type</label>
                <div className="space-y-1.5">
                  {(Object.entries(FORM_TYPE_META) as [FormType, typeof FORM_TYPE_META[FormType]][]).map(([type, meta]) => (
                    <div
                      key={type}
                      onClick={() => setNewFormType(type)}
                      className={`flex items-center gap-3 p-2.5 rounded border cursor-pointer transition-all ${
                        newFormType === type ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className={`p-1.5 rounded border text-[10px] font-medium ${meta.color}`}>{meta.icon}</span>
                      <div>
                        <p className="text-[12px] font-semibold text-slate-700">{meta.label}</p>
                        <p className="text-[10px] text-slate-400">{meta.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setCreating(false); setNewFormName(''); }}
                className="flex-1 py-2 text-[12px] border border-slate-300 rounded text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newFormName.trim()}
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
            <h3 className="text-[13px] font-semibold text-slate-800 mb-1">Clone Form</h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Creates an editable copy of <strong className="text-slate-600">{cloneTarget.name}</strong>
            </p>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">New Form Name</label>
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
          title="Delete Custom Form"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete Form'}
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
