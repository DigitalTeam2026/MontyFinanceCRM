import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  loadUserPermissions, getEntityPrivilege, getFieldRestriction,
  getSectionRestriction, getActionRestriction, isActionAllowed, isRecordAccessible,
  getAllowedFormIds, isFormAllowed, isFlowAllowed,
} from '../services/permissionService';
import type {
  UserPermissions, EntityPrivilege, FieldRestriction,
  SectionRestriction, ActionRestriction, UserAccessContext, AccessLevel,
} from '../services/permissionService';

export type { AccessLevel };

interface PermissionContextValue {
  permissions: UserPermissions;
  ready: boolean;
  accessContext: UserAccessContext;
  getEntityPrivilege: (entityName: string) => EntityPrivilege;
  getFieldRestriction: (entityName: string, fieldName: string) => FieldRestriction;
  getSectionRestriction: (entityName: string, sectionId: string) => SectionRestriction;
  getActionRestriction: (entityName: string, actionKey: string) => ActionRestriction;
  isActionAllowed: (entityName: string, actionKey: string) => boolean;
  isRecordAccessible: (level: AccessLevel, recordOwnerId: string | null) => boolean;
  /** Allowed form_ids for an entity, or null = all forms allowed (system admin). */
  getAllowedFormIds: (entityName: string) => Set<string> | null;
  isFormAllowed: (entityName: string, formId: string) => boolean;
  isFlowAllowed: (flowId: string) => boolean;
}

const DEFAULT_ACCESS_CONTEXT: UserAccessContext = {
  userId: '',
  businessUnitId: null,
  buUserIds: [],
  buSubtreeUserIds: [],
};

const DEFAULT_PERMISSIONS: UserPermissions = {
  isSystemAdmin: false,
  entityPrivileges: {},
  fieldRestrictions: {},
  sectionRestrictions: {},
  actionRestrictions: {},
  allowedFormIds: {},
  allowedFlowIds: new Set(),
  securedFieldAccess: {},
  securedFields: {},
  accessContext: DEFAULT_ACCESS_CONTEXT,
};

const PermissionContext = createContext<PermissionContextValue>({
  permissions: DEFAULT_PERMISSIONS,
  ready: false,
  accessContext: DEFAULT_ACCESS_CONTEXT,
  getEntityPrivilege: () => ({
    can_create: true, can_read: true, can_write: true,
    can_delete: true, can_assign: true, can_share: true,
    create_access_level: 'organization', read_access_level: 'organization',
    write_access_level: 'organization', delete_access_level: 'organization',
    assign_access_level: 'organization', share_access_level: 'organization',
  }),
  getFieldRestriction: () => ({ is_hidden: false, is_readonly: false, is_masked: false }),
  getSectionRestriction: () => ({ is_hidden: false }),
  getActionRestriction: () => ({ is_denied: false }),
  isActionAllowed: () => true,
  isRecordAccessible: () => true,
  getAllowedFormIds: () => null,
  isFormAllowed: () => true,
  isFlowAllowed: () => true,
});

export function PermissionProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    loadUserPermissions(userId)
      .then((perms) => {
        if (!cancelled) {
          setPermissions(perms);
          setReady(true);
        }
      })
      .catch((err) => {
        console.error('[PermissionContext] Failed to load permissions:', err);
        if (!cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, [userId]);

  const ctx = permissions.accessContext;

  const value: PermissionContextValue = {
    permissions,
    ready,
    accessContext: ctx,
    getEntityPrivilege: (entityName) => getEntityPrivilege(permissions, entityName),
    getFieldRestriction: (entityName, fieldName) => getFieldRestriction(permissions, entityName, fieldName),
    getSectionRestriction: (entityName, sectionId) => getSectionRestriction(permissions, entityName, sectionId),
    getActionRestriction: (entityName, actionKey) => getActionRestriction(permissions, entityName, actionKey),
    isActionAllowed: (entityName, actionKey) => isActionAllowed(permissions, entityName, actionKey),
    isRecordAccessible: (level, recordOwnerId) => isRecordAccessible(level, recordOwnerId, ctx),
    getAllowedFormIds: (entityName) => getAllowedFormIds(permissions, entityName),
    isFormAllowed: (entityName, formId) => isFormAllowed(permissions, entityName, formId),
    isFlowAllowed: (flowId) => isFlowAllowed(permissions, flowId),
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionContext);
}
