import { supabase } from '../lib/supabase';

export interface ColumnSecurityProfile {
  profile_id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  modified_at: string;
}

export interface ColumnSecurityProfileField {
  profile_field_id: string;
  profile_id: string;
  entity_name: string;
  field_name: string;
  can_read: boolean;
  can_update: boolean;
}

export interface ColumnSecurityProfileAssignment {
  assignment_id: string;
  profile_id: string;
  principal_type: 'user' | 'team';
  principal_id: string;
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export async function fetchColumnSecurityProfiles(): Promise<ColumnSecurityProfile[]> {
  const { data, error } = await supabase
    .from('column_security_profile')
    .select('*')
    .order('name');
  if (error) throw error;
  return data as ColumnSecurityProfile[];
}

export async function fetchColumnSecurityProfile(profileId: string): Promise<ColumnSecurityProfile> {
  const { data, error } = await supabase
    .from('column_security_profile')
    .select('*')
    .eq('profile_id', profileId)
    .single();
  if (error) throw error;
  return data as ColumnSecurityProfile;
}

export async function createColumnSecurityProfile(
  payload: Pick<ColumnSecurityProfile, 'name' | 'description' | 'is_active'>
): Promise<ColumnSecurityProfile> {
  const { data, error } = await supabase
    .from('column_security_profile')
    .insert({ ...payload, modified_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as ColumnSecurityProfile;
}

export async function updateColumnSecurityProfile(
  profileId: string,
  payload: Partial<Pick<ColumnSecurityProfile, 'name' | 'description' | 'is_active'>>
): Promise<ColumnSecurityProfile> {
  const { data, error } = await supabase
    .from('column_security_profile')
    .update({ ...payload, modified_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .select()
    .single();
  if (error) throw error;
  return data as ColumnSecurityProfile;
}

export async function deleteColumnSecurityProfile(profileId: string): Promise<void> {
  const { error } = await supabase
    .from('column_security_profile')
    .delete()
    .eq('profile_id', profileId);
  if (error) throw error;
}

// ─── Profile Fields ───────────────────────────────────────────────────────────

export async function fetchProfileFields(profileId: string): Promise<ColumnSecurityProfileField[]> {
  const { data, error } = await supabase
    .from('column_security_profile_field')
    .select('*')
    .eq('profile_id', profileId);
  if (error) throw error;
  return data as ColumnSecurityProfileField[];
}

export async function saveProfileFields(
  profileId: string,
  fields: { entity_name: string; field_name: string; can_read: boolean; can_update: boolean }[]
): Promise<void> {
  const { error: delErr } = await supabase
    .from('column_security_profile_field')
    .delete()
    .eq('profile_id', profileId);
  if (delErr) throw delErr;

  if (fields.length === 0) return;
  const rows = fields.map((f) => ({ ...f, profile_id: profileId }));
  const { error } = await supabase.from('column_security_profile_field').insert(rows);
  if (error) throw error;
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export async function fetchProfileAssignments(profileId: string): Promise<ColumnSecurityProfileAssignment[]> {
  const { data, error } = await supabase
    .from('column_security_profile_assignment')
    .select('*')
    .eq('profile_id', profileId);
  if (error) throw error;
  return data as ColumnSecurityProfileAssignment[];
}

export async function addProfileAssignment(
  profileId: string,
  principalType: 'user' | 'team',
  principalId: string
): Promise<void> {
  const { error } = await supabase
    .from('column_security_profile_assignment')
    .insert({ profile_id: profileId, principal_type: principalType, principal_id: principalId });
  if (error) throw error;
}

export async function removeProfileAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase
    .from('column_security_profile_assignment')
    .delete()
    .eq('assignment_id', assignmentId);
  if (error) throw error;
}

export async function fetchAssignmentsForPrincipal(
  principalType: 'user' | 'team',
  principalId: string
): Promise<ColumnSecurityProfileAssignment[]> {
  const { data, error } = await supabase
    .from('column_security_profile_assignment')
    .select('*')
    .eq('principal_type', principalType)
    .eq('principal_id', principalId);
  if (error) throw error;
  return data as ColumnSecurityProfileAssignment[];
}

// ─── Bulk loader for permission engine ───────────────────────────────────────

export interface ColumnSecurityAccess {
  can_read: boolean;
  can_update: boolean;
}

export async function loadColumnSecurityForUser(
  userId: string,
  teamIds: string[]
): Promise<Record<string, Record<string, ColumnSecurityAccess>>> {
  const principalFilters: { principal_type: string; principal_id: string }[] = [
    { principal_type: 'user', principal_id: userId },
    ...teamIds.map((tid) => ({ principal_type: 'team', principal_id: tid })),
  ];

  const assignmentPromises = principalFilters.map((p) =>
    supabase
      .from('column_security_profile_assignment')
      .select('profile_id')
      .eq('principal_type', p.principal_type)
      .eq('principal_id', p.principal_id)
  );

  const assignmentResults = await Promise.all(assignmentPromises);
  const profileIdSet = new Set<string>();
  for (const res of assignmentResults) {
    for (const row of res.data ?? []) {
      profileIdSet.add(row.profile_id);
    }
  }

  const profileIds = Array.from(profileIdSet);
  if (profileIds.length === 0) {
    return {};
  }

  const { data: profileFields, error } = await supabase
    .from('column_security_profile_field')
    .select('entity_name,field_name,can_read,can_update')
    .in('profile_id', profileIds);

  if (error) throw error;

  const result: Record<string, Record<string, ColumnSecurityAccess>> = {};
  for (const row of profileFields ?? []) {
    if (!result[row.entity_name]) result[row.entity_name] = {};
    const existing = result[row.entity_name][row.field_name];
    if (!existing) {
      result[row.entity_name][row.field_name] = {
        can_read: row.can_read,
        can_update: row.can_update,
      };
    } else {
      result[row.entity_name][row.field_name] = {
        can_read: existing.can_read || row.can_read,
        can_update: existing.can_update || row.can_update,
      };
    }
  }

  return result;
}

// ─── Toggle is_secured on a field definition ──────────────────────────────────

export async function setFieldSecured(fieldDefinitionId: string, isSecured: boolean): Promise<void> {
  const { error } = await supabase
    .from('field_definition')
    .update({ is_secured: isSecured, modified_at: new Date().toISOString() })
    .eq('field_definition_id', fieldDefinitionId);
  if (error) throw error;
}
