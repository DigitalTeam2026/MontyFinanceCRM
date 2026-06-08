/*
  # Record Share — RLS hardening, update policy, and team-member access

  ## Changes

  ### 1. Add UPDATE policy on record_share
  Allows the sharer (or system admin) to update their own share entries
  (e.g., change can_read / can_write).

  ### 2. Extend SELECT policy to cover team membership
  A user must be able to see share entries where they are a member of the
  shared team (so the frontend can resolve "does my team have access?").

  ### 3. Add function: fn_get_record_shares_for_user
  Returns all record_share rows that apply to a user — either directly
  (principal_type='user', principal_id=user_id) or via team membership
  (principal_type='team', principal_id IN user's teams).
  Used by listService to inject shared record IDs into the query.

  ### 4. Grant execute on fn_get_record_shares_for_user to authenticated
*/

-- ─── Drop and recreate SELECT policy with team-member support ────────────────
DROP POLICY IF EXISTS "Users can view shares where they are principal or sharer" ON public.record_share;

CREATE POLICY "Users can view shares they are principal of or shared by them"
  ON public.record_share
  FOR SELECT
  TO authenticated
  USING (
    security.is_system_admin()
    OR shared_by = auth.uid()
    OR (principal_type = 'user' AND principal_id = auth.uid())
    OR (
      principal_type = 'team'
      AND EXISTS (
        SELECT 1 FROM public.team_user tu
        WHERE tu.team_id = record_share.principal_id
          AND tu.user_id = auth.uid()
      )
    )
  );

-- ─── Add UPDATE policy ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update their own record shares" ON public.record_share;

CREATE POLICY "Users can update their own record shares"
  ON public.record_share
  FOR UPDATE
  TO authenticated
  USING (security.is_system_admin() OR shared_by = auth.uid())
  WITH CHECK (security.is_system_admin() OR shared_by = auth.uid());

-- ─── RPC: get all record_share rows applicable to a user ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_record_shares_for_user(
  p_user_id uuid,
  p_entity_name text
)
RETURNS TABLE (
  share_id uuid,
  entity_name text,
  record_id uuid,
  can_read boolean,
  can_write boolean,
  principal_type text,
  principal_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, security
AS $$
  SELECT
    rs.share_id,
    rs.entity_name,
    rs.record_id,
    rs.can_read,
    rs.can_write,
    rs.principal_type,
    rs.principal_id
  FROM public.record_share rs
  WHERE rs.entity_name = p_entity_name
    AND (
      (rs.principal_type = 'user' AND rs.principal_id = p_user_id)
      OR (
        rs.principal_type = 'team'
        AND EXISTS (
          SELECT 1 FROM public.team_user tu
          WHERE tu.team_id = rs.principal_id
            AND tu.user_id = p_user_id
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.fn_get_record_shares_for_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_record_shares_for_user(uuid, text) TO authenticated;
