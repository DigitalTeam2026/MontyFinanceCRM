import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Building2, ChevronRight, ChevronDown, Plus, Pencil, PowerOff, Power, Users, Users as Users2, RefreshCw, Check, ArrowLeft } from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { BusinessUnit, CrmUser, Team } from '../../types/security';
import {
  fetchBusinessUnits, createBusinessUnit, updateBusinessUnit,
  fetchUsers, fetchTeams, fetchOrganizationId,
} from '../../services/securityService';
import SearchableSelect from '../../app/components/SearchableSelect';
import ConfirmDialog from '../components/ConfirmDialog';

interface Props {
  onClose: () => void;
}

type PanelMode = 'detail' | 'edit' | 'create' | 'users' | 'teams';

interface BUForm {
  name: string;
  description: string;
  parent_business_unit_id: string;
  is_active: boolean;
}

export default function BusinessUnitHierarchyModal({ onClose }: Props) {
  const { showSuccess, showError } = useToast();

  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<BusinessUnit | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>('detail');

  const [form, setForm] = useState<BUForm>({ name: '', description: '', parent_business_unit_id: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<BusinessUnit | null>(null);

  useEffect(() => {
    Promise.all([fetchBusinessUnits(), fetchUsers(), fetchTeams(), fetchOrganizationId()])
      .then(([bus, u, t, oid]) => {
        setUnits(bus);
        setUsers(u);
        setTeams(t);
        setOrgId(oid);
        const roots = bus.filter((b) => !b.parent_business_unit_id);
        setExpanded(new Set(roots.map((r) => r.business_unit_id)));
      })
      .catch((e) => showError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const childrenOf = useCallback(
    (parentId: string | null) => units.filter((u) => (u.parent_business_unit_id ?? null) === parentId),
    [units],
  );

  const getDescendants = useCallback(
    (buId: string): string[] => {
      const children = units.filter((u) => u.parent_business_unit_id === buId);
      return children.flatMap((c) => [c.business_unit_id, ...getDescendants(c.business_unit_id)]);
    },
    [units],
  );

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectUnit = (u: BusinessUnit) => {
    setSelected(u);
    setPanelMode('detail');
  };

  const openEdit = (u: BusinessUnit) => {
    setSelected(u);
    setForm({
      name: u.name,
      description: u.description ?? '',
      parent_business_unit_id: u.parent_business_unit_id ?? '',
      is_active: u.is_active,
    });
    setPanelMode('edit');
  };

  const openAddChild = (parent: BusinessUnit) => {
    setExpanded((prev) => new Set([...prev, parent.business_unit_id]));
    setForm({ name: '', description: '', parent_business_unit_id: parent.business_unit_id, is_active: true });
    setPanelMode('create');
  };

  const openCreateRoot = () => {
    setForm({ name: '', description: '', parent_business_unit_id: '', is_active: true });
    setPanelMode('create');
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (panelMode === 'create') {
        if (!orgId) throw new Error('No organization found');
        const created = await createBusinessUnit({
          organization_id: orgId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          parent_business_unit_id: form.parent_business_unit_id || null,
        });
        setUnits((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        if (form.parent_business_unit_id) {
          setExpanded((prev) => new Set([...prev, form.parent_business_unit_id]));
        }
        setSelected(created);
        setPanelMode('detail');
        showSuccess('Business unit created');
      } else if (panelMode === 'edit' && selected) {
        const updated = await updateBusinessUnit(selected.business_unit_id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          parent_business_unit_id: form.parent_business_unit_id || null,
          is_active: form.is_active,
        });
        setUnits((prev) => prev.map((u) => (u.business_unit_id === updated.business_unit_id ? updated : u)));
        setSelected(updated);
        setPanelMode('detail');
        showSuccess('Business unit saved');
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const tryDeactivate = (u: BusinessUnit) => {
    const hasActiveChildren = units.some(
      (c) => c.parent_business_unit_id === u.business_unit_id && c.is_active && !c.deleted_at,
    );
    const hasUsers = users.some((usr) => usr.business_unit_id === u.business_unit_id && usr.is_active);
    const hasTeams = teams.some((t) => t.business_unit_id === u.business_unit_id && t.is_active);

    if (hasActiveChildren || hasUsers || hasTeams) {
      const reasons: string[] = [];
      if (hasActiveChildren) reasons.push('active child business units');
      if (hasUsers) reasons.push('active users');
      if (hasTeams) reasons.push('active teams');
      showError(`Cannot deactivate "${u.name}" — it has ${reasons.join(', ')}.`);
      return;
    }
    setDeactivateTarget(u);
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      const updated = await updateBusinessUnit(deactivateTarget.business_unit_id, { is_active: false });
      setUnits((prev) => prev.map((u) => (u.business_unit_id === updated.business_unit_id ? updated : u)));
      if (selected?.business_unit_id === deactivateTarget.business_unit_id) setSelected(updated);
      showSuccess(`"${deactivateTarget.name}" deactivated`);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to deactivate');
    } finally {
      setDeactivateTarget(null);
    }
  };

  const handleActivate = async (u: BusinessUnit) => {
    try {
      const updated = await updateBusinessUnit(u.business_unit_id, { is_active: true });
      setUnits((prev) => prev.map((bu) => (bu.business_unit_id === updated.business_unit_id ? updated : bu)));
      if (selected?.business_unit_id === u.business_unit_id) setSelected(updated);
      showSuccess(`"${u.name}" activated`);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to activate');
    }
  };

  const parentOptions = useMemo(() => {
    const excluded = new Set<string>();
    if (panelMode === 'edit' && selected) {
      excluded.add(selected.business_unit_id);
      getDescendants(selected.business_unit_id).forEach((id) => excluded.add(id));
    }
    return [
      { value: '', label: '— Top Level (Root) —' },
      ...units
        .filter((u) => !excluded.has(u.business_unit_id))
        .map((u) => ({ value: u.business_unit_id, label: u.name })),
    ];
  }, [units, panelMode, selected, getDescendants]);

  const renderNode = (u: BusinessUnit, depth: number): React.ReactNode => {
    const children = childrenOf(u.business_unit_id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(u.business_unit_id);
    const isSelected = selected?.business_unit_id === u.business_unit_id;
    const userCount = users.filter((usr) => usr.business_unit_id === u.business_unit_id).length;
    const teamCount = teams.filter((t) => t.business_unit_id === u.business_unit_id).length;

    return (
      <div key={u.business_unit_id}>
        <div
          className={`group flex items-center gap-1 px-2 py-2 cursor-pointer transition-colors ${
            isSelected ? 'bg-blue-50 border-r-2 border-blue-500' : 'hover:bg-slate-50'
          }`}
          style={{ paddingLeft: `${8 + depth * 18}px` }}
          onClick={() => selectUnit(u)}
        >
          <button
            className={`p-0.5 rounded transition-colors shrink-0 ${
              hasChildren
                ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                : 'text-transparent pointer-events-none'
            }`}
            onClick={(e) => { if (hasChildren) toggleExpand(u.business_unit_id, e); }}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          <Building2
            size={12}
            className={`shrink-0 ${u.is_active ? 'text-slate-500' : 'text-slate-300'}`}
          />

          <span
            className={`flex-1 text-xs font-medium truncate min-w-0 ml-1 ${
              u.is_active ? 'text-slate-800' : 'text-slate-400'
            }`}
          >
            {u.name}
          </span>

          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {userCount > 0 && (
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <Users size={9} />{userCount}
              </span>
            )}
            {teamCount > 0 && (
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <Users2 size={9} />{teamCount}
              </span>
            )}
          </div>

          {!u.is_active && (
            <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0 ml-1">
              Inactive
            </span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const roots = childrenOf(null);
  const buUsers = selected ? users.filter((u) => u.business_unit_id === selected.business_unit_id) : [];
  const buTeams = selected ? teams.filter((t) => t.business_unit_id === selected.business_unit_id) : [];
  const parentName = selected?.parent_business_unit_id
    ? units.find((u) => u.business_unit_id === selected.parent_business_unit_id)?.name
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-[920px] h-[640px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-teal-50 rounded-lg flex items-center justify-center">
              <Building2 size={14} className="text-teal-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Business Unit Hierarchy</h2>
              <p className="text-[10px] text-slate-400">{units.length} business unit{units.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openCreateRoot}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100 transition-colors"
            >
              <Plus size={12} /> New Business Unit
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Tree pane */}
          <div className="w-64 border-r border-slate-200 flex flex-col shrink-0 bg-slate-50/40">
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-white">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tree</span>
              <button
                onClick={() => setExpanded(new Set(units.map((u) => u.business_unit_id)))}
                className="text-[10px] text-blue-500 hover:text-blue-700 font-medium"
              >
                Expand all
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <RefreshCw size={16} className="animate-spin text-slate-300" />
                </div>
              ) : roots.length === 0 ? (
                <div className="p-6 text-center">
                  <Building2 size={24} className="text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No business units</p>
                </div>
              ) : (
                roots.map((r) => renderNode(r, 0))
              )}
            </div>
          </div>

          {/* Detail pane */}
          <div className="flex-1 overflow-y-auto bg-white">
            {panelMode === 'create' && (
              <BUFormPanel
                title="New Business Unit"
                form={form}
                setForm={setForm}
                parentOptions={parentOptions}
                saving={saving}
                onSave={handleSave}
                onCancel={() => setPanelMode('detail')}
              />
            )}

            {panelMode === 'edit' && selected && (
              <BUFormPanel
                title={`Edit: ${selected.name}`}
                form={form}
                setForm={setForm}
                parentOptions={parentOptions}
                saving={saving}
                onSave={handleSave}
                onCancel={() => setPanelMode('detail')}
              />
            )}

            {panelMode === 'detail' && selected && (
              <BUDetailPanel
                bu={selected}
                parentName={parentName ?? null}
                userCount={buUsers.length}
                teamCount={buTeams.length}
                childCount={childrenOf(selected.business_unit_id).length}
                onEdit={() => openEdit(selected)}
                onAddChild={() => openAddChild(selected)}
                onDeactivate={() => tryDeactivate(selected)}
                onActivate={() => handleActivate(selected)}
                onViewUsers={() => setPanelMode('users')}
                onViewTeams={() => setPanelMode('teams')}
              />
            )}

            {panelMode === 'users' && selected && (
              <BUUsersPanel
                buName={selected.name}
                users={buUsers}
                onBack={() => setPanelMode('detail')}
              />
            )}

            {panelMode === 'teams' && selected && (
              <BUTeamsPanel
                buName={selected.name}
                teams={buTeams}
                onBack={() => setPanelMode('detail')}
              />
            )}

            {panelMode === 'detail' && !selected && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <Building2 size={36} className="text-slate-150" strokeWidth={1} style={{ color: '#e2e8f0' }} />
                <p className="text-xs text-slate-400">Select a business unit to view details</p>
                <p className="text-[10px] text-slate-300">or click "New Business Unit" to add one</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {deactivateTarget && (
        <ConfirmDialog
          title="Deactivate Business Unit"
          message={`Deactivate "${deactivateTarget.name}"? It will remain in the system but become inactive. You can reactivate it later.`}
          confirmLabel="Deactivate"
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivateTarget(null)}
          danger
        />
      )}
    </div>
  );
}

// ─── Form Panel ───────────────────────────────────────────────────────────────

interface BUFormPanelProps {
  title: string;
  form: BUForm;
  setForm: (f: BUForm) => void;
  parentOptions: { value: string; label: string }[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function BUFormPanel({ title, form, setForm, parentOptions, saving, onSave, onCancel }: BUFormPanelProps) {
  return (
    <div className="p-6 max-w-md">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className={LBL}>Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={INPUT}
            placeholder="e.g. North America"
            autoFocus
          />
        </div>

        <div>
          <label className={LBL}>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className={INPUT + ' resize-none'}
            placeholder="Optional description..."
          />
        </div>

        <div>
          <label className={LBL}>Parent Business Unit</label>
          <SearchableSelect
            options={parentOptions}
            value={form.parent_business_unit_id}
            onChange={(v) => setForm({ ...form, parent_business_unit_id: v })}
            placeholder="— Top Level (Root) —"
          />
          {!form.parent_business_unit_id && (
            <p className="text-[10px] text-slate-400 mt-1">This will be a root-level business unit.</p>
          )}
        </div>

        <div>
          <label className={LBL}>Status</label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={form.is_active}
                onChange={() => setForm({ ...form, is_active: true })}
                className="accent-blue-600"
              />
              <span className="text-xs text-slate-700">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={!form.is_active}
                onChange={() => setForm({ ...form, is_active: false })}
                className="accent-blue-600"
              />
              <span className="text-xs text-slate-700">Inactive</span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          className="flex-1 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !form.name.trim()}
          className="flex-1 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors"
        >
          {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

interface BUDetailPanelProps {
  bu: BusinessUnit;
  parentName: string | null;
  userCount: number;
  teamCount: number;
  childCount: number;
  onEdit: () => void;
  onAddChild: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onViewUsers: () => void;
  onViewTeams: () => void;
}

function BUDetailPanel({
  bu, parentName, userCount, teamCount, childCount,
  onEdit, onAddChild, onDeactivate, onActivate, onViewUsers, onViewTeams,
}: BUDetailPanelProps) {
  return (
    <div className="p-6">
      {/* Name + status */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${bu.is_active ? 'bg-teal-50' : 'bg-slate-100'}`}>
            <Building2 size={16} className={bu.is_active ? 'text-teal-600' : 'text-slate-400'} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{bu.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  bu.is_active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {bu.is_active ? 'Active' : 'Inactive'}
              </span>
              {bu.is_system && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600">
                  System
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Parent BU</p>
          <p className="text-xs text-slate-700 font-medium">{parentName ?? '— Root —'}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Children</p>
          <p className="text-xs text-slate-700 font-medium">{childCount} business unit{childCount !== 1 ? 's' : ''}</p>
        </div>
        {bu.description && (
          <div className="col-span-2 bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Description</p>
            <p className="text-xs text-slate-600">{bu.description}</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-5">
        <button
          onClick={onViewUsers}
          className="flex-1 flex items-center gap-2 p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-left"
        >
          <Users size={14} className="text-blue-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-700">{userCount}</p>
            <p className="text-[10px] text-blue-500">User{userCount !== 1 ? 's' : ''}</p>
          </div>
        </button>
        <button
          onClick={onViewTeams}
          className="flex-1 flex items-center gap-2 p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-left"
        >
          <Users2 size={14} className="text-slate-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-700">{teamCount}</p>
            <p className="text-[10px] text-slate-400">Team{teamCount !== 1 ? 's' : ''}</p>
          </div>
        </button>
      </div>

      {/* Actions */}
      <div className="border-t border-slate-100 pt-4">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Actions</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onAddChild}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100 transition-colors"
          >
            <Plus size={11} /> Add Child BU
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
          >
            <Pencil size={11} /> Edit
          </button>
          {bu.is_active ? (
            <button
              onClick={onDeactivate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-100 transition-colors"
            >
              <PowerOff size={11} /> Deactivate
            </button>
          ) : (
            <button
              onClick={onActivate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-lg border border-green-100 transition-colors"
            >
              <Power size={11} /> Activate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Users Panel ──────────────────────────────────────────────────────────────

interface BUUsersPanelProps {
  buName: string;
  users: CrmUser[];
  onBack: () => void;
}

function BUUsersPanel({ buName, users, onBack }: BUUsersPanelProps) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={14} />
        </button>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Users in {buName}</h3>
          <p className="text-[10px] text-slate-400">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-10">
          <Users size={24} className="text-slate-200 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No users in this business unit</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {users.map((u) => (
            <div key={u.user_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-semibold text-blue-600">
                  {u.full_name?.charAt(0).toUpperCase() ?? '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">{u.full_name}</p>
                <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {u.job_title && <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{u.job_title}</span>}
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                    u.is_active ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {u.is_active ? 'Active' : 'Inactive'}
                </span>
                {u.is_system_admin && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">Admin</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Teams Panel ──────────────────────────────────────────────────────────────

interface BUTeamsPanelProps {
  buName: string;
  teams: Team[];
  onBack: () => void;
}

function BUTeamsPanel({ buName, teams, onBack }: BUTeamsPanelProps) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={14} />
        </button>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Teams in {buName}</h3>
          <p className="text-[10px] text-slate-400">{teams.length} team{teams.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-10">
          <Users2 size={24} className="text-slate-200 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No teams in this business unit</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {teams.map((t) => (
            <div key={t.team_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                <Users2 size={12} className="text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">{t.name}</p>
                {t.description && <p className="text-[10px] text-slate-400 truncate">{t.description}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full capitalize">{t.team_type}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                    t.is_active ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {t.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────

const INPUT = 'w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400';
const LBL = 'block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1';
