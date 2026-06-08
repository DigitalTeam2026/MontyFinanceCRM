/*
  # Fix BU user list RPCs to use SECURITY DEFINER

  1. Changes
    - `get_users_in_bu`: Changed from SECURITY INVOKER to SECURITY DEFINER
    - `get_users_in_bu_subtree`: Changed from SECURITY INVOKER to SECURITY DEFINER
  
  2. Reason
    - These functions query crm_user table which has restrictive RLS
      (users can only see their own row)
    - When called by non-admin users, SECURITY INVOKER returns incomplete
      results because the caller cannot read other users' rows
    - SECURITY DEFINER allows the function to bypass RLS and return
      all users in the business unit, which is required for proper
      access-level enforcement (BU-level, parent-BU-level filtering)
  
  3. Security
    - Both functions require auth.uid() IS NOT NULL (authenticated only)
    - Both functions have restricted search_path
    - Only return user_id values, no sensitive data exposed
*/

CREATE OR REPLACE FUNCTION public.get_users_in_bu(target_bu_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cu.user_id
  FROM crm_user cu
  WHERE cu.business_unit_id = target_bu_id
    AND cu.is_active = true
    AND cu.deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_users_in_bu_subtree(root_bu_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cu.user_id
  FROM crm_user cu
  WHERE cu.business_unit_id IN (
    SELECT subtree.business_unit_id FROM get_bu_subtree(root_bu_id) subtree
  )
    AND cu.is_active = true
    AND cu.deleted_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_users_in_bu(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) TO authenticated;
