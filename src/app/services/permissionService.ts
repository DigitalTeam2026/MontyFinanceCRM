import { supabase } from '../../lib/supabase';
import { loadColumnSecurityForUser } from '../../services/columnSecurityService';
import { ENTITY_LOGICAL_NAME } from '../types';
import type { AccessLevel } from '../../types/security';

export type { AccessLevel };

export interface EntityPrivilege {
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
}

export interface FieldRestriction {
  is_hidden: boolean;
  is_readonly: boolean;
  is_masked: boolean;
}

export interface SectionRestriction {
  is_hidden: boolean;
}

export interface ActionRestriction {
  is_denied: boolean;
}

/** Context about the current user for access-level enforcement */
export interface UserAccessContext {
  userId: string;
  businessUnitId: string | null;
  /** user_ids of all active users in the same BU */
  buUserIds: string[];
  /** user_ids of all active users in the BU subtree (includes same BU) */
  buSubtreeUserIds: string[];
}

export interface UserPermissions {
  isSystemAdmin: boolean;
  entityPrivileges: Record<string, EntityPrivilege>;
  fieldRestrictions: Record<string, Record<string, FieldRestriction>>;
  sectionRestrictions: Record<string, Record<string, SectionRestriction>>;
  actionRestrictions: Record<string, Record<string, ActionRestriction>>;
  securedFieldAccess: Record<string, Record<string, { can_read: boolean; can_update: boolean }>>;
  securedFields: Record<string, Set<string>>;
  accessContext: UserAccessContext;
}

const ORG: AccessLevel = 'organization';

const DEFAULT_PRIVILEGE: EntityPrivilege = {
  can_create: true, can_read: true, can_write: true,
  can_delete: true, can_assign: true, can_share: true,
  create_access_level: ORG, read_access_level: ORG,
  write_access_level: ORG, delete_access_level: ORG,
  assign_access_level: ORG, share_access_level: ORG,
};

const DENY_PRIVILEGE: EntityPrivilege = {
  can_create: false, can_read: false, can_write: false,
  can_delete: false, can_assign: false, can_share: false,
  create_access_level: 'user', read_access_level: 'user',
  write_access_level: 'user', delete_access_level: 'user',
  assign_access_level: 'user', share_access_level: 'user',
};

const LEVEL_ORDER: AccessLevel[] = ['user', 'business_unit', 'parent_bu', 'organization'];

function mergeLevel(a: AccessLevel | null | undefined, b: AccessLevel | null | undefined): AccessLevel {
  const ai = LEVEL_ORDER.indexOf((a ?? 'user') as AccessLevel);
  const bi = LEVEL_ORDER.indexOf((b ?? 'user') as AccessLevel);
  return LEVEL_ORDER[Math.max(ai, bi)];
}

export async function loadUserPermissions(userId: string): Promise<UserPermissions> {
  const [crmUserRes, userRolesRes] = await Promise.all([
    supabase.from('crm_user').select('is_system_admin, business_unit_id').eq('user_id', userId).maybeSingle(),
    supabase.from('user_security_role').select('role_id').eq('user_id', userId),
  ]);

  const isSystemAdmin = crmUserRes.data?.is_system_admin ?? false;
  const businessUnitId: string | null = crmUserRes.data?.business_unit_id ?? null;

  // Load BU peer and subtree user lists for access-level checks
  const [buRes, buSubRes] = await Promise.all([
    businessUnitId
      ? supabase.rpc('get_users_in_bu', { target_bu_id: businessUnitId })
      : Promise.resolve({ data: null }),
    businessUnitId
      ? supabase.rpc('get_users_in_bu_subtree', { root_bu_id: businessUnitId })
      : Promise.resolve({ data: null }),
  ]);

  const buUserIds: string[] = ((buRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  const buSubtreeUserIds: string[] = ((buSubRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  const accessContext: UserAccessContext = { userId, businessUnitId, buUserIds, buSubtreeUserIds };

  if (isSystemAdmin) {
    return {
      isSystemAdmin: true,
      entityPrivileges: {},
      fieldRestrictions: {},
      sectionRestrictions: {},
      actionRestrictions: {},
      securedFieldAccess: {},
      securedFields: {},
      accessContext,
    };
  }

  const roleIds: string[] = (userRolesRes.data ?? []).map((r: { role_id: string }) => r.role_id);

  const teamMemberRes = await supabase.from('team_user').select('team_id').eq('user_id', userId);
  const teamIds: string[] = (teamMemberRes.data ?? []).map((t: { team_id: string }) => t.team_id);

  if (roleIds.length === 0) {
    const securedFieldAccess = await loadColumnSecurityForUser(userId, teamIds);
    const securedFields = await loadSecuredFieldIndex();
    return {
      isSystemAdmin: false,
      entityPrivileges: {},
      fieldRestrictions: {},
      sectionRestrictions: {},
      actionRestrictions: {},
      securedFieldAccess,
      securedFields,
      accessContext,
    };
  }

  const [privRes, fieldRes, sectionRes, actionRes, securedFieldAccess, securedFields] = await Promise.all([
    supabase
      .from('role_privilege')
      .select('entity_name,can_create,can_read,can_write,can_delete,can_assign,can_share,create_access_level,read_access_level,write_access_level,delete_access_level,assign_access_level,share_access_level')
      .in('role_id', roleIds),
    supabase.from('field_permission').select('entity_name,field_name,is_hidden,is_readonly').in('role_id', roleIds),
    supabase.from('section_permission').select('entity_name,section_id,is_hidden').in('role_id', roleIds),
    supabase.from('action_permission').select('entity_name,action_key,is_denied').in('role_id', roleIds),
    loadColumnSecurityForUser(userId, teamIds),
    loadSecuredFieldIndex(),
  ]);

  const entityPrivileges: Record<string, EntityPrivilege> = {};
  for (const row of privRes.data ?? []) {
    const existing = entityPrivileges[row.entity_name];
    if (!existing) {
      entityPrivileges[row.entity_name] = {
        // Coerce null/undefined → false so a missing flag never grants access.
        can_create: row.can_create === true,
        can_read: row.can_read === true,
        can_write: row.can_write === true,
        can_delete: row.can_delete === true,
        can_assign: row.can_assign === true,
        can_share: row.can_share === true,
        create_access_level: (row.create_access_level as AccessLevel) ?? 'user',
        read_access_level: (row.read_access_level as AccessLevel) ?? 'user',
        write_access_level: (row.write_access_level as AccessLevel) ?? 'user',
        delete_access_level: (row.delete_access_level as AccessLevel) ?? 'user',
        assign_access_level: (row.assign_access_level as AccessLevel) ?? 'user',
        share_access_level: (row.share_access_level as AccessLevel) ?? 'user',
      };
    } else {
      // Multiple roles: OR the booleans (only explicit true grants), take highest access level
      entityPrivileges[row.entity_name] = {
        can_create: existing.can_create || row.can_create === true,
        can_read: existing.can_read || row.can_read === true,
        can_write: existing.can_write || row.can_write === true,
        can_delete: existing.can_delete || row.can_delete === true,
        can_assign: existing.can_assign || row.can_assign === true,
        can_share: existing.can_share || row.can_share === true,
        create_access_level: mergeLevel(existing.create_access_level, row.create_access_level as AccessLevel),
        read_access_level: mergeLevel(existing.read_access_level, row.read_access_level as AccessLevel),
        write_access_level: mergeLevel(existing.write_access_level, row.write_access_level as AccessLevel),
        delete_access_level: mergeLevel(existing.delete_access_level, row.delete_access_level as AccessLevel),
        assign_access_level: mergeLevel(existing.assign_access_level, row.assign_access_level as AccessLevel),
        share_access_level: mergeLevel(existing.share_access_level, row.share_access_level as AccessLevel),
      };
    }
  }

  const fieldRestrictions: Record<string, Record<string, FieldRestriction>> = {};
  for (const row of fieldRes.data ?? []) {
    if (!fieldRestrictions[row.entity_name]) fieldRestrictions[row.entity_name] = {};
    const existing = fieldRestrictions[row.entity_name][row.field_name];
    fieldRestrictions[row.entity_name][row.field_name] = existing
      ? { is_hidden: existing.is_hidden || row.is_hidden, is_readonly: existing.is_readonly || row.is_readonly, is_masked: false }
      : { is_hidden: row.is_hidden, is_readonly: row.is_readonly, is_masked: false };
  }

  const sectionRestrictions: Record<string, Record<string, SectionRestriction>> = {};
  for (const row of sectionRes.data ?? []) {
    if (!sectionRestrictions[row.entity_name]) sectionRestrictions[row.entity_name] = {};
    const existing = sectionRestrictions[row.entity_name][row.section_id];
    sectionRestrictions[row.entity_name][row.section_id] = {
      is_hidden: existing ? existing.is_hidden || row.is_hidden : row.is_hidden,
    };
  }

  const actionRestrictions: Record<string, Record<string, ActionRestriction>> = {};
  for (const row of actionRes.data ?? []) {
    if (!actionRestrictions[row.entity_name]) actionRestrictions[row.entity_name] = {};
    const existing = actionRestrictions[row.entity_name][row.action_key];
    actionRestrictions[row.entity_name][row.action_key] = {
      is_denied: existing ? existing.is_denied || row.is_denied : row.is_denied,
    };
  }

  return {
    isSystemAdmin: false,
    entityPrivileges,
    fieldRestrictions,
    sectionRestrictions,
    actionRestrictions,
    securedFieldAccess,
    securedFields,
    accessContext,
  };
}

async function loadSecuredFieldIndex(): Promise<Record<string, Set<string>>> {
  const { data, error } = await supabase
    .from('field_definition')
    .select('logical_name, entity_definition_id, entity_definition!field_definition_entity_definition_id_fkey!inner(logical_name)')
    .eq('is_secured', true);

  if (error) return {};

  const index: Record<string, Set<string>> = {};
  for (const row of data ?? []) {
    const entityName = (row as unknown as { entity_definition: { logical_name: string } }).entity_definition?.logical_name;
    if (!entityName) continue;
    if (!index[entityName]) index[entityName] = new Set();
    index[entityName].add(row.logical_name);
  }
  return index;
}

/**
 * Maps a physical table name (e.g. "crm_prospect") to its logical entity name
 * (e.g. "prospect") so privilege lookups always key on the logical name stored
 * in role_privilege. Logical names and unknown names pass through unchanged.
 */
const PHYSICAL_TO_LOGICAL: Record<string, string> = {
  crm_prospect: 'prospect',
  crm_partners: 'partners',
  crm_reseller: 'reseller',
  crm_opportunity_partner: 'opportunity_partner',
  crm_continent: 'continent',
};

export function toLogicalEntityName(entityName: string): string {
  return ENTITY_LOGICAL_NAME[entityName] ?? PHYSICAL_TO_LOGICAL[entityName] ?? entityName;
}

export function getEntityPrivilege(perms: UserPermissions, entityName: string): EntityPrivilege {
  if (perms.isSystemAdmin) return DEFAULT_PRIVILEGE;
  // Default-deny: no matching privilege row (no role, empty role, unknown
  // entity, or simply not granted) ⇒ DENY. Missing privilege NEVER means access.
  // Only is_system_admin (handled above) bypasses. Resolve physical→logical so a
  // lookup keyed on a table name still finds the privilege.
  return perms.entityPrivileges[toLogicalEntityName(entityName)] ?? DENY_PRIVILEGE;
}

export function getFieldRestriction(perms: UserPermissions, entityName: string, fieldName: string): FieldRestriction {
  if (perms.isSystemAdmin) return { is_hidden: false, is_readonly: false, is_masked: false };
  const isSecured = perms.securedFields[entityName]?.has(fieldName) ?? false;
  if (isSecured) {
    const access = perms.securedFieldAccess[entityName]?.[fieldName];
    if (!access) return { is_hidden: false, is_readonly: true, is_masked: true };
    if (!access.can_read) return { is_hidden: false, is_readonly: true, is_masked: true };
    return { is_hidden: false, is_readonly: !access.can_update, is_masked: false };
  }
  const base = perms.fieldRestrictions[entityName]?.[fieldName] ?? { is_hidden: false, is_readonly: false };
  return { ...base, is_masked: false };
}

export function getSectionRestriction(perms: UserPermissions, entityName: string, sectionId: string): SectionRestriction {
  if (perms.isSystemAdmin) return { is_hidden: false };
  return perms.sectionRestrictions[entityName]?.[sectionId] ?? { is_hidden: false };
}

export function getActionRestriction(perms: UserPermissions, entityName: string, actionKey: string): ActionRestriction {
  if (perms.isSystemAdmin) return { is_denied: false };
  return perms.actionRestrictions[entityName]?.[actionKey] ?? { is_denied: false };
}

export function isActionAllowed(perms: UserPermissions, entityName: string, actionKey: string): boolean {
  return !getActionRestriction(perms, entityName, actionKey).is_denied;
}

/**
 * Returns true if the user (via their access context) can access a record
 * owned by `recordOwnerId` under the given access level.
 *
 * None  → always false (caller must check can_* flag first)
 * User  → owner_id === userId
 * BU    → owner is in same business unit
 * BU+   → owner is in BU subtree
 * Org   → always true
 */
export function isRecordAccessible(
  level: AccessLevel,
  recordOwnerId: string | null,
  ctx: UserAccessContext,
): boolean {
  switch (level) {
    case 'organization': return true;
    case 'parent_bu':    return recordOwnerId != null && ctx.buSubtreeUserIds.includes(recordOwnerId);
    case 'business_unit': return recordOwnerId != null && ctx.buUserIds.includes(recordOwnerId);
    case 'user':
    default:             return recordOwnerId === ctx.userId;
  }
}
