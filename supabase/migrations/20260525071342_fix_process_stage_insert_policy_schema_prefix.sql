/*
  # Fix process_stage INSERT policy to use security schema prefix

  The INSERT policy was calling is_system_admin() without the security. schema prefix,
  resolving to public.is_system_admin() which is not granted to the authenticated role.
  All other policies on this table correctly use security.is_system_admin().
*/

DROP POLICY IF EXISTS "Admins can insert process stages" ON process_stage;

CREATE POLICY "Admins can insert process stages"
  ON process_stage
  FOR INSERT
  TO authenticated
  WITH CHECK (security.is_system_admin());
