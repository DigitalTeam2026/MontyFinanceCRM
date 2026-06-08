/*
  # Fix Account Update RLS - Merge Into Single Policy

  ## Problem
  Having two permissive UPDATE policies on the account table causes unexpected behavior.
  Even though PostgreSQL ORs WITH CHECK clauses across permissive policies, in practice
  the combination of the write policy's WITH CHECK (requiring can_write AND modified_by = auth.uid())
  blocks soft-delete operations that go through the delete privilege path.

  ## Fix
  Merge both UPDATE policies into a single policy that covers both write and delete scenarios.
  A user can update a row if they have write access to it, OR if they have delete privilege
  and own the record (or are a system admin).
*/

DROP POLICY IF EXISTS "Users with write privilege can update accounts they have access" ON account;
DROP POLICY IF EXISTS "Users with delete privilege can soft-delete accounts they own" ON account;

CREATE POLICY "Users can update or soft-delete accounts based on privileges"
  ON account
  FOR UPDATE
  TO authenticated
  USING (
    (
      crm_user_has_privilege('account', 'can_write')
      AND crm_user_has_access('account', account_id, owner_type, owner_id)
    )
    OR
    (
      crm_user_has_privilege('account', 'can_delete')
      AND (
        (owner_type = 'user' AND owner_id = auth.uid())
        OR is_system_admin()
      )
    )
  )
  WITH CHECK (
    (
      crm_user_has_privilege('account', 'can_write')
      AND (modified_by = auth.uid())
    )
    OR
    (
      crm_user_has_privilege('account', 'can_delete')
      AND (
        (owner_type = 'user' AND owner_id = auth.uid())
        OR is_system_admin()
      )
    )
  );
