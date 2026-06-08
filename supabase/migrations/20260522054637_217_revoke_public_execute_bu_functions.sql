/*
  # Revoke PUBLIC EXECUTE on BU helper functions

  The previous migration revoked anon/authenticated directly, but these three functions
  had grants via the PUBLIC pseudo-role (shown as "-" in pg_proc.proacl).
  PostgreSQL inherits EXECUTE to all roles including anon/authenticated through PUBLIC.
  We must revoke from PUBLIC and then grant only to authenticated where legitimately needed.

  Functions affected:
  - get_bu_subtree(uuid)         — internal BU tree traversal, used by access control
  - get_users_in_bu(uuid)        — internal helper, not REST-callable
  - get_users_in_bu_subtree(uuid) — internal helper, not REST-callable
*/

-- Revoke from PUBLIC (covers both anon and authenticated inheritance)
REVOKE EXECUTE ON FUNCTION public.get_bu_subtree(root_bu_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_users_in_bu(target_bu_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_users_in_bu_subtree(root_bu_id uuid) FROM PUBLIC;

-- Re-grant only to service_role and postgres (already had explicit grants, but make it explicit)
-- These functions are called internally by RLS policies which run as the function definer,
-- so no end-user role grant is needed.
GRANT EXECUTE ON FUNCTION public.get_bu_subtree(root_bu_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu(target_bu_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu_subtree(root_bu_id uuid) TO service_role;
