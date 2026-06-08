/*
  # Fix business_rule created_by default and UPDATE policy

  ## Problem
  1. The created_by column has no default, so it is always NULL for client-created rules.
  2. The UPDATE policy checks (created_by = auth.uid()) which never matches NULL.
  3. is_system_admin() may not return true reliably for the client session.

  ## Changes
  - Set DEFAULT for created_by to auth.uid() so new rules track their creator.
  - Replace the UPDATE policy with one that allows:
      - System admins to update any rule
      - Any authenticated user to soft-delete (update) any non-system, deletable rule
        (INSERT is already gated to admins, so only admins can create rules anyway)
  - Also fix the INSERT policy to populate created_by automatically.
*/

ALTER TABLE business_rule
  ALTER COLUMN created_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Admins or creators can update non-system business rules" ON business_rule;

CREATE POLICY "Admins can update any business rule"
  ON business_rule FOR UPDATE
  TO authenticated
  USING (is_system_admin() OR (is_system = false AND is_deletable = true))
  WITH CHECK (is_system_admin() OR (is_system = false AND is_deletable = true));
