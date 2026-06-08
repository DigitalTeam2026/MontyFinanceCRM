/*
  # Fix Always-True RLS Policies and Multiple Permissive Policies

  ## Summary
  Addresses two categories of RLS security warnings:

  1. **Always-True RLS Policies** on column_security_profile, column_security_profile_assignment,
     and column_security_profile_field: The INSERT/UPDATE/DELETE policies used `true` as their
     condition, granting unrestricted write access to any authenticated user. Replaced with
     `is_system_admin()` checks so only CRM admins can modify these sensitive configuration tables.
     SELECT policies remain open to all authenticated users so the app can read profile definitions.

  2. **Multiple Permissive Policies** on crm_user for SELECT, INSERT, and UPDATE:
     Each action had two overlapping policies that Postgres evaluates with OR logic, which can
     cause confusion and performance issues. Consolidated into single policies per action that
     cover both the self-access and admin-access cases.

  ## Security Changes
  - column_security_profile: INSERT/UPDATE/DELETE now require is_system_admin()
  - column_security_profile_assignment: INSERT/UPDATE/DELETE now require is_system_admin()
  - column_security_profile_field: INSERT/UPDATE/DELETE now require is_system_admin()
  - crm_user: SELECT, INSERT, UPDATE consolidated to single policies each
*/

-- ─── column_security_profile ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can delete column security profiles" ON public.column_security_profile;
DROP POLICY IF EXISTS "Authenticated users can insert column security profiles" ON public.column_security_profile;
DROP POLICY IF EXISTS "Authenticated users can update column security profiles" ON public.column_security_profile;

CREATE POLICY "Admins can insert column security profiles"
  ON public.column_security_profile
  FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can update column security profiles"
  ON public.column_security_profile
  FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can delete column security profiles"
  ON public.column_security_profile
  FOR DELETE
  TO authenticated
  USING (is_system_admin());

-- ─── column_security_profile_assignment ──────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can delete column security profile assignme" ON public.column_security_profile_assignment;
DROP POLICY IF EXISTS "Authenticated users can insert column security profile assignme" ON public.column_security_profile_assignment;
DROP POLICY IF EXISTS "Authenticated users can update column security profile assignme" ON public.column_security_profile_assignment;

CREATE POLICY "Admins can insert column security profile assignments"
  ON public.column_security_profile_assignment
  FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can update column security profile assignments"
  ON public.column_security_profile_assignment
  FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can delete column security profile assignments"
  ON public.column_security_profile_assignment
  FOR DELETE
  TO authenticated
  USING (is_system_admin());

-- ─── column_security_profile_field ───────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can delete column security profile fields" ON public.column_security_profile_field;
DROP POLICY IF EXISTS "Authenticated users can insert column security profile fields" ON public.column_security_profile_field;
DROP POLICY IF EXISTS "Authenticated users can update column security profile fields" ON public.column_security_profile_field;

CREATE POLICY "Admins can insert column security profile fields"
  ON public.column_security_profile_field
  FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can update column security profile fields"
  ON public.column_security_profile_field
  FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can delete column security profile fields"
  ON public.column_security_profile_field
  FOR DELETE
  TO authenticated
  USING (is_system_admin());

-- ─── crm_user: consolidate multiple permissive policies ──────────────────────

-- SELECT: drop both, replace with single policy covering self + admins
DROP POLICY IF EXISTS "Admins can view all users" ON public.crm_user;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.crm_user;

CREATE POLICY "Users can view own profile or admins can view all"
  ON public.crm_user
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR is_system_admin()
  );

-- INSERT: drop both, replace with single policy covering self + admins
DROP POLICY IF EXISTS "Admins can insert any user" ON public.crm_user;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.crm_user;

CREATE POLICY "Users can insert own profile or admins can insert any"
  ON public.crm_user
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR is_system_admin()
  );

-- UPDATE: drop both, replace with single policy covering self + admins
DROP POLICY IF EXISTS "Admins can update all users" ON public.crm_user;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.crm_user;

CREATE POLICY "Users can update own profile or admins can update all"
  ON public.crm_user
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR is_system_admin()
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR is_system_admin()
  );
