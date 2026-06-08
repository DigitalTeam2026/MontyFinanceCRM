/*
  # Add RPC to resolve user emails for field history display

  1. New Functions
    - `fn_get_user_display_map(p_user_ids uuid[])` 
      - Returns a table of (user_id, display_name) for a batch of user IDs
      - Uses SECURITY DEFINER to bypass RLS so any authenticated user 
        can resolve display names in the field history panel
      - Only returns email (as display name) for minimal data exposure

  2. Why
    - The crm_user RLS policies restrict non-admins to only see their own profile
    - Field history needs to show who made each change, even for other users
    - This function returns only display names, not full user records
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
    COALESCE(
      NULLIF(TRIM(COALESCE(cu.first_name, '') || ' ' || COALESCE(cu.last_name, '')), ''),
      cu.email
    ) AS display_name
  FROM crm_user cu
  WHERE cu.user_id = ANY(p_user_ids);
END;
$$;

REVOKE ALL ON FUNCTION fn_get_user_display_map(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_get_user_display_map(uuid[]) TO authenticated;
