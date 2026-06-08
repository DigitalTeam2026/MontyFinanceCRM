/*
  # Grant execute on get_is_system_admin_bypass_rls to authenticated

  This function is used in RLS policies on crm_user and process_flow tables.
  Migration 200/201 revoked all public execute on security-definer functions but
  failed to re-grant execute to the authenticated role for this function.
  Without this grant, any RLS policy referencing it returns 403.

  1. Security Changes
    - GRANT EXECUTE on get_is_system_admin_bypass_rls to authenticated
*/

GRANT EXECUTE ON FUNCTION public.get_is_system_admin_bypass_rls(uuid) TO authenticated;
