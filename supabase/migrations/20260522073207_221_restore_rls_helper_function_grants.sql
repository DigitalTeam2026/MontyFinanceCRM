/*
  # Restore EXECUTE grants on RLS helper functions

  ## Summary
  Migration 216 revoked EXECUTE on get_is_system_admin_bypass_rls and
  get_current_user_is_admin from the authenticated role. These functions are
  called internally by RLS SELECT policies on crm_user, so revoking them caused
  PostgreSQL to return 403 when any authenticated user tried to query crm_user.

  This migration restores the grants so the RLS policies can evaluate correctly.
  The functions remain SECURITY DEFINER and are not directly callable via REST
  in a meaningful way — they only return a boolean based on the caller's own
  auth.uid(), so there is no privilege escalation risk.
*/

GRANT EXECUTE ON FUNCTION public.get_is_system_admin_bypass_rls(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_is_admin() TO authenticated;
