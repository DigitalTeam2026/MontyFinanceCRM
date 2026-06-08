
/*
  # Move internal RLS helper functions to private security schema

  Creates a private `security` schema and moves all internal RLS helper
  functions there. The public schema versions are kept temporarily as
  thin wrappers pointing to security.* (dropped in the next migration).

  This closes the attack surface where SECURITY DEFINER functions were
  callable via /rest/v1/rpc/ by authenticated users.

  Changes:
  - New schema: security
  - Revoke all broad grants on security schema from public/anon
  - Grant USAGE on security schema to authenticated (needed for RLS)
  - Recreate all RLS helper functions in security schema with SECURITY DEFINER + safe search_path
  - Grant EXECUTE on each security.* function only to authenticated
*/

CREATE SCHEMA IF NOT EXISTS security;

REVOKE ALL ON SCHEMA security FROM public;
REVOKE ALL ON SCHEMA security FROM anon;
GRANT USAGE ON SCHEMA security TO authenticated;

CREATE OR REPLACE FUNCTION security.get_is_system_admin_bypass_rls(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT is_system_admin FROM public.crm_user WHERE user_id = p_user_id),
    false
  );
$$;

CREATE OR REPLACE FUNCTION security.get_current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT security.get_is_system_admin_bypass_rls(auth.uid());
$$;

CREATE OR REPLACE FUNCTION security.is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT security.get_current_user_is_admin();
$$;

CREATE OR REPLACE FUNCTION security.crm_user_has_access(
  p_entity_name text,
  p_record_id   uuid,
  p_owner_type  text,
  p_owner_id    uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin    boolean;
  v_user_bu_id  uuid;
  v_owner_bu_id uuid;
  v_max_level   text;
BEGIN
  SELECT cu.is_system_admin, cu.business_unit_id
    INTO v_is_admin, v_user_bu_id
    FROM public.crm_user cu
   WHERE cu.user_id = auth.uid();

  IF v_is_admin THEN RETURN true; END IF;

  SELECT MAX(
    CASE rp.read_access_level
      WHEN 'organization'  THEN 4
      WHEN 'parent_bu'     THEN 3
      WHEN 'business_unit' THEN 2
      WHEN 'user'          THEN 1
      ELSE 0
    END
  ) INTO v_max_level
  FROM public.user_security_role usr
  JOIN public.role_privilege rp
    ON rp.role_id = usr.role_id
   AND rp.entity_name = p_entity_name
  WHERE usr.user_id = auth.uid()
    AND rp.can_read = true;

  IF v_max_level = '4' THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.record_share rs
    WHERE rs.entity_name    = p_entity_name
      AND rs.record_id      = p_record_id
      AND rs.can_read       = true
      AND rs.principal_type = 'user'
      AND rs.principal_id   = auth.uid()
  ) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.record_share rs
    JOIN public.team_user tu ON tu.team_id = rs.principal_id
    WHERE rs.entity_name    = p_entity_name
      AND rs.record_id      = p_record_id
      AND rs.can_read       = true
      AND rs.principal_type = 'team'
      AND tu.user_id        = auth.uid()
  ) THEN RETURN true; END IF;

  IF p_owner_type = 'team' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.team_user tu
      WHERE tu.team_id = p_owner_id AND tu.user_id = auth.uid()
    );
  END IF;

  IF p_owner_type != 'user' THEN RETURN false; END IF;
  IF p_owner_id = auth.uid() THEN RETURN true; END IF;

  IF v_max_level IN ('2', '3') AND v_user_bu_id IS NOT NULL THEN
    SELECT cu.business_unit_id INTO v_owner_bu_id
      FROM public.crm_user cu WHERE cu.user_id = p_owner_id;

    IF v_max_level = '2' THEN
      RETURN v_owner_bu_id = v_user_bu_id;
    ELSE
      RETURN EXISTS (
        WITH RECURSIVE bu_tree AS (
          SELECT business_unit_id FROM public.business_unit
          WHERE business_unit_id = v_user_bu_id
          UNION ALL
          SELECT bu.business_unit_id FROM public.business_unit bu
          JOIN bu_tree t ON bu.parent_business_unit_id = t.business_unit_id
        )
        SELECT 1 FROM bu_tree WHERE business_unit_id = v_owner_bu_id
      );
    END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION security.crm_user_has_privilege(
  p_entity_name text,
  p_privilege   text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.crm_user cu
      WHERE cu.user_id = auth.uid() AND cu.is_system_admin = true
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.user_security_role usr
      JOIN public.role_privilege rp
        ON rp.role_id = usr.role_id
       AND rp.entity_name = p_entity_name
      WHERE usr.user_id = auth.uid()
        AND CASE p_privilege
          WHEN 'can_create' THEN rp.can_create
          WHEN 'can_read'   THEN rp.can_read
          WHEN 'can_write'  THEN rp.can_write
          WHEN 'can_delete' THEN rp.can_delete
          WHEN 'can_assign' THEN rp.can_assign
          WHEN 'can_share'  THEN rp.can_share
          ELSE false
        END = true
    );
$$;

CREATE OR REPLACE FUNCTION security.fn_check_product_access(
  p_product_id  uuid,
  p_access_mode text,
  p_user_id     uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_real_user_id  uuid;
  v_user_bu_id    uuid;
  v_user_role_ids uuid[];
  v_user_team_ids uuid[];
  v_user_override text;
  v_is_admin      boolean;
BEGIN
  v_real_user_id := auth.uid();
  IF v_real_user_id IS NULL THEN RETURN false; END IF;
  IF p_product_id IS NULL THEN RETURN true; END IF;
  IF p_access_mode = 'unrestricted' THEN RETURN true; END IF;

  SELECT is_system_admin INTO v_is_admin
    FROM public.crm_user WHERE user_id = v_real_user_id AND is_active = true;
  IF v_is_admin = true THEN RETURN true; END IF;

  SELECT business_unit_id INTO v_user_bu_id
    FROM public.crm_user WHERE user_id = v_real_user_id AND is_active = true;

  SELECT array_agg(role_id) INTO v_user_role_ids
    FROM public.user_role_assignment WHERE user_id = v_real_user_id;

  SELECT array_agg(team_id) INTO v_user_team_ids
    FROM public.team_member WHERE user_id = v_real_user_id;

  SELECT access_type INTO v_user_override
    FROM public.product_user_access
   WHERE product_id = p_product_id AND crm_user_id = v_real_user_id;
  IF v_user_override = 'deny'  THEN RETURN false; END IF;
  IF v_user_override = 'allow' THEN RETURN true;  END IF;

  IF v_user_bu_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.product_business_unit_access
      WHERE product_id = p_product_id AND business_unit_id = v_user_bu_id
    ) THEN RETURN true; END IF;
  END IF;

  IF v_user_role_ids IS NOT NULL AND array_length(v_user_role_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.product_role_access
      WHERE product_id = p_product_id AND role_id = ANY(v_user_role_ids)
    ) THEN RETURN true; END IF;
  END IF;

  IF v_user_team_ids IS NOT NULL AND array_length(v_user_team_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.product_team_access
      WHERE product_id = p_product_id AND team_id = ANY(v_user_team_ids)
    ) THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION security.is_view_owner(p_view_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.view_definition
    WHERE view_id = p_view_id AND created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION security.user_has_view_share(p_view_id uuid, p_min_level text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.view_sharing
    WHERE view_id = p_view_id
      AND shared_with_user_id = auth.uid()
      AND (p_min_level = 'read' OR permission_level = 'write')
  );
$$;

REVOKE ALL ON FUNCTION security.get_is_system_admin_bypass_rls(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION security.get_current_user_is_admin() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION security.is_system_admin() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION security.crm_user_has_access(text, uuid, text, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION security.crm_user_has_privilege(text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION security.fn_check_product_access(uuid, text, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION security.is_view_owner(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION security.user_has_view_share(uuid, text) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION security.is_system_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION security.crm_user_has_access(text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION security.crm_user_has_privilege(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION security.fn_check_product_access(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION security.is_view_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION security.user_has_view_share(uuid, text) TO authenticated;
