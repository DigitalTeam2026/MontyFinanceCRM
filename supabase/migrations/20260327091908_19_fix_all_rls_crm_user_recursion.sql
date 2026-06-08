/*
  # Fix all RLS policies with direct crm_user subqueries

  ## Summary
  The Supabase auth token endpoint (500 error) is caused by RLS policies that
  reference crm_user directly, which itself has RLS enabled. This creates
  recursive policy evaluation during auth schema queries.

  ## Fix
  1. Update crm_user_has_access to use SECURITY DEFINER so it bypasses RLS on crm_user.
  2. Create is_system_admin as SECURITY DEFINER (already done in migration 18).
  3. Fix record_share policy that directly queries crm_user.
  4. Fix account policy that directly queries crm_user.
*/

-- Update crm_user_has_access to be SECURITY DEFINER so it bypasses RLS
CREATE OR REPLACE FUNCTION public.crm_user_has_access(
  p_entity_name text,
  p_record_id uuid,
  p_owner_type text,
  p_owner_id uuid
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

-- Fix record_share policy that directly queries crm_user (causing recursion)
DROP POLICY IF EXISTS "Users can view shares where they are principal or sharer" ON record_share;

CREATE POLICY "Users can view shares where they are principal or sharer"
  ON record_share FOR SELECT
  TO authenticated
  USING (
    (principal_type = 'user' AND principal_id = auth.uid())
    OR shared_by = auth.uid()
    OR public.is_system_admin()
  );

-- Fix account policy that directly queries crm_user
DROP POLICY IF EXISTS "Users can soft delete accounts they own" ON account;

CREATE POLICY "Users can soft delete accounts they own"
  ON account FOR UPDATE
  TO authenticated
  USING (
    (owner_type = 'user' AND owner_id = auth.uid())
    OR public.is_system_admin()
  );
