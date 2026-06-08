/*
  # Drop duplicate product-access triggers

  1. Changes
    - Drop `trg_validate_product_access` on `lead` (duplicate, no WHEN clause)
    - Drop `trg_validate_product_access` on `opportunity` (duplicate, no WHEN clause)
    - Keep the properly scoped `trg_validate_product_access_lead` and
      `trg_validate_product_access_opportunity` triggers (with WHEN clause)
    - Update `fn_validate_product_access_on_save` to also bypass when
      the current role is `service_role` (edge-function admin client)

  2. Reason
    - The duplicate triggers fire on ALL updates, even when product_id
      is unchanged. This causes spurious "Product access denied" errors
      when edge functions update unrelated fields (e.g. state_code)
      via the service-role client.
*/

-- Drop the duplicate triggers (no WHEN clause)
DROP TRIGGER IF EXISTS trg_validate_product_access ON lead;
DROP TRIGGER IF EXISTS trg_validate_product_access ON opportunity;

-- Update the function to also skip when running as service_role
CREATE OR REPLACE FUNCTION fn_validate_product_access_on_save()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access_mode text;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  -- Service-role / superuser context: skip check
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;
  IF current_setting('role', true) = 'service_role' THEN RETURN NEW; END IF;

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
