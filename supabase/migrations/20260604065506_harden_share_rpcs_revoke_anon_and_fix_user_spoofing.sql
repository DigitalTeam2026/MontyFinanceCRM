/*
  # Harden share RPCs — revoke anon access and fix user-ID spoofing

  ## Issues fixed

  1. **`fn_get_record_shares_for_user`** — `anon` and `authenticated` could call this
     SECURITY DEFINER function. `anon` is revoked. For authenticated callers, the function
     body now enforces `p_user_id = auth.uid()` so a signed-in user cannot pass a different
     user's UUID to read their shares.

  2. **`get_my_shared_record_ids`** — `anon` is revoked. Authenticated callers are
     legitimate (the function uses `auth.uid()` internally; no user-ID parameter to spoof).

  3. **`get_record_share_perms`** — `anon` is revoked. Authenticated callers are
     legitimate (uses `auth.uid()` internally).

  4. **`public.is_view_owner`** — `anon` was already absent from its ACL; no change
     needed. The authenticated grant is intentional (uses `auth.uid()` internally).

  ## Security notes
  - All three functions remain callable by `authenticated` because the frontend calls
    them directly via the PostgREST RPC endpoint.
  - `anon` access is removed because unauthenticated callers have no business querying
    another user's share state.
  - `fn_get_record_shares_for_user` now returns zero rows if `p_user_id != auth.uid()`,
    eliminating the privilege-escalation vector where a logged-in user could enumerate
    shares belonging to another user.
*/

-- ── 1. Revoke anon from all three functions ────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.fn_get_record_shares_for_user(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_shared_record_ids(text)             FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_record_share_perms(text, uuid)         FROM anon;

-- ── 2. Re-create fn_get_record_shares_for_user with auth.uid() guard ──────────
--    The WHERE clause now requires p_user_id = auth.uid(), so authenticated
--    callers can only ever retrieve their own shares.

CREATE OR REPLACE FUNCTION public.fn_get_record_shares_for_user(
  p_user_id    uuid,
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
SECURITY DEFINER
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
    -- Guard: only return rows for the currently authenticated user.
    -- If p_user_id != auth.uid() the function returns zero rows.
    AND p_user_id = auth.uid()
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

-- Re-assert grants (REPLACE drops and recreates; grants must be re-applied)
REVOKE ALL ON FUNCTION public.fn_get_record_shares_for_user(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_get_record_shares_for_user(uuid, text) TO authenticated;

-- ── 3. Re-assert grants for get_my_shared_record_ids (anon already revoked above)

REVOKE ALL ON FUNCTION public.get_my_shared_record_ids(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_shared_record_ids(text) TO authenticated;

-- ── 4. Re-assert grants for get_record_share_perms (anon already revoked above)

REVOKE ALL ON FUNCTION public.get_record_share_perms(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_record_share_perms(text, uuid) TO authenticated;
