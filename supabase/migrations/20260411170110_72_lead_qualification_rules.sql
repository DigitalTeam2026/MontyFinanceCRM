/*
  # Lead Qualification / Conversion Rules

  ## Overview
  Provides a dedicated admin configuration area for what happens when a Lead is
  qualified (converted). Admins can define multiple named qualification rule sets
  (e.g. "Standard Sales Qualification", "SMB Fast-Track"). Each rule set controls:

    - Which target records are created (Account, Contact, Opportunity)
    - Whether each target creation is automatic or optional (user decides at qualify time)
    - Which Process Flow / Pipeline the created Opportunity enters
    - Whether to inherit the Lead's Line of Business / Products
    - Whether to run duplicate detection before creating Account / Contact
    - Field-level mapping: which Lead field maps to which Account / Contact / Opportunity field

  ## New Tables

  ### 1. lead_qualification_rule
  Top-level configuration record for one qualification rule set.

  Columns:
  - lead_qualification_rule_id (uuid PK)
  - name                 — friendly label shown during qualification
  - description          — internal notes
  - is_active            — only active rules are offered during qualification
  - is_default           — exactly one rule can be the default (used when none is selected)
  - is_system            — system-seeded rules cannot be deleted

  Account creation settings:
  - create_account       — 'always' | 'optional' | 'never'
  - check_duplicate_account (boolean) — run duplicate detection before creating

  Contact creation settings:
  - create_contact       — 'always' | 'optional' | 'never'
  - check_duplicate_contact (boolean)

  Opportunity creation settings:
  - create_opportunity   — 'always' | 'optional' | 'never'
  - default_process_flow_id (uuid FK → process_flow, nullable)
    — which pipeline the created Opportunity enters
  - inherit_line_of_business (boolean) — copy LOB from Lead to Opportunity
  - inherit_products         (boolean) — copy associated products

  Timestamps:
  - created_at, modified_at, deleted_at

  ### 2. lead_qualification_field_mapping
  Each row maps one Lead field to a target field on Account, Contact, or Opportunity.

  Columns:
  - lead_qualification_field_mapping_id (uuid PK)
  - lead_qualification_rule_id (uuid FK → lead_qualification_rule)
  - target_entity   — 'account' | 'contact' | 'opportunity'
  - lead_field      — logical name of the source field on Lead
  - target_field    — logical name of the destination field on target entity
  - is_required     — whether the mapping must succeed for qualification to proceed
  - transform       — optional jsonb: { type: 'static'|'concat'|'map', ... }
  - display_order   (int)
  - created_at

  ## Security
  - RLS enabled on both tables
  - Authenticated users can read; insert/update/delete restricted to authenticated

  ## Seed
  One default system rule with sensible out-of-the-box field mappings.
*/

-- ─── lead_qualification_rule ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_qualification_rule (
  lead_qualification_rule_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL,
  description                 text NOT NULL DEFAULT '',
  is_active                   boolean NOT NULL DEFAULT true,
  is_default                  boolean NOT NULL DEFAULT false,
  is_system                   boolean NOT NULL DEFAULT false,

  -- Account
  create_account              text NOT NULL DEFAULT 'always'
                                CHECK (create_account IN ('always', 'optional', 'never')),
  check_duplicate_account     boolean NOT NULL DEFAULT true,

  -- Contact
  create_contact              text NOT NULL DEFAULT 'always'
                                CHECK (create_contact IN ('always', 'optional', 'never')),
  check_duplicate_contact     boolean NOT NULL DEFAULT true,

  -- Opportunity
  create_opportunity          text NOT NULL DEFAULT 'optional'
                                CHECK (create_opportunity IN ('always', 'optional', 'never')),
  default_process_flow_id     uuid,
  inherit_line_of_business    boolean NOT NULL DEFAULT true,
  inherit_products            boolean NOT NULL DEFAULT false,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  modified_at                 timestamptz NOT NULL DEFAULT now(),
  deleted_at                  timestamptz
);

ALTER TABLE lead_qualification_rule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read qualification rules"
  ON lead_qualification_rule FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated users can insert qualification rules"
  ON lead_qualification_rule FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update qualification rules"
  ON lead_qualification_rule FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete qualification rules"
  ON lead_qualification_rule FOR DELETE
  TO authenticated
  USING (is_system = false);

CREATE INDEX IF NOT EXISTS idx_lead_qual_rule_active
  ON lead_qualification_rule(is_active) WHERE deleted_at IS NULL;

-- ─── lead_qualification_field_mapping ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_qualification_field_mapping (
  lead_qualification_field_mapping_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_qualification_rule_id           uuid NOT NULL
    REFERENCES lead_qualification_rule(lead_qualification_rule_id) ON DELETE CASCADE,
  target_entity                        text NOT NULL
    CHECK (target_entity IN ('account', 'contact', 'opportunity')),
  lead_field                           text NOT NULL,
  target_field                         text NOT NULL,
  is_required                          boolean NOT NULL DEFAULT false,
  transform                            jsonb,
  display_order                        int NOT NULL DEFAULT 0,
  created_at                           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lead_qualification_field_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read field mappings"
  ON lead_qualification_field_mapping FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert field mappings"
  ON lead_qualification_field_mapping FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update field mappings"
  ON lead_qualification_field_mapping FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete field mappings"
  ON lead_qualification_field_mapping FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_lead_qual_mapping_rule
  ON lead_qualification_field_mapping(lead_qualification_rule_id);

CREATE INDEX IF NOT EXISTS idx_lead_qual_mapping_target
  ON lead_qualification_field_mapping(lead_qualification_rule_id, target_entity);

-- ─── Seed: Default Standard Qualification Rule ────────────────────────────────

DO $$
DECLARE
  v_rule_id uuid;
BEGIN
  INSERT INTO lead_qualification_rule (
    name, description, is_active, is_default, is_system,
    create_account, check_duplicate_account,
    create_contact, check_duplicate_contact,
    create_opportunity, inherit_line_of_business, inherit_products
  ) VALUES (
    'Standard Qualification',
    'Default qualification rule. Creates an Account and Contact automatically; Opportunity creation is optional. Duplicate checks are enabled for Account and Contact.',
    true, true, true,
    'always', true,
    'always', true,
    'optional', true, false
  )
  RETURNING lead_qualification_rule_id INTO v_rule_id;

  -- ── Account mappings ──────────────────────────────────────────────────────
  INSERT INTO lead_qualification_field_mapping
    (lead_qualification_rule_id, target_entity, lead_field, target_field, is_required, display_order)
  VALUES
    (v_rule_id, 'account', 'companyname',      'name',             true,  1),
    (v_rule_id, 'account', 'telephone1',        'telephone1',       false, 2),
    (v_rule_id, 'account', 'websiteurl',        'websiteurl',       false, 3),
    (v_rule_id, 'account', 'address1_line1',    'address1_line1',   false, 4),
    (v_rule_id, 'account', 'address1_city',     'address1_city',    false, 5),
    (v_rule_id, 'account', 'address1_country',  'address1_country', false, 6),
    (v_rule_id, 'account', 'industrycode',      'industrycode',     false, 7);

  -- ── Contact mappings ──────────────────────────────────────────────────────
  INSERT INTO lead_qualification_field_mapping
    (lead_qualification_rule_id, target_entity, lead_field, target_field, is_required, display_order)
  VALUES
    (v_rule_id, 'contact', 'firstname',        'firstname',        true,  1),
    (v_rule_id, 'contact', 'lastname',         'lastname',         true,  2),
    (v_rule_id, 'contact', 'emailaddress1',    'emailaddress1',    true,  3),
    (v_rule_id, 'contact', 'telephone1',       'telephone1',       false, 4),
    (v_rule_id, 'contact', 'mobilephone',      'mobilephone',      false, 5),
    (v_rule_id, 'contact', 'jobtitle',         'jobtitle',         false, 6),
    (v_rule_id, 'contact', 'address1_line1',   'address1_line1',   false, 7),
    (v_rule_id, 'contact', 'address1_city',    'address1_city',    false, 8),
    (v_rule_id, 'contact', 'address1_country', 'address1_country', false, 9);

  -- ── Opportunity mappings ──────────────────────────────────────────────────
  INSERT INTO lead_qualification_field_mapping
    (lead_qualification_rule_id, target_entity, lead_field, target_field, is_required, display_order)
  VALUES
    (v_rule_id, 'opportunity', 'subject',            'name',               true,  1),
    (v_rule_id, 'opportunity', 'estimatedvalue',     'estimatedvalue',     false, 2),
    (v_rule_id, 'opportunity', 'estimatedclosedate', 'estimatedclosedate', false, 3),
    (v_rule_id, 'opportunity', 'description',        'description',        false, 4);
END $$;
