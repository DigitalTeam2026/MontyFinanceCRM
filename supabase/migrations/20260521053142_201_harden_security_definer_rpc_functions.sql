/*
  # Harden SECURITY DEFINER functions exposed via PostgREST RPC

  These 10 functions are SECURITY DEFINER and callable by `authenticated` via
  `/rest/v1/rpc/...`. They must remain callable because RLS policies reference
  them and RLS evaluation runs as the current user (who needs EXECUTE privilege).

  ## Changes

  1. **fn_check_product_access** — Overrides the `p_user_id` parameter with
     `auth.uid()` so callers cannot impersonate another user.

  2. **increment_workflow_run_count** — Adds authentication check and verifies
     the target workflow exists and is active before incrementing.

  3. The remaining 8 functions (`is_system_admin`, `get_current_user_is_admin`,
     `crm_user_has_access`, `crm_user_has_privilege`, `is_view_owner`,
     `user_has_view_share`, `soft_delete_process_flow`,
     `soft_delete_qualification_rule`) already scope all logic to `auth.uid()`
     and cannot be abused by an authenticated caller. No changes needed.

  ## Security notes
  - `fn_check_product_access`: even when called directly via API, the user can
    now only check their own product access, not another user's.
  - `increment_workflow_run_count`: now rejects unauthenticated calls and
    prevents incrementing non-existent or inactive workflows.
*/

-- 1. Harden fn_check_product_access: force p_user_id = auth.uid()
CREATE OR REPLACE FUNCTION public.fn_check_product_access(
  p_product_id uuid,
  p_access_mode text,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_real_user_id  uuid;
  v_user_bu_id    uuid;
  v_user_role_ids uuid[];
  v_user_team_ids uuid[];
  v_user_override text;
  v_is_admin      boolean;
BEGIN
  -- Always use the authenticated user, ignore the parameter
  v_real_user_id := auth.uid();
  IF v_real_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_product_id IS NULL THEN RETURN true; END IF;
  IF p_access_mode = 'unrestricted' THEN RETURN true; END IF;

  SELECT is_system_admin INTO v_is_admin
    FROM crm_user WHERE user_id = v_real_user_id AND is_active = true;
  IF v_is_admin = true THEN RETURN true; END IF;

  SELECT business_unit_id INTO v_user_bu_id
    FROM crm_user WHERE user_id = v_real_user_id AND is_active = true;

  SELECT array_agg(role_id) INTO v_user_role_ids
    FROM user_role_assignment WHERE user_id = v_real_user_id;

  SELECT array_agg(team_id) INTO v_user_team_ids
    FROM team_member WHERE user_id = v_real_user_id;

  SELECT access_type INTO v_user_override
    FROM product_user_access
    WHERE product_id = p_product_id AND crm_user_id = v_real_user_id;
  IF v_user_override = 'deny'  THEN RETURN false; END IF;
  IF v_user_override = 'allow' THEN RETURN true;  END IF;

  IF v_user_bu_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM product_business_unit_access
      WHERE product_id = p_product_id AND business_unit_id = v_user_bu_id
    ) THEN RETURN true; END IF;
  END IF;

  IF v_user_role_ids IS NOT NULL AND array_length(v_user_role_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM product_role_access
      WHERE product_id = p_product_id AND role_id = ANY(v_user_role_ids)
    ) THEN RETURN true; END IF;
  END IF;

  IF v_user_team_ids IS NOT NULL AND array_length(v_user_team_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM product_team_access
      WHERE product_id = p_product_id AND team_id = ANY(v_user_team_ids)
    ) THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$function$;

-- 2. Harden increment_workflow_run_count: require auth + valid active workflow
CREATE OR REPLACE FUNCTION public.increment_workflow_run_count(wf_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE workflow_definition
    SET run_count = COALESCE(run_count, 0) + 1
    WHERE workflow_id = wf_id
      AND is_active = true
      AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow not found or inactive';
  END IF;
END;
$function$;

-- Re-apply privilege grants (unchanged from migration 200)
REVOKE EXECUTE ON FUNCTION public.fn_check_product_access(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_check_product_access(uuid, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_workflow_run_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_workflow_run_count(uuid) TO authenticated;
