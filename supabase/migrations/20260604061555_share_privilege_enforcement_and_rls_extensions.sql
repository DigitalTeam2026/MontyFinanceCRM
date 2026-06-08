/*
  # Share Privilege Enforcement and RLS Extensions

  ## Summary
  1. Drops and recreates fn_get_record_shares_for_user to include all 5 permission columns
  2. Adds security.check_share_privilege RPC for validating share privilege
  3. Adds get_record_share_perms RPC for frontend permission checks
  4. Grants execute to authenticated on all new functions

  ## Security
  - All functions are SECURITY DEFINER with explicit search_path
  - EXECUTE granted only to authenticated role
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop and recreate fn_get_record_shares_for_user with full permission cols
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_get_record_shares_for_user(uuid, text);

CREATE FUNCTION public.fn_get_record_shares_for_user(
  p_user_id    uuid,
  p_entity_name text
)
RETURNS TABLE (
  record_id  uuid,
  can_read   boolean,
  can_write  boolean,
  can_delete boolean,
  can_assign boolean,
  can_share  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    rs.record_id,
    bool_or(rs.can_read)   AS can_read,
    bool_or(rs.can_write)  AS can_write,
    bool_or(rs.can_delete) AS can_delete,
    bool_or(rs.can_assign) AS can_assign,
    bool_or(rs.can_share)  AS can_share
  FROM record_share rs
  WHERE rs.entity_name = p_entity_name
    AND (
      (rs.principal_type = 'user' AND rs.principal_id = p_user_id)
      OR
      (rs.principal_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
         WHERE tu.team_id = rs.principal_id
           AND tu.user_id = p_user_id
      ))
    )
  GROUP BY rs.record_id;
$$;

REVOKE ALL ON FUNCTION public.fn_get_record_shares_for_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_record_shares_for_user(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. check_share_privilege: returns true if current user may share the record
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.check_share_privilege(
  p_entity_name text,
  p_record_id   uuid,
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
  v_user_id     uuid := auth.uid();
  v_user_bu_id  uuid;
  v_owner_bu_id uuid;
  v_share_level text;
BEGIN
  SELECT cu.is_system_admin, cu.business_unit_id
    INTO v_is_admin, v_user_bu_id
    FROM public.crm_user cu
   WHERE cu.user_id = v_user_id;

  IF v_is_admin THEN RETURN true; END IF;

  SELECT
    CASE MAX(CASE rp.share_access_level
      WHEN 'organization'  THEN 4
      WHEN 'parent_bu'     THEN 3
      WHEN 'business_unit' THEN 2
      WHEN 'user'          THEN 1
      ELSE 0 END)
    WHEN 4 THEN 'organization'
    WHEN 3 THEN 'parent_bu'
    WHEN 2 THEN 'business_unit'
    WHEN 1 THEN 'user'
    ELSE NULL END
  INTO v_share_level
  FROM public.user_security_role usr
  JOIN public.role_privilege rp
    ON rp.role_id = usr.role_id
   AND rp.entity_name = p_entity_name
  WHERE usr.user_id = v_user_id
    AND rp.can_share = true;

  IF v_share_level IS NULL THEN RETURN false; END IF;
  IF v_share_level = 'organization' THEN RETURN true; END IF;
  IF v_share_level = 'user' THEN RETURN p_owner_id = v_user_id; END IF;

  SELECT cu.business_unit_id INTO v_owner_bu_id
    FROM public.crm_user cu WHERE cu.user_id = p_owner_id;

  IF v_share_level = 'business_unit' THEN
    RETURN v_owner_bu_id = v_user_bu_id;
  END IF;

  IF v_share_level = 'parent_bu' THEN
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

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION security.check_share_privilege(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security.check_share_privilege(text, uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_record_share_perms: effective shared permissions for current user
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_record_share_perms(
  p_entity_name text,
  p_record_id   uuid
)
RETURNS TABLE (
  can_read   boolean,
  can_write  boolean,
  can_delete boolean,
  can_assign boolean,
  can_share  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    bool_or(rs.can_read)   AS can_read,
    bool_or(rs.can_write)  AS can_write,
    bool_or(rs.can_delete) AS can_delete,
    bool_or(rs.can_assign) AS can_assign,
    bool_or(rs.can_share)  AS can_share
  FROM record_share rs
  WHERE rs.entity_name  = p_entity_name
    AND rs.record_id    = p_record_id
    AND (
      (rs.principal_type = 'user' AND rs.principal_id = auth.uid())
      OR
      (rs.principal_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
         WHERE tu.team_id = rs.principal_id
           AND tu.user_id = auth.uid()
      ))
    );
$$;

REVOKE ALL ON FUNCTION public.get_record_share_perms(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_record_share_perms(text, uuid) TO authenticated;
