/*
  # Fix entity_definition UPDATE RLS policy

  ## Problem
  The existing UPDATE policy uses USING (is_system_admin()) but has no WITH CHECK clause.
  For UPDATE, Postgres applies USING to filter rows and WITH CHECK to validate the new row.
  Without WITH CHECK, some Supabase client paths silently reject the update.

  ## Fix
  Drop and recreate the UPDATE policy with both USING and WITH CHECK.
*/

DROP POLICY IF EXISTS "System admins can update entity definitions" ON entity_definition;

CREATE POLICY "System admins can update entity definitions"
  ON entity_definition FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());
