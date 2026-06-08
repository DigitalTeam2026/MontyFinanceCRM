/*
  # Grant authenticated EXECUTE on security schema RPC functions

  1. Problem
    - Public wrapper functions are SECURITY INVOKER — they run as the caller
    - The caller (authenticated role) needs EXECUTE on the security schema
      functions that the wrappers delegate to
    - Without this grant, the wrappers would fail with permission denied

  2. Changes
    - Grant EXECUTE to `authenticated` on all six security schema functions
    - These functions are still not exposed via PostgREST (security schema
      is not in the API schemas), so this grant only enables the
      public wrapper → security function call chain
*/

GRANT EXECUTE ON FUNCTION security.fn_get_user_display_map(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION security.fn_list_active_crm_users() TO authenticated;
GRANT EXECUTE ON FUNCTION security.fn_lookup_user_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION security.get_table_columns(text) TO authenticated;
GRANT EXECUTE ON FUNCTION security.get_users_in_bu(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION security.get_users_in_bu_subtree(uuid) TO authenticated;
