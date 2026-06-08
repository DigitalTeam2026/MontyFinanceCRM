/*
  # Fix qualification rule update policy to allow system admin edits

  1. Security Changes
    - Replaces the update policy on `lead_qualification_rule` to allow:
      - Non-system rules: any authenticated user can update
      - System rules: only system admins can update
    - This fixes a 406 error when admins try to edit the "Standard Qualification" rule

  2. Important Notes
    - Uses security.is_system_admin() to check admin status
    - Preserves the restriction that regular users cannot modify system rules
*/

DROP POLICY IF EXISTS "Authenticated users can update non-system qualification rules" ON lead_qualification_rule;

CREATE POLICY "Authenticated users can update qualification rules"
  ON lead_qualification_rule
  FOR UPDATE
  TO authenticated
  USING (
    is_system = false
    OR security.is_system_admin()
  )
  WITH CHECK (
    is_system = false
    OR security.is_system_admin()
  );
