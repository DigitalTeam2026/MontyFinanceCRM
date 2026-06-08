/*
  # Add RPC to list active CRM users for assignment dropdowns

  1. New Function
    - `fn_list_active_crm_users`: Returns user_id and email for all active CRM users
  
  2. Reason
    - crm_user table has restrictive RLS (users can only see own row)
    - Non-admin users need to see the list of active users for:
      - Owner assignment dropdowns
      - Sharing views with other users
      - Activity timeline author resolution
    - SECURITY DEFINER allows listing all active users safely
  
  3. Security
    - Requires auth.uid() IS NOT NULL (authenticated only)
    - Only returns user_id and email (minimal data)
    - Restricted search_path
*/

CREATE OR REPLACE FUNCTION public.fn_list_active_crm_users()
RETURNS TABLE(user_id uuid, email text)
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
  SELECT cu.user_id, cu.email
  FROM crm_user cu
  WHERE cu.is_active = true
    AND cu.deleted_at IS NULL
  ORDER BY cu.email;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_list_active_crm_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_list_active_crm_users() TO authenticated;
