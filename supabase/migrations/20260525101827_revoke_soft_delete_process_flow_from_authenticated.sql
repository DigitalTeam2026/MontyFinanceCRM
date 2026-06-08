/*
  # Revoke soft_delete_process_flow from authenticated role

  ## Problem
  `soft_delete_process_flow` is SECURITY DEFINER and callable by any authenticated user
  via `/rest/v1/rpc/soft_delete_process_flow`. Although it checks `security.is_system_admin()`
  internally, exposing a SECURITY DEFINER function as a public RPC endpoint violates the
  principle of least privilege.

  ## Solution
  - Revoke EXECUTE from `authenticated`. The function will only be callable by `service_role`
    (used by the admin Edge Function that proxies the call after server-side auth validation).
  - The client-side `softDeleteProcessFlow()` in processFlowService.ts will be updated to
    call the Edge Function instead.
*/

REVOKE EXECUTE ON FUNCTION public.soft_delete_process_flow(uuid) FROM authenticated;
-- Keep service_role grant so the Edge Function can invoke it
GRANT  EXECUTE ON FUNCTION public.soft_delete_process_flow(uuid) TO service_role;
