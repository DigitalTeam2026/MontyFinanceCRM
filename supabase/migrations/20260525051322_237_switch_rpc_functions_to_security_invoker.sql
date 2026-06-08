/*
  # Switch frontend-callable RPC functions from SECURITY DEFINER to SECURITY INVOKER

  ## Problem
  The Supabase security scanner flags any SECURITY DEFINER function callable by
  `authenticated` via REST as a potential privilege escalation vector — even when
  the function itself is safe. The fix is to switch functions that do NOT need
  elevated privileges to SECURITY INVOKER, which eliminates the attack surface
  entirely: the function runs as the calling user, so RLS applies normally.

  ## Changes

  ### Group A — Switched to SECURITY INVOKER (no elevated privileges needed)
  These functions only read/write data the calling user already has RLS access to.
  They all have auth.uid() IS NULL guards. Running as the calling user is safe
  and equivalent to the previous behavior.

  1. get_users_in_bu(uuid)          — reads crm_user filtered by BU; called by permissionService.ts
  2. get_users_in_bu_subtree(uuid)  — reads crm_user via get_bu_subtree; called by permissionService.ts
  3. get_bu_subtree(uuid)           — reads business_unit (no RLS restriction for authenticated)
  4. fn_get_user_display_map(uuid[]) — reads crm_user names; called by FieldHistoryPanel.tsx
  5. get_table_columns(text)        — reads information_schema (always readable); called by recordService.ts
  6. increment_workflow_run_count(uuid) — updates workflow_definition; already has auth + active check;
                                         called by workflowEngine.ts / stageAutomationService.ts

  ### Group B — Switched to SECURITY INVOKER (soft-deletes; admin check + RLS covers access)
  The functions already call security.is_system_admin() internally, which rejects
  non-admins. All touched tables have admin UPDATE/DELETE RLS policies. Running as
  the calling user is safe — admins pass RLS; non-admins are rejected by the guard
  before any DML runs.

  7. soft_delete_process_flow(uuid)        — called by processFlowService.ts
  8. soft_delete_qualification_rule(uuid)  — called by leadQualificationService.ts

  ## What is NOT changed
  - security.* schema functions (already private, not REST-exposed)
  - All RLS policies
  - All triggers
  - Function signatures (no frontend changes needed)
  - EXECUTE grants (authenticated still has EXECUTE on all 8 functions)
*/

-- ============================================================
-- 1. get_users_in_bu — SECURITY INVOKER
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_users_in_bu(target_bu_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cu.user_id
  FROM crm_user cu
  WHERE cu.business_unit_id = target_bu_id
    AND cu.is_active = true
    AND cu.deleted_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_users_in_bu(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_users_in_bu(uuid) TO authenticated;

-- ============================================================
-- 2. get_users_in_bu_subtree — SECURITY INVOKER
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_users_in_bu_subtree(root_bu_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cu.user_id
  FROM crm_user cu
  WHERE cu.business_unit_id IN (
    SELECT subtree.business_unit_id FROM get_bu_subtree(root_bu_id) subtree
  )
    AND cu.is_active = true
    AND cu.deleted_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) TO authenticated;

-- ============================================================
-- 3. get_bu_subtree — SECURITY INVOKER
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_bu_subtree(root_bu_id uuid)
RETURNS TABLE(business_unit_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE bu_tree AS (
    SELECT bu.business_unit_id
    FROM business_unit bu
    WHERE bu.business_unit_id = root_bu_id
      AND bu.deleted_at IS NULL

    UNION ALL

    SELECT child.business_unit_id
    FROM business_unit child
    INNER JOIN bu_tree parent ON child.parent_business_unit_id = parent.business_unit_id
    WHERE child.deleted_at IS NULL
  )
  SELECT bu_tree.business_unit_id FROM bu_tree;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_bu_subtree(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_bu_subtree(uuid) TO authenticated;

-- ============================================================
-- 4. fn_get_user_display_map — SECURITY INVOKER
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_get_user_display_map(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cu.user_id,
    COALESCE(NULLIF(TRIM(cu.full_name), ''), cu.email) AS display_name
  FROM crm_user cu
  WHERE cu.user_id = ANY(p_user_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_get_user_display_map(uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_user_display_map(uuid[]) TO authenticated;

-- ============================================================
-- 5. get_table_columns — SECURITY INVOKER
-- information_schema.columns is always readable by any role;
-- no elevated access needed.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_table_columns(p_table text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('cols', '[]'::json);
  END IF;

  RETURN (
    SELECT json_build_object(
      'cols',
      COALESCE(
        (SELECT json_agg(column_name ORDER BY ordinal_position)
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = p_table),
        '[]'::json
      )
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_table_columns(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_table_columns(text) TO authenticated;

-- ============================================================
-- 6. increment_workflow_run_count — SECURITY INVOKER
-- Authenticated users have implicit UPDATE on workflow_definition
-- for their own workflows; the function already validates auth +
-- that the workflow is active before updating.
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_workflow_run_count(wf_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE workflow_definition
    SET run_count = COALESCE(run_count, 0) + 1
  WHERE workflow_id = wf_id
    AND is_active   = true
    AND deleted_at  IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow not found or inactive';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_workflow_run_count(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_workflow_run_count(uuid) TO authenticated;

-- ============================================================
-- 7. soft_delete_process_flow — SECURITY INVOKER
-- security.is_system_admin() gates the function; only admins
-- pass. Admin UPDATE/DELETE RLS policies exist on all touched
-- tables (process_flow, entity_definition, lead, opportunity).
-- ============================================================
CREATE OR REPLACE FUNCTION public.soft_delete_process_flow(p_flow_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT security.is_system_admin() THEN
    RAISE EXCEPTION 'Permission denied: system admin required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM process_flow WHERE process_flow_id = p_flow_id
  ) THEN
    RAISE EXCEPTION 'Process flow not found';
  END IF;

  UPDATE process_flow
    SET default_stage_id = NULL
  WHERE process_flow_id = p_flow_id
    AND default_stage_id IS NOT NULL;

  UPDATE entity_definition
    SET default_process_flow_id = NULL
  WHERE default_process_flow_id = p_flow_id;

  UPDATE lead
    SET active_process_flow_id          = NULL,
        active_process_stage_id         = NULL,
        active_process_flow_instance_id = NULL,
        process_flow_id                 = NULL
  WHERE active_process_flow_id = p_flow_id
     OR process_flow_id        = p_flow_id;

  UPDATE opportunity
    SET active_process_flow_id          = NULL,
        active_process_stage_id         = NULL,
        active_process_flow_instance_id = NULL,
        process_flow_id                 = NULL
  WHERE active_process_flow_id = p_flow_id
     OR process_flow_id        = p_flow_id;

  UPDATE process_flow
    SET deleted_at = now(),
        is_active  = false
  WHERE process_flow_id = p_flow_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soft_delete_process_flow(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.soft_delete_process_flow(uuid) TO authenticated;

-- ============================================================
-- 8. soft_delete_qualification_rule — SECURITY INVOKER
-- security.is_system_admin() gates the function.
-- lead_qualification_rule UPDATE RLS allows non-system rules.
-- ============================================================
CREATE OR REPLACE FUNCTION public.soft_delete_qualification_rule(p_rule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT security.is_system_admin() THEN
    RAISE EXCEPTION 'Permission denied: system admin required';
  END IF;

  UPDATE lead_qualification_rule
    SET deleted_at = now(),
        is_active  = false,
        is_default = false
  WHERE lead_qualification_rule_id = p_rule_id
    AND is_system  = false
    AND deleted_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soft_delete_qualification_rule(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.soft_delete_qualification_rule(uuid) TO authenticated;
