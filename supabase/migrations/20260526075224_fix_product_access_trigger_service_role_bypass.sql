/*
  # Fix product access trigger to allow service_role operations

  1. Problem
    - The `fn_validate_product_access_on_save` trigger checks `auth.uid()` for product access
    - When called from edge functions using service_role key, `auth.uid()` is NULL
    - This causes the trigger to fail with "permission to assign this product"
    - Affects the delete-rules edge function when it updates lead records

  2. Fix
    - Add an early return when `auth.uid()` is NULL, which indicates a service_role
      or superuser context where product access restrictions should not apply
*/

CREATE OR REPLACE FUNCTION public.fn_validate_product_access_on_save()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_access_mode text;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  -- Service-role / superuser context: no auth.uid(), skip check
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;

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
$function$;
