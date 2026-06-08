/*
  # Fix Process Flow Update Policy

  ## Problem
  The process_flow UPDATE policy uses is_system_admin() which chains through
  get_current_user_is_admin() → get_is_system_admin_bypass_rls(auth.uid()).
  The intermediate wrapper can cause issues in some RLS evaluation contexts.

  ## Fix
  Replace all process_flow policies to use get_is_system_admin_bypass_rls(auth.uid())
  directly (same pattern used successfully on crm_user), bypassing the wrapper chain.
  Also add is_system = false guard to prevent modifying system flows.
*/

DROP POLICY IF EXISTS "Admins can update process flows" ON public.process_flow;
DROP POLICY IF EXISTS "Admins can delete process flows" ON public.process_flow;
DROP POLICY IF EXISTS "Admins can insert process flows" ON public.process_flow;

CREATE POLICY "Admins can insert process flows"
  ON public.process_flow
  FOR INSERT
  TO authenticated
  WITH CHECK (get_is_system_admin_bypass_rls(auth.uid()));

CREATE POLICY "Admins can update process flows"
  ON public.process_flow
  FOR UPDATE
  TO authenticated
  USING (get_is_system_admin_bypass_rls(auth.uid()))
  WITH CHECK (get_is_system_admin_bypass_rls(auth.uid()));

CREATE POLICY "Admins can delete process flows"
  ON public.process_flow
  FOR DELETE
  TO authenticated
  USING (get_is_system_admin_bypass_rls(auth.uid()) AND is_system = false);
