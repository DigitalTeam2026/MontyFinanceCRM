/*
  # Fix product access function and align all entity RLS with privilege system

  ## Problem
  1. security.fn_check_product_access referenced non-existent tables
     (user_role_assignment -> user_security_role, team_member -> team_user),
     causing product SELECT to always fail for non-admin users.
  2. Several reference/lookup entity tables (product, product_family, country,
     currency, business_unit, security_role, team, organization) used admin-only
     INSERT/UPDATE/DELETE policies. Users with CRM security roles granting
     privileges on these entities received 403 errors.

  ## Changes

  ### 1. Fix security.fn_check_product_access
  - Change `user_role_assignment` -> `user_security_role`
  - Change `team_member` -> `team_user`
  - Now correctly resolves role-based and team-based product access

  ### 2. Product table — privilege-based CRUD
  - SELECT: add privilege fallback so users with read privilege can see products
  - INSERT/UPDATE/DELETE: allow users with matching role privileges

  ### 3. Product Family — privilege-based CRUD
  - INSERT/UPDATE/DELETE: allow users with matching role privileges

  ### 4. Country, Currency — privilege-based CRUD
  - INSERT/UPDATE: allow users with matching role privileges

  ### 5. Business Unit, Security Role, Team, Organization — privilege-based CRUD
  - INSERT/UPDATE: allow users with matching role privileges

  ## Security
  - All policies require authenticated role
  - security.crm_user_has_privilege() checks both admin status and role grants
  - System admins retain full access through the function's admin check
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FIX security.fn_check_product_access — wrong table references
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION security.fn_check_product_access(
  p_product_id uuid,
  p_access_mode text,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
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
  FROM public.user_security_role WHERE user_id = v_real_user_id;

  SELECT array_agg(team_id) INTO v_user_team_ids
  FROM public.team_user WHERE user_id = v_real_user_id;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PRODUCT — privilege-based CRUD + fix SELECT for privilege holders
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can read products" ON public.product;
DROP POLICY IF EXISTS "Admins can insert products" ON public.product;
DROP POLICY IF EXISTS "Admins can update products" ON public.product;
DROP POLICY IF EXISTS "Admins can delete products" ON public.product;

CREATE POLICY "Users can read products with access"
  ON public.product
  FOR SELECT
  TO authenticated
  USING (
    security.is_system_admin()
    OR (
      is_active = true
      AND deleted_at IS NULL
      AND (
        security.fn_check_product_access(product_id, access_mode, auth.uid())
        OR security.crm_user_has_privilege('product', 'can_read')
      )
    )
  );

CREATE POLICY "Privileged users can insert products"
  ON public.product
  FOR INSERT
  TO authenticated
  WITH CHECK (security.crm_user_has_privilege('product', 'can_create'));

CREATE POLICY "Privileged users can update products"
  ON public.product
  FOR UPDATE
  TO authenticated
  USING (security.crm_user_has_privilege('product', 'can_write'))
  WITH CHECK (security.crm_user_has_privilege('product', 'can_write'));

CREATE POLICY "Privileged users can delete products"
  ON public.product
  FOR DELETE
  TO authenticated
  USING (security.crm_user_has_privilege('product', 'can_delete'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PRODUCT_FAMILY — privilege-based CRUD
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can insert product families" ON public.product_family;
DROP POLICY IF EXISTS "Admins can update product families" ON public.product_family;
DROP POLICY IF EXISTS "Admins can delete product families" ON public.product_family;

CREATE POLICY "Privileged users can insert product families"
  ON public.product_family
  FOR INSERT
  TO authenticated
  WITH CHECK (security.crm_user_has_privilege('product_family', 'can_create'));

CREATE POLICY "Privileged users can update product families"
  ON public.product_family
  FOR UPDATE
  TO authenticated
  USING (security.crm_user_has_privilege('product_family', 'can_write'))
  WITH CHECK (security.crm_user_has_privilege('product_family', 'can_write'));

CREATE POLICY "Privileged users can delete product families"
  ON public.product_family
  FOR DELETE
  TO authenticated
  USING (security.crm_user_has_privilege('product_family', 'can_delete'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. COUNTRY — privilege-based writes
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "System admins can insert countries" ON public.country;
DROP POLICY IF EXISTS "System admins can update countries" ON public.country;

CREATE POLICY "Privileged users can insert countries"
  ON public.country
  FOR INSERT
  TO authenticated
  WITH CHECK (security.crm_user_has_privilege('country', 'can_create'));

CREATE POLICY "Privileged users can update countries"
  ON public.country
  FOR UPDATE
  TO authenticated
  USING (security.crm_user_has_privilege('country', 'can_write'))
  WITH CHECK (security.crm_user_has_privilege('country', 'can_write'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CURRENCY — privilege-based writes
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "System admins can insert currencies" ON public.currency;
DROP POLICY IF EXISTS "System admins can update currencies" ON public.currency;

CREATE POLICY "Privileged users can insert currencies"
  ON public.currency
  FOR INSERT
  TO authenticated
  WITH CHECK (security.crm_user_has_privilege('currency', 'can_create'));

CREATE POLICY "Privileged users can update currencies"
  ON public.currency
  FOR UPDATE
  TO authenticated
  USING (security.crm_user_has_privilege('currency', 'can_write'))
  WITH CHECK (security.crm_user_has_privilege('currency', 'can_write'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. BUSINESS_UNIT — privilege-based writes
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "System admins can insert business units" ON public.business_unit;
DROP POLICY IF EXISTS "System admins can update business units" ON public.business_unit;

CREATE POLICY "Privileged users can insert business units"
  ON public.business_unit
  FOR INSERT
  TO authenticated
  WITH CHECK (security.crm_user_has_privilege('business_unit', 'can_create'));

CREATE POLICY "Privileged users can update business units"
  ON public.business_unit
  FOR UPDATE
  TO authenticated
  USING (security.crm_user_has_privilege('business_unit', 'can_write'))
  WITH CHECK (security.crm_user_has_privilege('business_unit', 'can_write'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. SECURITY_ROLE — privilege-based writes
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "System admins can insert security roles" ON public.security_role;
DROP POLICY IF EXISTS "System admins can update security roles" ON public.security_role;

CREATE POLICY "Privileged users can insert security roles"
  ON public.security_role
  FOR INSERT
  TO authenticated
  WITH CHECK (security.crm_user_has_privilege('security_role', 'can_create'));

CREATE POLICY "Privileged users can update security roles"
  ON public.security_role
  FOR UPDATE
  TO authenticated
  USING (security.crm_user_has_privilege('security_role', 'can_write'))
  WITH CHECK (security.crm_user_has_privilege('security_role', 'can_write'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. TEAM — privilege-based writes
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "System admins can insert teams" ON public.team;
DROP POLICY IF EXISTS "System admins can update teams" ON public.team;

CREATE POLICY "Privileged users can insert teams"
  ON public.team
  FOR INSERT
  TO authenticated
  WITH CHECK (security.crm_user_has_privilege('team', 'can_create'));

CREATE POLICY "Privileged users can update teams"
  ON public.team
  FOR UPDATE
  TO authenticated
  USING (security.crm_user_has_privilege('team', 'can_write'))
  WITH CHECK (security.crm_user_has_privilege('team', 'can_write'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. ORGANIZATION — privilege-based writes
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "System admins can insert organizations" ON public.organization;
DROP POLICY IF EXISTS "System admins can update organizations" ON public.organization;

CREATE POLICY "Privileged users can insert organizations"
  ON public.organization
  FOR INSERT
  TO authenticated
  WITH CHECK (security.crm_user_has_privilege('organization', 'can_create'));

CREATE POLICY "Privileged users can update organizations"
  ON public.organization
  FOR UPDATE
  TO authenticated
  USING (security.crm_user_has_privilege('organization', 'can_write'))
  WITH CHECK (security.crm_user_has_privilege('organization', 'can_write'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
