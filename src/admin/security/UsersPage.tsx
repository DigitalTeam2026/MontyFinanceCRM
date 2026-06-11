import { useEffect, useState } from 'react';
import {
  Plus, Search, Trash2, RefreshCw,
  Shield, ShieldCheck, UserCheck, X, Check,
  Users, ToggleLeft, ToggleRight, Building2,
} from 'lucide-react';
import SearchableSelect from '../../app/components/SearchableSelect';
import { useToast } from '../../app/context/ToastContext';
import type { CrmUser, SecurityRole, UserSecurityRole, BusinessUnit } from '../../types/security';
import {
  fetchUsers, createUser, upsertUser, softDeleteUser,
  fetchUserRoles, assignRoleToUser, removeRoleFromUser,
  fetchBusinessUnits, fetchSecurityRoles,
} from '../../services/securityService';
import ConfirmDialog from '../components/ConfirmDialog';

type Panel = 'edit' | 'roles';
type ActiveFilter = 'all' | 'active' | 'inactive';

const PASSWORD_MIN = 12;

/** Returns an array of unmet complexity requirements (empty = valid). */
function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < PASSWORD_MIN) issues.push(`at least ${PASSWORD_MIN} characters`);
  if (!/[a-z]/.test(pw)) issues.push('a lowercase letter');
  if (!/[A-Z]/.test(pw)) issues.push('an uppercase letter');
  if (!/[0-9]/.test(pw)) issues.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push('a special character');
  return issues;
}

export default function UsersPage() {
  const { showSuccess, showError } = useToast();
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [roles, setRoles] = useState<SecurityRole[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
  const [selected, setSelected] = useState<CrmUser | null>(null);
  const [panel, setPanel] = useState<Panel>('edit');
  const [userRoles, setUserRoles] = useState<UserSecurityRole[]>([]);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CrmUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<CrmUser>>({});
  const [password, setPassword] = useState('');
  const [userRoleCounts, setUserRoleCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([fetchUsers(), fetchSecurityRoles(), fetchBusinessUnits()])
      .then(([u, r, b]) => {
        setUsers(u);
        setRoles(r);
        setBusinessUnits(b);
        loadRoleCounts(u);
      })
      .catch((e) => showError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadRoleCounts = async (userList: CrmUser[]) => {
    const counts: Record<string, number> = {};
    await Promise.all(
      userList.map(async (u) => {
        const r = await fetchUserRoles(u.user_id);
        counts[u.user_id] = r.length;
      })
    );
    setUserRoleCounts(counts);
  };

  const openUser = (u: CrmUser) => {
    setSelected(u);
    setForm(u);
    setPanel('edit');
    setCreating(false);
    fetchUserRoles(u.user_id).then(setUserRoles);
  };

  const openCreate = () => {
    setSelected(null);
    setForm({ full_name: '', email: '', is_active: true, is_system_admin: false });
    setPassword('');
    setCreating(true);
    setPanel('edit');
    setUserRoles([]);
  };

  const handleSave = async () => {
    if (creating) {
      const issues = passwordIssues(password);
      if (issues.length) {
        showError(`Password must include ${issues.join(', ')}.`);
        return;
      }
    }
    setSaving(true);
    try {
      if (creating) {
        const saved = await createUser({
          email: form.email ?? '',
          password,
          full_name: form.full_name ?? '',
          username: form.username ?? undefined,
          job_title: form.job_title ?? undefined,
          mobile_phone: form.mobile_phone ?? undefined,
          business_unit_id: form.business_unit_id ?? null,
          is_active: form.is_active ?? true,
          is_system_admin: form.is_system_admin ?? false,
        });
        setUsers((prev) => [...prev, saved].sort((a, b) => a.full_name.localeCompare(b.full_name)));
        setUserRoleCounts((prev) => ({ ...prev, [saved.user_id]: 0 }));
        setSelected(saved);
        setForm(saved);
        setPassword('');
        setCreating(false);
        showSuccess('User created');
      } else if (selected) {
        const saved = await upsertUser({ ...form, user_id: selected.user_id } as CrmUser);
        setUsers((prev) => prev.map((u) => u.user_id === saved.user_id ? saved : u));
        setSelected(saved);
        setForm(saved);
        showSuccess('User saved');
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await softDeleteUser(deleteTarget.user_id);
    setUsers((prev) => prev.filter((u) => u.user_id !== deleteTarget.user_id));
    if (selected?.user_id === deleteTarget.user_id) setSelected(null);
    setDeleteTarget(null);
  };

  const handleToggleRole = async (roleId: string) => {
    if (!selected) return;
    const has = userRoles.some((r) => r.role_id === roleId);
    if (has) {
      await removeRoleFromUser(selected.user_id, roleId);
      setUserRoles((prev) => prev.filter((r) => r.role_id !== roleId));
      setUserRoleCounts((prev) => ({ ...prev, [selected.user_id]: Math.max(0, (prev[selected.user_id] ?? 1) - 1) }));
    } else {
      await assignRoleToUser(selected.user_id, roleId);
      const updated = await fetchUserRoles(selected.user_id);
      setUserRoles(updated);
      setUserRoleCounts((prev) => ({ ...prev, [selected.user_id]: updated.length }));
    }
  };

  const buMap = Object.fromEntries(businessUnits.map((b) => [b.business_unit_id, b.name]));

  const filtered = users.filter((u) => {
    if (activeFilter === 'active' && !u.is_active) return false;
    if (activeFilter === 'inactive' && u.is_active) return false;
    const q = search.toLowerCase();
    return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const counts = {
    all: users.length,
    active: users.filter((u) => u.is_active).length,
    inactive: users.filter((u) => !u.is_active).length,
  };

  if (loading) return <Loader />;

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      <div className="w-72 border-r border-slate-200 flex flex-col bg-white shrink-0">
        <div className="px-3 pt-3 pb-2 border-b border-slate-100 space-y-2">
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            {(['all', 'active', 'inactive'] as ActiveFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`flex-1 py-1 text-[10px] font-semibold rounded-md capitalize transition-all ${
                  activeFilter === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f} ({counts[f]})
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-xs bg-transparent border-0 focus:outline-none placeholder:text-slate-400"
            />
            {search && <button onClick={() => setSearch('')}><X size={11} className="text-slate-400" /></button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map((u) => {
            const roleCount = userRoleCounts[u.user_id] ?? 0;
            const buName = u.business_unit_id ? buMap[u.business_unit_id] : null;
            return (
              <div
                key={u.user_id}
                onClick={() => openUser(u)}
                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-slate-50 ${
                  selected?.user_id === u.user_id ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  u.is_system_admin ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {u.full_name.slice(0, 2).toUpperCase() || '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-slate-800 truncate">{u.full_name || '(no name)'}</p>
                    {u.is_system_admin && <Shield size={10} className="text-amber-500 shrink-0" />}
                    {!u.is_active && (
                      <span className="text-[9px] px-1 bg-slate-100 text-slate-400 rounded shrink-0">Inactive</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {buName && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-400">
                        <Building2 size={8} /> {buName}
                      </span>
                    )}
                    {roleCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-blue-50 border border-blue-100 text-blue-600 text-[9px] font-semibold rounded-full">
                        <Shield size={7} /> {roleCount} role{roleCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-6 text-center">
              <Users size={24} className="text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No users found</p>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-100">
          <button onClick={openCreate} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100">
            <Plus size={13} /> Add User
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {(selected || creating) ? (
          <>
            <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 shrink-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${form.is_system_admin ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                {(form.full_name ?? '').slice(0, 2).toUpperCase() || '??'}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{creating ? 'New User' : form.full_name}</p>
                {!creating && (
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-[10px] text-slate-400">{form.email}</p>
                    {form.business_unit_id && buMap[form.business_unit_id] && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                        <Building2 size={9} /> {buMap[form.business_unit_id]}
                      </span>
                    )}
                    {form.is_system_admin && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-semibold rounded-full">
                        <Shield size={8} /> System Admin
                      </span>
                    )}
                    {!form.is_active && (
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-semibold rounded-full">
                        Inactive
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {!creating && selected && (
                  <button
                    onClick={() => setPanel(panel === 'edit' ? 'roles' : 'edit')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${panel === 'roles' ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <UserCheck size={12} />
                    Roles
                    {userRoles.length > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${panel === 'roles' ? 'bg-blue-500' : 'bg-slate-100 text-slate-600'}`}>
                        {userRoles.length}
                      </span>
                    )}
                  </button>
                )}
                {selected && !creating && (
                  <button
                    onClick={() => {
                      const newActive = !form.is_active;
                      setForm((f) => ({ ...f, is_active: newActive }));
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                    title={form.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {form.is_active
                      ? <ToggleRight size={16} className="text-emerald-500" />
                      : <ToggleLeft size={16} className="text-slate-400" />}
                  </button>
                )}
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                  {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                  {creating ? 'Create' : 'Save'}
                </button>
                {selected && (
                  <button onClick={() => setDeleteTarget(selected)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {panel === 'edit' ? (
                <UserEditForm form={form} onChange={setForm} businessUnits={businessUnits} creating={creating} password={password} onPasswordChange={setPassword} />
              ) : (
                <UserRolesPanel roles={roles} userRoles={userRoles} onToggle={handleToggleRole} />
              )}
            </div>
          </>
        ) : (
          <EmptyDetail icon={<Shield size={28} className="text-slate-300" />} msg="Select a user to view or edit" />
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Deactivate User"
          message={`Deactivate "${deleteTarget.full_name}"? They will lose access.`}
          confirmLabel="Deactivate"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}
    </div>
  );
}

function UserEditForm({
  form, onChange, businessUnits, creating, password, onPasswordChange,
}: {
  form: Partial<CrmUser>;
  onChange: (f: Partial<CrmUser>) => void;
  businessUnits: BusinessUnit[];
  creating?: boolean;
  password?: string;
  onPasswordChange?: (v: string) => void;
}) {
  return (
    <div className="max-w-md space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full Name" required>
          <input type="text" value={form.full_name ?? ''} onChange={(e) => onChange({ ...form, full_name: e.target.value })} className={INPUT} />
        </Field>
        <Field label="Email" required={creating}>
          <input type="email" value={form.email ?? ''} onChange={(e) => onChange({ ...form, email: e.target.value })} className={INPUT} />
        </Field>
      </div>
      {creating && (() => {
        const issues = passwordIssues(password ?? '');
        const touched = (password ?? '').length > 0;
        return (
          <Field label="Password" required>
            <input type="password" value={password ?? ''} onChange={(e) => onPasswordChange?.(e.target.value)} className={INPUT} placeholder={`Min. ${PASSWORD_MIN} chars, mixed case, number & symbol`} autoComplete="new-password" />
            {touched && issues.length > 0 && (
              <p className="mt-1 text-xs text-red-600">Must include {issues.join(', ')}.</p>
            )}
            {touched && issues.length === 0 && (
              <p className="mt-1 text-xs text-green-600">Strong password.</p>
            )}
          </Field>
        );
      })()}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Username">
          <input type="text" value={form.username ?? ''} onChange={(e) => onChange({ ...form, username: e.target.value })} className={INPUT} />
        </Field>
        <Field label="Job Title">
          <input type="text" value={form.job_title ?? ''} onChange={(e) => onChange({ ...form, job_title: e.target.value })} className={INPUT} />
        </Field>
      </div>
      <Field label="Mobile Phone">
        <input type="text" value={form.mobile_phone ?? ''} onChange={(e) => onChange({ ...form, mobile_phone: e.target.value })} className={INPUT} />
      </Field>
      <Field label="Business Unit">
        <SearchableSelect
          options={[
            { value: '', label: '— None —' },
            ...businessUnits.map((bu) => ({ value: bu.business_unit_id, label: bu.name })),
          ]}
          value={form.business_unit_id ?? ''}
          onChange={(v) => onChange({ ...form, business_unit_id: v || null })}
          placeholder="— None —"
        />
      </Field>
      <div className="flex items-center gap-6 pt-1">
        <Toggle label="Active" checked={form.is_active ?? true} onChange={(v) => onChange({ ...form, is_active: v })} />
        <Toggle label="System Admin" checked={form.is_system_admin ?? false} onChange={(v) => onChange({ ...form, is_system_admin: v })} accent="amber" />
      </div>
    </div>
  );
}

function UserRolesPanel({
  roles, userRoles, onToggle,
}: {
  roles: SecurityRole[];
  userRoles: UserSecurityRole[];
  onToggle: (roleId: string) => void;
}) {
  const assigned = new Set(userRoles.map((r) => r.role_id));
  const assignedRoles = roles.filter((r) => assigned.has(r.role_id));
  const availableRoles = roles.filter((r) => !assigned.has(r.role_id));

  return (
    <div className="max-w-md space-y-4">
      {assignedRoles.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Assigned Roles ({assignedRoles.length})</p>
          <div className="space-y-1.5">
            {assignedRoles.map((r) => (
              <div key={r.role_id} onClick={() => onToggle(r.role_id)} className="flex items-center gap-3 p-3 rounded-xl border-2 border-blue-300 bg-blue-50 cursor-pointer hover:border-red-200 hover:bg-red-50 group transition-all">
                <div className="w-5 h-5 rounded-md flex items-center justify-center bg-blue-600 border-2 border-blue-600 shrink-0">
                  <Check size={11} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-slate-800 truncate">{r.name}</p>
                    {r.is_system && <span className="text-[9px] px-1 bg-amber-100 text-amber-700 rounded-full border border-amber-200 shrink-0">System</span>}
                  </div>
                  {r.description && <p className="text-[10px] text-slate-400 truncate">{r.description}</p>}
                </div>
                <ShieldCheck size={13} className="text-blue-500 group-hover:text-red-400 transition-colors shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {availableRoles.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Available Roles</p>
          <div className="space-y-1.5">
            {availableRoles.map((r) => (
              <div key={r.role_id} onClick={() => onToggle(r.role_id)} className="flex items-center gap-3 p-3 rounded-xl border-2 border-slate-200 bg-white hover:border-blue-300 cursor-pointer transition-all">
                <div className="w-5 h-5 rounded-md flex items-center justify-center border-2 border-slate-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-slate-700 truncate">{r.name}</p>
                    {r.is_system && <span className="text-[9px] px-1 bg-amber-50 text-amber-600 rounded-full border border-amber-100 shrink-0">System</span>}
                  </div>
                  {r.description && <p className="text-[10px] text-slate-400 truncate">{r.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {roles.length === 0 && <p className="text-xs text-slate-400">No roles defined yet. Create roles in the Security Roles tab.</p>}
    </div>
  );
}

const INPUT = 'w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400';

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange, accent = 'blue' }: { label: string; checked: boolean; onChange: (v: boolean) => void; accent?: string }) {
  const colors: Record<string, string> = { blue: 'bg-blue-500', amber: 'bg-amber-500' };
  const bg = colors[accent] ?? 'bg-blue-500';
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={() => onChange(!checked)} className={`w-8 h-4 rounded-full relative transition-colors ${checked ? bg : 'bg-slate-200'}`}>
        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
      </div>
      <span className="text-xs text-slate-600 font-medium">{label}</span>
    </label>
  );
}

function EmptyDetail({ icon, msg }: { icon: React.ReactNode; msg: string }) {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="text-center">
        <div className="flex justify-center mb-3">{icon}</div>
        <p className="text-xs text-slate-400">{msg}</p>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <RefreshCw size={20} className="animate-spin text-slate-400" />
    </div>
  );
}
