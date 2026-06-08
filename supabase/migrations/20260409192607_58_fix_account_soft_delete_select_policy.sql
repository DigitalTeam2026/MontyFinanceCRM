/*
  # Fix Account Soft Delete - SELECT Policy Blocks Post-Update Visibility

  ## Problem
  When PostgreSQL executes an UPDATE, it re-checks the SELECT policy on the post-update row
  to verify the row is still "visible" after the change. The current SELECT policy requires
  `is_deleted = false`, so when a soft-delete sets `is_deleted = true`, the post-update row
  fails the SELECT policy check and the entire UPDATE is rejected with a 403.

  ## Fix
  Add a second permissive SELECT policy that allows users to see their own soft-deleted records.
  Permissive policies are OR'd together, so either policy passing allows access.
  This lets the post-update visibility check succeed for soft-deleted rows owned by the user.
*/

CREATE POLICY "Users can see their own soft-deleted accounts for update"
  ON account
  FOR SELECT
  TO authenticated
  USING (
    is_deleted = true
    AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = auth.uid())
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu WHERE tu.team_id = owner_id AND tu.user_id = auth.uid()
      ))
    )
  );
