import { useEffect, useState } from 'react';
import {
  Plus, Trash2, RefreshCw,
  Building2, ChevronRight, Check, X, ExternalLink,
} from 'lucide-react';
import SearchableSelect from '../../app/components/SearchableSelect';
import { useToast } from '../../app/context/ToastContext';
import type { BusinessUnit } from '../../types/security';
import {
  fetchBusinessUnits, createBusinessUnit,
  updateBusinessUnit, softDeleteBusinessUnit, fetchOrganizationId,
} from '../../services/securityService';
import ConfirmDialog from '../components/ConfirmDialog';
import BusinessUnitHierarchyModal from './BusinessUnitHierarchyModal';

type Mode = 'list' | 'create' | 'edit';

export default function BusinessUnitsPage() {
  const { showSuccess, showError } = useToast();
  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('list');
  const [editing, setEditing] = useState<BusinessUnit | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BusinessUnit | null>(null);
  const [saving, setSaving] = useState(false);
  const [showHierarchy, setShowHierarchy] = useState(false);
  const [form, setForm] = useState<{ name: string; description: string; parent_business_unit_id: string }>({
    name: '', description: '', parent_business_unit_id: '',
  });

  useEffect(() => {
    Promise.all([fetchBusinessUnits(), fetchOrganizationId()])
      .then(([u, oid]) => { setUnits(u); setOrgId(oid); })
      .catch((e) => showError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', parent_business_unit_id: '' });
    setMode('create');
  };

  const openEdit = (u: BusinessUnit) => {
    setEditing(u);
    setForm({ name: u.name, description: u.description ?? '', parent_business_unit_id: u.parent_business_unit_id ?? '' });
    setMode('edit');
  };

  const handleSave = async () => {
    if (!form.name.trim() || !orgId) return;
    setSaving(true);
    try {
      if (mode === 'create') {
        const created = await createBusinessUnit({
          organization_id: orgId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          parent_business_unit_id: form.parent_business_unit_id || null,
        });
        setUnits((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        showSuccess('Business unit created');
      } else if (mode === 'edit' && editing) {
        const updated = await updateBusinessUnit(editing.business_unit_id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          parent_business_unit_id: form.parent_business_unit_id || null,
        });
        setUnits((prev) => prev.map((u) => u.business_unit_id === updated.business_unit_id ? updated : u));
        showSuccess('Business unit saved');
      }
      setMode('list');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await softDeleteBusinessUnit(deleteTarget.business_unit_id);
    setUnits((prev) => prev.filter((u) => u.business_unit_id !== deleteTarget.business_unit_id));
    setDeleteTarget(null);
    if (editing?.business_unit_id === deleteTarget.business_unit_id) setMode('list');
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>;

  const parentMap = Object.fromEntries(units.map((u) => [u.business_unit_id, u.name]));

  const buildTree = (parentId: string | null, depth = 0): BusinessUnit[] => {
    const children = units.filter((u) => (u.parent_business_unit_id ?? null) === parentId);
    const result: (BusinessUnit & { _depth: number })[] = [];
    for (const child of children) {
      result.push({ ...child, _depth: depth });
      result.push(...buildTree(child.business_unit_id, depth + 1) as (BusinessUnit & { _depth: number })[]);
    }
    return result;
  };

  const tree = buildTree(null) as (BusinessUnit & { _depth: number })[];

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-xs font-semibold text-slate-600 shrink-0">{units.length} Business Unit{units.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => setShowHierarchy(true)}
              className="flex items-center gap-1 text-[11px] font-medium text-teal-600 hover:text-teal-700 transition-colors whitespace-nowrap"
            >
              <ExternalLink size={10} />
              Hierarchy
            </button>
          </div>
          <button onClick={openCreate} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100 shrink-0">
            <Plus size={12} /> Add
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {tree.length === 0 ? (
            <div className="p-6 text-center">
              <Building2 size={24} className="text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No business units yet</p>
              {!orgId && <p className="text-[10px] text-amber-500 mt-1">No organization found. Create one first.</p>}
            </div>
          ) : tree.map((u) => (
            <div
              key={u.business_unit_id}
              onClick={() => openEdit(u)}
              className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors border-b border-slate-50 ${editing?.business_unit_id === u.business_unit_id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              style={{ paddingLeft: `${12 + u._depth * 16}px` }}
            >
              {u._depth > 0 && <ChevronRight size={11} className="text-slate-300 shrink-0" />}
              <Building2 size={13} className={u.is_active ? 'text-slate-500 shrink-0' : 'text-slate-300 shrink-0'} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium truncate ${u.is_active ? 'text-slate-800' : 'text-slate-400'}`}>{u.name}</p>
                {u.description && <p className="text-[10px] text-slate-400 truncate">{u.description}</p>}
              </div>
              <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(u); }} className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {(mode === 'create' || mode === 'edit') ? (
          <div className="max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-slate-800">
                {mode === 'create' ? 'New Business Unit' : `Edit: ${editing?.name}`}
              </h3>
              <button onClick={() => setMode('list')} className="p-1.5 text-slate-400 hover:text-slate-700"><X size={14} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={LBL}>Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} placeholder="e.g. North America" autoFocus />
              </div>
              <div>
                <label className={LBL}>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={INPUT + ' resize-none'} placeholder="Optional description..." />
              </div>
              <div>
                <label className={LBL}>Parent Business Unit</label>
                <SearchableSelect
                  options={[
                    { value: '', label: '— Top Level —' },
                    ...units
                      .filter((u) => mode === 'edit' ? u.business_unit_id !== editing?.business_unit_id : true)
                      .map((u) => ({ value: u.business_unit_id, label: u.name })),
                  ]}
                  value={form.parent_business_unit_id}
                  onChange={(v) => setForm({ ...form, parent_business_unit_id: v })}
                  placeholder="— Top Level —"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setMode('list')} className="flex-1 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="flex-1 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg flex items-center justify-center gap-1.5">
                {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                {mode === 'create' ? 'Create' : 'Save Changes'}
              </button>
            </div>
            {mode === 'edit' && editing && (
              <button onClick={() => setDeleteTarget(editing)} className="mt-3 w-full py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg flex items-center justify-center gap-1.5 border border-red-200">
                <Trash2 size={11} /> Delete Business Unit
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-48 text-center">
            <div>
              <Building2 size={28} className="text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Select a business unit to edit, or add a new one</p>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Business Unit"
          message={`Delete "${deleteTarget.name}"? Child units will become top-level.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}

      {showHierarchy && (
        <BusinessUnitHierarchyModal onClose={() => setShowHierarchy(false)} />
      )}
    </div>
  );
}

const INPUT = 'w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400';
const LBL = 'block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1';
