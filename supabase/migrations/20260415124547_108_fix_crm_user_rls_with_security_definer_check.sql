/*
  # Fix crm_user RLS infinite recursion using a dedicated SECURITY DEFINER function

  ## Problem
  All approaches using EXISTS (SELECT FROM crm_user ...) inside crm_user policies
  cause infinite recursion because the subquery re-triggers the same SELECT policy.

  The only correct approach is a SECURITY DEFINER function that bypasses RLS entirely
  when it queries crm_user. This function cannot call is_system_admin() (which also
  queries crm_user) — it must do a direct query with RLS bypassed via SECURITY DEFINER.

  ## Solution
  1. Create a dedicated get_current_user_is_admin() function that is SECURITY DEFINER
     and queries crm_user directly (bypassing RLS)
  2. Update all crm_user policies to call this function instead of inline subqueries

  ## Important
  SECURITY DEFINER functions run as the function owner (postgres/superuser), so they
  bypass RLS entirely on any table they query. This breaks the recursion cycle.
*/

-- Create a dedicated function to check if the current user is a system admin
-- This MUST be SECURITY DEFINER to bypass RLS on crm_user
CREATE OR REPLACE FUNCTION get_current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_system_admin FROM crm_user WHERE user_id = auth.uid()),
    false
  );
$$;

-- Drop and recreate all crm_user policies using get_current_user_is_admin()
DROP POLICY IF EXISTS "Users can view own profile or admins can view all" ON crm_user;
CREATE POLICY "Users can view own profile or admins can view all"
  ON crm_user FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR get_current_user_is_admin()
  );

DROP POLICY IF EXISTS "Users can update own profile or admins can update all" ON crm_user;
CREATE POLICY "Users can update own profile or admins can update all"
  ON crm_user FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR get_current_user_is_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR get_current_user_is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own profile or admins can insert any" ON crm_user;
CREATE POLICY "Users can insert own profile or admins can insert any"
  ON crm_user FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR get_current_user_is_admin()
  );

-- Also update is_system_admin() to use get_current_user_is_admin() internally
-- so it too avoids the recursion problem
CREATE OR REPLACE FUNCTION is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_current_user_is_admin();
$$;
