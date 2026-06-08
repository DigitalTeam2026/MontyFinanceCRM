/*
  # Revoke PUBLIC execute on all SECURITY DEFINER functions

  1. Changes
    - Revoke EXECUTE from PUBLIC role on all SECURITY DEFINER functions
      (this removes inherited access for anon and authenticated)
    - Grant EXECUTE back to authenticated on functions the frontend needs
    - Trigger functions and internal helpers get no grants (engine-invoked only)

  2. Important Notes
    - PostgreSQL grants EXECUTE to PUBLIC by default on all functions
    - REVOKE from anon/authenticated alone is ineffective due to PUBLIC inheritance
    - Functions used in RLS policies still work because RLS runs as SECURITY DEFINER
    - Frontend RPC calls: soft_delete_process_flow, soft_delete_qualification_rule,
      increment_workflow_run_count, fn_check_product_access
    - RLS/session helpers called from client: is_system_admin, get_current_user_is_admin,
      crm_user_has_access, crm_user_has_privilege, is_view_owner, user_has_view_share
*/

-- ============================================================================
-- Revoke PUBLIC EXECUTE on all SECURITY DEFINER functions
-- ============================================================================

-- Trigger functions (no one should call these via RPC)
REVOKE EXECUTE ON FUNCTION public.fn_trigger_data_policy_check() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_validate_product_access_on_save() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_stage_is_terminal() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_provision_entity_statecodes() FROM PUBLIC;

-- Internal helpers (used by other functions/triggers/RLS, not called directly)
REVOKE EXECUTE ON FUNCTION public._add_status_column_if_missing(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_entity_statecodes(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_is_system_admin_bypass_rls(uuid) FROM PUBLIC;

-- Process flow functions not used by frontend
REVOKE EXECUTE ON FUNCTION public.advance_process_stage(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_process_flow_instance(uuid, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_or_create_process_flow_instance(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;

-- Frontend RPC functions - revoke public, grant back to authenticated
REVOKE EXECUTE ON FUNCTION public.soft_delete_process_flow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_process_flow(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.soft_delete_qualification_rule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_qualification_rule(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_workflow_run_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_workflow_run_count(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_check_product_access(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_check_product_access(uuid, text, uuid) TO authenticated;

-- RLS/session helpers - used by client-side permission checks
REVOKE EXECUTE ON FUNCTION public.is_system_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_current_user_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.crm_user_has_access(text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_user_has_access(text, uuid, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.crm_user_has_privilege(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_user_has_privilege(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_view_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_view_owner(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.user_has_view_share(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_view_share(uuid, text) TO authenticated;
