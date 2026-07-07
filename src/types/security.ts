export interface CrmUser {
  user_id: string;
  business_unit_id: string | null;
  full_name: string;
  email: string;
  username: string | null;
  job_title: string | null;
  mobile_phone: string | null;
  is_active: boolean;
  is_system_admin: boolean;
  totp_enabled?: boolean;
  deleted_at: string | null;
  created_at: string;
  modified_at: string;
}

export interface BusinessUnit {
  business_unit_id: string;
  organization_id: string;
  parent_business_unit_id: string | null;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  modified_at: string;
}

export interface Team {
  team_id: string;
  business_unit_id: string;
  name: string;
  team_type: 'standard' | 'owner' | 'access';
  description: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  modified_at: string;
}

export interface TeamUser {
  team_user_id: string;
  team_id: string;
  user_id: string;
  created_at: string;
}

export interface SecurityRole {
  role_id: string;
  business_unit_id: string | null;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  modified_at: string;
}

export interface UserSecurityRole {
  user_security_role_id: string;
  user_id: string;
  role_id: string;
  created_at: string;
}

export interface TeamSecurityRole {
  team_security_role_id: string;
  team_id: string;
  role_id: string;
  created_at: string;
}

export type AccessLevel = 'user' | 'business_unit' | 'parent_bu' | 'organization';

export interface RolePrivilege {
  privilege_id: string;
  role_id: string;
  entity_name: string;
  can_create: boolean;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
  can_assign: boolean;
  can_share: boolean;
  create_access_level: AccessLevel;
  read_access_level: AccessLevel;
  write_access_level: AccessLevel;
  delete_access_level: AccessLevel;
  assign_access_level: AccessLevel;
  share_access_level: AccessLevel;
  created_at: string;
  modified_at: string;
}

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  user:          'User',
  business_unit: 'Business Unit',
  parent_bu:     'BU + Children',
  organization:  'Organization',
};

export const PRIVILEGE_KEYS = ['can_create', 'can_read', 'can_write', 'can_delete', 'can_assign', 'can_share'] as const;
export type PrivilegeKey = (typeof PRIVILEGE_KEYS)[number];

export const PRIVILEGE_LABELS: Record<PrivilegeKey, string> = {
  can_create: 'Create',
  can_read:   'Read',
  can_write:  'Write',
  can_delete: 'Delete',
  can_assign: 'Assign',
  can_share:  'Share',
};
