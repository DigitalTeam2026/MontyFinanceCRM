/*
  # Move SECURITY DEFINER RPCs to security schema

  1. Problem
    - Six SECURITY DEFINER functions in `public` schema are exposed via PostgREST
    - `fn_list_active_crm_users` and `fn_lookup_user_by_email` are callable by `anon`
    - All six are callable by `authenticated` as SECURITY DEFINER via REST API

  2. Solution
    - Move the SECURITY DEFINER implementations into `security` schema
      (not exposed via PostgREST since it's not in the API schemas)
    - Replace `public` versions with SECURITY INVOKER wrappers that delegate
      to the `security` schema implementations
    - Revoke EXECUTE from `anon` and `public` on all affected functions
    - Grant EXECUTE to `authenticated` only on the public wrappers

  3. Functions affected
    - `fn_get_user_display_map(uuid[])` — resolves user display names
    - `fn_list_active_crm_users()` — lists active CRM users for dropdowns
    - `fn_lookup_user_by_email(text)` — resolves email to user_id
    - `get_table_columns(text)` — returns column names for a table
    - `get_users_in_bu(uuid)` — returns user_ids in a business unit
    - `get_users_in_bu_subtree(uuid)` — returns user_ids in BU subtree

  4. Security
    - SECURITY DEFINER logic hidden from REST API (security schema)
    - Public wrappers are SECURITY INVOKER (safe to expose)
    - All require auth.uid() IS NOT NULL
    - anon cannot execute any of these functions
*/

-- ============================================================
-- 1. fn_get_user_display_map
-- ============================================================
CREATE OR REPLACE FUNCTION security.fn_get_user_display_map(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT cu.user_id,
    COALESCE(NULLIF(TRIM(cu.full_name), ''), cu.email) AS display_name
  FROM crm_user cu
  WHERE cu.user_id = ANY(p_user_ids);
END;
$$;

REVOKE ALL ON FUNCTION security.fn_get_user_display_map(uuid[]) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.fn_get_user_display_map(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT * FROM security.fn_get_user_display_map(p_user_ids);
$$;

REVOKE ALL ON FUNCTION public.fn_get_user_display_map(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_get_user_display_map(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_get_user_display_map(uuid[]) TO authenticated;

-- ============================================================
-- 2. fn_list_active_crm_users
-- ============================================================
CREATE OR REPLACE FUNCTION security.fn_list_active_crm_users()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT cu.user_id, cu.email
  FROM crm_user cu
  WHERE cu.is_active = true
    AND cu.deleted_at IS NULL
  ORDER BY cu.email;
END;
$$;

REVOKE ALL ON FUNCTION security.fn_list_active_crm_users() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.fn_list_active_crm_users()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT * FROM security.fn_list_active_crm_users();
$$;

REVOKE ALL ON FUNCTION public.fn_list_active_crm_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_list_active_crm_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_list_active_crm_users() TO authenticated;

-- ============================================================
-- 3. fn_lookup_user_by_email
-- ============================================================
CREATE OR REPLACE FUNCTION security.fn_lookup_user_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT cu.user_id INTO result_id
  FROM crm_user cu
  WHERE cu.email = p_email
  LIMIT 1;
  RETURN result_id;
END;
$$;

REVOKE ALL ON FUNCTION security.fn_lookup_user_by_email(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.fn_lookup_user_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT security.fn_lookup_user_by_email(p_email);
$$;

REVOKE ALL ON FUNCTION public.fn_lookup_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_lookup_user_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_lookup_user_by_email(text) TO authenticated;

-- ============================================================
-- 4. get_table_columns
-- ============================================================
CREATE OR REPLACE FUNCTION security.get_table_columns(p_table text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
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

REVOKE ALL ON FUNCTION security.get_table_columns(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_table_columns(p_table text)
RETURNS json
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT security.get_table_columns(p_table);
$$;

REVOKE ALL ON FUNCTION public.get_table_columns(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_table_columns(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_table_columns(text) TO authenticated;

-- ============================================================
-- 5. get_users_in_bu
-- ============================================================
CREATE OR REPLACE FUNCTION security.get_users_in_bu(target_bu_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT cu.user_id
  FROM crm_user cu
  WHERE cu.business_unit_id = target_bu_id
    AND cu.is_active = true
    AND cu.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION security.get_users_in_bu(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_users_in_bu(target_bu_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT * FROM security.get_users_in_bu(target_bu_id);
$$;

REVOKE ALL ON FUNCTION public.get_users_in_bu(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_users_in_bu(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu(uuid) TO authenticated;

-- ============================================================
-- 6. get_users_in_bu_subtree
-- ============================================================
CREATE OR REPLACE FUNCTION security.get_users_in_bu_subtree(root_bu_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
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

REVOKE ALL ON FUNCTION security.get_users_in_bu_subtree(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_users_in_bu_subtree(root_bu_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT * FROM security.get_users_in_bu_subtree(root_bu_id);
$$;

REVOKE ALL ON FUNCTION public.get_users_in_bu_subtree(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_users_in_bu_subtree(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) TO authenticated;
