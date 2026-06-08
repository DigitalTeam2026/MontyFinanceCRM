/*
  # Fix view_definition RLS infinite recursion

  ## Problem
  Migration 156 added two policies on view_definition that subquery view_sharing,
  while view_sharing policies subquery view_definition — causing a "mutual recursion
  detected in policy" 500 error on every SELECT from view_definition.

  ## Fix
  1. Drop the two recursive view_definition policies added in migration 156.
  2. Create a SECURITY DEFINER helper function that reads view_sharing without
     triggering RLS on view_sharing (which in turn queries view_definition).
  3. Re-add the two view_definition policies using that helper function.
  4. Fix view_sharing SELECT policies similarly, using a helper that reads
     view_definition.created_by without hitting view_definition RLS.
*/

-- ─── Drop the recursive policies on view_definition ─────────────────────────

DROP POLICY IF EXISTS "Users can read views shared with them" ON view_definition;
DROP POLICY IF EXISTS "Shared-write users can update view" ON view_definition;

-- ─── Drop the view_sharing policies that reference view_definition ────────────

DROP POLICY IF EXISTS "View owners can read their view shares" ON view_sharing;
DROP POLICY IF EXISTS "View owners can create shares" ON view_sharing;
DROP POLICY IF EXISTS "View owners can update shares" ON view_sharing;
DROP POLICY IF EXISTS "View owners can delete shares" ON view_sharing;

-- ─── Helper: check if current user owns a given view (SECURITY DEFINER) ──────
-- Bypasses RLS on view_definition so no recursion occurs.

CREATE OR REPLACE FUNCTION is_view_owner(p_view_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM view_definition
    WHERE view_id = p_view_id
      AND created_by = auth.uid()
  );
$$;

-- ─── Helper: check if current user has a share on a view (SECURITY DEFINER) ──

CREATE OR REPLACE FUNCTION user_has_view_share(p_view_id uuid, p_min_level text DEFAULT 'read')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM view_sharing
    WHERE view_id = p_view_id
      AND shared_with_user_id = auth.uid()
      AND (
        p_min_level = 'read'
        OR permission_level = 'write'
      )
  );
$$;

-- ─── Re-add view_definition SELECT policy for shared views ────────────────────

CREATE POLICY "Users can read views shared with them"
  ON view_definition FOR SELECT
  TO authenticated
  USING (user_has_view_share(view_id, 'read'));

-- ─── Re-add view_definition UPDATE policy for shared-write users ──────────────

CREATE POLICY "Shared-write users can update view"
  ON view_definition FOR UPDATE
  TO authenticated
  USING (user_has_view_share(view_id, 'write'))
  WITH CHECK (user_has_view_share(view_id, 'write'));

-- ─── Re-add view_sharing policies using is_view_owner() ──────────────────────

CREATE POLICY "View owners can read their view shares"
  ON view_sharing FOR SELECT
  TO authenticated
  USING (is_view_owner(view_id));

CREATE POLICY "View owners can create shares"
  ON view_sharing FOR INSERT
  TO authenticated
  WITH CHECK (is_view_owner(view_id));

CREATE POLICY "View owners can update shares"
  ON view_sharing FOR UPDATE
  TO authenticated
  USING (is_view_owner(view_id))
  WITH CHECK (is_view_owner(view_id));

CREATE POLICY "View owners can delete shares"
  ON view_sharing FOR DELETE
  TO authenticated
  USING (is_view_owner(view_id));
