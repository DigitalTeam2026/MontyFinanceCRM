/*
  # Fix user display map RPC to use SECURITY DEFINER

  1. Changes
    - `fn_get_user_display_map`: Changed from SECURITY INVOKER to SECURITY DEFINER
  
  2. Reason
    - crm_user table has restrictive RLS (users can only see own row)
    - Non-admin users cannot resolve other users' display names or emails
    - This breaks owner column display in list views and activity timelines
    - SECURITY DEFINER allows resolving display names for any user_id
  
  3. Security
    - Requires auth.uid() IS NOT NULL (authenticated only)
    - Only returns user_id and display_name (no sensitive data)
    - Restricted search_path
*/

CREATE OR REPLACE FUNCTION public.fn_get_user_display_map(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, display_name text)
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
  SELECT cu.user_id,
    COALESCE(NULLIF(TRIM(cu.full_name), ''), cu.email) AS display_name
  FROM crm_user cu
  WHERE cu.user_id = ANY(p_user_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_get_user_display_map(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_get_user_display_map(uuid[]) TO authenticated;
