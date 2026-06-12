import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, RefreshCw, Search,
  Shield, ShieldCheck, Check, ChevronDown, X, Lock,
  Copy, Wrench, EyeOff, ShieldAlert, Clock,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { SecurityRole, RolePrivilege, AccessLevel, PrivilegeKey } from '../../types/security';
import { PRIVILEGE_KEYS, PRIVILEGE_LABELS } from '../../types/security';
import type { EntityDefinition } from '../../types/entity';
import type { FieldDefinition } from '../../types/field';
import {
  fetchSecurityRoles, createSecurityRole, updateSecurityRole,
  softDeleteSecurityRole, fetchPrivilegesForRole, savePrivilegesForRole,
  cloneSecurityRole, fetchFieldPermissionsForRole, saveFieldPermissionsForRole,
  fetchSectionPermissionsForRole, saveSectionPermissionsForRole,
  fetchActionPermissionsForRole, saveActionPermissionsForRole,
  STANDARD_ACTION_KEYS,
} from '../../services/securityService';
import type { FieldPermissionRow, SectionPermissionRow, ActionPermissionRow } from '../../services/securityService';
import { fetchEntities } from '../../services/entityService';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { fetchFormsForEntity } from '../../services/formService';
import type { DesignerSection, DesignerTab } from '../../types/form';
import ConfirmDialog from '../components/ConfirmDialog';

type Tab = 'details' | 'privileges' | 'field_permissions' | 'section_permissions' | 'action_permissions';
type CategoryFilter = 'all' | 'system' | 'custom';
type AccessFilter = 'all' | 'has_access' | 'no_access';

const ACCESS_LEVELS: AccessLevel[] = ['user', 'business_unit', 'parent_bu', 'organization'];

const ACCESS_LEVEL_FIELD_MAP: Record<PrivilegeKey, keyof RolePrivilege> = {
  can_create: 'create_access_level',
  can_read:   'read_access_level',
  can_write:  'write_access_level',
  can_delete: 'delete_access_level',
  can_assign: 'assign_access_level',
  can_share:  'share_access_level',
};

const LEVEL_PILL: Record<string, string> = {
  none:          'bg-slate-100 text-slate-400 border-slate-200',
  user:          'bg-sky-50 text-sky-700 border-sky-200',
  business_unit: 'bg-teal-50 text-teal-700 border-teal-200',
  parent_bu:     'bg-violet-50 text-violet-700 border-violet-200',
  organization:  'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const LEVEL_SHORT: Record<string, string> = {
  none:          'None',
  user:          'User',
  business_unit: 'BU',
  parent_bu:     'BU+',
  organization:  'Org',
};

const INPUT = 'w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400';
const LBL = 'block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1';

export default function SecurityRolesPage() {
  const { showSuccess, showError } = useToast();
  const [roles, setRoles] = useState<SecurityRole[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const [selected, setSelected] = useState<SecurityRole | null>(null);
  const [tab, setTab] = useState<Tab>('details');
  const [privileges, setPrivileges] = useState<RolePrivilege[]>([]);
  const [privDirty, setPrivDirty] = useState(false);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SecurityRole | null>(null);

  const [cloneTarget, setCloneTarget] = useState<SecurityRole | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloneLoading, setCloneLoading] = useState(false);

  const [fieldPerms, setFieldPerms] = useState<FieldPermissionRow[]>([]);
  const [fieldPermsDirty, setFieldPermsDirty] = useState(false);
  const [allFields, setAllFields] = useState<{ entity: EntityDefinition; fields: FieldDefinition[] }[]>([]);

  const [sectionPerms, setSectionPerms] = useState<SectionPermissionRow[]>([]);
  const [sectionPermsDirty, setSectionPermsDirty] = useState(false);
  const [allSections, setAllSections] = useState<{ entity: EntityDefinition; sections: { id: string; label: string; tabLabel: string }[] }[]>([]);

  const [actionPerms, setActionPerms] = useState<ActionPermissionRow[]>([]);
  const [actionPermsDirty, setActionPermsDirty] = useState(false);

  useEffect(() => {
    Promise.all([fetchSecurityRoles(), fetchEntities()])
      .then(([r, e]) => {
        setRoles(r);
        const activeEntities = e.filter((ent: EntityDefinition) => ent.is_active !== false);
        setEntities(activeEntities);
        // Field/section/action permissions are only relevant for non-activity entities
        const nonActivityEntities = activeEntities.filter((ent: EntityDefinition) => !ent.is_activity);
        Promise.all(
          nonActivityEntities.map((ent: EntityDefinition) =>
            fetchFieldsForEntity(ent.entity_definition_id)
              .then((fields) => ({ entity: ent, fields }))
              .catch(() => ({ entity: ent, fields: [] as FieldDefinition[] }))
          )
        ).then(setAllFields);

        Promise.all(
          nonActivityEntities.map((ent: EntityDefinition) =>
            fetchFormsForEntity(ent.entity_definition_id).then((forms) => {
              const mainForm = forms.find((f) => f.form_type === 'main' && f.layout_json);
              const sections: { id: string; label: string; tabLabel: string }[] = [];
              if (mainForm?.layout_json) {
                const rawTabs = Array.isArray(mainForm.layout_json) ? mainForm.layout_json : (mainForm.layout_json as { tabs?: DesignerTab[] }).tabs ?? [];
                for (const tab of (rawTabs as DesignerTab[])) {
                  for (const sec of (tab.sections as DesignerSection[])) {
                    sections.push({ id: sec.id, label: sec.label || sec.name, tabLabel: tab.label || tab.name });
                  }
                }
              }
              return { entity: ent, sections };
            }).catch(() => ({ entity: ent, sections: [] as { id: string; label: string; tabLabel: string }[] }))
          )
        ).then(setAllSections);
      })
      .catch((e) => showError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const selectRole = async (role: SecurityRole) => {
    setSelected(role);
    setForm({ name: role.name, description: role.description ?? '' });
    setTab('details');
    setPrivDirty(false);
    setFieldPermsDirty(false);
    const [privs, fps, sps, aps] = await Promise.all([
      fetchPrivilegesForRole(role.role_id),
      fetchFieldPermissionsForRole(role.role_id),
      fetchSectionPermissionsForRole(role.role_id),
      fetchActionPermissionsForRole(role.role_id),
    ]);
    const existingNames = new Set(privs.map((p) => p.entity_name));
    const filled = [...privs];
    for (const ent of entities) {
      if (!existingNames.has(ent.logical_name)) {
        filled.push({
          privilege_id: `local_${ent.logical_name}`,
          role_id: role.role_id,
          entity_name: ent.logical_name,
          can_create: false, can_read: false, can_write: false,
          can_delete: false, can_assign: false, can_share: false,
          create_access_level: 'user', read_access_level: 'user',
          write_access_level: 'user', delete_access_level: 'user',
          assign_access_level: 'user', share_access_level: 'user',
          created_at: '', modified_at: '',
        });
      }
    }
    setPrivileges(filled);
    setFieldPerms(fps);
    setSectionPerms(sps);
    setSectionPermsDirty(false);
    setActionPerms(aps);
    setActionPermsDirty(false);
  };

  const openCreate = () => {
    setSelected(null);
    setCreating(true);
    setForm({ name: '', description: '' });
    setPrivileges([]);
    setTab('details');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) {
        const created = await createSecurityRole({ name: form.name.trim(), description: form.description.trim() || null });
        setRoles((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setCreating(false);
        await selectRole(created);
        showSuccess('Role created');
      } else if (selected) {
        const updated = await updateSecurityRole(selected.role_id, { name: form.name.trim(), description: form.description.trim() || null });
        setRoles((prev) => prev.map((r) => r.role_id === updated.role_id ? updated : r));
        setSelected(updated);
        showSuccess('Role saved');
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrivileges = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await savePrivilegesForRole(selected.role_id, privileges.map((p) => ({
        role_id: selected.role_id,
        entity_name: p.entity_name,
        can_create: p.can_create,
        can_read: p.can_read,
        can_write: p.can_write,
        can_delete: p.can_delete,
        can_assign: p.can_assign,
        can_share: p.can_share,
        create_access_level: p.create_access_level,
        read_access_level: p.read_access_level,
        write_access_level: p.write_access_level,
        delete_access_level: p.delete_access_level,
        assign_access_level: p.assign_access_level,
        share_access_level: p.share_access_level,
      })));
      setPrivDirty(false);
      showSuccess('Privileges saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFieldPerms = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await saveFieldPermissionsForRole(selected.role_id, fieldPerms.map((fp) => ({
        entity_name: fp.entity_name,
        field_name: fp.field_name,
        is_hidden: fp.is_hidden,
        is_readonly: fp.is_readonly,
      })));
      setFieldPermsDirty(false);
      showSuccess('Field permissions saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const getFieldPerm = useCallback((entityName: string, fieldName: string): FieldPermissionRow | undefined =>
    fieldPerms.find((fp) => fp.entity_name === entityName && fp.field_name === fieldName),
  [fieldPerms]);

  const setFieldPermBit = useCallback((entityName: string, fieldName: string, key: 'is_hidden' | 'is_readonly', value: boolean) => {
    setFieldPerms((prev) => {
      const existing = prev.find((fp) => fp.entity_name === entityName && fp.field_name === fieldName);
      if (existing) {
        const updated = prev.map((fp) =>
          fp.entity_name === entityName && fp.field_name === fieldName ? { ...fp, [key]: value } : fp
        );
        return updated.filter((fp) => fp.is_hidden || fp.is_readonly);
      }
      return [...prev, {
        field_permission_id: `local_${entityName}_${fieldName}`,
        role_id: selected?.role_id ?? '',
        entity_name: entityName,
        field_name: fieldName,
        is_hidden: key === 'is_hidden' ? value : false,
        is_readonly: key === 'is_readonly' ? value : false,
      }];
    });
    setFieldPermsDirty(true);
  }, [selected]);

  const handleSaveSectionPerms = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await saveSectionPermissionsForRole(selected.role_id, sectionPerms.map((sp) => ({
        entity_name: sp.entity_name,
        section_id: sp.section_id,
        section_label: sp.section_label,
        is_hidden: sp.is_hidden,
      })));
      setSectionPermsDirty(false);
      showSuccess('Section permissions saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const getSectionPerm = useCallback((entityName: string, sectionId: string): SectionPermissionRow | undefined =>
    sectionPerms.find((sp) => sp.entity_name === entityName && sp.section_id === sectionId),
  [sectionPerms]);

  const toggleSectionHidden = useCallback((entityName: string, sectionId: string, sectionLabel: string, value: boolean) => {
    setSectionPerms((prev) => {
      const existing = prev.find((sp) => sp.entity_name === entityName && sp.section_id === sectionId);
      if (existing) {
        if (!value) return prev.filter((sp) => !(sp.entity_name === entityName && sp.section_id === sectionId));
        return prev.map((sp) => sp.entity_name === entityName && sp.section_id === sectionId ? { ...sp, is_hidden: value } : sp);
      }
      if (!value) return prev;
      return [...prev, {
        section_permission_id: `local_${entityName}_${sectionId}`,
        role_id: selected?.role_id ?? '',
        entity_name: entityName,
        section_id: sectionId,
        section_label: sectionLabel,
        is_hidden: true,
      }];
    });
    setSectionPermsDirty(true);
  }, [selected]);

  const handleSaveActionPerms = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await saveActionPermissionsForRole(selected.role_id, actionPerms.map((ap) => ({
        entity_name: ap.entity_name,
        action_key: ap.action_key,
        action_label: ap.action_label,
        is_denied: ap.is_denied,
      })));
      setActionPermsDirty(false);
      showSuccess('Action permissions saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const getActionPerm = useCallback((entityName: string, actionKey: string): ActionPermissionRow | undefined =>
    actionPerms.find((ap) => ap.entity_name === entityName && ap.action_key === actionKey),
  [actionPerms]);

  const toggleActionDenied = useCallback((entityName: string, actionKey: string, actionLabel: string, value: boolean) => {
    setActionPerms((prev) => {
      const existing = prev.find((ap) => ap.entity_name === entityName && ap.action_key === actionKey);
      if (existing) {
        if (!value) return prev.filter((ap) => !(ap.entity_name === entityName && ap.action_key === actionKey));
        return prev.map((ap) => ap.entity_name === entityName && ap.action_key === actionKey ? { ...ap, is_denied: value } : ap);
      }
      if (!value) return prev;
      return [...prev, {
        action_permission_id: `local_${entityName}_${actionKey}`,
        role_id: selected?.role_id ?? '',
        entity_name: entityName,
        action_key: actionKey,
        action_label: actionLabel,
        is_denied: true,
      }];
    });
    setActionPermsDirty(true);
  }, [selected]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await softDeleteSecurityRole(deleteTarget.role_id);
    setRoles((prev) => prev.filter((r) => r.role_id !== deleteTarget.role_id));
    if (selected?.role_id === deleteTarget.role_id) setSelected(null);
    setDeleteTarget(null);
  };

  const handleClone = async () => {
    if (!cloneTarget || !cloneName.trim()) return;
    setCloneLoading(true);
    try {
      const cloned = await cloneSecurityRole(cloneTarget.role_id, cloneName.trim());
      setRoles((prev) => [...prev, cloned].sort((a, b) => a.name.localeCompare(b.name)));
      setCloneTarget(null);
      await selectRole(cloned);
      showSuccess('Role cloned');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Clone failed');
    } finally {
      setCloneLoading(false);
    }
  };

  const getPriv = (entityName: string): RolePrivilege | undefined =>
    privileges.find((p) => p.entity_name === entityName);

  const setPrivBit = (entityName: string, key: keyof RolePrivilege, value: boolean | string) => {
    setPrivileges((prev) => {
      const existing = prev.find((p) => p.entity_name === entityName);
      if (existing) {
        return prev.map((p) => p.entity_name === entityName ? { ...p, [key]: value } : p);
      }
      const newPriv: RolePrivilege = {
        privilege_id: `local_${entityName}`,
        role_id: selected?.role_id ?? '',
        entity_name: entityName,
        can_create: false, can_read: false, can_write: false,
        can_delete: false, can_assign: false, can_share: false,
        create_access_level: 'user',
        read_access_level: 'user',
        write_access_level: 'user',
        delete_access_level: 'user',
        assign_access_level: 'user',
        share_access_level: 'user',
        created_at: '', modified_at: '',
        [key]: value,
      };
      return [...prev, newPriv];
    });
    setPrivDirty(true);
  };

  const toggleAllForEntity = (entityName: string, value: boolean) => {
    setPrivileges((prev) => {
      const existing = prev.find((p) => p.entity_name === entityName);
      const updated: RolePrivilege = existing
        ? { ...existing }
        : {
            privilege_id: `local_${entityName}`,
            role_id: selected?.role_id ?? '',
            entity_name: entityName,
            can_create: false, can_read: false, can_write: false,
            can_delete: false, can_assign: false, can_share: false,
            create_access_level: 'user',
            read_access_level: 'user',
            write_access_level: 'user',
            delete_access_level: 'user',
            assign_access_level: 'user',
            share_access_level: 'user',
            created_at: '', modified_at: '',
          };
      for (const key of PRIVILEGE_KEYS) {
        (updated as unknown as Record<string, unknown>)[key] = value;
      }
      if (existing) {
        return prev.map((p) => p.entity_name === entityName ? updated : p);
      }
      return [...prev, updated];
    });
    setPrivDirty(true);
  };

  const counts = {
    all: roles.length,
    system: roles.filter((r) => r.is_system).length,
    custom: roles.filter((r) => !r.is_system).length,
  };

  const filteredRoles = roles.filter((r) => {
    if (categoryFilter === 'system' && !r.is_system) return false;
    if (categoryFilter === 'custom' && r.is_system) return false;
    return r.name.toLowerCase().includes(search.toLowerCase());
  });

  const isSystemAdminRole = selected?.name === 'System Administrator';
  const isDirty = privDirty || fieldPermsDirty || sectionPermsDirty || actionPermsDirty;

  const saveHandler =
    isSystemAdminRole ? null  // SA role: nothing is saveable from UI
    : tab === 'privileges' && privDirty ? handleSavePrivileges
    : tab === 'field_permissions' && fieldPermsDirty ? handleSaveFieldPerms
    : tab === 'section_permissions' && sectionPermsDirty ? handleSaveSectionPerms
    : tab === 'action_permissions' && actionPermsDirty ? handleSaveActionPerms
    : tab === 'details' && !selected?.is_system ? handleSave
    : null;

  const saveLabel =
    tab === 'privileges' ? 'Save Privileges'
    : tab === 'field_permissions' ? 'Save Field Permissions'
    : tab === 'section_permissions' ? 'Save Section Permissions'
    : tab === 'action_permissions' ? 'Save Action Permissions'
    : 'Save';

  if (loading) return <div className="flex-1 flex items-center justify-center"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>;

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {/* ── Left sidebar: role list ── */}
      <div className="w-72 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="px-3 pt-3 pb-2 border-b border-slate-100 space-y-2 shrink-0">
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            {(['all', 'system', 'custom'] as CategoryFilter[]).map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`flex-1 py-1 text-[10px] font-semibold rounded-md capitalize transition-all ${
                  categoryFilter === c ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {c} ({counts[c]})
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input id="role-search" name="role-search" type="text" placeholder="Search roles..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 text-xs bg-transparent border-0 focus:outline-none placeholder:text-slate-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {filteredRoles.map((r) => (
            <div
              key={r.role_id}
              onClick={() => { setCreating(false); selectRole(r); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-slate-50 ${selected?.role_id === r.role_id && !creating ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
            >
              <div className={`p-1.5 rounded-lg shrink-0 ${r.is_active ? (r.is_system ? 'bg-amber-100' : 'bg-blue-100') : 'bg-slate-100'}`}>
                <Shield size={12} className={r.is_active ? (r.is_system ? 'text-amber-600' : 'text-blue-600') : 'text-slate-400'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs font-semibold text-slate-800 truncate">{r.name}</p>
                  {r.is_system && (
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-semibold rounded-full shrink-0">
                      <Lock size={7} /> System
                    </span>
                  )}
                </div>
                {r.description && <p className="text-[10px] text-slate-400 truncate">{r.description}</p>}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setCloneTarget(r); setCloneName(`${r.name} (Copy)`); }}
                className="p-1 text-slate-300 hover:text-blue-500 transition-colors shrink-0"
                title="Clone role"
              >
                <Copy size={11} />
              </button>
            </div>
          ))}
          {filteredRoles.length === 0 && <p className="text-xs text-slate-400 p-4 text-center">No roles found</p>}
        </div>

        <div className="p-3 border-t border-slate-100 shrink-0">
          <button onClick={openCreate} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100">
            <Plus size={13} /> New Custom Role
          </button>
        </div>
      </div>

      {/* ── Right content area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {creating ? (
          <div className="p-6 max-w-md">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Wrench size={14} className="text-blue-600" />
                </div>
                <h3 className="text-sm font-semibold text-slate-800">New Custom Role</h3>
              </div>
              <button onClick={() => setCreating(false)} className="p-1 text-slate-400 hover:text-slate-700"><X size={13} /></button>
            </div>
            <RoleForm form={form} onChange={setForm} />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setCreating(false)} className="flex-1 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="flex-1 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg flex items-center justify-center gap-1.5">
                {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />} Create Role
              </button>
            </div>
          </div>
        ) : selected ? (
          <>
            {/* ── Role header bar (fixed) ── */}
            <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
              <div className={`p-2 rounded-xl ${selected.is_system ? 'bg-amber-100' : 'bg-blue-100'}`}>
                <ShieldCheck size={16} className={selected.is_system ? 'text-amber-600' : 'text-blue-600'} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800">{selected.name}</p>
                  {selected.is_system ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold rounded-full">
                      <Lock size={8} /> System
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-semibold rounded-full">
                      <Wrench size={8} /> Custom
                    </span>
                  )}
                </div>
                {selected.description && <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs">{selected.description}</p>}
              </div>
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { setCloneTarget(selected); setCloneName(`${selected.name} (Copy)`); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg transition-colors"
                >
                  <Copy size={12} /> Clone
                </button>
                {saveHandler && (
                  <button onClick={saveHandler} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                    {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />} {saveLabel}
                  </button>
                )}
                {selected.is_system ? (
                  <div className="p-1.5 text-slate-300 cursor-not-allowed" title="System roles cannot be deleted">
                    <Lock size={13} />
                  </div>
                ) : (
                  <button onClick={() => setDeleteTarget(selected)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* ── Tab bar (fixed) ── */}
            <div className="flex border-b border-slate-200 bg-white px-5 shrink-0">
              {(['details', 'privileges', 'field_permissions', 'section_permissions', 'action_permissions'] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {t === 'details' ? 'Details' : t === 'privileges' ? 'Privileges' : t === 'field_permissions' ? 'Field Perms' : t === 'section_permissions' ? 'Section Perms' : 'Action Perms'}
                </button>
              ))}
              {isDirty && <span className="ml-auto self-center text-[10px] text-amber-500 font-medium">Unsaved changes</span>}
            </div>

            {/* ── Tab content (scrollable) ── */}
            <div className="flex-1 overflow-y-auto">
              {tab === 'details' && (
                <div className="p-5">
                  <div className="max-w-md">
                    {isSystemAdminRole ? (
                      <div className="mb-4 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <ShieldAlert size={16} className="text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-amber-800">System Administrator — Locked</p>
                          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                            This role has full organization-level access to all entities, fields, sections, and actions.<br />
                            It cannot be renamed, deleted, or have any permissions reduced.<br />
                            Clone this role to create a customisable copy.
                          </p>
                        </div>
                      </div>
                    ) : selected.is_system ? (
                      <div className="mb-4 flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <Lock size={13} className="text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-amber-700">System Role</p>
                          <p className="text-[10px] text-amber-600 mt-0.5">Clone this role to create a customisable copy.</p>
                        </div>
                      </div>
                    ) : null}
                    <RoleForm form={form} onChange={setForm} readOnly={selected.is_system} />
                  </div>
                </div>
              )}
              {isSystemAdminRole && (
                <SystemAdminLockBanner />
              )}
              {tab === 'privileges' && (
                <PrivilegeMatrix
                  entities={entities}
                  getPriv={getPriv}
                  onSetBit={setPrivBit}
                  onToggleAll={toggleAllForEntity}
                  readOnly={isSystemAdminRole}
                />
              )}
              {tab === 'field_permissions' && (
                <FieldPermissionsMatrix
                  allFields={allFields}
                  getFieldPerm={getFieldPerm}
                  onSetBit={setFieldPermBit}
                  readOnly={isSystemAdminRole}
                />
              )}
              {tab === 'section_permissions' && (
                <SectionPermissionsMatrix
                  allSections={allSections}
                  getSectionPerm={getSectionPerm}
                  onToggle={toggleSectionHidden}
                  readOnly={isSystemAdminRole}
                />
              )}
              {tab === 'action_permissions' && (
                <ActionPermissionsMatrix
                  entities={entities}
                  getActionPerm={getActionPerm}
                  onToggle={toggleActionDenied}
                  readOnly={isSystemAdminRole}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Shield size={28} className="text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Select a role to manage, or create a new custom role</p>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Role"
          message={`Delete "${deleteTarget.name}"? Users with this role will lose associated privileges.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}

      {cloneTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Copy size={18} className="text-blue-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Clone Role</h3>
                <p className="text-xs text-slate-500">Creates an editable copy with all privileges</p>
              </div>
            </div>
            <input
              id="clone-role-name"
              name="clone-role-name"
              type="text"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCloneTarget(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={handleClone}
                disabled={!cloneName.trim() || cloneLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {cloneLoading ? 'Cloning...' : 'Clone & Edit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * System Administrator lock banner (shown above all tabs)
 * ───────────────────────────────────────────────────────── */

function SystemAdminLockBanner() {
  return (
    <div className="mx-5 mt-4 flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
      <ShieldAlert size={15} className="text-amber-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-semibold text-amber-800">System Administrator has full organization access and cannot be modified.</p>
        <p className="text-[11px] text-amber-600 mt-0.5">
          All privileges are permanently set to ON at Organization scope. Field, section, and action restrictions are not applicable.
          Clone this role to create a customisable copy with reduced access.
        </p>
      </div>
      <Lock size={13} className="text-amber-400 shrink-0 ml-auto mt-0.5" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Shared: SearchFilterBar
 * ───────────────────────────────────────────────────────── */

function SearchFilterBar({
  search, onSearch, accessFilter, onAccessFilter, counts,
}: {
  search: string;
  onSearch: (v: string) => void;
  accessFilter: AccessFilter;
  onAccessFilter: (v: AccessFilter) => void;
  counts: { all: number; has_access: number; no_access: number };
}) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white flex-1 max-w-xs">
        <Search size={12} className="text-slate-400 shrink-0" />
        <input
          id="entity-search"
          name="entity-search"
          type="text"
          placeholder="Search entities..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="flex-1 text-xs bg-transparent border-0 focus:outline-none placeholder:text-slate-400"
        />
        {search && <button onClick={() => onSearch('')} className="text-slate-400 hover:text-slate-600"><X size={10} /></button>}
      </div>
      <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
        {([
          { key: 'all' as const, label: 'All', count: counts.all },
          { key: 'has_access' as const, label: 'Has Access', count: counts.has_access },
          { key: 'no_access' as const, label: 'No Access', count: counts.no_access },
        ]).map((f) => (
          <button
            key={f.key}
            onClick={() => onAccessFilter(f.key)}
            className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap ${
              accessFilter === f.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Role form
 * ───────────────────────────────────────────────────────── */

function RoleForm({
  form, onChange, readOnly = false,
}: {
  form: { name: string; description: string };
  onChange: (f: typeof form) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="role-name" className={LBL}>Role Name *</label>
        <input
          id="role-name"
          name="role-name"
          type="text"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className={INPUT + (readOnly ? ' opacity-60 cursor-not-allowed' : '')}
          placeholder="e.g. Sales Manager"
          readOnly={readOnly}
          autoFocus={!readOnly}
        />
      </div>
      <div>
        <label htmlFor="role-description" className={LBL}>Description</label>
        <textarea
          id="role-description"
          name="role-description"
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          rows={3}
          className={INPUT + ' resize-none' + (readOnly ? ' opacity-60 cursor-not-allowed' : '')}
          placeholder="Describe the purpose of this role..."
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Privilege cell
 * ───────────────────────────────────────────────────────── */

function PrivilegeLevelCell({
  enabled, level, onEnabledChange, onLevelChange, disabled, cellId,
}: {
  enabled: boolean;
  level: AccessLevel;
  onEnabledChange: (v: boolean) => void;
  onLevelChange: (v: AccessLevel) => void;
  disabled: boolean;
  cellId: string;
}) {
  const activePillCls = LEVEL_PILL[level] ?? LEVEL_PILL.user;
  const nonePillCls = LEVEL_PILL.none;
  const selectId = `priv-level-${cellId}`;

  return (
    <div style={{ width: 64, height: 42, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <button
        type="button"
        onClick={() => !disabled && onEnabledChange(!enabled)}
        disabled={disabled}
        style={{ display: 'flex', alignItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, background: 'none', border: 'none', padding: 0 }}
        aria-pressed={enabled}
      >
        <div style={{ width: 28, height: 14, borderRadius: 9999, backgroundColor: enabled ? '#3b82f6' : '#cbd5e1', transition: 'background-color 0.15s', position: 'relative', flexShrink: 0 }}>
          <span style={{ display: 'block', width: 12, height: 12, borderRadius: 9999, backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', position: 'absolute', top: 1, left: enabled ? 15 : 2, transition: 'left 0.15s' }} />
        </div>
      </button>
      {/* Always render both states with same dimensions — only visibility differs */}
      <div style={{ width: 52, height: 16, position: 'relative' }}>
        {/* Enabled: select dropdown */}
        <div style={{ position: 'absolute', inset: 0, display: enabled ? 'flex' : 'none', alignItems: 'center' }}>
          <FilterSelect
            id={selectId}
            name={selectId}
            value={level}
            onChange={(e) => !disabled && onLevelChange(e.target.value as AccessLevel)}
            disabled={disabled || !enabled}
            className={`text-[9px] font-semibold border rounded appearance-none focus:outline-none ${activePillCls} disabled:opacity-50`}
            style={{ width: '100%', paddingLeft: 4, paddingRight: 14, paddingTop: 2, paddingBottom: 2, cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            {ACCESS_LEVELS.map((al) => (
              <option key={al} value={al}>{LEVEL_SHORT[al]}</option>
            ))}
          </FilterSelect>
          <ChevronDown size={7} style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.6 }} />
        </div>
        {/* Disabled: static None pill */}
        <div style={{ position: 'absolute', inset: 0, display: enabled ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className={`text-[9px] font-semibold border rounded ${nonePillCls}`} style={{ paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2, whiteSpace: 'nowrap' }}>
            None
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Privilege Matrix
 * ───────────────────────────────────────────────────────── */

function PrivilegeMatrix({
  entities, getPriv, onSetBit, onToggleAll, readOnly,
}: {
  entities: EntityDefinition[];
  getPriv: (entityName: string) => RolePrivilege | undefined;
  onSetBit: (entityName: string, key: keyof RolePrivilege, value: boolean | string) => void;
  onToggleAll: (entityName: string, value: boolean) => void;
  readOnly: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');

  const regularEntities = useMemo(() => entities.filter((e) => !e.is_activity), [entities]);
  const activityEntities = useMemo(() => entities.filter((e) => e.is_activity), [entities]);

  const entityHasAccess = useCallback((e: EntityDefinition) => {
    const priv = getPriv(e.logical_name);
    return priv ? PRIVILEGE_KEYS.some((k) => priv[k] === true) : false;
  }, [getPriv]);

  const allEntities = useMemo(() => [...regularEntities, ...activityEntities], [regularEntities, activityEntities]);

  const counts = useMemo(() => {
    const has = allEntities.filter(entityHasAccess).length;
    return { all: allEntities.length, has_access: has, no_access: allEntities.length - has };
  }, [allEntities, entityHasAccess]);

  const filteredRegular = useMemo(() => regularEntities.filter((e) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!e.display_name.toLowerCase().includes(q) && !e.logical_name.toLowerCase().includes(q)) return false;
    }
    if (accessFilter === 'has_access') return entityHasAccess(e);
    if (accessFilter === 'no_access') return !entityHasAccess(e);
    return true;
  }), [regularEntities, searchTerm, accessFilter, entityHasAccess]);

  const filteredActivity = useMemo(() => activityEntities.filter((e) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!e.display_name.toLowerCase().includes(q) && !e.logical_name.toLowerCase().includes(q)) return false;
    }
    if (accessFilter === 'has_access') return entityHasAccess(e);
    if (accessFilter === 'no_access') return !entityHasAccess(e);
    return true;
  }), [activityEntities, searchTerm, accessFilter, entityHasAccess]);

  const renderTable = (rows: EntityDefinition[], rowOffset = 0) => (
    <table className="text-xs border-collapse" style={{ tableLayout: 'fixed', width: '100%', minWidth: 700 }}>
      <colgroup>
        <col style={{ width: 180, minWidth: 180 }} />
        {PRIVILEGE_KEYS.map((k) => <col key={k} style={{ width: 80, minWidth: 80 }} />)}
        <col style={{ width: 70, minWidth: 70 }} />
      </colgroup>
      <thead className="sticky top-0 z-10">
        <tr>
          <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 bg-slate-50">Entity</th>
          {PRIVILEGE_KEYS.map((k) => (
            <th key={k} className="px-2 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center bg-slate-50">
              {PRIVILEGE_LABELS[k]}
            </th>
          ))}
          <th className="px-2 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center bg-slate-50">All</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e, i) => {
          const priv = getPriv(e.logical_name);
          const anyOn = priv ? PRIVILEGE_KEYS.some((k) => priv[k] === true) : false;
          return (
            <tr key={e.entity_definition_id} className={`border-b border-slate-100 transition-colors hover:bg-slate-50/60 ${(i + rowOffset) % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'}`}>
              <td className="px-3 py-2">
                <p className="font-semibold text-slate-700 truncate">{e.display_name}</p>
                <p className="text-[10px] text-slate-400 truncate font-mono">{e.logical_name}</p>
              </td>
              {PRIVILEGE_KEYS.map((k) => {
                const levelKey = ACCESS_LEVEL_FIELD_MAP[k];
                const enabled = priv ? (priv[k] as boolean) : false;
                const level = (priv ? (priv[levelKey] as AccessLevel) : 'user') ?? 'user';
                return (
                  <td key={k} style={{ width: 80, textAlign: 'center', verticalAlign: 'middle', padding: '4px 2px' }}>
                    <PrivilegeLevelCell
                      enabled={enabled}
                      level={level}
                      onEnabledChange={(v) => onSetBit(e.logical_name, k, v)}
                      onLevelChange={(v) => onSetBit(e.logical_name, levelKey, v)}
                      disabled={readOnly}
                      cellId={`${e.logical_name}-${k}`}
                    />
                  </td>
                );
              })}
              <td style={{ width: 70, textAlign: 'center', verticalAlign: 'middle', padding: '4px 6px' }}>
                <button
                  onClick={() => !readOnly && onToggleAll(e.logical_name, !anyOn)}
                  disabled={readOnly}
                  className={`text-[10px] font-medium px-2 py-1 rounded-md transition-colors disabled:opacity-50 ${anyOn ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {anyOn ? 'All On' : 'All Off'}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="flex flex-col">
      {/* Info bar + search/filter */}
      <div className="px-5 pt-4 pb-3 space-y-3 bg-[#f3f4f6]">
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
          <Shield size={13} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-700 leading-relaxed">
            Toggle each action on/off, then set its scope.
            <span className="ml-1 font-semibold">User</span> = own records,
            <span className="ml-1 font-semibold">BU</span> = business unit,
            <span className="ml-1 font-semibold">BU+</span> = BU + children,
            <span className="ml-1 font-semibold">Org</span> = entire organisation.
          </p>
        </div>
        <SearchFilterBar
          search={searchTerm}
          onSearch={setSearchTerm}
          accessFilter={accessFilter}
          onAccessFilter={setAccessFilter}
          counts={counts}
        />
      </div>

      {/* Regular entities */}
      {filteredRegular.length > 0 && (
        <div className="mx-5 mb-3 border border-slate-200 rounded-xl bg-white overflow-hidden" style={{ isolation: 'isolate' }}>
          {renderTable(filteredRegular, 0)}
        </div>
      )}

      {/* Activities group */}
      {filteredActivity.length > 0 && (
        <div className="mx-5 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={12} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Activities</span>
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] text-slate-400">Timeline privileges — Note, Appointment, Email, Attachment</span>
          </div>
          <div className="border border-teal-200 rounded-xl bg-white overflow-hidden" style={{ isolation: 'isolate' }}>
            <div className="px-3 py-2 bg-teal-50 border-b border-teal-100 flex items-start gap-2">
              <Clock size={11} className="text-teal-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-teal-700 leading-relaxed">
                Activity privileges are <strong>independent</strong> from the parent record's entity access. Opening any record (Account, Contact, Lead, etc.) does not grant access to its timeline activities — each activity type is secured separately by its own privilege rows below.
              </p>
            </div>
            {renderTable(filteredActivity, filteredRegular.length)}
          </div>
        </div>
      )}

      {filteredRegular.length === 0 && filteredActivity.length === 0 && (
        <div className="mx-5 mb-4 border border-slate-200 rounded-xl bg-white flex items-center justify-center py-16">
          <div className="text-center">
            <Shield size={24} className="text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No entities found.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Action Permissions Matrix
 * ───────────────────────────────────────────────────────── */

function ActionPermissionsMatrix({
  entities, getActionPerm, onToggle, readOnly = false,
}: {
  entities: EntityDefinition[];
  getActionPerm: (entityName: string, actionKey: string) => ActionPermissionRow | undefined;
  onToggle: (entityName: string, actionKey: string, actionLabel: string, value: boolean) => void;
  readOnly?: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');

  const entityHasAccess = useCallback((e: EntityDefinition) => {
    return STANDARD_ACTION_KEYS.some((a) => !getActionPerm(e.logical_name, a.action_key)?.is_denied);
  }, [getActionPerm]);

  const counts = useMemo(() => {
    const has = entities.filter(entityHasAccess).length;
    return { all: entities.length, has_access: has, no_access: entities.length - has };
  }, [entities, entityHasAccess]);

  const filtered = useMemo(() => {
    return entities.filter((e) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!e.display_name.toLowerCase().includes(q) && !e.logical_name.toLowerCase().includes(q)) return false;
      }
      if (accessFilter === 'has_access') return entityHasAccess(e);
      if (accessFilter === 'no_access') return !entityHasAccess(e);
      return true;
    });
  }, [entities, searchTerm, accessFilter, entityHasAccess]);

  return (
    <div className="flex flex-col">
      <div className="px-5 pt-4 pb-3 space-y-3 bg-[#f3f4f6]">
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
          <Lock size={13} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 leading-relaxed">
            Control which bulk operations are allowed. <strong>Deny wins</strong> -- if any role denies an action, it is blocked. System Admins always have full access.
          </p>
        </div>
        <SearchFilterBar
          search={searchTerm}
          onSearch={setSearchTerm}
          accessFilter={accessFilter}
          onAccessFilter={setAccessFilter}
          counts={counts}
        />
      </div>

      <div className="px-5 pb-4">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <Shield size={24} className="text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No entities found.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((entity) => {
              const deniedCount = STANDARD_ACTION_KEYS.filter(
                (a) => getActionPerm(entity.logical_name, a.action_key)?.is_denied
              ).length;

              return (
                <div key={entity.entity_definition_id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                    <Shield size={13} className="text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-slate-700">{entity.display_name}</span>
                      <span className="ml-2 text-[10px] text-slate-400 font-mono">{entity.logical_name}</span>
                    </div>
                    {deniedCount > 0 ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-full text-[10px] font-semibold text-red-600">
                        <Lock size={8} /> {deniedCount} denied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-full text-[10px] font-semibold text-emerald-600">
                        <Check size={8} /> All allowed
                      </span>
                    )}
                  </div>

                  <div className="divide-y divide-slate-100">
                    {STANDARD_ACTION_KEYS.map((action) => {
                      const ap = getActionPerm(entity.logical_name, action.action_key);
                      const isDenied = ap?.is_denied ?? false;

                      return (
                        <div
                          key={action.action_key}
                          className={`flex items-center gap-3 px-4 py-3 transition-colors ${isDenied ? 'bg-red-50/30' : 'bg-white hover:bg-slate-50/60'}`}
                        >
                          <div className="flex-1 min-w-0 flex items-center gap-2.5">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-bold ${isDenied ? 'bg-red-100 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                              {isDenied ? <X size={11} /> : <Check size={11} />}
                            </span>
                            <p className={`text-xs font-medium ${isDenied ? 'text-slate-500' : 'text-slate-700'}`}>
                              {action.action_label}
                            </p>
                          </div>
                          <div
                            onClick={() => !readOnly && onToggle(entity.logical_name, action.action_key, action.action_label, !isDenied)}
                            className={`flex items-center gap-2 select-none ${readOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                          >
                            <span className={`text-[11px] font-semibold ${isDenied ? 'text-red-500' : 'text-emerald-600'}`}>
                              {isDenied ? 'Denied' : 'Allowed'}
                            </span>
                            <div className={`relative w-9 h-5 rounded-full transition-colors ${isDenied ? 'bg-red-500' : 'bg-emerald-500'}`}>
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isDenied ? 'left-[1px]' : 'left-[19px]'}`} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Section Permissions Matrix
 * ───────────────────────────────────────────────────────── */

function SectionPermissionsMatrix({
  allSections, getSectionPerm, onToggle, readOnly = false,
}: {
  allSections: { entity: EntityDefinition; sections: { id: string; label: string; tabLabel: string }[] }[];
  getSectionPerm: (entityName: string, sectionId: string) => SectionPermissionRow | undefined;
  onToggle: (entityName: string, sectionId: string, sectionLabel: string, value: boolean) => void;
  readOnly?: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');

  const entitiesWithSections = useMemo(
    () => allSections.filter(({ sections }) => sections.length > 0),
    [allSections]
  );

  const entityHasAccess = useCallback(({ entity, sections }: typeof entitiesWithSections[0]) => {
    return sections.some((s) => !getSectionPerm(entity.logical_name, s.id)?.is_hidden);
  }, [getSectionPerm]);

  const counts = useMemo(() => {
    const has = entitiesWithSections.filter(entityHasAccess).length;
    return { all: entitiesWithSections.length, has_access: has, no_access: entitiesWithSections.length - has };
  }, [entitiesWithSections, entityHasAccess]);

  const filtered = useMemo(() => {
    return entitiesWithSections.filter((item) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!item.entity.display_name.toLowerCase().includes(q) && !item.entity.logical_name.toLowerCase().includes(q)) return false;
      }
      if (accessFilter === 'has_access') return entityHasAccess(item);
      if (accessFilter === 'no_access') return !entityHasAccess(item);
      return true;
    });
  }, [entitiesWithSections, searchTerm, accessFilter, entityHasAccess]);

  return (
    <div className="flex flex-col">
      <div className="px-5 pt-4 pb-3 space-y-3 bg-[#f3f4f6]">
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
          <EyeOff size={13} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-700 leading-relaxed">
            Hidden sections are removed from the form for users with this role. System admins always see all sections.
          </p>
        </div>
        <SearchFilterBar
          search={searchTerm}
          onSearch={setSearchTerm}
          accessFilter={accessFilter}
          onAccessFilter={setAccessFilter}
          counts={counts}
        />
      </div>

      <div className="px-5 pb-4">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <EyeOff size={24} className="text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No entities found.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(({ entity, sections }) => {
              const hiddenCount = sections.filter((s) => getSectionPerm(entity.logical_name, s.id)?.is_hidden).length;
              const byTab = sections.reduce<Record<string, typeof sections>>((acc, s) => {
                if (!acc[s.tabLabel]) acc[s.tabLabel] = [];
                acc[s.tabLabel].push(s);
                return acc;
              }, {});

              return (
                <div key={entity.entity_definition_id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                    <Shield size={13} className="text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-slate-700">{entity.display_name}</span>
                      <span className="ml-2 text-[10px] text-slate-400 font-mono">{entity.logical_name}</span>
                    </div>
                    {hiddenCount > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-full text-[10px] font-semibold text-red-600">
                        <EyeOff size={8} /> {hiddenCount} hidden
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">{sections.length} sections</span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {Object.entries(byTab).map(([tabLabel, tabSections]) => (
                      <div key={tabLabel}>
                        <div className="px-4 py-2 bg-slate-50/60 border-t border-slate-100">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{tabLabel} tab</span>
                        </div>
                        {tabSections.map((sec) => {
                          const sp = getSectionPerm(entity.logical_name, sec.id);
                          const isHidden = sp?.is_hidden ?? false;
                          return (
                            <div
                              key={sec.id}
                              className={`flex items-center gap-3 px-4 py-3 transition-colors ${isHidden ? 'bg-red-50/40' : 'bg-white hover:bg-slate-50'}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {isHidden && <EyeOff size={11} className="text-red-400 shrink-0" />}
                                  <p className={`text-xs font-medium ${isHidden ? 'text-red-600 line-through decoration-red-300' : 'text-slate-700'}`}>
                                    {sec.label}
                                  </p>
                                </div>
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">{sec.id}</p>
                              </div>
                              <label className={`flex items-center gap-2 select-none ${readOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                <span className={`text-[11px] font-medium ${isHidden ? 'text-red-500' : 'text-slate-400'}`}>
                                  {isHidden ? 'Hidden' : 'Visible'}
                                </span>
                                <div
                                  onClick={() => !readOnly && onToggle(entity.logical_name, sec.id, sec.label, !isHidden)}
                                  className={`relative w-8 h-4 rounded-full transition-colors ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'} ${isHidden ? 'bg-red-500' : 'bg-slate-200'}`}
                                >
                                  <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isHidden ? 'translate-x-4' : ''}`} />
                                </div>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Field Permissions Matrix
 * ───────────────────────────────────────────────────────── */

function FieldPermissionsMatrix({
  allFields, getFieldPerm, onSetBit, readOnly = false,
}: {
  allFields: { entity: EntityDefinition; fields: FieldDefinition[] }[];
  getFieldPerm: (entityName: string, fieldName: string) => FieldPermissionRow | undefined;
  onSetBit: (entityName: string, fieldName: string, key: 'is_hidden' | 'is_readonly', value: boolean) => void;
  readOnly?: boolean;
}) {
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');

  const entityHasAccess = useCallback(({ entity, fields }: typeof allFields[0]) => {
    return fields.some((f) => {
      const fp = getFieldPerm(entity.logical_name, f.logical_name);
      return !fp?.is_hidden && !fp?.is_readonly;
    });
  }, [getFieldPerm]);

  const entitiesWithFields = useMemo(
    () => allFields.filter(({ fields }) => fields.length > 0),
    [allFields]
  );

  const counts = useMemo(() => {
    const has = entitiesWithFields.filter(entityHasAccess).length;
    return { all: entitiesWithFields.length, has_access: has, no_access: entitiesWithFields.length - has };
  }, [entitiesWithFields, entityHasAccess]);

  const filtered = useMemo(() => {
    return entitiesWithFields.filter((item) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!item.entity.display_name.toLowerCase().includes(q) && !item.entity.logical_name.toLowerCase().includes(q)) return false;
      }
      if (accessFilter === 'has_access') return entityHasAccess(item);
      if (accessFilter === 'no_access') return !entityHasAccess(item);
      return true;
    }).map(({ entity, fields }) => {
      const filteredFields = searchTerm
        ? fields.filter((f) => {
            const q = searchTerm.toLowerCase();
            return f.display_name.toLowerCase().includes(q) || f.logical_name.toLowerCase().includes(q) ||
              entity.display_name.toLowerCase().includes(q) || entity.logical_name.toLowerCase().includes(q);
          })
        : fields;
      return { entity, fields: filteredFields };
    }).filter(({ fields }) => fields.length > 0);
  }, [entitiesWithFields, searchTerm, accessFilter, entityHasAccess]);

  return (
    <div className="flex flex-col">
      <div className="px-5 pt-4 pb-3 space-y-3 bg-[#f3f4f6]">
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
          <Lock size={13} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-700 leading-relaxed">
            <strong>Hidden</strong> removes the field from the form. <strong>Read-only</strong> shows it as locked. System admins bypass all restrictions.
          </p>
        </div>
        <SearchFilterBar
          search={searchTerm}
          onSearch={setSearchTerm}
          accessFilter={accessFilter}
          onAccessFilter={setAccessFilter}
          counts={counts}
        />
      </div>

      <div className="px-5 pb-4">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <EyeOff size={24} className="text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No entities found.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(({ entity, fields }) => {
              const isExpanded = expandedEntity === entity.entity_definition_id || !!searchTerm;
              const restrictedCount = fields.filter((f) => {
                const fp = getFieldPerm(entity.logical_name, f.logical_name);
                return fp?.is_hidden || fp?.is_readonly;
              }).length;

              return (
                <div key={entity.entity_definition_id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                    onClick={() => !searchTerm && setExpandedEntity(isExpanded && !searchTerm ? null : entity.entity_definition_id)}
                  >
                    <Shield size={13} className="text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-slate-700">{entity.display_name}</span>
                      <span className="ml-2 text-[10px] text-slate-400 font-mono">{entity.logical_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {restrictedCount > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-semibold text-amber-700">
                          <Lock size={8} /> {restrictedCount} restricted
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">{fields.length} fields</span>
                      {!searchTerm && (
                        <ChevronDown size={12} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-white border-b border-slate-100">
                          <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Field</th>
                          <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center w-24">Hidden</th>
                          <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center w-24">Read-only</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field, fi) => {
                          const fp = getFieldPerm(entity.logical_name, field.logical_name);
                          const isHidden = fp?.is_hidden ?? false;
                          const isReadonly = fp?.is_readonly ?? false;
                          const hasRestriction = isHidden || isReadonly;
                          return (
                            <tr
                              key={field.field_definition_id}
                              className={`border-b border-slate-50 transition-colors ${hasRestriction ? 'bg-amber-50/40' : fi % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'} hover:bg-slate-50`}
                            >
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  {hasRestriction && <Lock size={10} className="text-amber-500 shrink-0" />}
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-700 truncate">{field.display_name}</p>
                                    <p className="text-[10px] text-slate-400 font-mono truncate">{field.logical_name}</p>
                                  </div>
                                  {field.is_system && (
                                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200 shrink-0">system</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <label htmlFor={`fp-hidden-${entity.logical_name}-${field.logical_name}`} className={`inline-flex items-center justify-center ${readOnly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}>
                                  <input
                                    id={`fp-hidden-${entity.logical_name}-${field.logical_name}`}
                                    name={`fp-hidden-${entity.logical_name}-${field.logical_name}`}
                                    type="checkbox"
                                    checked={isHidden}
                                    disabled={readOnly}
                                    onChange={(e) => {
                                      if (readOnly) return;
                                      onSetBit(entity.logical_name, field.logical_name, 'is_hidden', e.target.checked);
                                      if (e.target.checked) onSetBit(entity.logical_name, field.logical_name, 'is_readonly', false);
                                    }}
                                    className="w-3.5 h-3.5 accent-red-500 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </label>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <label htmlFor={`fp-readonly-${entity.logical_name}-${field.logical_name}`} className={`inline-flex items-center justify-center ${readOnly || isHidden ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}>
                                  <input
                                    id={`fp-readonly-${entity.logical_name}-${field.logical_name}`}
                                    name={`fp-readonly-${entity.logical_name}-${field.logical_name}`}
                                    type="checkbox"
                                    checked={isReadonly}
                                    disabled={readOnly || isHidden}
                                    onChange={(e) => { if (!readOnly) onSetBit(entity.logical_name, field.logical_name, 'is_readonly', e.target.checked); }}
                                    className="w-3.5 h-3.5 accent-amber-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                                  />
                                </label>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
