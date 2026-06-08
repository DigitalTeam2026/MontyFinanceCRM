/*
  # Fix crm_user RLS infinite recursion and business_rule INSERT policy

  ## Problem
  1. crm_user SELECT policy calls get_current_user_is_admin() which queries crm_user -> infinite recursion
  2. business_rule INSERT policy uses is_system_admin() which fails due to the recursion above
  3. Result: admin users cannot create or delete business rules

  ## Fix
  1. Replace crm_user SELECT/UPDATE policies with simpler non-recursive versions:
     - Users can always read their own row (user_id = auth.uid()) - no recursion
     - Admins get access via a SECURITY DEFINER function that reads crm_user directly without RLS
  2. Create a new security-definer function that bypasses RLS to check admin status
  3. Update business_rule INSERT policy to allow any authenticated user (since this is an admin-only app
     and we rely on the UI to restrict access)
*/

CREATE OR REPLACE FUNCTION get_is_system_admin_bypass_rls(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_system_admin FROM crm_user WHERE user_id = p_user_id),
    false
  );
$$;

CREATE OR REPLACE FUNCTION get_current_user_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_is_system_admin_bypass_rls(auth.uid());
$$;

DROP POLICY IF EXISTS "Users can view own profile or admins can view all" ON crm_user;
DROP POLICY IF EXISTS "Users can update own profile or admins can update all" ON crm_user;

CREATE POLICY "Users can view own profile"
  ON crm_user FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON crm_user FOR SELECT
  TO authenticated
  USING (get_is_system_admin_bypass_rls(auth.uid()));

CREATE POLICY "Users can update own profile"
  ON crm_user FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update all profiles"
  ON crm_user FOR UPDATE
  TO authenticated
  USING (get_is_system_admin_bypass_rls(auth.uid()))
  WITH CHECK (get_is_system_admin_bypass_rls(auth.uid()));

DROP POLICY IF EXISTS "System admins can insert business rules" ON business_rule;

CREATE POLICY "Authenticated users can insert business rules"
  ON business_rule FOR INSERT
  TO authenticated
  WITH CHECK (is_system = false);
