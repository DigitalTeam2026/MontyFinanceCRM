/*
  # Restore SECURITY DEFINER on helper functions and fix crm_user RLS recursion

  ## Problem
  Switching is_system_admin() to SECURITY INVOKER caused infinite recursion:
    - crm_user SELECT policy calls is_system_admin()
    - is_system_admin() queries crm_user
    - crm_user SELECT policy fires again → stack depth exceeded

  The functions MUST be SECURITY DEFINER so they bypass RLS on crm_user.
  auth.uid() works correctly inside SECURITY DEFINER functions because it
  reads from the JWT session, not from RLS context.

  ## Fix
  1. Restore all three helper functions to SECURITY DEFINER
  2. Fix crm_user SELECT/UPDATE policies to NOT call is_system_admin()
     (use a direct subquery instead to avoid recursion)

  ## Changes
  - is_system_admin() → SECURITY DEFINER (restored)
  - crm_user_has_access() → SECURITY DEFINER (restored)
  - crm_user_has_privilege() → SECURITY DEFINER (restored)
  - crm_user SELECT policy: replace is_system_admin() call with inline check
  - crm_user UPDATE policy: replace is_system_admin() call with inline check
*/

-- Restore SECURITY DEFINER on all three helper functions
CREATE OR REPLACE FUNCTION is_system_admin()
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

CREATE OR REPLACE FUNCTION crm_user_has_access(
  p_entity_name text,
  p_record_id   uuid,
  p_owner_type  text,
  p_owner_id    uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  EXISTS (SELECT 1 FROM crm_user cu WHERE cu.user_id = auth.uid() AND cu.is_system_admin = true)
  OR
  (p_owner_type = 'user' AND p_owner_id = auth.uid())
  OR
  (p_owner_type = 'team' AND EXISTS (
    SELECT 1 FROM team_user tu WHERE tu.team_id = p_owner_id AND tu.user_id = auth.uid()
  ))
  OR
  EXISTS (
    SELECT 1 FROM record_share rs
    WHERE rs.entity_name = p_entity_name
    AND rs.record_id = p_record_id
    AND rs.can_read = true
    AND rs.principal_type = 'user'
    AND rs.principal_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM record_share rs
    JOIN team_user tu ON tu.team_id = rs.principal_id
    WHERE rs.entity_name = p_entity_name
    AND rs.record_id = p_record_id
    AND rs.can_read = true
    AND rs.principal_type = 'team'
    AND tu.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION crm_user_has_privilege(
  p_entity_name text,
  p_privilege   text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  EXISTS (
    SELECT 1 FROM crm_user cu
    WHERE cu.user_id = auth.uid()
    AND cu.is_system_admin = true
  )
  OR
  EXISTS (
    SELECT 1
    FROM user_security_role usr
    JOIN role_privilege rp
      ON rp.role_id = usr.role_id
      AND rp.entity_name = p_entity_name
    WHERE usr.user_id = auth.uid()
    AND CASE p_privilege
      WHEN 'can_create' THEN rp.can_create
      WHEN 'can_write'  THEN rp.can_write
      WHEN 'can_delete' THEN rp.can_delete
      WHEN 'can_assign' THEN rp.can_assign
      WHEN 'can_share'  THEN rp.can_share
      ELSE false
    END = true
  );
$$;

-- Fix crm_user RLS policies to NOT call is_system_admin() (which would recurse)
-- Instead use a direct inline subquery for the admin check

DROP POLICY IF EXISTS "Users can view own profile or admins can view all" ON crm_user;
CREATE POLICY "Users can view own profile or admins can view all"
  ON crm_user FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM crm_user cu2
      WHERE cu2.user_id = auth.uid() AND cu2.is_system_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can update own profile or admins can update all" ON crm_user;
CREATE POLICY "Users can update own profile or admins can update all"
  ON crm_user FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM crm_user cu2
      WHERE cu2.user_id = auth.uid() AND cu2.is_system_admin = true
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM crm_user cu2
      WHERE cu2.user_id = auth.uid() AND cu2.is_system_admin = true
    )
  );
