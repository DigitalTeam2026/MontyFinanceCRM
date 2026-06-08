/*
  # Restore Function Grants and Harden Data-Exposure Functions

  ## Summary
  Grants EXECUTE to `authenticated` on all functions needed by the frontend
  and adds auth.uid() IS NULL guards to data-exposure functions so they
  return empty results when called without a valid session.

  ## Changes
  1. Grant authenticated EXECUTE on frontend-called functions
  2. Rewrite SQL functions with auth guards (using DROP + CREATE)
  3. Revoke anon access from functions with PUBLIC grants

  ## Security Notes
  - SECURITY DEFINER functions guard against unauthenticated callers
  - anon role cannot call data-exposure functions via REST API
*/

-- ============================================================
-- STEP 1: Grant authenticated EXECUTE on functions used by frontend
-- ============================================================
GRANT EXECUTE ON FUNCTION public.fn_get_user_display_map(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bu_subtree(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_table_columns(text) TO authenticated;

-- Process flow functions called by frontend
GRANT EXECUTE ON FUNCTION public.advance_process_stage(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_process_flow_instance(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_process_flow_instance(uuid, uuid, uuid, uuid, uuid) TO authenticated;

-- ============================================================
-- STEP 2: Add auth guards to SQL data-exposure functions
-- ============================================================

-- get_bu_subtree: returns empty table if not authenticated
DROP FUNCTION IF EXISTS public.get_bu_subtree(uuid);
CREATE OR REPLACE FUNCTION public.get_bu_subtree(root_bu_id uuid)
RETURNS TABLE(business_unit_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.get_bu_subtree(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bu_subtree(uuid) TO service_role;

-- get_users_in_bu: returns empty table if not authenticated
DROP FUNCTION IF EXISTS public.get_users_in_bu(uuid);
CREATE OR REPLACE FUNCTION public.get_users_in_bu(target_bu_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.get_users_in_bu(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu(uuid) TO service_role;

-- get_users_in_bu_subtree: returns empty table if not authenticated
DROP FUNCTION IF EXISTS public.get_users_in_bu_subtree(uuid);
CREATE OR REPLACE FUNCTION public.get_users_in_bu_subtree(root_bu_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) TO service_role;

-- get_table_columns: returns empty JSON if not authenticated
DROP FUNCTION IF EXISTS public.get_table_columns(text);
CREATE OR REPLACE FUNCTION public.get_table_columns(p_table text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.get_table_columns(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_table_columns(text) TO service_role;

-- ============================================================
-- STEP 3: Revoke anon access from functions with PUBLIC grants
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.fn_check_policy_condition(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_preflight_data_policies(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_relationship_definition_modified_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_rtr_modified_at() FROM anon;
