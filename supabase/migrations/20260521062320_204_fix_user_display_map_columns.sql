/*
  # Fix fn_get_user_display_map to use correct column names

  1. Changes
    - Use full_name and email columns (crm_user has no first_name/last_name)
*/

CREATE OR REPLACE FUNCTION fn_get_user_display_map(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
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

REVOKE ALL ON FUNCTION fn_get_user_display_map(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_get_user_display_map(uuid[]) TO authenticated;
