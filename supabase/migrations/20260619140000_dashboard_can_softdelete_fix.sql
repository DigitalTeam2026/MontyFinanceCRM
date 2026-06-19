/*
  # Fix: soft-deleting / restoring a dashboard 403s for owners and permitted users

  The dashboard row is soft-deleted with an UPDATE that sets `deleted_at`. The
  `dash_upd` policy re-evaluates `security.dashboard_can(dashboard_id, 'write')`
  in its WITH CHECK against the NEW row — but the function resolved the owner with
  `WHERE dashboard_id = ... AND deleted_at IS NULL`. Once `deleted_at` is set the
  lookup found no row, `v_owner` was NULL, and the function returned false, so the
  update was rejected (PostgREST 403). Only system admins (who short-circuit to
  true before the lookup) could delete — which is why duplicated/owned dashboards
  could not be deleted by their own owner.

  Fix: drop the `deleted_at IS NULL` filter from the owner lookup so ownership is
  resolvable for already-soft-deleted rows (also unblocks restore from the recycle
  bin for non-admin owners). Row visibility for SELECT is unchanged — the table
  SELECT policies still require `deleted_at IS NULL`. Everything else (the
  is_default read short-circuit, organization scope, BU/team/role grants) is
  preserved verbatim from 20260617150000_dashboard_permission_org_scope.sql.
*/

CREATE OR REPLACE FUNCTION security.dashboard_can(p_dashboard_id uuid, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, security, pg_temp
AS $function$
DECLARE
  v_owner   uuid;
  v_user_bu uuid;
BEGIN
  IF p_dashboard_id IS NULL THEN RETURN false; END IF;

  -- System admins can do anything.
  IF EXISTS (SELECT 1 FROM public.crm_user cu
             WHERE cu.user_id = auth.uid() AND cu.is_system_admin = true) THEN
    RETURN true;
  END IF;

  -- Anyone may READ the organization-wide default dashboard ("for all users").
  IF p_action = 'read' AND EXISTS (
       SELECT 1 FROM public.dashboard d
        WHERE d.dashboard_id = p_dashboard_id
          AND d.deleted_at IS NULL
          AND d.is_default = true
     ) THEN
    RETURN true;
  END IF;

  -- Resolve ownership WITHOUT a deleted_at filter so soft-delete (and restore)
  -- still recognises the owner when the row's deleted_at is set.
  SELECT owner_id INTO v_owner FROM public.dashboard
   WHERE dashboard_id = p_dashboard_id;
  IF v_owner IS NULL THEN RETURN false; END IF;          -- truly missing
  IF v_owner = auth.uid() THEN RETURN true; END IF;       -- owners have full control

  SELECT cu.business_unit_id INTO v_user_bu
    FROM public.crm_user cu WHERE cu.user_id = auth.uid();

  RETURN EXISTS (
    SELECT 1 FROM public.dashboard_permission dp
    WHERE dp.dashboard_id = p_dashboard_id
      AND CASE p_action
        WHEN 'read'    THEN dp.can_read
        WHEN 'write'   THEN dp.can_write
        WHEN 'delete'  THEN dp.can_delete
        WHEN 'publish' THEN dp.can_publish
        WHEN 'share'   THEN dp.can_share
        WHEN 'export'  THEN dp.can_export
        ELSE false
      END = true
      AND (
            (dp.principal_type = 'organization')
         OR (dp.principal_type = 'user' AND dp.principal_id = auth.uid())
         OR (dp.principal_type = 'team' AND EXISTS (
              SELECT 1 FROM public.team_user tu
              WHERE tu.team_id = dp.principal_id AND tu.user_id = auth.uid()))
         OR (dp.principal_type = 'role' AND EXISTS (
              SELECT 1 FROM public.user_security_role usr
              WHERE usr.role_id = dp.principal_id AND usr.user_id = auth.uid()))
         OR (dp.principal_type = 'business_unit' AND dp.principal_id = v_user_bu)
      )
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
