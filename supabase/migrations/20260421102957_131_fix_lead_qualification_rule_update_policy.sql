/*
  # Fix lead_qualification_rule UPDATE policy

  The existing UPDATE policy restricts to is_system_admin() only, which blocks
  authenticated CRM users from soft-deleting their own non-system rules via PATCH.

  Changes:
  - Drop the overly restrictive UPDATE policy
  - Add separate policies: system admins can update any rule, authenticated users
    can soft-delete (update) non-system rules only
*/

DROP POLICY IF EXISTS "System admins can update qualification rules" ON lead_qualification_rule;

CREATE POLICY "System admins can update any qualification rule"
  ON lead_qualification_rule FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

CREATE POLICY "Authenticated users can update non-system qualification rules"
  ON lead_qualification_rule FOR UPDATE
  TO authenticated
  USING (is_system = false)
  WITH CHECK (is_system = false);
