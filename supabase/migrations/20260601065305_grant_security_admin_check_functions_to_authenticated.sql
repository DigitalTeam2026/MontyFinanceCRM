/*
  # Grant EXECUTE on security admin-check functions to authenticated

  1. Problem
    - The crm_user INSERT policy calls security.get_current_user_is_admin()
    - This function only had EXECUTE granted to postgres, not authenticated
    - Authenticated users could not invoke it during RLS evaluation

  2. Fix
    - Grant EXECUTE on security.get_current_user_is_admin() to authenticated
    - Grant EXECUTE on security.get_is_system_admin_bypass_rls(uuid) to authenticated
    - These are in the security schema, NOT exposed via PostgREST RPC endpoints

  3. Security
    - The security schema is not in PostgREST's search path
    - These functions cannot be called directly via the REST API
    - Only RLS policies and other DB functions can invoke them
*/

GRANT EXECUTE ON FUNCTION security.get_current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION security.get_is_system_admin_bypass_rls(uuid) TO authenticated;
