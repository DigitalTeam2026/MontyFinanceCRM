import { describe, it, expect, vi } from 'vitest';

// permissionService imports the Supabase client at module load; stub it so the
// pure privilege-resolution functions can be tested in isolation.
vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../../services/columnSecurityService', () => ({
  loadColumnSecurityForUser: vi.fn(),
}));

import { getEntityPrivilege, toLogicalEntityName } from '../permissionService';
import type { UserPermissions } from '../permissionService';

const baseCtx = { userId: 'u1', businessUnitId: null, buUserIds: [], buSubtreeUserIds: [] };

function perms(partial: Partial<UserPermissions>): UserPermissions {
  return {
    isSystemAdmin: false,
    entityPrivileges: {},
    fieldRestrictions: {},
    sectionRestrictions: {},
    actionRestrictions: {},
    securedFieldAccess: {},
    securedFields: {},
    accessContext: baseCtx,
    ...partial,
  };
}

const GRANTED = {
  can_create: true, can_read: true, can_write: true, can_delete: true,
  can_assign: true, can_share: true,
  create_access_level: 'user', read_access_level: 'user', write_access_level: 'user',
  delete_access_level: 'user', assign_access_level: 'user', share_access_level: 'user',
} as const;

describe('getEntityPrivilege — default deny', () => {
  it('denies every action when the user has NO privilege row for the entity', () => {
    const p = perms({ entityPrivileges: { account: { ...GRANTED } } });
    const priv = getEntityPrivilege(p, 'prospect');
    expect(priv).toMatchObject({
      can_create: false, can_read: false, can_write: false,
      can_delete: false, can_assign: false, can_share: false,
    });
  });

  it('denies when the user has no roles / empty privilege map', () => {
    const priv = getEntityPrivilege(perms({}), 'prospect');
    expect(priv.can_read).toBe(false);
    expect(priv.can_create).toBe(false);
  });

  it('denies an unknown entity', () => {
    const priv = getEntityPrivilege(perms({ entityPrivileges: { account: { ...GRANTED } } }), 'totally_unknown');
    expect(priv.can_read).toBe(false);
  });

  it('grants only the explicitly-true flags from the matching row', () => {
    const p = perms({ entityPrivileges: { prospect: { ...GRANTED, can_delete: false, can_create: false } } });
    const priv = getEntityPrivilege(p, 'prospect');
    expect(priv.can_read).toBe(true);
    expect(priv.can_delete).toBe(false);
    expect(priv.can_create).toBe(false);
  });

  it('system admin bypasses and gets full access even with an empty map', () => {
    const priv = getEntityPrivilege(perms({ isSystemAdmin: true }), 'prospect');
    expect(priv).toMatchObject({ can_read: true, can_create: true, can_write: true, can_delete: true });
  });

  it('resolves a physical table name to its logical privilege key', () => {
    expect(toLogicalEntityName('crm_prospect')).toBe('prospect');
    expect(toLogicalEntityName('crm_partners')).toBe('partners');
    expect(toLogicalEntityName('accounts')).toBe('account');
    expect(toLogicalEntityName('prospect')).toBe('prospect');
    expect(toLogicalEntityName('whatever')).toBe('whatever');

    // A privilege keyed on the logical name is found via the physical name.
    const p = perms({ entityPrivileges: { prospect: { ...GRANTED } } });
    expect(getEntityPrivilege(p, 'crm_prospect').can_read).toBe(true);
  });
});
