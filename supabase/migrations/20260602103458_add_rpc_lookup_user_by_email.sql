/*
  # Add RPC to lookup a CRM user by email

  1. New Function
    - `fn_lookup_user_by_email`: Returns user_id for a given email address
  
  2. Reason
    - crm_user table has restrictive RLS (users can only see own row)
    - Workflow engine needs to resolve email addresses to user_ids
      for recipient resolution (e.g., send notification to field_ref user)
    - SECURITY DEFINER allows looking up any user by email
  
  3. Security
    - Requires auth.uid() IS NOT NULL (authenticated only)
    - Only returns user_id (no sensitive data)
    - Restricted search_path
*/

CREATE OR REPLACE FUNCTION public.fn_lookup_user_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT cu.user_id INTO result_id
  FROM crm_user cu
  WHERE cu.email = p_email
  LIMIT 1;

  RETURN result_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_lookup_user_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_lookup_user_by_email(text) TO authenticated;
