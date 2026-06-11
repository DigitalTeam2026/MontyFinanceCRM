import { useEffect, useState } from 'react';
import {
  Plus, Trash2, RefreshCw, Search,
  Users, UserPlus, UserMinus, ShieldCheck, Check,
} from 'lucide-react';
import SearchableSelect from '../../app/components/SearchableSelect';
import { useToast } from '../../app/context/ToastContext';
import type { Team, TeamUser, CrmUser, SecurityRole, TeamSecurityRole, BusinessUnit } from '../../types/security';
import {
  fetchTeams, createTeam, updateTeam, softDeleteTeam,
  fetchTeamMembers, addTeamMember, removeTeamMember,
  fetchTeamRoles, assignRoleToTeam, removeRoleFromTeam,
  fetchBusinessUnits,
} from '../../services/securityService';
import { fetchUsers, fetchSecurityRoles } from '../../services/securityService';
import ConfirmDialog from '../components/ConfirmDialog';

type Tab = 'details' | 'members' | 'roles';

export default function TeamsPage() {
  const { showSuccess, showError } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [allUsers, setAllUsers] = useState<CrmUser[]>([]);
  const [allRoles, setAllRoles] = useState<SecurityRole[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Team | null>(null);
  const [tab, setTab] = useState<Tab>('details');
  const [members, setMembers] = useState<TeamUser[]>([]);
  const [teamRoles, setTeamRoles] = useState<TeamSecurityRole[]>([]);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', business_unit_id: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([fetchTeams(), fetchUsers(), fetchSecurityRoles(), fetchBusinessUnits()])
      .then(([t, u, r, b]) => { setTeams(t); setAllUsers(u); setAllRoles(r); setBusinessUnits(b); })
      .catch((e) => showError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const selectTeam = async (team: Team) => {
    setSelected(team);
    setForm({ name: team.name, description: team.description ?? '', business_unit_id: team.business_unit_id });
    setTab('details');
    const [m, r] = await Promise.all([fetchTeamMembers(team.team_id), fetchTeamRoles(team.team_id)]);
    setMembers(m);
    setTeamRoles(r);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) {
        const created = await createTeam({
          business_unit_id: form.business_unit_id || businessUnits[0]?.business_unit_id || '',
          name: form.name.trim(),
          description: form.description.trim() || null,
        });
        setTeams((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setCreating(false);
        selectTeam(created);
        showSuccess('Team created');
      } else if (selected) {
        const updated = await updateTeam(selected.team_id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          business_unit_id: form.business_unit_id || selected.business_unit_id,
        });
        setTeams((prev) => prev.map((t) => t.team_id === updated.team_id ? updated : t));
        setSelected(updated);
        showSuccess('Team saved');
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await softDeleteTeam(deleteTarget.team_id);
    setTeams((prev) => prev.filter((t) => t.team_id !== deleteTarget.team_id));
    if (selected?.team_id === deleteTarget.team_id) setSelected(null);
    setDeleteTarget(null);
  };

  const handleToggleMember = async (userId: string) => {
    if (!selected) return;
    const has = members.some((m) => m.user_id === userId);
    if (has) {
      await removeTeamMember(selected.team_id, userId);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } else {
      await addTeamMember(selected.team_id, userId);
      const updated = await fetchTeamMembers(selected.team_id);
      setMembers(updated);
    }
  };

  const handleToggleRole = async (roleId: string) => {
    if (!selected) return;
    const has = teamRoles.some((r) => r.role_id === roleId);
    if (has) {
      await removeRoleFromTeam(selected.team_id, roleId);
      setTeamRoles((prev) => prev.filter((r) => r.role_id !== roleId));
    } else {
      await assignRoleToTeam(selected.team_id, roleId);
      const updated = await fetchTeamRoles(selected.team_id);
      setTeamRoles(updated);
    }
  };

  const filteredTeams = teams.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
  const buMap = Object.fromEntries(businessUnits.map((b) => [b.business_unit_id, b.name]));
  const memberSet = new Set(members.map((m) => m.user_id));
  const roleSet = new Set(teamRoles.map((r) => r.role_id));

  if (loading) return <div className="flex-1 flex items-center justify-center"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>;

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      <div className="w-72 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-100 space-y-2">
          <div className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input type="text" placeholder="Search teams..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 text-xs bg-transparent border-0 focus:outline-none placeholder:text-slate-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredTeams.map((t) => (
            <div
              key={t.team_id}
              onClick={() => { setCreating(false); selectTeam(t); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-slate-50 ${selected?.team_id === t.team_id && !creating ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
            >
              <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold shrink-0">
                {t.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{t.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{buMap[t.business_unit_id] ?? 'No BU'}</p>
              </div>
            </div>
          ))}
          {filteredTeams.length === 0 && <p className="text-xs text-slate-400 p-4 text-center">No teams found</p>}
        </div>

        <div className="p-3 border-t border-slate-100">
          <button onClick={() => { setSelected(null); setForm({ name: '', description: '', business_unit_id: businessUnits[0]?.business_unit_id ?? '' }); setCreating(true); }} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-100">
            <Plus size={13} /> New Team
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {creating ? (
          <div className="p-6 max-w-md">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">New Team</h3>
            <TeamForm form={form} onChange={setForm} businessUnits={businessUnits} />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setCreating(false)} className="flex-1 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="flex-1 py-2 text-xs bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium rounded-lg flex items-center justify-center gap-1.5">
                {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />} Create Team
              </button>
            </div>
          </div>
        ) : selected ? (
          <>
            <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-sm font-bold">{selected.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{selected.name}</p>
                <p className="text-[10px] text-slate-400">{buMap[selected.business_unit_id] ?? 'No BU'} · {members.length} member{members.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                  {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />} Save
                </button>
                <button onClick={() => setDeleteTarget(selected)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
              </div>
            </div>

            <div className="flex border-b border-slate-200 bg-white px-5">
              {(['details', 'members', 'roles'] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {t}
                  {t === 'members' && ` (${members.length})`}
                  {t === 'roles' && ` (${teamRoles.length})`}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'details' && (
                <div className="max-w-md">
                  <TeamForm form={form} onChange={setForm} businessUnits={businessUnits} />
                </div>
              )}
              {tab === 'members' && (
                <MembersTab allUsers={allUsers} memberSet={memberSet} onToggle={handleToggleMember} />
              )}
              {tab === 'roles' && (
                <RolesTab allRoles={allRoles} roleSet={roleSet} onToggle={handleToggleRole} />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Users size={28} className="text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Select a team or create a new one</p>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Team"
          message={`Delete "${deleteTarget.name}"? Members will be unassigned.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}
    </div>
  );
}

function TeamForm({ form, onChange, businessUnits }: { form: { name: string; description: string; business_unit_id: string }; onChange: (f: typeof form) => void; businessUnits: BusinessUnit[] }) {
  return (
    <div className="space-y-3">
      <div>
        <label className={LBL}>Team Name *</label>
        <input type="text" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} className={INPUT} placeholder="e.g. Sales West" />
      </div>
      <div>
        <label className={LBL}>Description</label>
        <textarea value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} rows={2} className={INPUT + ' resize-none'} placeholder="Optional..." />
      </div>
      <div>
        <label className={LBL}>Business Unit</label>
        <SearchableSelect
          options={[
            { value: '', label: '— None —' },
            ...businessUnits.map((b) => ({ value: b.business_unit_id, label: b.name })),
          ]}
          value={form.business_unit_id}
          onChange={(v) => onChange({ ...form, business_unit_id: v })}
          placeholder="— None —"
        />
      </div>
    </div>
  );
}

function MembersTab({ allUsers, memberSet, onToggle }: { allUsers: CrmUser[]; memberSet: Set<string>; onToggle: (uid: string) => void }) {
  const [search, setSearch] = useState('');
  const filtered = allUsers.filter((u) => u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));
  const members = filtered.filter((u) => memberSet.has(u.user_id));
  const nonMembers = filtered.filter((u) => !memberSet.has(u.user_id));

  return (
    <div className="max-w-lg space-y-3">
      <div className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg">
        <Search size={13} className="text-slate-400 shrink-0" />
        <input type="text" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 text-xs bg-transparent border-0 focus:outline-none placeholder:text-slate-400" />
      </div>
      {members.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Members ({members.length})</p>
          <div className="space-y-1.5">
            {members.map((u) => (
              <div key={u.user_id} className="flex items-center gap-2.5 p-2.5 bg-teal-50 border border-teal-200 rounded-xl">
                <div className="w-7 h-7 rounded-full bg-teal-200 text-teal-800 flex items-center justify-center text-[10px] font-bold shrink-0">{u.full_name.slice(0,2).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{u.full_name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                </div>
                <button onClick={() => onToggle(u.user_id)} className="p-1 text-teal-400 hover:text-red-500 transition-colors"><UserMinus size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      {nonMembers.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Add Members</p>
          <div className="space-y-1.5">
            {nonMembers.map((u) => (
              <div key={u.user_id} className="flex items-center gap-2.5 p-2.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">{u.full_name.slice(0,2).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{u.full_name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                </div>
                <button onClick={() => onToggle(u.user_id)} className="p-1 text-slate-400 hover:text-teal-600 transition-colors"><UserPlus size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RolesTab({ allRoles, roleSet, onToggle }: { allRoles: SecurityRole[]; roleSet: Set<string>; onToggle: (roleId: string) => void }) {
  return (
    <div className="max-w-lg space-y-2">
      <p className="text-xs font-semibold text-slate-500 mb-3">Assigned Security Roles</p>
      {allRoles.length === 0 && <p className="text-xs text-slate-400">No roles defined yet.</p>}
      {allRoles.map((r) => {
        const has = roleSet.has(r.role_id);
        return (
          <div key={r.role_id} onClick={() => onToggle(r.role_id)} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${has ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-colors ${has ? 'bg-teal-600 border-teal-600' : 'border-slate-300'}`}>
              {has && <Check size={11} className="text-white" />}
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-800">{r.name}</p>
              {r.description && <p className="text-[10px] text-slate-400">{r.description}</p>}
            </div>
            {has && <ShieldCheck size={13} className="text-teal-500 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

const INPUT = 'w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-teal-400';
const LBL = 'block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1';
