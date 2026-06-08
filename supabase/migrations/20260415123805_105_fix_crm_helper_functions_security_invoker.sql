/*
  # Fix crm_user_has_access() and crm_user_has_privilege() — Switch to SECURITY INVOKER

  ## Problem
  Both functions were declared as SECURITY DEFINER, causing auth.uid() to return
  null when called from RLS policies. This made all record-level access checks
  and privilege checks fail for authenticated users, potentially causing 403 errors
  on any table whose RLS policies use these functions.

  ## Fix
  Recreate both functions as SECURITY INVOKER so auth.uid() correctly resolves
  to the authenticated user's session identity.
*/

CREATE OR REPLACE FUNCTION crm_user_has_access(
  p_entity_name text,
  p_record_id   uuid,
  p_owner_type  text,
  p_owner_id    uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
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
SECURITY INVOKER
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
