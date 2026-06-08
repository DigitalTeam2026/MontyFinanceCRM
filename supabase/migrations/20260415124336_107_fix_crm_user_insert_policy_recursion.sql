/*
  # Fix crm_user INSERT policy to avoid calling is_system_admin()

  ## Problem
  The INSERT policy on crm_user calls is_system_admin() in its WITH CHECK.
  While SECURITY DEFINER functions bypass RLS (so no current recursion),
  this is an inconsistency that could cause issues. Making it consistent
  with the SELECT/UPDATE policies by using an inline subquery.

  ## Change
  - crm_user INSERT policy: replace is_system_admin() with inline subquery
*/

DROP POLICY IF EXISTS "Users can insert own profile or admins can insert any" ON crm_user;
CREATE POLICY "Users can insert own profile or admins can insert any"
  ON crm_user FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM crm_user cu2
      WHERE cu2.user_id = auth.uid() AND cu2.is_system_admin = true
    )
  );
