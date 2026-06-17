/*
  # Dashboard "default for all users" flag

  Adds dashboard.is_default — when true, the dashboard is THE organization-wide
  default surfaced on the user-facing Sales Dashboard for every authenticated
  user. Only one dashboard can be the default at a time (partial unique index).

  Visibility: a default dashboard must be readable by everyone, regardless of
  ownership / dashboard_permission rows. We therefore extend security.dashboard_can
  so a 'read' check short-circuits to true for any non-deleted is_default
  dashboard. All other actions (write/delete/publish/share/export) still require
  ownership, an explicit permission, or system-admin — so a normal user can VIEW
  the default but cannot edit it.
*/

-- 1. Column + single-default guarantee ----------------------------------------
ALTER TABLE public.dashboard
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- At most one default dashboard across the table.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_single_default
  ON public.dashboard (is_default)
  WHERE is_default = true AND deleted_at IS NULL;

-- 2. Grant read on the default to every authenticated user --------------------
CREATE OR REPLACE FUNCTION security.dashboard_can(p_dashboard_id uuid, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, security, pg_temp
AS $$
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

  SELECT owner_id INTO v_owner FROM public.dashboard
   WHERE dashboard_id = p_dashboard_id AND deleted_at IS NULL;
  IF v_owner IS NULL THEN RETURN false; END IF;          -- missing / deleted
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
            (dp.principal_type = 'user' AND dp.principal_id = auth.uid())
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
$$;
REVOKE ALL ON FUNCTION security.dashboard_can(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION security.dashboard_can(uuid, text) TO authenticated;
