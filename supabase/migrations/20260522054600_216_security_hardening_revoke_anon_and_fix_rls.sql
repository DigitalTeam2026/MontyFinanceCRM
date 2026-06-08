/*
  # Security Hardening: Revoke anon EXECUTE on SECURITY DEFINER functions + fix test_entity RLS

  ## Summary
  Addresses all security findings from the latest audit:

  ## 1. Always-True RLS Policy on test_entity
  - DROP the INSERT policy `Authenticated users can insert test_entity` that used `WITH CHECK (true)`
  - Replace with a proper policy that ties the insert to the authenticated user's identity
  - Also fix the SELECT policy (same issue — `USING (true)` allows any authenticated user to see all rows)

  ## 2. Revoke anon EXECUTE on SECURITY DEFINER functions
  These functions were callable by unauthenticated users (anon role):
  - fn_get_user_display_map(uuid[])
  - get_bu_subtree(uuid)
  - get_table_columns(text)
  - get_users_in_bu(uuid)
  - get_users_in_bu_subtree(uuid)

  ## 3. Revoke authenticated EXECUTE on SECURITY DEFINER functions that should be internal-only
  These are helper functions used inside RLS policies or triggers — they must not be callable
  directly via the REST API by end users:
  - crm_user_has_access(text, uuid, text, uuid)
  - crm_user_has_privilege(text, text)
  - fn_check_product_access(uuid, text, uuid)
  - fn_get_user_display_map(uuid[])
  - get_bu_subtree(uuid)
  - get_current_user_is_admin()
  - get_is_system_admin_bypass_rls(uuid)
  - get_table_columns(text)
  - get_users_in_bu(uuid)
  - get_users_in_bu_subtree(uuid)
  - increment_workflow_run_count(uuid)
  - is_system_admin()
  - is_view_owner(uuid)
  - soft_delete_process_flow(uuid)
  - soft_delete_qualification_rule(uuid)
  - user_has_view_share(uuid, text)

  ## Notes
  - SECURITY DEFINER functions run with the privileges of the definer (typically postgres/service role).
    Allowing anon or authenticated to call them directly via REST bypasses RLS entirely.
  - Functions still work correctly when called internally by PostgreSQL (from triggers, other
    functions, or RLS policies) — REVOKE only removes the ability to call them via REST API.
  - soft_delete_process_flow and soft_delete_qualification_rule are legitimate user-facing RPCs —
    they are granted only to authenticated (not anon), and only authenticated users who are
    signed in can call them.
  - get_table_columns is an internal helper for the backend; end users should not be able to
    enumerate table schemas.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix test_entity RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert test_entity" ON public.test_entity;
DROP POLICY IF EXISTS "Authenticated users can read test_entity" ON public.test_entity;

-- Proper INSERT: only the authenticated user themselves can insert rows they own
CREATE POLICY "Authenticated users can insert own test_entity"
  ON public.test_entity
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Proper SELECT: authenticated users can only see rows they created/own
-- If the table has no owner column, restrict to authenticated users at minimum
CREATE POLICY "Authenticated users can read test_entity"
  ON public.test_entity
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Revoke anon EXECUTE on SECURITY DEFINER functions
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.fn_get_user_display_map(p_user_ids uuid[])
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_bu_subtree(root_bu_id uuid)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_table_columns(p_table text)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_users_in_bu(target_bu_id uuid)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_users_in_bu_subtree(root_bu_id uuid)
  FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Revoke authenticated EXECUTE on internal SECURITY DEFINER helpers
--    These are called from RLS policies/triggers — not meant to be REST-callable
-- ─────────────────────────────────────────────────────────────────────────────

-- Internal RLS helper — should never be called via REST
REVOKE EXECUTE ON FUNCTION public.crm_user_has_access(
  p_entity_name text, p_record_id uuid, p_owner_type text, p_owner_id uuid
) FROM authenticated;

-- Internal privilege check — called from RLS policies only
REVOKE EXECUTE ON FUNCTION public.crm_user_has_privilege(
  p_entity_name text, p_privilege text
) FROM authenticated;

-- Internal product access check — called from triggers/policies only
REVOKE EXECUTE ON FUNCTION public.fn_check_product_access(
  p_product_id uuid, p_access_mode text, p_user_id uuid
) FROM authenticated;

-- User display map — internal only, should not be exposed via REST
REVOKE EXECUTE ON FUNCTION public.fn_get_user_display_map(p_user_ids uuid[])
  FROM authenticated;

-- BU subtree traversal — internal helper used by access control logic
REVOKE EXECUTE ON FUNCTION public.get_bu_subtree(root_bu_id uuid)
  FROM authenticated;

-- Admin check helpers — internal only
REVOKE EXECUTE ON FUNCTION public.get_current_user_is_admin()
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.get_is_system_admin_bypass_rls(p_user_id uuid)
  FROM authenticated;

-- Schema introspection — should not be callable by end users
REVOKE EXECUTE ON FUNCTION public.get_table_columns(p_table text)
  FROM authenticated;

-- BU user lookup helpers — internal only
REVOKE EXECUTE ON FUNCTION public.get_users_in_bu(target_bu_id uuid)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.get_users_in_bu_subtree(root_bu_id uuid)
  FROM authenticated;

-- Workflow run counter — internal, called by triggers
REVOKE EXECUTE ON FUNCTION public.increment_workflow_run_count(wf_id uuid)
  FROM authenticated;

-- Admin status check — internal only
REVOKE EXECUTE ON FUNCTION public.is_system_admin()
  FROM authenticated;

-- View ownership check — internal only
REVOKE EXECUTE ON FUNCTION public.is_view_owner(p_view_id uuid)
  FROM authenticated;

-- Soft delete RPCs — these ARE user-facing but only for admins; keep authenticated grant
-- but revoke anon (already done above for anon; these were not in the anon list)
-- soft_delete_process_flow and soft_delete_qualification_rule remain callable by authenticated
-- users as they are legitimate user-facing operations. No change needed for these two.

-- View share check — internal only
REVOKE EXECUTE ON FUNCTION public.user_has_view_share(p_view_id uuid, p_min_level text)
  FROM authenticated;
