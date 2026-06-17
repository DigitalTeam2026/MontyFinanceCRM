/*
  # Dashboard RLS fixup + schema-cache reload

  Fixes two issues seen at runtime:

  1. PATCH /dashboard → 403: the dash_upd WITH CHECK required
     `modified_by = auth.uid()`. Write access is already gated by
     security.dashboard_can(..., 'write') (owner / permission / admin), so the
     extra audit equality adds no security and is a brittle source of 403s
     (e.g. when modified_by is momentarily unset). Relax it.

  2. RPC 404: PostgREST may be serving a stale schema cache after the function
     migration. Force a reload. (Harmless if already fresh.)

  Idempotent.
*/

DROP POLICY IF EXISTS dash_upd ON public.dashboard;
CREATE POLICY dash_upd ON public.dashboard FOR UPDATE TO authenticated
  USING (security.dashboard_can(dashboard_id, 'write'))
  WITH CHECK (security.dashboard_can(dashboard_id, 'write'));

-- Refresh PostgREST's schema cache so dashboard_aggregate / dashboard_record_query
-- become callable immediately after their migration is applied.
NOTIFY pgrst, 'reload schema';
