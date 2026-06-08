import { supabase } from '../../lib/supabase';

export interface RecordShare {
  share_id: string;
  entity_name: string;
  record_id: string;
  principal_type: 'user' | 'team';
  principal_id: string;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
  can_assign: boolean;
  can_share: boolean;
  shared_by: string | null;
  shared_at: string;
  /** Resolved display name — email for users, name for teams */
  principal_label?: string;
}

export interface SharePermissions {
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
  can_assign: boolean;
  can_share: boolean;
}

export interface AddRecordShareInput {
  entity_name: string;
  record_id: string;
  principal_type: 'user' | 'team';
  principal_id: string;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
  can_assign: boolean;
  can_share: boolean;
}

/** Fetch all shares for a single record, with resolved principal labels. */
export async function fetchRecordShares(
  entityName: string,
  recordId: string,
): Promise<RecordShare[]> {
  const { data, error } = await supabase
    .from('record_share')
    .select('*')
    .eq('entity_name', entityName)
    .eq('record_id', recordId)
    .order('shared_at');
  if (error) throw error;

  const rows = (data ?? []) as RecordShare[];

  const userIds = rows.filter((r) => r.principal_type === 'user').map((r) => r.principal_id);
  const teamIds = rows.filter((r) => r.principal_type === 'team').map((r) => r.principal_id);

  const [usersRes, teamsRes] = await Promise.all([
    userIds.length > 0
      ? supabase.from('crm_user').select('user_id, email').in('user_id', userIds)
      : Promise.resolve({ data: [] }),
    teamIds.length > 0
      ? supabase.from('team').select('team_id, name').in('team_id', teamIds)
      : Promise.resolve({ data: [] }),
  ]);

  const userMap = new Map(
    ((usersRes.data ?? []) as { user_id: string; email: string }[]).map((u) => [u.user_id, u.email]),
  );
  const teamMap = new Map(
    ((teamsRes.data ?? []) as { team_id: string; name: string }[]).map((t) => [t.team_id, t.name]),
  );

  return rows.map((r) => ({
    ...r,
    principal_label:
      r.principal_type === 'user'
        ? userMap.get(r.principal_id) ?? r.principal_id
        : teamMap.get(r.principal_id) ?? r.principal_id,
  }));
}

/** Add a new share entry. */
export async function addRecordShare(input: AddRecordShareInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('record_share').insert({
    entity_name: input.entity_name,
    record_id: input.record_id,
    principal_type: input.principal_type,
    principal_id: input.principal_id,
    can_read: input.can_read,
    can_write: input.can_write,
    can_delete: input.can_delete,
    can_assign: input.can_assign,
    can_share: input.can_share,
    shared_by: user?.id ?? null,
  });
  if (error) throw error;
}

/** Update permissions on an existing share entry. */
export async function updateRecordShare(
  shareId: string,
  changes: Partial<SharePermissions>,
): Promise<void> {
  const { error } = await supabase
    .from('record_share')
    .update(changes)
    .eq('share_id', shareId);
  if (error) throw error;
}

/** Remove a share entry. */
export async function removeRecordShare(shareId: string): Promise<void> {
  const { error } = await supabase
    .from('record_share')
    .delete()
    .eq('share_id', shareId);
  if (error) throw error;
}

/**
 * Returns the set of record IDs for a given entity that are shared with the
 * current user (directly or via team). Includes all permission dimensions.
 */
export async function fetchSharedRecordIds(
  _userId: string,
  entityName: string,
): Promise<{
  readIds: Set<string>;
  writeIds: Set<string>;
  deleteIds: Set<string>;
  assignIds: Set<string>;
  shareIds: Set<string>;
}> {
  const { data, error } = await supabase.rpc('get_my_shared_record_ids', {
    p_entity_name: entityName,
  });
  if (error) {
    console.warn('[recordShareService] fetchSharedRecordIds error:', error);
    return {
      readIds: new Set(),
      writeIds: new Set(),
      deleteIds: new Set(),
      assignIds: new Set(),
      shareIds: new Set(),
    };
  }

  const readIds = new Set<string>();
  const writeIds = new Set<string>();
  const deleteIds = new Set<string>();
  const assignIds = new Set<string>();
  const shareIds = new Set<string>();

  for (const row of (data ?? []) as {
    record_id: string;
    can_read: boolean;
    can_write: boolean;
    can_delete: boolean;
    can_assign: boolean;
    can_share: boolean;
  }[]) {
    if (row.can_read)   readIds.add(row.record_id);
    if (row.can_write)  writeIds.add(row.record_id);
    if (row.can_delete) deleteIds.add(row.record_id);
    if (row.can_assign) assignIds.add(row.record_id);
    if (row.can_share)  shareIds.add(row.record_id);
  }

  return { readIds, writeIds, deleteIds, assignIds, shareIds };
}

/**
 * Check all shared permissions for the current user on a specific record.
 */
export async function checkRecordShareAccess(
  entityName: string,
  recordId: string,
): Promise<SharePermissions> {
  const { data, error } = await supabase.rpc('get_record_share_perms', {
    p_entity_name: entityName,
    p_record_id: recordId,
  });
  if (error || !data || (data as SharePermissions[]).length === 0) {
    return { can_read: false, can_write: false, can_delete: false, can_assign: false, can_share: false };
  }
  const row = (data as SharePermissions[])[0];
  return {
    can_read: row.can_read ?? false,
    can_write: row.can_write ?? false,
    can_delete: row.can_delete ?? false,
    can_assign: row.can_assign ?? false,
    can_share: row.can_share ?? false,
  };
}

/**
 * Validate whether the current user is allowed to share a specific record.
 * Uses the backend security function which checks share_access_level.
 */
export async function validateSharePrivilege(
  entityName: string,
  recordId: string,
  recordOwnerId: string | null,
): Promise<boolean> {
  if (!recordOwnerId) return false;
  const { data, error } = await supabase.rpc('check_share_privilege', {
    p_entity_name: entityName,
    p_record_id: recordId,
    p_owner_id: recordOwnerId,
  });
  if (error) return false;
  return !!data;
}
