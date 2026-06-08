/*
  # Fix business_rule UPDATE policy to allow soft-deletes by rule creators

  ## Problem
  The soft-delete operation (setting deleted_at) uses an UPDATE statement.
  The existing UPDATE policy only permits system admins, so regular users
  who created a rule cannot soft-delete it — the update silently succeeds
  (no RLS error) but actually updates 0 rows, so the record remains on refresh.

  ## Changes
  - DROP the admin-only UPDATE policy
  - CREATE a new UPDATE policy that allows:
    - System admins to update any rule
    - Regular users to update (soft-delete) rules they created, as long as
      the rule is not a system rule (is_system = false)
*/

DROP POLICY IF EXISTS "System admins can update business rules" ON business_rule;

CREATE POLICY "Admins or creators can update non-system business rules"
  ON business_rule FOR UPDATE
  TO authenticated
  USING (
    is_system_admin()
    OR (created_by = auth.uid() AND is_system = false)
  )
  WITH CHECK (
    is_system_admin()
    OR (created_by = auth.uid() AND is_system = false)
  );
