/*
  # Harden share and view RPCs — remove SECURITY DEFINER from REST-exposed functions

  ## Problem
  Four public-schema SECURITY DEFINER functions are callable by authenticated users via
  PostgREST (`/rest/v1/rpc/...`). The scanner flags these because SECURITY DEFINER
  functions bypass RLS and run with elevated privileges, creating a potential
  privilege-escalation surface even when the functions are logically safe.

  ## Fix applied per function

  ### fn_get_record_shares_for_user(uuid, text)
  - Frontend no longer calls this (replaced by get_my_shared_record_ids).
  - Revoke EXECUTE from `authenticated` so it is no longer REST-callable.
  - Keep for `service_role` / internal use only.

  ### get_my_shared_record_ids(text)
  - Called from the frontend. Uses auth.uid() internally.
  - `record_share` SELECT RLS already restricts rows to the caller's own shares.
  - Switch to SECURITY INVOKER — the function runs under the caller's permissions,
    RLS applies naturally, and auth.uid() still resolves correctly.

  ### get_record_share_perms(text, uuid)
  - Called from the frontend. Uses auth.uid() internally.
  - Same reasoning as above — switch to SECURITY INVOKER.

  ### public.is_view_owner(uuid)
  - NOT called from the frontend (grep confirms zero client references).
  - The `security` schema already has an identical copy used by RLS policies.
  - Revoke EXECUTE from `authenticated` to remove it from the REST surface.
    The public copy remains for service_role / postgres only.

  ## Leaked Password Protection
  This cannot be changed via SQL migration — it requires toggling
  "Prevent use of leaked passwords" in the Supabase Dashboard under
  Authentication → Settings → Password Security.
*/

-- ── 1. fn_get_record_shares_for_user — revoke authenticated ───────────────────
REVOKE EXECUTE ON FUNCTION public.fn_get_record_shares_for_user(uuid, text) FROM authenticated;
-- service_role and postgres retain access for any internal callers.

-- ── 2. get_my_shared_record_ids — switch to SECURITY INVOKER ─────────────────
CREATE OR REPLACE FUNCTION public.get_my_shared_record_ids(
  p_entity_name text
)
RETURNS TABLE (
  record_id  uuid,
  can_read   boolean,
  can_write  boolean,
  can_delete boolean,
  can_assign boolean,
  can_share  boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    rs.record_id,
    bool_or(rs.can_read)   AS can_read,
    bool_or(rs.can_write)  AS can_write,
    bool_or(rs.can_delete) AS can_delete,
    bool_or(rs.can_assign) AS can_assign,
    bool_or(rs.can_share)  AS can_share
  FROM record_share rs
  WHERE rs.entity_name = p_entity_name
    AND (
      (rs.principal_type = 'user' AND rs.principal_id = auth.uid())
      OR
      (rs.principal_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
         WHERE tu.team_id = rs.principal_id
           AND tu.user_id = auth.uid()
      ))
    )
  GROUP BY rs.record_id;
$$;

-- Re-assert grants (CREATE OR REPLACE resets ACL)
REVOKE ALL ON FUNCTION public.get_my_shared_record_ids(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_shared_record_ids(text) TO authenticated;

-- ── 3. get_record_share_perms — switch to SECURITY INVOKER ───────────────────
CREATE OR REPLACE FUNCTION public.get_record_share_perms(
  p_entity_name text,
  p_record_id   uuid
)
RETURNS TABLE (
  can_read   boolean,
  can_write  boolean,
  can_delete boolean,
  can_assign boolean,
  can_share  boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    bool_or(rs.can_read)   AS can_read,
    bool_or(rs.can_write)  AS can_write,
    bool_or(rs.can_delete) AS can_delete,
    bool_or(rs.can_assign) AS can_assign,
    bool_or(rs.can_share)  AS can_share
  FROM record_share rs
  WHERE rs.entity_name = p_entity_name
    AND rs.record_id   = p_record_id
    AND (
      (rs.principal_type = 'user' AND rs.principal_id = auth.uid())
      OR
      (rs.principal_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
         WHERE tu.team_id = rs.principal_id
           AND tu.user_id = auth.uid()
      ))
    );
$$;

-- Re-assert grants
REVOKE ALL ON FUNCTION public.get_record_share_perms(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_record_share_perms(text, uuid) TO authenticated;

-- ── 4. public.is_view_owner — revoke authenticated (not called from frontend) ─
REVOKE EXECUTE ON FUNCTION public.is_view_owner(uuid) FROM authenticated;
-- The security-schema copy (security.is_view_owner) continues to serve RLS policies.
