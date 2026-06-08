/*
  # Fix Product RLS Recursion - Final Fix

  ## Problem
  The product SELECT policy calls fn_check_product_access(product_id, ...).
  Inside that function there is: SELECT access_mode FROM product WHERE product_id = ...
  Even with SECURITY DEFINER, this inner SELECT on the product table triggers the
  same SELECT RLS policy again → infinite recursion → stack depth limit exceeded.

  ## Fix
  1. Drop the old SELECT policy and old function signature first.
  2. Recreate fn_check_product_access with a new signature that accepts access_mode
     as a parameter — eliminating the SELECT FROM product inside the function.
  3. Recreate the SELECT policy passing access_mode from the current row directly.
  The function never touches the product table, breaking the recursion entirely.
*/

-- Drop the dependent policy first, then the old function
DROP POLICY IF EXISTS "Users can only read products they have access to" ON public.product;
DROP FUNCTION IF EXISTS public.fn_check_product_access(uuid, uuid);

-- Recreate with access_mode passed in (no SELECT FROM product inside)
CREATE OR REPLACE FUNCTION public.fn_check_product_access(
  p_product_id  uuid,
  p_access_mode text,
  p_user_id     uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_bu_id    uuid;
  v_user_role_ids uuid[];
  v_user_team_ids uuid[];
  v_user_override text;
  v_is_admin      boolean;
BEGIN
  IF p_product_id IS NULL THEN RETURN true; END IF;
  IF p_access_mode = 'unrestricted' THEN RETURN true; END IF;

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

-- Recreate SELECT policy — passes access_mode from the current row, no re-query needed
CREATE POLICY "Users can only read products they have access to"
  ON public.product
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND is_active = true
    AND fn_check_product_access(product_id, access_mode, (SELECT auth.uid()))
  );

-- Update the save-validation trigger function to use the new 3-arg signature
CREATE OR REPLACE FUNCTION public.fn_validate_product_access_on_save()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_access_mode text;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM crm_user
    WHERE user_id = (SELECT auth.uid()) AND is_system_admin = true AND is_active = true
  ) THEN RETURN NEW; END IF;

  SELECT access_mode INTO v_access_mode
  FROM product
  WHERE product_id = NEW.product_id AND is_active = true AND deleted_at IS NULL;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NOT fn_check_product_access(NEW.product_id, v_access_mode, (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Product access denied: you do not have permission to assign this product.'
      USING ERRCODE = 'insufficient_privilege',
            HINT    = 'Contact your administrator to request access to this product.';
  END IF;

  RETURN NEW;
END;
$$;
