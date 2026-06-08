
/*
  # Fix view_column INSERT policy: use security.is_system_admin()

  The "System admins can insert view columns" policy was calling is_system_admin()
  without the security schema prefix, causing a 403 permission denied error.
  All other policies on this table already use security.is_system_admin().
*/

DROP POLICY IF EXISTS "System admins can insert view columns" ON view_column;

CREATE POLICY "System admins can insert view columns"
  ON view_column
  FOR INSERT
  TO authenticated
  WITH CHECK (security.is_system_admin());
