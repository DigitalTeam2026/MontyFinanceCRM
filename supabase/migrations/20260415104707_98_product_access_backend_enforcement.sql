/*
  # Product Access Backend Enforcement

  ## Summary
  Moves product access control from client-side filtering to server-side enforcement.
  Previously, the frontend called `resolveProductVisibility()` in TypeScript to filter
  products — this was UX-only and could be bypassed. This migration adds:

  1. **`fn_check_product_access(p_product_id, p_user_id)`** — a SECURITY DEFINER
     function that evaluates the full access resolution logic (deny override → allow
     override → BU match → role match → team match → unrestricted fallback).

  2. **RLS SELECT policy on `product`** — replaces the current permissive read with
     a policy that calls `fn_check_product_access`. Now the database itself filters
     which products a user can see, making it impossible to retrieve a restricted
     product by guessing its ID.

  3. **`fn_validate_product_access_on_save()`** — a BEFORE INSERT/UPDATE trigger
     function on `lead` and `opportunity` tables. When a `product_id` field is set,
     it verifies the current user has access. Raises a 403-class exception if not,
     preventing the save entirely without any client cooperation.

  ## Security Notes
  - All functions use SECURITY DEFINER to read crm_user, product_*_access tables
    directly, bypassing any intermediate RLS on those helper tables.
  - The trigger fires on INSERT and UPDATE when product_id is non-null, including
    bulk operations and imports.
  - NULL product_id is always allowed (no product selected = no restriction).
  - System admins (is_system_admin = true) always pass access checks.

  ## Tables Affected
  - `product` — RLS SELECT policy added
  - `lead` — BEFORE INSERT/UPDATE trigger added
  - `opportunity` — BEFORE INSERT/UPDATE trigger added
*/

-- ─── 1. Core access check function ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_check_product_access(
  p_product_id uuid,
  p_user_id    uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_access_mode     text;
  v_user_bu_id      uuid;
  v_user_role_ids   uuid[];
  v_user_team_ids   uuid[];
  v_user_override   text;
  v_is_admin        boolean;
BEGIN
  -- NULL product = always allowed (no restriction)
  IF p_product_id IS NULL THEN RETURN true; END IF;

  -- Fetch product access_mode
  SELECT access_mode INTO v_access_mode
  FROM product
  WHERE product_id = p_product_id AND is_active = true AND deleted_at IS NULL;

  -- Product not found or deleted = deny
  IF NOT FOUND THEN RETURN false; END IF;

  -- Unrestricted products are visible to everyone
  IF v_access_mode = 'unrestricted' THEN RETURN true; END IF;

  -- System admins always have access
  SELECT is_system_admin INTO v_is_admin
  FROM crm_user WHERE user_id = p_user_id AND is_active = true;
  IF v_is_admin = true THEN RETURN true; END IF;

  -- Collect user's principal data
  SELECT business_unit_id INTO v_user_bu_id
  FROM crm_user WHERE user_id = p_user_id AND is_active = true;

  SELECT array_agg(role_id) INTO v_user_role_ids
  FROM user_role_assignment WHERE user_id = p_user_id;

  SELECT array_agg(team_id) INTO v_user_team_ids
  FROM team_member WHERE user_id = p_user_id;

  -- Check per-user deny override (hard stop — deny always wins)
  SELECT access_type INTO v_user_override
  FROM product_user_access
  WHERE product_id = p_product_id AND crm_user_id = p_user_id;

  IF v_user_override = 'deny' THEN RETURN false; END IF;
  IF v_user_override = 'allow' THEN RETURN true; END IF;

  -- Check BU match
  IF v_user_bu_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM product_business_unit_access
      WHERE product_id = p_product_id AND business_unit_id = v_user_bu_id
    ) THEN RETURN true; END IF;
  END IF;

  -- Check role match
  IF v_user_role_ids IS NOT NULL AND array_length(v_user_role_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM product_role_access
      WHERE product_id = p_product_id AND role_id = ANY(v_user_role_ids)
    ) THEN RETURN true; END IF;
  END IF;

  -- Check team match
  IF v_user_team_ids IS NOT NULL AND array_length(v_user_team_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM product_team_access
      WHERE product_id = p_product_id AND team_id = ANY(v_user_team_ids)
    ) THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$$;

-- ─── 2. Replace permissive product SELECT policy with access-checked one ──────

-- Drop the old permissive read policies if they exist
DO $$
BEGIN
  -- Drop any prior open "read all" policy
  DROP POLICY IF EXISTS "Authenticated users can read active products" ON product;
  DROP POLICY IF EXISTS "Authenticated users can read products" ON product;
  DROP POLICY IF EXISTS "All authenticated users can read products" ON product;
END $$;

-- New filtered SELECT policy
CREATE POLICY "Users can only read products they have access to"
  ON product FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND is_active = true
    AND fn_check_product_access(product_id, auth.uid())
  );

-- ─── 3. Trigger function — validates product_id on lead/opportunity save ──────

CREATE OR REPLACE FUNCTION fn_validate_product_access_on_save()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only validate when product_id is being set to a non-null value
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip for system admins
  IF EXISTS (
    SELECT 1 FROM crm_user
    WHERE user_id = auth.uid() AND is_system_admin = true AND is_active = true
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT fn_check_product_access(NEW.product_id, auth.uid()) THEN
    RAISE EXCEPTION 'Product access denied: you do not have permission to assign this product.'
      USING ERRCODE = 'insufficient_privilege',
            HINT    = 'Contact your administrator to request access to this product.';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 4. Attach trigger to lead table ─────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_validate_product_access_lead ON lead;

CREATE TRIGGER trg_validate_product_access_lead
  BEFORE INSERT OR UPDATE ON lead
  FOR EACH ROW
  WHEN (NEW.product_id IS NOT NULL)
  EXECUTE FUNCTION fn_validate_product_access_on_save();

-- ─── 5. Attach trigger to opportunity table ───────────────────────────────────

DROP TRIGGER IF EXISTS trg_validate_product_access_opportunity ON opportunity;

CREATE TRIGGER trg_validate_product_access_opportunity
  BEFORE INSERT OR UPDATE ON opportunity
  FOR EACH ROW
  WHEN (NEW.product_id IS NOT NULL)
  EXECUTE FUNCTION fn_validate_product_access_on_save();

-- ─── 6. Expose check function via RPC for frontend pre-validation ──────────

-- Grant execute to authenticated role so frontend can call it directly
GRANT EXECUTE ON FUNCTION fn_check_product_access(uuid, uuid) TO authenticated;

-- ─── 7. Index to speed up the access resolution queries ──────────────────────

CREATE INDEX IF NOT EXISTS idx_product_bu_access_bu ON product_business_unit_access(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_product_role_access_role ON product_role_access(role_id);
CREATE INDEX IF NOT EXISTS idx_product_team_access_team ON product_team_access(team_id);
CREATE INDEX IF NOT EXISTS idx_product_user_access_user_product ON product_user_access(crm_user_id, product_id);
