/*
  # Fix field mapping insert policy to use security schema

  1. Security Changes
    - Drops and recreates the INSERT policy on `lead_qualification_field_mapping`
    - Changes `is_system_admin()` to `security.is_system_admin()` so the
      `authenticated` role can execute the function
    - This fixes the 403 "permission denied for function is_system_admin" error

  2. Important Notes
    - The old policy referenced `public.is_system_admin()` which is only granted
      to `service_role` and `postgres`
    - `security.is_system_admin()` is granted to `authenticated`
*/

DROP POLICY IF EXISTS "System admins can insert field mappings" ON lead_qualification_field_mapping;

CREATE POLICY "System admins can insert field mappings"
  ON lead_qualification_field_mapping
  FOR INSERT
  TO authenticated
  WITH CHECK (security.is_system_admin());
