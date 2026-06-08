/*
  # Products and Lines of Business

  ## Overview
  Adds a Product Catalogue and Lines of Business configuration layer to the CRM platform.
  Products and Lines of Business drive pipeline selection, form selection, and approval/review
  requirements on Leads and Opportunities.

  ## New Tables

  ### line_of_business
  - Top-level categorisation (e.g. Retail Banking, Corporate Finance)
  - Columns: lob_id, name, description, code, is_active, is_system,
    display_order, business_unit_id, created_at, modified_at, deleted_at

  ### product_family
  - Product family / product line groupings within a line of business
  - Columns: family_id, lob_id (FK), name, description, code,
    is_active, display_order, created_at, modified_at

  ### product
  - Individual product definitions
  - Columns: product_id, family_id (FK nullable), lob_id (FK), name,
    description, code, product_type, is_active, is_system,
    default_process_flow_id (FK nullable), default_form_id (FK nullable),
    requires_approval, requires_compliance_review, requires_technical_review,
    requires_settlement_review, business_unit_id, display_order,
    created_at, created_by, modified_at, modified_by, deleted_at

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read all records
  - Only is_system_admin() can write

  ## Notes
  - Soft delete on line_of_business and product
  - All approval/review flags default false
  - business_unit_id is a soft reference (no FK) to avoid circular dependencies
*/

-- ─── line_of_business ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS line_of_business (
  lob_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  description         text NOT NULL DEFAULT '',
  code                text NOT NULL DEFAULT '',
  is_active           boolean NOT NULL DEFAULT true,
  is_system           boolean NOT NULL DEFAULT false,
  display_order       integer NOT NULL DEFAULT 0,
  business_unit_id    uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

-- ─── product_family ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_family (
  family_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lob_id              uuid REFERENCES line_of_business(lob_id) ON DELETE SET NULL,
  name                text NOT NULL,
  description         text NOT NULL DEFAULT '',
  code                text NOT NULL DEFAULT '',
  is_active           boolean NOT NULL DEFAULT true,
  display_order       integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now()
);

-- ─── product ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product (
  product_id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lob_id                      uuid REFERENCES line_of_business(lob_id) ON DELETE SET NULL,
  family_id                   uuid REFERENCES product_family(family_id) ON DELETE SET NULL,
  name                        text NOT NULL,
  description                 text NOT NULL DEFAULT '',
  code                        text NOT NULL DEFAULT '',
  product_type                text NOT NULL DEFAULT 'standard'
                                CHECK (product_type IN ('standard', 'bundle', 'service', 'subscription', 'internal')),
  is_active                   boolean NOT NULL DEFAULT true,
  is_system                   boolean NOT NULL DEFAULT false,
  default_process_flow_id     uuid REFERENCES process_flow(process_flow_id) ON DELETE SET NULL,
  default_form_id             uuid,
  requires_approval           boolean NOT NULL DEFAULT false,
  requires_compliance_review  boolean NOT NULL DEFAULT false,
  requires_technical_review   boolean NOT NULL DEFAULT false,
  requires_settlement_review  boolean NOT NULL DEFAULT false,
  business_unit_id            uuid,
  display_order               integer NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES auth.users(id),
  modified_at                 timestamptz NOT NULL DEFAULT now(),
  modified_by                 uuid REFERENCES auth.users(id),
  deleted_at                  timestamptz
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_lob_active          ON line_of_business(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lob_order           ON line_of_business(display_order);
CREATE INDEX IF NOT EXISTS idx_family_lob          ON product_family(lob_id);
CREATE INDEX IF NOT EXISTS idx_product_lob         ON product(lob_id);
CREATE INDEX IF NOT EXISTS idx_product_family      ON product(family_id);
CREATE INDEX IF NOT EXISTS idx_product_active      ON product(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_flow        ON product(default_process_flow_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE line_of_business ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_family   ENABLE ROW LEVEL SECURITY;
ALTER TABLE product          ENABLE ROW LEVEL SECURITY;

-- line_of_business
CREATE POLICY "Authenticated users can read lines of business"
  ON line_of_business FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins can insert lines of business"
  ON line_of_business FOR INSERT TO authenticated
  WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can update lines of business"
  ON line_of_business FOR UPDATE TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can delete lines of business"
  ON line_of_business FOR DELETE TO authenticated
  USING (public.is_system_admin());

-- product_family
CREATE POLICY "Authenticated users can read product families"
  ON product_family FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert product families"
  ON product_family FOR INSERT TO authenticated
  WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can update product families"
  ON product_family FOR UPDATE TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can delete product families"
  ON product_family FOR DELETE TO authenticated
  USING (public.is_system_admin());

-- product
CREATE POLICY "Authenticated users can read products"
  ON product FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins can insert products"
  ON product FOR INSERT TO authenticated
  WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can update products"
  ON product FOR UPDATE TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can delete products"
  ON product FOR DELETE TO authenticated
  USING (public.is_system_admin());

-- ─── Seed: Sample Lines of Business, Families, Products ──────────────────────

DO $$
DECLARE
  v_lob_retail    uuid;
  v_lob_corporate uuid;
  v_lob_sme       uuid;
  v_fam_loans     uuid;
  v_fam_cards     uuid;
  v_fam_corp_fin  uuid;
BEGIN
  -- Lines of Business
  INSERT INTO line_of_business (name, description, code, is_active, is_system, display_order)
  VALUES ('Retail Banking', 'Consumer and personal banking products', 'RETAIL', true, true, 0)
  RETURNING lob_id INTO v_lob_retail;

  INSERT INTO line_of_business (name, description, code, is_active, is_system, display_order)
  VALUES ('Corporate Finance', 'Large enterprise and institutional finance', 'CORPORATE', true, true, 1)
  RETURNING lob_id INTO v_lob_corporate;

  INSERT INTO line_of_business (name, description, code, is_active, is_system, display_order)
  VALUES ('SME Banking', 'Small and medium enterprise banking solutions', 'SME', true, true, 2)
  RETURNING lob_id INTO v_lob_sme;

  -- Product Families
  INSERT INTO product_family (lob_id, name, description, code, display_order)
  VALUES (v_lob_retail, 'Loans & Mortgages', 'Personal and home loan products', 'LOANS', 0)
  RETURNING family_id INTO v_fam_loans;

  INSERT INTO product_family (lob_id, name, description, code, display_order)
  VALUES (v_lob_retail, 'Cards & Payments', 'Credit and debit card products', 'CARDS', 1)
  RETURNING family_id INTO v_fam_cards;

  INSERT INTO product_family (lob_id, name, description, code, display_order)
  VALUES (v_lob_corporate, 'Corporate Finance', 'Capital markets and finance products', 'CORP_FIN', 0)
  RETURNING family_id INTO v_fam_corp_fin;

  -- Products
  INSERT INTO product (lob_id, family_id, name, description, code, product_type, is_active, is_system,
    requires_approval, requires_compliance_review, requires_technical_review, requires_settlement_review, display_order)
  VALUES
    (v_lob_retail,    v_fam_loans,    'Personal Loan',          'Unsecured personal lending product',    'PERS_LOAN',   'standard', true, true, false, false, false, false, 0),
    (v_lob_retail,    v_fam_loans,    'Home Mortgage',          'Residential mortgage product',          'HOME_MORT',   'standard', true, true, true,  true,  false, true,  1),
    (v_lob_retail,    v_fam_cards,    'Credit Card',            'Revolving credit card facility',        'CREDIT_CARD', 'standard', true, true, true,  false, false, false, 2),
    (v_lob_corporate, v_fam_corp_fin, 'Corporate Term Loan',    'Structured corporate lending',          'CORP_LOAN',   'standard', true, true, true,  true,  true,  true,  0),
    (v_lob_sme,       NULL,           'SME Business Loan',      'Working capital loan for SMEs',         'SME_LOAN',    'standard', true, true, true,  false, false, true,  0),
    (v_lob_sme,       NULL,           'SME Overdraft Facility', 'Flexible overdraft for business needs', 'SME_OD',      'standard', true, true, false, false, false, false, 1);
END $$;
