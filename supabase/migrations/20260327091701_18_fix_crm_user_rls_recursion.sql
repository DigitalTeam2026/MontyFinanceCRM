/*
  # Fix crm_user RLS infinite recursion

  ## Summary
  The "Admins can view all users" and "Admins can update all users" policies on
  crm_user were self-referencing — they queried crm_user inside a policy on
  crm_user, causing infinite recursion. This crashed the Supabase auth token
  endpoint with a 500 "Database error querying schema" error.

  ## Fix
  1. Create a SECURITY DEFINER function that checks admin status by bypassing RLS.
  2. Replace the recursive policies with ones that call this safe function.
  3. Remove duplicate conflicting INSERT/UPDATE policies.
*/

CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM crm_user
    WHERE user_id = auth.uid() AND is_system_admin = true
  );
$$;

DROP POLICY IF EXISTS "Admins can view all users" ON crm_user;
DROP POLICY IF EXISTS "Admins can update all users" ON crm_user;
DROP POLICY IF EXISTS "Authenticated users can insert crm users" ON crm_user;
DROP POLICY IF EXISTS "Authenticated users can update crm users" ON crm_user;

CREATE POLICY "Admins can view all users"
  ON crm_user FOR SELECT
  TO authenticated
  USING (public.is_system_admin());

CREATE POLICY "Admins can update all users"
  ON crm_user FOR UPDATE
  TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());
