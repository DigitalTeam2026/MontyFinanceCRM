import { supabase } from '../lib/supabase';
import type {
  CrmUser,
  BusinessUnit,
  Team,
  TeamUser,
  SecurityRole,
  UserSecurityRole,
  TeamSecurityRole,
  RolePrivilege,
} from '../types/security';

// ─── Users ───────────────────────────────────────────────────────────────────

export async function createUser(payload: {
  email: string;
  password: string;
  full_name?: string;
  username?: string;
  job_title?: string;
  mobile_phone?: string;
  business_unit_id?: string | null;
  is_active?: boolean;
  is_system_admin?: boolean;
}): Promise<CrmUser> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-crm-user`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Failed to create user');
  return json.user as CrmUser;
}

export async function fetchUsers(): Promise<CrmUser[]> {
  const { data, error } = await supabase
    .from('crm_user')
    .select('*')
    .is('deleted_at', null)
    .order('full_name');
  if (error) throw error;
  return data as CrmUser[];
}

export async function upsertUser(user: Partial<CrmUser> & { user_id: string }): Promise<CrmUser> {
  const { data, error } = await supabase
    .from('crm_user')
    .upsert({ ...user, modified_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as CrmUser;
}

export async function softDeleteUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('crm_user')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('user_id', userId);
  if (error) throw error;
}

export async function fetchUserRoles(userId: string): Promise<UserSecurityRole[]> {
  const { data, error } = await supabase
    .from('user_security_role')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data as UserSecurityRole[];
}

export async function assignRoleToUser(userId: string, roleId: string): Promise<void> {
  const { error } = await supabase
    .from('user_security_role')
    .insert({ user_id: userId, role_id: roleId });
  if (error) throw error;
}

export async function removeRoleFromUser(userId: string, roleId: string): Promise<void> {
  const { error } = await supabase
    .from('user_security_role')
    .delete()
    .eq('user_id', userId)
    .eq('role_id', roleId);
  if (error) throw error;
}

// ─── Business Units ───────────────────────────────────────────────────────────

export async function fetchBusinessUnits(): Promise<BusinessUnit[]> {
  const { data, error } = await supabase
    .from('business_unit')
    .select('*')
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return data as BusinessUnit[];
}

export async function createBusinessUnit(payload: {
  organization_id: string;
  name: string;
  description?: string | null;
  parent_business_unit_id?: string | null;
}): Promise<BusinessUnit> {
  const { data, error } = await supabase
    .from('business_unit')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as BusinessUnit;
}

export async function updateBusinessUnit(
  id: string,
  updates: Partial<Pick<BusinessUnit, 'name' | 'description' | 'parent_business_unit_id' | 'is_active'>>
): Promise<BusinessUnit> {
  const { data, error } = await supabase
    .from('business_unit')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('business_unit_id', id)
    .select()
    .single();
  if (error) throw error;
  return data as BusinessUnit;
}

export async function softDeleteBusinessUnit(id: string): Promise<void> {
  const { error } = await supabase
    .from('business_unit')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('business_unit_id', id);
  if (error) throw error;
}

export async function fetchOrganizationId(): Promise<string | null> {
  const { data } = await supabase.from('organization').select('organization_id').limit(1).maybeSingle();
  return data?.organization_id ?? null;
}

// ─── Teams ────────────────────────────────────────────────────────────────────

export async function fetchTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from('team')
    .select('*')
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return data as Team[];
}

export async function createTeam(payload: {
  business_unit_id: string;
  name: string;
  description?: string | null;
  team_type?: string;
}): Promise<Team> {
  const { data, error } = await supabase
    .from('team')
    .insert({ ...payload, team_type: payload.team_type ?? 'standard' })
    .select()
    .single();
  if (error) throw error;
  return data as Team;
}

export async function updateTeam(
  id: string,
  updates: Partial<Pick<Team, 'name' | 'description' | 'business_unit_id' | 'is_active'>>
): Promise<Team> {
  const { data, error } = await supabase
    .from('team')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('team_id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Team;
}

export async function softDeleteTeam(id: string): Promise<void> {
  const { error } = await supabase
    .from('team')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('team_id', id);
  if (error) throw error;
}

export async function fetchTeamMembers(teamId: string): Promise<TeamUser[]> {
  const { data, error } = await supabase
    .from('team_user')
    .select('*')
    .eq('team_id', teamId);
  if (error) throw error;
  return data as TeamUser[];
}

export async function addTeamMember(teamId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('team_user')
    .insert({ team_id: teamId, user_id: userId });
  if (error) throw error;
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('team_user')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function fetchTeamRoles(teamId: string): Promise<TeamSecurityRole[]> {
  const { data, error } = await supabase
    .from('team_security_role')
    .select('*')
    .eq('team_id', teamId);
  if (error) throw error;
  return data as TeamSecurityRole[];
}

export async function assignRoleToTeam(teamId: string, roleId: string): Promise<void> {
  const { error } = await supabase
    .from('team_security_role')
    .insert({ team_id: teamId, role_id: roleId });
  if (error) throw error;
}

export async function removeRoleFromTeam(teamId: string, roleId: string): Promise<void> {
  const { error } = await supabase
    .from('team_security_role')
    .delete()
    .eq('team_id', teamId)
    .eq('role_id', roleId);
  if (error) throw error;
}

// ─── Security Roles ───────────────────────────────────────────────────────────

export async function fetchSecurityRoles(): Promise<SecurityRole[]> {
  const { data, error } = await supabase
    .from('security_role')
    .select('*')
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return data as SecurityRole[];
}

export async function createSecurityRole(payload: {
  name: string;
  description?: string | null;
  business_unit_id?: string | null;
}): Promise<SecurityRole> {
  const { data, error } = await supabase
    .from('security_role')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as SecurityRole;
}

export async function updateSecurityRole(
  id: string,
  updates: Partial<Pick<SecurityRole, 'name' | 'description' | 'is_active'>>
): Promise<SecurityRole> {
  // Fetch current name to guard System Administrator
  const { data: existing } = await supabase.from('security_role').select('name').eq('role_id', id).maybeSingle();
  if (existing?.name === 'System Administrator') {
    throw new Error('The System Administrator role cannot be modified.');
  }
  const { data, error } = await supabase
    .from('security_role')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('role_id', id)
    .select()
    .single();
  if (error) throw error;
  return data as SecurityRole;
}

export async function softDeleteSecurityRole(id: string): Promise<void> {
  const { data: existing } = await supabase.from('security_role').select('name').eq('role_id', id).maybeSingle();
  if (existing?.name === 'System Administrator') {
    throw new Error('The System Administrator role cannot be deleted.');
  }
  const { error } = await supabase
    .from('security_role')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('role_id', id);
  if (error) throw error;
}

export async function cloneSecurityRole(roleId: string, newName: string): Promise<SecurityRole> {
  const [privRes, srcRes, actionRes, formRes, flowRes] = await Promise.all([
    fetchPrivilegesForRole(roleId),
    supabase.from('security_role').select('*').eq('role_id', roleId).single(),
    fetchActionPermissionsForRole(roleId),
    fetchFormPermissionsForRole(roleId),
    fetchFlowPermissionsForRole(roleId),
  ]);
  if (srcRes.error) throw srcRes.error;
  const src = srcRes.data as SecurityRole;

  const cloned = await createSecurityRole({
    name: newName,
    description: src.description,
    business_unit_id: src.business_unit_id,
  });

  if (privRes.length > 0) {
    const clonedPrivs = privRes.map(({ privilege_id: _pid, created_at: _ca, modified_at: _ma, role_id: _rid, ...rest }) => ({
      ...rest,
      role_id: cloned.role_id,
    }));
    const { error } = await supabase.from('role_privilege').insert(clonedPrivs);
    if (error) throw error;
  }

  if (actionRes.length > 0) {
    const clonedActions = actionRes.map(({ action_permission_id: _id, role_id: _rid, ...rest }) => ({
      ...rest,
      role_id: cloned.role_id,
    }));
    await supabase.from('action_permission').insert(clonedActions);
  }

  if (formRes.length > 0) {
    const clonedForms = formRes.map(({ form_permission_id: _id, role_id: _rid, ...rest }) => ({
      ...rest,
      role_id: cloned.role_id,
    }));
    await supabase.from('form_permission').insert(clonedForms);
  }

  if (flowRes.length > 0) {
    const clonedFlows = flowRes.map(({ process_flow_permission_id: _id, role_id: _rid, ...rest }) => ({
      ...rest,
      role_id: cloned.role_id,
    }));
    await supabase.from('process_flow_permission').insert(clonedFlows);
  }

  return cloned;
}

// ─── Privileges ───────────────────────────────────────────────────────────────

export async function fetchPrivilegesForRole(roleId: string): Promise<RolePrivilege[]> {
  const { data, error } = await supabase
    .from('role_privilege')
    .select('*')
    .eq('role_id', roleId);
  if (error) throw error;
  return data as RolePrivilege[];
}

export async function savePrivilegesForRole(
  roleId: string,
  privileges: Omit<RolePrivilege, 'privilege_id' | 'created_at' | 'modified_at' | 'access_level'>[]
): Promise<void> {
  const { error: delErr } = await supabase
    .from('role_privilege')
    .delete()
    .eq('role_id', roleId);
  if (delErr) throw delErr;

  if (privileges.length === 0) return;
  const { error } = await supabase.from('role_privilege').insert(privileges);
  if (error) throw error;
}

// ─── Field Permissions ────────────────────────────────────────────────────────

export interface FieldPermissionRow {
  field_permission_id: string;
  role_id: string;
  entity_name: string;
  field_name: string;
  is_hidden: boolean;
  is_readonly: boolean;
}

export async function fetchFieldPermissionsForRole(roleId: string): Promise<FieldPermissionRow[]> {
  const { data, error } = await supabase
    .from('field_permission')
    .select('*')
    .eq('role_id', roleId);
  if (error) throw error;
  return data as FieldPermissionRow[];
}

export async function saveFieldPermissionsForRole(
  roleId: string,
  permissions: { entity_name: string; field_name: string; is_hidden: boolean; is_readonly: boolean }[]
): Promise<void> {
  const { error: delErr } = await supabase
    .from('field_permission')
    .delete()
    .eq('role_id', roleId);
  if (delErr) throw delErr;

  if (permissions.length === 0) return;
  const rows = permissions.map((p) => ({ ...p, role_id: roleId }));
  const { error } = await supabase.from('field_permission').insert(rows);
  if (error) throw error;
}

// ─── Section Permissions ──────────────────────────────────────────────────────

export interface SectionPermissionRow {
  section_permission_id: string;
  role_id: string;
  entity_name: string;
  section_id: string;
  section_label: string;
  is_hidden: boolean;
}

export async function fetchSectionPermissionsForRole(roleId: string): Promise<SectionPermissionRow[]> {
  const { data, error } = await supabase
    .from('section_permission')
    .select('*')
    .eq('role_id', roleId);
  if (error) throw error;
  return data as SectionPermissionRow[];
}

export async function saveSectionPermissionsForRole(
  roleId: string,
  permissions: { entity_name: string; section_id: string; section_label: string; is_hidden: boolean }[]
): Promise<void> {
  const { error: delErr } = await supabase
    .from('section_permission')
    .delete()
    .eq('role_id', roleId);
  if (delErr) throw delErr;

  if (permissions.length === 0) return;
  const rows = permissions.map((p) => ({ ...p, role_id: roleId }));
  const { error } = await supabase.from('section_permission').insert(rows);
  if (error) throw error;
}

// ─── Action Permissions ───────────────────────────────────────────────────────

export interface ActionDefinition {
  action_key: string;
  action_label: string;
  entity_name: string;
}

export const STANDARD_ACTION_KEYS: { action_key: string; action_label: string }[] = [
  { action_key: 'bulk_delete',       action_label: 'Bulk Delete' },
  { action_key: 'bulk_assign',       action_label: 'Bulk Assign' },
  { action_key: 'bulk_edit',         action_label: 'Bulk Edit' },
  { action_key: 'activate',          action_label: 'Activate' },
  { action_key: 'deactivate',        action_label: 'Deactivate' },
  { action_key: 'export_to_csv',     action_label: 'Export To CSV' },
  { action_key: 'export_to_excel',   action_label: 'Export To Excel' },
  { action_key: 'import_from_excel', action_label: 'Import From Excel' },
];

export function buildActionsForEntities(entityLogicalNames: string[]): ActionDefinition[] {
  return entityLogicalNames.flatMap((name) =>
    STANDARD_ACTION_KEYS.map((a) => ({ ...a, entity_name: name }))
  );
}

export interface ActionPermissionRow {
  action_permission_id: string;
  role_id: string;
  entity_name: string;
  action_key: string;
  action_label: string;
  is_denied: boolean;
}

export async function fetchActionPermissionsForRole(roleId: string): Promise<ActionPermissionRow[]> {
  const { data, error } = await supabase
    .from('action_permission')
    .select('*')
    .eq('role_id', roleId);
  if (error) throw error;
  return data as ActionPermissionRow[];
}

export async function saveActionPermissionsForRole(
  roleId: string,
  permissions: { entity_name: string; action_key: string; action_label: string; is_denied: boolean }[]
): Promise<void> {
  const { error: delErr } = await supabase
    .from('action_permission')
    .delete()
    .eq('role_id', roleId);
  if (delErr) throw delErr;

  const denied = permissions.filter((p) => p.is_denied);
  if (denied.length === 0) return;
  const rows = denied.map((p) => ({ ...p, role_id: roleId }));
  const { error } = await supabase.from('action_permission').insert(rows);
  if (error) throw error;
}

// ─── Form Permissions ─────────────────────────────────────────────────────────
//
// Controls WHICH forms a role may use for an entity. Deny-by-default: only forms
// with an `is_allowed = true` row are available to the role. Generic by design —
// rows reference the entity by logical name and the form by form_id, so any new
// entity or form is supported with no code changes.

export interface FormPermissionRow {
  form_permission_id: string;
  role_id: string;
  entity_name: string;
  form_id: string;
  is_allowed: boolean;
}

export async function fetchFormPermissionsForRole(roleId: string): Promise<FormPermissionRow[]> {
  const { data, error } = await supabase
    .from('form_permission')
    .select('*')
    .eq('role_id', roleId);
  if (error) throw error;
  return data as FormPermissionRow[];
}

export async function saveFormPermissionsForRole(
  roleId: string,
  permissions: { entity_name: string; form_id: string; is_allowed: boolean }[]
): Promise<void> {
  const { error: delErr } = await supabase
    .from('form_permission')
    .delete()
    .eq('role_id', roleId);
  if (delErr) throw delErr;

  // Persist only granted forms; absence of a row means denied.
  const allowed = permissions.filter((p) => p.is_allowed);
  if (allowed.length === 0) return;
  const rows = allowed.map((p) => ({
    role_id: roleId,
    entity_name: p.entity_name,
    form_id: p.form_id,
    is_allowed: true,
  }));
  const { error } = await supabase.from('form_permission').insert(rows);
  if (error) throw error;
}

// ─── Process Flow Permissions ─────────────────────────────────────────────────
//
// Controls which business process flows a role may use. Deny-by-default, mirroring
// form_permission. A process flow can be linked to a form, so both dimensions are
// checked at runtime when a record is created/edited.

export interface ProcessFlowPermissionRow {
  process_flow_permission_id: string;
  role_id: string;
  process_flow_id: string;
  is_allowed: boolean;
}

export async function fetchFlowPermissionsForRole(roleId: string): Promise<ProcessFlowPermissionRow[]> {
  const { data, error } = await supabase
    .from('process_flow_permission')
    .select('*')
    .eq('role_id', roleId);
  if (error) throw error;
  return data as ProcessFlowPermissionRow[];
}

export async function saveFlowPermissionsForRole(
  roleId: string,
  permissions: { process_flow_id: string; is_allowed: boolean }[]
): Promise<void> {
  const { error: delErr } = await supabase
    .from('process_flow_permission')
    .delete()
    .eq('role_id', roleId);
  if (delErr) throw delErr;

  // Persist only granted flows; absence of a row means denied.
  const allowed = permissions.filter((p) => p.is_allowed);
  if (allowed.length === 0) return;
  const rows = allowed.map((p) => ({
    role_id: roleId,
    process_flow_id: p.process_flow_id,
    is_allowed: true,
  }));
  const { error } = await supabase.from('process_flow_permission').insert(rows);
  if (error) throw error;
}
