/*
  # Revoke vestigial RPCs and harden soft-delete functions

  ## Summary

  ### Group A — Revoked from authenticated (zero frontend call sites confirmed by full codebase audit)
  These three process flow RPCs exist in the DB but are never called via supabase.rpc()
  anywhere in the React frontend. The frontend drives process flow entirely through
  direct table operations. Revoking removes the REST API attack surface.

    - advance_process_stage(uuid, uuid, uuid, text)
    - complete_process_flow_instance(uuid, text, uuid, text)
    - get_or_create_process_flow_instance(uuid, uuid, uuid, uuid, uuid)

  fn_evaluate_data_policies (both overloads) are trigger-internal functions.
  They are called exclusively by fn_trigger_data_policy_check() which executes
  under postgres/service_role context via trigger. No frontend code calls them.

  ### Group B — Frontend-called, kept with authenticated EXECUTE, internal guards verified
  These functions ARE called by the React frontend via supabase.rpc() and must
  remain callable. They already have auth.uid() IS NULL guards or admin checks:

    - get_users_in_bu            → permissionService.ts (login-critical, Promise.all)
    - get_users_in_bu_subtree    → permissionService.ts (login-critical, Promise.all)
    - get_table_columns          → recordService.ts (every INSERT/UPDATE)
    - fn_get_user_display_map    → FieldHistoryPanel.tsx
    - increment_workflow_run_count → workflowEngine.ts / stageAutomationService.ts
    - get_bu_subtree             → used by security.crm_user_has_access RLS chain
    - soft_delete_process_flow   → processFlowService.ts (admin UI)
    - soft_delete_qualification_rule → leadQualificationService.ts (admin UI)

  ### Group C — Soft-delete functions hardened
  Both soft-delete functions are recreated with:
    - security.is_system_admin() guard (non-bypassable, private schema)
    - SET search_path = public, pg_temp (prevents search path injection)
    - authenticated EXECUTE preserved (frontend calls them; admin check inside enforces access)

  ### NOT changed
  - get_users_in_bu, get_users_in_bu_subtree (login-critical — breaking these breaks login)
  - get_table_columns (save-critical — breaking this breaks all record saves)
  - All security.* schema functions
  - All RLS policies
  - All triggers
  - Supabase Auth settings
*/

-- ============================================================
-- REVOKE: vestigial process flow RPCs (never called by frontend)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.advance_process_stage(uuid, uuid, uuid, text)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_process_flow_instance(uuid, text, uuid, text)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.get_or_create_process_flow_instance(uuid, uuid, uuid, uuid, uuid)
  FROM authenticated;

-- Both overloads: trigger-internal only
REVOKE EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb, text, jsonb)
  FROM authenticated;

-- ============================================================
-- HARDEN: soft_delete_process_flow
-- Switch admin check to security.is_system_admin() (private schema)
-- Add hardened search_path
-- ============================================================

CREATE OR REPLACE FUNCTION public.soft_delete_process_flow(p_flow_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
-- HARDEN: soft_delete_qualification_rule
-- Add security.is_system_admin() check (previously only checked auth.uid() IS NULL,
-- meaning any authenticated user could soft-delete any non-system rule)
-- ============================================================

CREATE OR REPLACE FUNCTION public.soft_delete_qualification_rule(p_rule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
