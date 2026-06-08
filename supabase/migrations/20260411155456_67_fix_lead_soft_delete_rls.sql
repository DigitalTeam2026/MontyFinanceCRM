/*
  # Fix Lead Soft-Delete RLS Policies

  ## Summary
  The lead table's UPDATE policy was blocking soft-delete operations (PATCH is_deleted=true)
  because it only checked can_write privilege, not can_delete.

  ## Changes
  - Drop the existing lead UPDATE policy
  - Add a combined UPDATE policy that allows:
    1. Write operations: users with can_write privilege who have access to the record
    2. Soft-delete operations: users with can_delete privilege who own the record or are system admins
  - Add a SELECT policy for soft-deleted leads (needed for the UPDATE to work on is_deleted=true rows)
*/

DROP POLICY IF EXISTS "Users with write privilege can update leads they have access to" ON lead;
DROP POLICY IF EXISTS "Users can see their own soft-deleted leads for update" ON lead;

CREATE POLICY "Users can update or soft-delete leads based on privileges"
  ON lead
  FOR UPDATE
  TO authenticated
  USING (
    (crm_user_has_privilege('lead'::text, 'can_write'::text) AND crm_user_has_access('lead'::text, lead_id, owner_type, owner_id))
    OR
    (crm_user_has_privilege('lead'::text, 'can_delete'::text) AND (
      (owner_type = 'user' AND owner_id = auth.uid()) OR is_system_admin()
    ))
  )
  WITH CHECK (
    (crm_user_has_privilege('lead'::text, 'can_write'::text) AND (modified_by = auth.uid()))
    OR
    (crm_user_has_privilege('lead'::text, 'can_delete'::text) AND (
      (owner_type = 'user' AND owner_id = auth.uid()) OR is_system_admin()
    ))
  );

CREATE POLICY "Users can see their own soft-deleted leads for update"
  ON lead
  FOR SELECT
  TO authenticated
  USING (
    (is_deleted = true) AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = auth.uid())
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = lead.owner_id AND tu.user_id = auth.uid()
      ))
    )
  );
