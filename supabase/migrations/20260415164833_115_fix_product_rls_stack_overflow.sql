/*
  # Fix Product RLS Stack Overflow

  ## Problem
  The `product` table SELECT policy calls `fn_check_product_access()`.
  That function was declared as SECURITY INVOKER, meaning it runs as the
  calling user and is subject to RLS. Inside it does:
    SELECT access_mode FROM product WHERE ...
  This triggers the product SELECT policy again → calls fn_check_product_access
  again → infinite recursion → "stack depth limit exceeded" (54001).

  ## Fix
  Recreate `fn_check_product_access` as SECURITY DEFINER with SET search_path.
  As a security-definer function it runs as the function owner (postgres/superuser)
  and bypasses RLS, breaking the recursion. The crm_user reads inside are also
  safe since get_is_system_admin_bypass_rls is already SECURITY DEFINER.

  Also recreate `fn_validate_product_access_on_save` as SECURITY DEFINER for
  the same reason — it also reads from product and crm_user under RLS.
*/

CREATE OR REPLACE FUNCTION public.fn_check_product_access(
  p_product_id uuid,
  p_user_id    uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_access_mode   text;
  v_user_bu_id    uuid;
  v_user_role_ids uuid[];
  v_user_team_ids uuid[];
  v_user_override text;
  v_is_admin      boolean;
BEGIN
  IF p_product_id IS NULL THEN RETURN true; END IF;

  SELECT access_mode INTO v_access_mode
  FROM product
  WHERE product_id = p_product_id AND is_active = true AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_access_mode = 'unrestricted' THEN RETURN true; END IF;

  SELECT is_system_admin INTO v_is_admin
  FROM crm_user WHERE user_id = p_user_id AND is_active = true;
  IF v_is_admin = true THEN RETURN true; END IF;

  SELECT business_unit_id INTO v_user_bu_id
  FROM crm_user WHERE user_id = p_user_id AND is_active = true;

  SELECT array_agg(role_id) INTO v_user_role_ids
  FROM user_role_assignment WHERE user_id = p_user_id;

  SELECT array_agg(team_id) INTO v_user_team_ids
  FROM team_member WHERE user_id = p_user_id;

  SELECT access_type INTO v_user_override
  FROM product_user_access
  WHERE product_id = p_product_id AND crm_user_id = p_user_id;
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
$$;

CREATE OR REPLACE FUNCTION public.fn_validate_product_access_on_save()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM crm_user
    WHERE user_id = (SELECT auth.uid()) AND is_system_admin = true AND is_active = true
  ) THEN RETURN NEW; END IF;

  IF NOT fn_check_product_access(NEW.product_id, (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Product access denied: you do not have permission to assign this product.'
      USING ERRCODE = 'insufficient_privilege',
            HINT    = 'Contact your administrator to request access to this product.';
  END IF;

  RETURN NEW;
END;
$$;
