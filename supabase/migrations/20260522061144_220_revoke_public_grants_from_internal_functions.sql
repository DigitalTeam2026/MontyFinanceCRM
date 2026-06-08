/*
  # Revoke PUBLIC Grants from Internal Functions

  ## Summary
  Several functions have a PUBLIC role grant (shown as =X/postgres in pg_proc.proacl),
  meaning any database role — including unauthenticated — can invoke them via PostgREST.
  This migration removes those PUBLIC grants from all internal and trigger functions.

  ## Functions Affected
  - fn_check_policy_condition: trigger helper for data policy evaluation
  - fn_evaluate_data_policies(text, jsonb): trigger helper (public overload)
  - fn_preflight_data_policies: called from trigger; has data-exposure potential
  - get_bu_subtree: data function (already has auth guard, but PUBLIC grant is still risky)
  - get_table_columns: data function (already has auth guard, but PUBLIC grant is still risky)
  - get_users_in_bu: data function (already has auth guard, but PUBLIC grant is still risky)
  - get_users_in_bu_subtree: data function (already has auth guard, but PUBLIC grant is still risky)
  - provision_entity_statecodes(): admin bootstrap, must not be publicly callable
  - set_relationship_definition_modified_at: trigger function
  - update_rtr_modified_at: trigger function

  ## Security Notes
  - REVOKE FROM PUBLIC removes the inherited grant from all roles
  - We then explicitly re-grant to the roles that legitimately need access
  - Trigger functions only need postgres/service_role
  - Data functions need authenticated (for frontend calls) + service_role
*/

-- ============================================================
-- Trigger / internal helpers — postgres + service_role only
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.fn_check_policy_condition(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_check_policy_condition(text, text, text) TO postgres, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb) TO postgres, service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_preflight_data_policies(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_preflight_data_policies(text, jsonb) TO postgres, service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.set_relationship_definition_modified_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_relationship_definition_modified_at() TO postgres, service_role;

REVOKE EXECUTE ON FUNCTION public.update_rtr_modified_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_rtr_modified_at() TO postgres, service_role;

-- provision_entity_statecodes (no-arg overload is the one with PUBLIC grant)
DO $$
BEGIN
  BEGIN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.provision_entity_statecodes() FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.provision_entity_statecodes() TO postgres, service_role';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

-- ============================================================
-- Data-exposure functions — remove PUBLIC but keep authenticated
-- (these have auth.uid() IS NULL guards but PUBLIC grant is still
-- unnecessary and allows unauthenticated PostgREST discovery)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.get_bu_subtree(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bu_subtree(uuid) TO postgres, service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_table_columns(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_table_columns(text) TO postgres, service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_users_in_bu(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu(uuid) TO postgres, service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) TO postgres, service_role, authenticated;
