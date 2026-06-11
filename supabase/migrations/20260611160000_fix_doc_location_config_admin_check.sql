/*
  # Fix document_location_config admin write policies (403 regression)

  Problem
    - 20260611140000_document_location_storage.sql created the INSERT/UPDATE/DELETE
      policies on document_location_config using public.is_system_admin().
    - 20260601061455_revoke_rpc_on_public_security_definer_functions.sql had already
      REVOKEd EXECUTE on public.is_system_admin() from authenticated (to remove it
      from the PostgREST /rpc/ surface), on the basis that all RLS policies use the
      security schema version.
    - Result: evaluating these policies raises 42501 "permission denied for function
      is_system_admin", so every admin write returns HTTP 403 — even for a real
      system admin.

  Fix
    - Recreate the three admin policies using security.is_system_admin(), which the
      authenticated role CAN execute (granted in 20260522080252) and which is not
      exposed via REST. This matches the convention applied in migrations 230/231.
    - The permissive SELECT policy (USING true) is unchanged.
*/

DROP POLICY IF EXISTS "System admins can insert doc location config" ON document_location_config;
DROP POLICY IF EXISTS "System admins can update doc location config" ON document_location_config;
DROP POLICY IF EXISTS "System admins can delete doc location config" ON document_location_config;

CREATE POLICY "System admins can insert doc location config"
  ON document_location_config
  FOR INSERT
  TO authenticated
  WITH CHECK (security.is_system_admin());

CREATE POLICY "System admins can update doc location config"
  ON document_location_config
  FOR UPDATE
  TO authenticated
  USING (security.is_system_admin())
  WITH CHECK (security.is_system_admin());

CREATE POLICY "System admins can delete doc location config"
  ON document_location_config
  FOR DELETE
  TO authenticated
  USING (security.is_system_admin());
