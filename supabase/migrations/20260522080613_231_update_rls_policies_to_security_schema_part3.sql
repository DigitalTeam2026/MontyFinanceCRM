
/*
  # Update RLS policies part 3: All admin-only tables using is_system_admin()
  Replace public.is_system_admin() with security.is_system_admin() across
  all remaining tables that still reference the old public schema function.
  Skips policies already updated (those already containing security.is_system_admin).
*/

DO $$
DECLARE
  r record;
  v_qual text;
  v_with_check text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        qual       LIKE '%is_system_admin()%'
        OR with_check LIKE '%is_system_admin()%'
      )
      AND qual       NOT LIKE '%security.is_system_admin()%'
      AND (with_check IS NULL OR with_check NOT LIKE '%security.is_system_admin()%')
  LOOP
    v_qual       := replace(coalesce(r.qual, ''),       'is_system_admin()', 'security.is_system_admin()');
    v_with_check := replace(coalesce(r.with_check, ''), 'is_system_admin()', 'security.is_system_admin()');
    IF v_with_check = '' THEN v_with_check := NULL; END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);

    IF r.cmd = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
        r.policyname, r.tablename, v_qual
      );
    ELSIF r.cmd = 'INSERT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
        r.policyname, r.tablename, v_with_check
      );
    ELSIF r.cmd = 'UPDATE' THEN
      IF v_with_check IS NOT NULL THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
          r.policyname, r.tablename, v_qual, v_with_check
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s)',
          r.policyname, r.tablename, v_qual
        );
      END IF;
    ELSIF r.cmd = 'DELETE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
        r.policyname, r.tablename, v_qual
      );
    END IF;
  END LOOP;
END $$;

-- view_definition: user_has_view_share
DROP POLICY IF EXISTS "Users can read views shared with them" ON public.view_definition;
CREATE POLICY "Users can read views shared with them"
  ON public.view_definition FOR SELECT TO authenticated
  USING (security.user_has_view_share(view_id, 'read'));

DROP POLICY IF EXISTS "Shared-write users can update view" ON public.view_definition;
CREATE POLICY "Shared-write users can update view"
  ON public.view_definition FOR UPDATE TO authenticated
  USING (security.user_has_view_share(view_id, 'write'))
  WITH CHECK (security.user_has_view_share(view_id, 'write'));

-- view_sharing: is_view_owner
DROP POLICY IF EXISTS "View owners can read their view shares" ON public.view_sharing;
CREATE POLICY "View owners can read their view shares"
  ON public.view_sharing FOR SELECT TO authenticated
  USING (security.is_view_owner(view_id));

DROP POLICY IF EXISTS "View owners can delete shares" ON public.view_sharing;
CREATE POLICY "View owners can delete shares"
  ON public.view_sharing FOR DELETE TO authenticated
  USING (security.is_view_owner(view_id));

DROP POLICY IF EXISTS "View owners can update shares" ON public.view_sharing;
CREATE POLICY "View owners can update shares"
  ON public.view_sharing FOR UPDATE TO authenticated
  USING (security.is_view_owner(view_id))
  WITH CHECK (security.is_view_owner(view_id));

-- product SELECT policy
DROP POLICY IF EXISTS "Authenticated users can read products" ON public.product;
CREATE POLICY "Authenticated users can read products"
  ON public.product FOR SELECT TO authenticated
  USING (
    security.is_system_admin()
    OR (
      is_active = true
      AND deleted_at IS NULL
      AND security.fn_check_product_access(product_id, access_mode, auth.uid())
    )
  );

-- record_share SELECT
DROP POLICY IF EXISTS "Users can view shares where they are principal or sharer" ON public.record_share;
CREATE POLICY "Users can view shares where they are principal or sharer"
  ON public.record_share FOR SELECT TO authenticated
  USING (
    security.is_system_admin()
    OR principal_id = auth.uid()
    OR shared_by    = auth.uid()
  );
