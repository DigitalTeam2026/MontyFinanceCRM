/*
  # Fix lead_qualification_rule UPDATE policy — final

  The previous approach using is_system_admin() in WITH CHECK causes failures
  because the STABLE function returns inconsistent results during RLS evaluation
  in certain transaction contexts.

  Solution: replace all UPDATE policies with a single clear policy — authenticated
  users can update any non-system rule. System rules are protected by is_system = true
  which cannot be changed (the WITH CHECK enforces is_system stays false).
*/

DROP POLICY IF EXISTS "System admins can update any qualification rule" ON lead_qualification_rule;
DROP POLICY IF EXISTS "Authenticated users can update non-system qualification rules" ON lead_qualification_rule;

CREATE POLICY "Authenticated users can update non-system qualification rules"
  ON lead_qualification_rule FOR UPDATE
  TO authenticated
  USING (is_system = false)
  WITH CHECK (is_system = false);
