/*
  # Revoke authenticated RPC access to public SECURITY DEFINER functions

  1. Security Changes
    - Revoke EXECUTE from `authenticated` and `anon` on `public.is_system_admin()`
    - Revoke EXECUTE from `authenticated` and `anon` on `public.fn_check_product_access(uuid, text, uuid)`
    - These functions are SECURITY DEFINER helpers used internally by RLS policies
    - All RLS policies already reference the `security` schema versions
    - The `public` schema versions must not be callable via PostgREST `/rpc/` endpoint

  2. Important Notes
    - The `security` schema versions remain callable by RLS policies (not exposed via REST)
    - No functional change to authorization behavior
    - Only removes the REST API surface for these privileged functions
*/

-- Revoke EXECUTE on public.is_system_admin() from all roles
REVOKE EXECUTE ON FUNCTION public.is_system_admin() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_system_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_system_admin() FROM public;

-- Revoke EXECUTE on public.fn_check_product_access() from all roles
REVOKE EXECUTE ON FUNCTION public.fn_check_product_access(uuid, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_check_product_access(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_check_product_access(uuid, text, uuid) FROM public;
