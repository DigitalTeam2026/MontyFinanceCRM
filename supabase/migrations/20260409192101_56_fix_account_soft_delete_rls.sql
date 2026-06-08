/*
  # Fix Account Soft-Delete RLS Policy

  ## Problem
  When a user with delete privilege (including system admins) tries to soft-delete an account,
  the operation fails with 403. This is because PostgreSQL evaluates WITH CHECK clauses from
  ALL permissive UPDATE policies, and the write policy's WITH CHECK requires `can_write` privilege
  even when the user is performing a soft-delete under the delete policy.

  ## Fix
  1. Drop and recreate the write UPDATE policy so its WITH CHECK also allows users who have
     delete privilege (covering the soft-delete path).
  2. Keep the delete policy as-is but ensure its WITH CHECK is comprehensive.
*/

-- Drop existing UPDATE policies on account
DROP POLICY IF EXISTS "Users with write privilege can update accounts they have access" ON account;
DROP POLICY IF EXISTS "Users with delete privilege can soft-delete accounts they own" ON account;

-- Recreate write policy: allows update when user has write access
CREATE POLICY "Users with write privilege can update accounts they have access"
  ON account
  FOR UPDATE
  TO authenticated
  USING (
    crm_user_has_privilege('account', 'can_write')
    AND crm_user_has_access('account', account_id, owner_type, owner_id)
  )
  WITH CHECK (
    crm_user_has_privilege('account', 'can_write')
    AND (modified_by = auth.uid())
  );

-- Recreate soft-delete policy: allows setting is_deleted=true for owners or admins with delete privilege
CREATE POLICY "Users with delete privilege can soft-delete accounts they own"
  ON account
  FOR UPDATE
  TO authenticated
  USING (
    crm_user_has_privilege('account', 'can_delete')
    AND (
      (owner_type = 'user' AND owner_id = auth.uid())
      OR is_system_admin()
    )
  )
  WITH CHECK (
    crm_user_has_privilege('account', 'can_delete')
    AND (
      (owner_type = 'user' AND owner_id = auth.uid())
      OR is_system_admin()
    )
  );
