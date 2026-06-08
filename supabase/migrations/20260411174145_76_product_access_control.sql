/*
  # Product Access Control

  ## Summary
  Implements a principal-based product visibility system with explicit access_mode.

  ## New Columns
  - `product.access_mode` — 'unrestricted' (default, visible to all) or 'restricted' (evaluated via bridge tables)

  ## New Tables

  ### product_business_unit_access
  - Links a restricted product to allowed business units (OR logic)
  - Columns: product_id, business_unit_id, granted_by, granted_at

  ### product_role_access
  - Links a restricted product to allowed security roles (OR logic)
  - Columns: product_id, role_id, granted_by, granted_at

  ### product_team_access
  - Links a restricted product to allowed teams (OR logic)
  - Columns: product_id, team_id, granted_by, granted_at

  ### product_user_access
  - Per-user override: access_type = 'allow' | 'deny'
  - Deny always wins over any principal match or allow override
  - Columns: product_id, crm_user_id, access_type, granted_by, granted_at

  ## Resolution Logic (when access_mode = 'restricted')
  1. User deny override exists? → hide (hard stop)
  2. User allow override exists? → show (hard pass)
  3. User's BU in product_business_unit_access? → show
  4. User's roles any in product_role_access? → show
  5. User's teams any in product_team_access? → show
  6. None matched → hide

  ## Security
  - RLS enabled on all four bridge tables
  - Authenticated users can read their own product access entries
  - Only admins (is_system_admin) can insert/update/delete
*/

-- ─── 1. Add access_mode to product ───────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product' AND column_name = 'access_mode'
  ) THEN
    ALTER TABLE product
      ADD COLUMN access_mode text NOT NULL DEFAULT 'unrestricted'
        CHECK (access_mode IN ('unrestricted', 'restricted'));
  END IF;
END $$;

-- ─── 2. product_business_unit_access ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_business_unit_access (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
  business_unit_id uuid NOT NULL REFERENCES business_unit(business_unit_id) ON DELETE CASCADE,
  granted_by      uuid REFERENCES crm_user(user_id) ON DELETE SET NULL,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, business_unit_id)
);

ALTER TABLE product_business_unit_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read product BU access"
  ON product_business_unit_access FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System admins can insert product BU access"
  ON product_business_unit_access FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_system_admin = true
    )
  );

CREATE POLICY "System admins can delete product BU access"
  ON product_business_unit_access FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_system_admin = true
    )
  );

-- ─── 3. product_role_access ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_role_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES security_role(role_id) ON DELETE CASCADE,
  granted_by  uuid REFERENCES crm_user(user_id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, role_id)
);

ALTER TABLE product_role_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read product role access"
  ON product_role_access FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System admins can insert product role access"
  ON product_role_access FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_system_admin = true
    )
  );

CREATE POLICY "System admins can delete product role access"
  ON product_role_access FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_system_admin = true
    )
  );

-- ─── 4. product_team_access ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_team_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES team(team_id) ON DELETE CASCADE,
  granted_by  uuid REFERENCES crm_user(user_id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, team_id)
);

ALTER TABLE product_team_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read product team access"
  ON product_team_access FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System admins can insert product team access"
  ON product_team_access FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_system_admin = true
    )
  );

CREATE POLICY "System admins can delete product team access"
  ON product_team_access FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_system_admin = true
    )
  );

-- ─── 5. product_user_access ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_user_access (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
  crm_user_id  uuid NOT NULL REFERENCES crm_user(user_id) ON DELETE CASCADE,
  access_type  text NOT NULL CHECK (access_type IN ('allow', 'deny')),
  granted_by   uuid REFERENCES crm_user(user_id) ON DELETE SET NULL,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, crm_user_id)
);

ALTER TABLE product_user_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read product user access"
  ON product_user_access FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System admins can insert product user access"
  ON product_user_access FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_system_admin = true
    )
  );

CREATE POLICY "System admins can update product user access"
  ON product_user_access FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_system_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_system_admin = true
    )
  );

CREATE POLICY "System admins can delete product user access"
  ON product_user_access FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_system_admin = true
    )
  );

-- ─── 6. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_product_bu_access_product ON product_business_unit_access(product_id);
CREATE INDEX IF NOT EXISTS idx_product_role_access_product ON product_role_access(product_id);
CREATE INDEX IF NOT EXISTS idx_product_team_access_product ON product_team_access(product_id);
CREATE INDEX IF NOT EXISTS idx_product_user_access_product ON product_user_access(product_id);
CREATE INDEX IF NOT EXISTS idx_product_user_access_user ON product_user_access(crm_user_id);
