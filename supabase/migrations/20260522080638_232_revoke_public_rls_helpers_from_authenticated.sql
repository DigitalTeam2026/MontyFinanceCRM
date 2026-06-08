
/*
  # Revoke authenticated EXECUTE on all public schema RLS helper functions

  All RLS policies now use security.* functions. The public.* versions
  are no longer referenced by any policy and must not be callable via RPC.
  Revoke EXECUTE from authenticated on all of them.

  The functions remain in public schema for internal/trigger use by postgres
  and service_role only.
*/

REVOKE EXECUTE ON FUNCTION public.is_system_admin() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_user_has_access(text, uuid, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_user_has_privilege(text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_check_product_access(uuid, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_bu_subtree(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_users_in_bu(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_get_user_display_map(uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_table_columns(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_workflow_run_count(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_process_stage(uuid, uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_process_flow_instance(uuid, uuid, uuid, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_process_flow_instance(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_process_flow(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_qualification_rule(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_view_owner(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.user_has_view_share(uuid, text) FROM authenticated;

-- Re-grant only the functions that must remain callable via RPC by authenticated users
-- (workflow count, process flow operations are called from the frontend)
GRANT EXECUTE ON FUNCTION public.fn_get_user_display_map(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_table_columns(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_workflow_run_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_process_stage(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_process_flow_instance(uuid, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_process_flow_instance(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_process_flow(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_qualification_rule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bu_subtree(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) TO authenticated;
