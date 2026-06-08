/*
  # Fix crm_user_has_access to respect read_access_level from role_privilege

  ## Summary
  The `crm_user_has_access` function is used in RLS SELECT policies for account, contact,
  lead, opportunity, ticket, and other entities. Previously it only allowed access to records
  where the user is the owner or the record is explicitly shared — ignoring the access level
  configured in role_privilege.

  This migration rewrites the function to check the user's `read_access_level`:
  - `organization` → user can see ALL records of that entity (no ownership filter)
  - `parent_bu`    → user can see records owned by users in their BU subtree
  - `business_unit`→ user can see records owned by users in the same BU
  - `user`         → user can see only their own records (previous behaviour)

  Also updates `crm_user_has_privilege` to handle the `can_read` privilege key.

  ## Changes
  1. Recreate `crm_user_has_access` with full access-level logic
  2. Recreate `crm_user_has_privilege` to include `can_read`
  3. Revoke public execute, grant to authenticated

  ## Security
  Both functions remain SECURITY DEFINER with fixed search_path = 'public'.
  Existing RLS policies are unchanged — they automatically benefit from the updated logic.
*/

-- ─── 1. Recreate crm_user_has_access ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crm_user_has_access(
  p_entity_name text,
  p_record_id   uuid,
  p_owner_type  text,
  p_owner_id    uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_admin      boolean;
  v_user_bu_id    uuid;
  v_owner_bu_id   uuid;
  v_max_level     text;
BEGIN
  -- System admin bypass
  SELECT cu.is_system_admin, cu.business_unit_id
  INTO v_is_admin, v_user_bu_id
  FROM crm_user cu
  WHERE cu.user_id = auth.uid();

  IF v_is_admin THEN RETURN true; END IF;

  -- Resolve the highest read_access_level the user has for this entity
  SELECT MAX(
    CASE rp.read_access_level
      WHEN 'organization'  THEN 4
      WHEN 'parent_bu'     THEN 3
      WHEN 'business_unit' THEN 2
      WHEN 'user'          THEN 1
      ELSE 0
    END
  ) INTO v_max_level
  FROM user_security_role usr
  JOIN role_privilege rp
    ON rp.role_id = usr.role_id
   AND rp.entity_name = p_entity_name
  WHERE usr.user_id = auth.uid()
    AND rp.can_read = true;

  -- organisation: sees everything
  IF v_max_level = '4' THEN RETURN true; END IF;

  -- Explicit record shares (user or team) — always checked regardless of access level
  IF EXISTS (
    SELECT 1 FROM record_share rs
    WHERE rs.entity_name = p_entity_name
      AND rs.record_id   = p_record_id
      AND rs.can_read    = true
      AND rs.principal_type = 'user'
      AND rs.principal_id   = auth.uid()
  ) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM record_share rs
    JOIN team_user tu ON tu.team_id = rs.principal_id
    WHERE rs.entity_name = p_entity_name
      AND rs.record_id   = p_record_id
      AND rs.can_read    = true
      AND rs.principal_type = 'team'
      AND tu.user_id = auth.uid()
  ) THEN RETURN true; END IF;

  -- Team ownership
  IF p_owner_type = 'team' THEN
    RETURN EXISTS (
      SELECT 1 FROM team_user tu
      WHERE tu.team_id = p_owner_id AND tu.user_id = auth.uid()
    );
  END IF;

  -- From here on: owner must be a user
  IF p_owner_type != 'user' THEN RETURN false; END IF;

  -- User-level: must own the record
  IF p_owner_id = auth.uid() THEN RETURN true; END IF;

  -- Business-unit: owner must be in the same BU
  IF v_max_level IN ('2', '3') AND v_user_bu_id IS NOT NULL THEN
    SELECT cu.business_unit_id INTO v_owner_bu_id
    FROM crm_user cu WHERE cu.user_id = p_owner_id;

    IF v_max_level = '2' THEN
      -- same BU only
      RETURN v_owner_bu_id = v_user_bu_id;
    ELSE
      -- parent_bu: owner must be in the subtree rooted at v_user_bu_id
      RETURN EXISTS (
        WITH RECURSIVE bu_tree AS (
          SELECT business_unit_id FROM business_unit
          WHERE business_unit_id = v_user_bu_id
          UNION ALL
          SELECT bu.business_unit_id FROM business_unit bu
          JOIN bu_tree t ON bu.parent_business_unit_id = t.business_unit_id
        )
        SELECT 1 FROM bu_tree WHERE business_unit_id = v_owner_bu_id
      );
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- ─── 2. Update crm_user_has_privilege to handle can_read ─────────────────────

CREATE OR REPLACE FUNCTION public.crm_user_has_privilege(
  p_entity_name text,
  p_privilege   text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
SELECT
  EXISTS (
    SELECT 1 FROM crm_user cu
    WHERE cu.user_id = auth.uid()
      AND cu.is_system_admin = true
  )
  OR
  EXISTS (
    SELECT 1
    FROM user_security_role usr
    JOIN role_privilege rp
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

-- ─── 3. Permissions ──────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.crm_user_has_access(text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_user_has_access(text, uuid, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.crm_user_has_privilege(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_user_has_privilege(text, text) TO authenticated;
