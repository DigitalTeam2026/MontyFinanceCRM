/*
  # MontyPay Line of Business and Products

  ## Summary
  Creates the MontyPay Line of Business and seeds the four MontyPay products
  that will drive product-scoped process flows throughout the CRM.

  ## New Data

  ### Line of Business
  - `MontyPay` — the parent LOB for all MontyPay products

  ### Products (all under MontyPay LOB)
  1. MontyPay Payment Gateway
  2. MontyPay SOFT POS
  3. MontyPay Point of Sale
  4. MontyPay Website Development

  ## Notes
  - All products have requires_approval, requires_compliance_review,
    requires_technical_review, and requires_settlement_review = true
  - Products are standard type, active, not system-locked
  - Idempotent: uses INSERT ... ON CONFLICT DO NOTHING
*/

DO $$
DECLARE
  v_lob_id uuid;
  v_pg_id  uuid;
  v_sp_id  uuid;
  v_pos_id uuid;
  v_wd_id  uuid;
BEGIN

  -- ── Line of Business ────────────────────────────────────────────────────────
  INSERT INTO line_of_business (name, description, code, is_active, is_system, display_order)
  VALUES ('MontyPay', 'MontyPay payment and technology solutions', 'MONTYPAY', true, false, 10)
  ON CONFLICT DO NOTHING;

  SELECT lob_id INTO v_lob_id FROM line_of_business WHERE code = 'MONTYPAY' LIMIT 1;

  -- ── Products ────────────────────────────────────────────────────────────────

  -- MontyPay Payment Gateway
  INSERT INTO product (
    lob_id, name, description, code, product_type, is_active, is_system,
    requires_approval, requires_compliance_review, requires_technical_review, requires_settlement_review,
    display_order
  ) VALUES (
    v_lob_id,
    'MontyPay Payment Gateway',
    'Online payment gateway solution for e-commerce and digital businesses',
    'MP-PG',
    'service', true, false,
    true, true, true, true,
    10
  ) ON CONFLICT DO NOTHING;

  -- MontyPay SOFT POS
  INSERT INTO product (
    lob_id, name, description, code, product_type, is_active, is_system,
    requires_approval, requires_compliance_review, requires_technical_review, requires_settlement_review,
    display_order
  ) VALUES (
    v_lob_id,
    'MontyPay SOFT POS',
    'Software-based point of sale solution for mobile and tablet devices',
    'MP-SOFTPOS',
    'service', true, false,
    true, true, true, true,
    20
  ) ON CONFLICT DO NOTHING;

  -- MontyPay Point of Sale
  INSERT INTO product (
    lob_id, name, description, code, product_type, is_active, is_system,
    requires_approval, requires_compliance_review, requires_technical_review, requires_settlement_review,
    display_order
  ) VALUES (
    v_lob_id,
    'MontyPay Point of Sale',
    'Hardware and software point of sale solution for retail merchants',
    'MP-POS',
    'service', true, false,
    true, true, true, true,
    30
  ) ON CONFLICT DO NOTHING;

  -- MontyPay Website Development
  INSERT INTO product (
    lob_id, name, description, code, product_type, is_active, is_system,
    requires_approval, requires_compliance_review, requires_technical_review, requires_settlement_review,
    display_order
  ) VALUES (
    v_lob_id,
    'MontyPay Website Development',
    'Website design and development services for merchant digital presence',
    'MP-WD',
    'service', true, false,
    true, true, true, false,
    40
  ) ON CONFLICT DO NOTHING;

END $$;
