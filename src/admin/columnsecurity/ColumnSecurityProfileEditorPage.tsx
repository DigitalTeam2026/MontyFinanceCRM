import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Save, RefreshCw, ShieldCheck, ChevronDown, Search,
  Plus, Trash2, Users, User, Users as UsersIcon,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { ColumnSecurityProfile, ColumnSecurityProfileField, ColumnSecurityProfileAssignment } from '../../services/columnSecurityService';
import {
  createColumnSecurityProfile, updateColumnSecurityProfile,
  fetchProfileFields, saveProfileFields,
  fetchProfileAssignments, addProfileAssignment, removeProfileAssignment,
} from '../../services/columnSecurityService';
import { fetchEntities } from '../../services/entityService';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { fetchUsers, fetchTeams } from '../../services/securityService';
import type { EntityDefinition } from '../../types/entity';
import type { FieldDefinition } from '../../types/field';
import type { CrmUser, Team } from '../../types/security';

type Tab = 'fields' | 'assignments';

interface Props {
  profile?: ColumnSecurityProfile;
  onBack: () => void;
  onSaved: () => void;
}

interface LocalFieldRule {
  entity_name: string;
  field_name: string;
  can_read: boolean;
  can_update: boolean;
}

export default function ColumnSecurityProfileEditorPage({ profile, onBack, onSaved }: Props) {
  const { showSuccess, showError } = useToast();
  const [tab, setTab] = useState<Tab>('fields');
  const [name, setName] = useState(profile?.name ?? '');
  const [description, setDescription] = useState(profile?.description ?? '');
  const [isActive, setIsActive] = useState(profile?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [entityFields, setEntityFields] = useState<FieldDefinition[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldRules, setFieldRules] = useState<Record<string, LocalFieldRule>>({});
  const [fieldSearch, setFieldSearch] = useState('');

  const [assignments, setAssignments] = useState<ColumnSecurityProfileAssignment[]>([]);
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [addingPrincipal, setAddingPrincipal] = useState(false);
  const [principalType, setPrincipalType] = useState<'user' | 'team'>('user');
  const [principalId, setPrincipalId] = useState('');

  useEffect(() => {
    fetchEntities().then((ents) => {
      setEntities(ents);
      if (ents.length > 0) setSelectedEntityId(ents[0].entity_definition_id);
    }).catch(() => {});

    Promise.all([fetchUsers(), fetchTeams()]).then(([u, t]) => {
      setUsers(u);
      setTeams(t);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!profile) return;
    fetchProfileFields(profile.profile_id).then((rows) => {
      const map: Record<string, LocalFieldRule> = {};
      for (const row of rows) {
        map[`${row.entity_name}::${row.field_name}`] = {
          entity_name: row.entity_name,
          field_name: row.field_name,
          can_read: row.can_read,
          can_update: row.can_update,
        };
      }
      setFieldRules(map);
    }).catch(() => {});
  }, [profile]);

  const loadAssignments = useCallback(() => {
    if (!profile) return;
    setAssignmentLoading(true);
    fetchProfileAssignments(profile.profile_id).then(setAssignments).catch(() => {}).finally(() => setAssignmentLoading(false));
  }, [profile]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    if (!selectedEntityId) return;
    setFieldsLoading(true);
    fetchFieldsForEntity(selectedEntityId).then((fields) => {
      setEntityFields(fields.filter((f) => f.is_active));
    }).catch(() => {}).finally(() => setFieldsLoading(false));
  }, [selectedEntityId]);

  const selectedEntity = entities.find((e) => e.entity_definition_id === selectedEntityId);

  const filteredFields = entityFields.filter((f) =>
    f.display_name.toLowerCase().includes(fieldSearch.toLowerCase()) ||
    f.logical_name.toLowerCase().includes(fieldSearch.toLowerCase())
  );

  const ruleKey = (entityName: string, fieldName: string) => `${entityName}::${fieldName}`;

  const getRule = (entityName: string, fieldName: string): LocalFieldRule | undefined =>
    fieldRules[ruleKey(entityName, fieldName)];

  const setRule = (entityName: string, fieldName: string, can_read: boolean, can_update: boolean) => {
    const key = ruleKey(entityName, fieldName);
    setFieldRules((prev) => ({ ...prev, [key]: { entity_name: entityName, field_name: fieldName, can_read, can_update } }));
    setDirty(true);
  };

  const clearRule = (entityName: string, fieldName: string) => {
    const key = ruleKey(entityName, fieldName);
    setFieldRules((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { showError('Profile name is required'); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), description: description.trim(), is_active: isActive };
      let profileId = profile?.profile_id;
      if (profile) {
        await updateColumnSecurityProfile(profile.profile_id, payload);
      } else {
        const created = await createColumnSecurityProfile(payload);
        profileId = created.profile_id;
      }

      if (profileId) {
        const rules = Object.values(fieldRules);
        await saveProfileFields(profileId, rules);
      }

      setDirty(false);
      showSuccess('Profile saved');
      onSaved();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAssignment = async () => {
    if (!principalId || !profile) return;
    setAddingPrincipal(true);
    try {
      await addProfileAssignment(profile.profile_id, principalType, principalId);
      setPrincipalId('');
      showSuccess('Assignment added');
      loadAssignments();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to add assignment');
    } finally {
      setAddingPrincipal(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      await removeProfileAssignment(assignmentId);
      showSuccess('Assignment removed');
      loadAssignments();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to remove assignment');
    }
  };

  const resolveLabel = (assignment: ColumnSecurityProfileAssignment) => {
    if (assignment.principal_type === 'user') {
      const u = users.find((u) => u.user_id === assignment.principal_id);
      return u ? `${u.full_name || u.username} (${u.email})` : assignment.principal_id;
    }
    const t = teams.find((t) => t.team_id === assignment.principal_id);
    return t ? t.name : assignment.principal_id;
  };

  const getUnassignedPrincipals = () => {
    const assignedIds = new Set(
      assignments.filter((a) => a.principal_type === principalType).map((a) => a.principal_id)
    );
    if (principalType === 'user') {
      return users.filter((u) => !assignedIds.has(u.user_id) && u.is_active);
    }
    return teams.filter((t) => !assignedIds.has(t.team_id));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft size={13} /> Back
        </button>
        <div className="w-px h-4 bg-slate-200" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center shrink-0">
            <ShieldCheck size={12} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-800 leading-none truncate">
              {profile ? profile.name : 'New Column Security Profile'}
            </p>
            {profile && <p className="text-[10px] text-slate-400 mt-0.5">Editing profile</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-[11px] text-amber-600 font-medium">Unsaved changes</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium rounded transition-colors disabled:opacity-40"
          >
            {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 px-4 py-3 shrink-0 flex gap-6">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Profile Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
            placeholder="e.g. Finance Read-Only"
            className="px-2.5 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 w-72 placeholder:text-slate-300"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
            placeholder="Optional description"
            className="px-2.5 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 w-80 placeholder:text-slate-300"
          />
        </div>
        <div className="flex flex-col gap-1 justify-center">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Active</label>
          <button
            onClick={() => { setIsActive((v) => !v); setDirty(true); }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isActive ? 'bg-blue-600' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow ${isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 px-4 flex items-center gap-0 shrink-0">
        {(['fields', 'assignments'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {t === 'fields' ? <ShieldCheck size={12} /> : <UsersIcon size={12} />}
            {t === 'fields' ? 'Field Rules' : 'Assignments'}
          </button>
        ))}
      </div>

      {tab === 'fields' && (
        <div className="flex-1 overflow-auto">
          <div className="flex h-full min-h-0">
            <div className="w-48 border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
              <p className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Entities</p>
              <div className="flex-1 overflow-y-auto">
                {entities.map((e) => {
                  const ruleCount = Object.values(fieldRules).filter((r) => r.entity_name === e.logical_name).length;
                  return (
                    <button
                      key={e.entity_definition_id}
                      onClick={() => setSelectedEntityId(e.entity_definition_id)}
                      className={`w-full text-left px-3 py-2 text-[12px] transition-colors flex items-center justify-between gap-2 ${
                        selectedEntityId === e.entity_definition_id
                          ? 'bg-blue-600/10 text-blue-700 font-medium'
                          : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      <span className="truncate">{e.display_name}</span>
                      {ruleCount > 0 && (
                        <span className="text-[9px] font-semibold bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full shrink-0">
                          {ruleCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-2 shrink-0">
                <p className="text-[12px] font-semibold text-slate-700 flex-1">
                  {selectedEntity?.display_name ?? 'Select an entity'}
                </p>
                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search fields..."
                    value={fieldSearch}
                    onChange={(e) => setFieldSearch(e.target.value)}
                    className="pl-7 pr-3 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 w-44 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-auto px-4 py-3">
                {fieldsLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <RefreshCw size={16} className="animate-spin text-slate-400" />
                  </div>
                ) : filteredFields.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-[12px] text-slate-400">No fields found</div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded overflow-hidden">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Field</th>
                          <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Logical Name</th>
                          <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Col. Security</th>
                          <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Can Read</th>
                          <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Can Update</th>
                          <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Access Result</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredFields.map((field) => {
                          const entityName = selectedEntity?.logical_name ?? '';
                          const rule = getRule(entityName, field.logical_name);
                          const isSecured = field.is_secured;

                          return (
                            <tr key={field.field_definition_id} className={`transition-colors ${rule ? 'bg-blue-50/30' : 'hover:bg-slate-50/50'}`}>
                              <td className="px-3 py-2.5">
                                <span className="font-medium text-slate-800">{field.display_name}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <code className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">{field.logical_name}</code>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {isSecured ? (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium bg-blue-50 border-blue-300 text-blue-700">
                                    <ShieldCheck size={8} /> Secured
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-300">Not secured</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={rule?.can_read ?? false}
                                  onChange={(e) => {
                                    const canRead = e.target.checked;
                                    setRule(entityName, field.logical_name, canRead, canRead ? (rule?.can_update ?? false) : false);
                                  }}
                                  className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                                />
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={rule?.can_update ?? false}
                                  disabled={!rule?.can_read}
                                  onChange={(e) => {
                                    if (rule?.can_read) {
                                      setRule(entityName, field.logical_name, true, e.target.checked);
                                    }
                                  }}
                                  className="w-3.5 h-3.5 accent-blue-600 cursor-pointer disabled:opacity-30"
                                />
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {!rule ? (
                                  <span className="text-[10px] text-slate-300">—</span>
                                ) : !rule.can_read ? (
                                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">Masked</span>
                                ) : !rule.can_update ? (
                                  <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Read Only</span>
                                ) : (
                                  <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">Editable</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 w-8">
                                {rule && (
                                  <button
                                    onClick={() => clearRule(entityName, field.logical_name)}
                                    title="Remove rule"
                                    className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'assignments' && (
        <div className="flex-1 overflow-auto px-4 py-4">
          {!profile ? (
            <div className="flex items-center justify-center h-40 text-center">
              <div>
                <p className="text-[12px] text-slate-500">Save the profile first to manage assignments.</p>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl space-y-4">
              <div className="bg-white border border-slate-200 rounded p-4">
                <p className="text-[12px] font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                  <Plus size={12} /> Add Assignment
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={principalType}
                      onChange={(e) => { setPrincipalType(e.target.value as 'user' | 'team'); setPrincipalId(''); }}
                      className="appearance-none pl-2.5 pr-6 py-1.5 text-[12px] border border-slate-300 rounded bg-white focus:outline-none focus:border-blue-400"
                    >
                      <option value="user">User</option>
                      <option value="team">Team</option>
                    </select>
                    <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <div className="relative flex-1">
                    <select
                      value={principalId}
                      onChange={(e) => setPrincipalId(e.target.value)}
                      className="appearance-none w-full pl-2.5 pr-6 py-1.5 text-[12px] border border-slate-300 rounded bg-white focus:outline-none focus:border-blue-400"
                    >
                      <option value="">Select {principalType}...</option>
                      {getUnassignedPrincipals().map((p) => {
                        const isUser = principalType === 'user';
                        const u = p as CrmUser;
                        const t = p as Team;
                        return (
                          <option key={isUser ? u.user_id : t.team_id} value={isUser ? u.user_id : t.team_id}>
                            {isUser ? `${u.full_name || u.username} (${u.email})` : t.name}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <button
                    onClick={handleAddAssignment}
                    disabled={!principalId || addingPrincipal}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium rounded transition-colors disabled:opacity-40"
                  >
                    {addingPrincipal ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />}
                    Add
                  </button>
                </div>
              </div>

              {assignmentLoading ? (
                <div className="flex items-center justify-center h-20">
                  <RefreshCw size={14} className="animate-spin text-slate-400" />
                </div>
              ) : assignments.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded p-6 text-center">
                  <Users size={24} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-[12px] text-slate-500">No assignments yet. Add users or teams above.</p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Principal</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {assignments.map((a) => (
                        <tr key={a.assignment_id} className="hover:bg-slate-50 group">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center">
                                {a.principal_type === 'user' ? <User size={10} className="text-slate-500" /> : <UsersIcon size={10} className="text-slate-500" />}
                              </div>
                              <span className="font-medium text-slate-700">{resolveLabel(a)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize ${
                              a.principal_type === 'user'
                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            }`}>
                              {a.principal_type}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 w-10 text-right">
                            <button
                              onClick={() => handleRemoveAssignment(a.assignment_id)}
                              title="Remove assignment"
                              className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded"
                            >
                              <Trash2 size={11} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
