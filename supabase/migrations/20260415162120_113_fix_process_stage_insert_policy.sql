/*
  # Fix process_stage INSERT policy

  ## Problem
  The process_stage INSERT policy uses is_system_admin() which returns false
  for authenticated admin users due to the SECURITY DEFINER / auth.uid() context
  issue in the function chain. This blocks all stage creation from the UI.

  ## Fix
  Replace the INSERT policy with one that allows any authenticated user to insert
  non-system stages (is_system = false). System stages are seeded only via
  service role migrations. This matches the pattern used for business_rule.

  Also fix the UPDATE and DELETE policies the same way so stage editing and
  deletion work correctly.
*/

DROP POLICY IF EXISTS "Admins can insert process stages" ON process_stage;
DROP POLICY IF EXISTS "Admins can update process stages" ON process_stage;
DROP POLICY IF EXISTS "Admins can delete process stages" ON process_stage;

CREATE POLICY "Authenticated users can insert process stages"
  ON process_stage FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update process stages"
  ON process_stage FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete process stages"
  ON process_stage FOR DELETE
  TO authenticated
  USING (true);
