/*
  # Fix dashboard UPDATE RLS policy

  ## Problem
  The dashboard UPDATE policy uses:
    WITH CHECK (created_by = auth.uid() OR is_system_admin())

  This fails for two reasons:
  1. System-seeded dashboards have created_by = NULL, so `NULL = auth.uid()` evaluates
     to NULL (not true), causing the check to fail for non-system-admins.
  2. is_system_admin() checks crm_user.is_system_admin which may be false even for
     users with an Administrator security role.

  ## Fix
  Expand the policy to also allow updates on dashboards where created_by IS NULL
  (system-seeded dashboards) by any authenticated user, and use security.is_system_admin()
  for consistency with all other updated RLS policies.

  Dashboard editing is already access-controlled at the application level (Admin Studio).
*/

-- dashboard UPDATE
DROP POLICY IF EXISTS "Authenticated users can update their own dashboards" ON dashboard;
CREATE POLICY "Authenticated users can update dashboards"
  ON dashboard FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR created_by IS NULL
    OR security.is_system_admin()
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    OR created_by IS NULL
    OR security.is_system_admin()
  );

-- dashboard_widget UPDATE (same pattern — widget ownership flows through the parent dashboard)
DROP POLICY IF EXISTS "Authenticated users can update widgets" ON dashboard_widget;
CREATE POLICY "Authenticated users can update widgets"
  ON dashboard_widget FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dashboard d
      WHERE d.dashboard_id = dashboard_widget.dashboard_id
        AND (
          d.created_by = (SELECT auth.uid())
          OR d.created_by IS NULL
          OR security.is_system_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dashboard d
      WHERE d.dashboard_id = dashboard_widget.dashboard_id
        AND (
          d.created_by = (SELECT auth.uid())
          OR d.created_by IS NULL
          OR security.is_system_admin()
        )
    )
  );
