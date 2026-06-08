
/*
  # Migration 3: Sales Module

  ## Overview
  Creates all core Sales entities with proper relationships, standard ownership columns,
  soft delete, versioning, and a JSONB custom_fields column for future flexibility.

  ## New Tables

  ### Reference / Lookup Tables
  - `country` — ISO country codes and names
  - `currency` — Currency codes, symbols, and exchange rates
  - `industry` — Industry classifications for accounts and leads
  - `contact_source` — Top-level lead/contact source (e.g. Web, Referral, Event)
  - `contact_subsource` — Subsource nested under a source (e.g. LinkedIn under Social)

  ### Core Sales Entities
  - `account` — Company or customer organization
  - `contact` — Person, optionally linked to an account
  - `lead` — Unqualified potential customer; can be qualified into account/contact/opportunity
  - `opportunity` — Qualified sales deal linked to an account

  ## Standard Columns on All Business Entities
  Every entity includes:
    owner_type, owner_id, business_unit_id (ownership)
    status_code, status_reason (lifecycle state)
    custom_fields JSONB (escape hatch for early custom data)
    created_at, created_by, modified_at, modified_by (audit)
    is_deleted, version_no (soft delete + optimistic locking)

  ## Security
  - RLS enabled on all tables
  - Ownership-based access: users can access records they own
  - Team-based access: users can access records owned by a team they belong to
  - Shared records: users can access records explicitly shared with them
  - System admins bypass ownership restrictions
*/

-- ─────────────────────────────────────────────
-- HELPER: reusable ownership check function
-- Returns true if the current user owns or has been shared the record
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_user_has_access(
  p_entity_name text,
  p_record_id   uuid,
  p_owner_type  text,
  p_owner_id    uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    -- system admin
    EXISTS (SELECT 1 FROM crm_user cu WHERE cu.user_id = auth.uid() AND cu.is_system_admin = true)
    OR
    -- direct user ownership
    (p_owner_type = 'user' AND p_owner_id = auth.uid())
    OR
    -- team ownership where user is a member
    (p_owner_type = 'team' AND EXISTS (
      SELECT 1 FROM team_user tu WHERE tu.team_id = p_owner_id AND tu.user_id = auth.uid()
    ))
    OR
    -- record explicitly shared with user
    EXISTS (
      SELECT 1 FROM record_share rs
      WHERE rs.entity_name = p_entity_name
        AND rs.record_id = p_record_id
        AND rs.can_read = true
        AND rs.principal_type = 'user'
        AND rs.principal_id = auth.uid()
    )
    OR
    -- record shared with a team the user belongs to
    EXISTS (
      SELECT 1 FROM record_share rs
      JOIN team_user tu ON tu.team_id = rs.principal_id
      WHERE rs.entity_name = p_entity_name
        AND rs.record_id = p_record_id
        AND rs.can_read = true
        AND rs.principal_type = 'team'
        AND tu.user_id = auth.uid()
    );
$$;

-- ─────────────────────────────────────────────
-- COUNTRY
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS country (
  country_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true
);

ALTER TABLE country ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view countries"
  ON country FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert countries"
  ON country FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update countries"
  ON country FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- CURRENCY
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS currency (
  currency_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  name            text NOT NULL,
  symbol          text NOT NULL DEFAULT '',
  exchange_rate   numeric(18, 6) NOT NULL DEFAULT 1.000000,
  is_base         boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true
);

ALTER TABLE currency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view currencies"
  ON currency FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert currencies"
  ON currency FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update currencies"
  ON currency FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- INDUSTRY
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS industry (
  industry_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  is_active     boolean NOT NULL DEFAULT true
);

ALTER TABLE industry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view industries"
  ON industry FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert industries"
  ON industry FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update industries"
  ON industry FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- CONTACT SOURCE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_source (
  source_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  is_active   boolean NOT NULL DEFAULT true
);

ALTER TABLE contact_source ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contact sources"
  ON contact_source FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert contact sources"
  ON contact_source FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update contact sources"
  ON contact_source FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- CONTACT SUBSOURCE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_subsource (
  subsource_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid NOT NULL REFERENCES contact_source(source_id) ON DELETE CASCADE,
  name            text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  UNIQUE(source_id, name)
);

CREATE INDEX IF NOT EXISTS idx_contact_subsource_source ON contact_subsource(source_id);

ALTER TABLE contact_subsource ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contact subsources"
  ON contact_subsource FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert contact subsources"
  ON contact_subsource FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update contact subsources"
  ON contact_subsource FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- ACCOUNT
-- Company or customer organization
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS account (
  account_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name        text NOT NULL,
  industry_id         uuid REFERENCES industry(industry_id),
  country_id          uuid REFERENCES country(country_id),
  currency_id         uuid REFERENCES currency(currency_id),
  parent_account_id   uuid REFERENCES account(account_id),
  phone               text,
  email               text,
  website             text,
  address_line1       text,
  address_line2       text,
  city                text,
  state_province      text,
  postal_code         text,
  annual_revenue      numeric(18, 2),
  number_of_employees integer,
  description         text,
  owner_type          text NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'team')),
  owner_id            uuid NOT NULL,
  business_unit_id    uuid REFERENCES business_unit(business_unit_id),
  status_code         text NOT NULL DEFAULT 'active',
  status_reason       text,
  custom_fields       jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES crm_user(user_id),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  modified_by         uuid REFERENCES crm_user(user_id),
  is_deleted          boolean NOT NULL DEFAULT false,
  version_no          integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_account_owner ON account(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_account_business_unit ON account(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_account_industry ON account(industry_id);
CREATE INDEX IF NOT EXISTS idx_account_country ON account(country_id);
CREATE INDEX IF NOT EXISTS idx_account_status ON account(status_code);
CREATE INDEX IF NOT EXISTS idx_account_is_deleted ON account(is_deleted);
CREATE INDEX IF NOT EXISTS idx_account_name ON account(account_name);

ALTER TABLE account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accounts they have access to"
  ON account FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND crm_user_has_access('account', account_id, owner_type, owner_id)
  );

CREATE POLICY "Authenticated users can insert accounts"
  ON account FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update accounts they own or are shared with write"
  ON account FOR UPDATE
  TO authenticated
  USING (crm_user_has_access('account', account_id, owner_type, owner_id))
  WITH CHECK (modified_by = auth.uid());

CREATE POLICY "Users can soft delete accounts they own"
  ON account FOR UPDATE
  TO authenticated
  USING (
    (owner_type = 'user' AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM crm_user cu WHERE cu.user_id = auth.uid() AND cu.is_system_admin = true)
  )
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- CONTACT
-- Person optionally linked to an account
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact (
  contact_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid REFERENCES account(account_id),
  first_name          text NOT NULL DEFAULT '',
  last_name           text NOT NULL DEFAULT '',
  job_title           text,
  email               text,
  mobile_phone        text,
  business_phone      text,
  country_id          uuid REFERENCES country(country_id),
  source_id           uuid REFERENCES contact_source(source_id),
  subsource_id        uuid REFERENCES contact_subsource(subsource_id),
  address_line1       text,
  address_line2       text,
  city                text,
  state_province      text,
  postal_code         text,
  description         text,
  do_not_email        boolean NOT NULL DEFAULT false,
  do_not_phone        boolean NOT NULL DEFAULT false,
  owner_type          text NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'team')),
  owner_id            uuid NOT NULL,
  business_unit_id    uuid REFERENCES business_unit(business_unit_id),
  status_code         text NOT NULL DEFAULT 'active',
  status_reason       text,
  custom_fields       jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES crm_user(user_id),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  modified_by         uuid REFERENCES crm_user(user_id),
  is_deleted          boolean NOT NULL DEFAULT false,
  version_no          integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_contact_account ON contact(account_id);
CREATE INDEX IF NOT EXISTS idx_contact_owner ON contact(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_contact_business_unit ON contact(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_contact_email ON contact(email);
CREATE INDEX IF NOT EXISTS idx_contact_is_deleted ON contact(is_deleted);

ALTER TABLE contact ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contacts they have access to"
  ON contact FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND crm_user_has_access('contact', contact_id, owner_type, owner_id)
  );

CREATE POLICY "Authenticated users can insert contacts"
  ON contact FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update contacts they own or are shared with write"
  ON contact FOR UPDATE
  TO authenticated
  USING (crm_user_has_access('contact', contact_id, owner_type, owner_id))
  WITH CHECK (modified_by = auth.uid());

-- ─────────────────────────────────────────────
-- LEAD
-- Unqualified potential customer
-- Can be qualified into: account, contact, opportunity
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead (
  lead_id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name                  text NOT NULL DEFAULT '',
  last_name                   text NOT NULL DEFAULT '',
  company_name                text,
  job_title                   text,
  email                       text,
  phone                       text,
  mobile_phone                text,
  website                     text,
  country_id                  uuid REFERENCES country(country_id),
  industry_id                 uuid REFERENCES industry(industry_id),
  source_id                   uuid REFERENCES contact_source(source_id),
  subsource_id                uuid REFERENCES contact_subsource(subsource_id),
  estimated_value             numeric(18, 2),
  currency_id                 uuid REFERENCES currency(currency_id),
  description                 text,
  rating                      text CHECK (rating IN ('hot', 'warm', 'cold')),
  is_qualified                boolean NOT NULL DEFAULT false,
  qualified_account_id        uuid REFERENCES account(account_id),
  qualified_contact_id        uuid REFERENCES contact(contact_id),
  qualified_opportunity_id    uuid,
  do_not_email                boolean NOT NULL DEFAULT false,
  do_not_phone                boolean NOT NULL DEFAULT false,
  owner_type                  text NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'team')),
  owner_id                    uuid NOT NULL,
  business_unit_id            uuid REFERENCES business_unit(business_unit_id),
  status_code                 text NOT NULL DEFAULT 'new',
  status_reason               text,
  custom_fields               jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES crm_user(user_id),
  modified_at                 timestamptz NOT NULL DEFAULT now(),
  modified_by                 uuid REFERENCES crm_user(user_id),
  is_deleted                  boolean NOT NULL DEFAULT false,
  version_no                  integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_lead_owner ON lead(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_lead_business_unit ON lead(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_lead_status ON lead(status_code);
CREATE INDEX IF NOT EXISTS idx_lead_is_qualified ON lead(is_qualified);
CREATE INDEX IF NOT EXISTS idx_lead_is_deleted ON lead(is_deleted);
CREATE INDEX IF NOT EXISTS idx_lead_email ON lead(email);

ALTER TABLE lead ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view leads they have access to"
  ON lead FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND crm_user_has_access('lead', lead_id, owner_type, owner_id)
  );

CREATE POLICY "Authenticated users can insert leads"
  ON lead FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update leads they own or are shared with write"
  ON lead FOR UPDATE
  TO authenticated
  USING (crm_user_has_access('lead', lead_id, owner_type, owner_id))
  WITH CHECK (modified_by = auth.uid());

-- ─────────────────────────────────────────────
-- OPPORTUNITY
-- Qualified sales deal linked to an account
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opportunity (
  opportunity_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              uuid REFERENCES account(account_id),
  primary_contact_id      uuid REFERENCES contact(contact_id),
  topic                   text NOT NULL DEFAULT '',
  description             text,
  estimated_value         numeric(18, 2),
  currency_id             uuid REFERENCES currency(currency_id),
  estimated_close_date    date,
  actual_close_date       date,
  actual_value            numeric(18, 2),
  probability             integer CHECK (probability >= 0 AND probability <= 100),
  stage                   text NOT NULL DEFAULT 'qualify' CHECK (stage IN (
                            'qualify', 'develop', 'propose', 'close', 'won', 'lost'
                          )),
  loss_reason             text,
  source_id               uuid REFERENCES contact_source(source_id),
  owner_type              text NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'team')),
  owner_id                uuid NOT NULL,
  business_unit_id        uuid REFERENCES business_unit(business_unit_id),
  status_code             text NOT NULL DEFAULT 'open' CHECK (status_code IN ('open', 'won', 'lost', 'cancelled')),
  status_reason           text,
  custom_fields           jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES crm_user(user_id),
  modified_at             timestamptz NOT NULL DEFAULT now(),
  modified_by             uuid REFERENCES crm_user(user_id),
  is_deleted              boolean NOT NULL DEFAULT false,
  version_no              integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_opportunity_account ON opportunity(account_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_contact ON opportunity(primary_contact_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_owner ON opportunity(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_business_unit ON opportunity(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_stage ON opportunity(stage);
CREATE INDEX IF NOT EXISTS idx_opportunity_status ON opportunity(status_code);
CREATE INDEX IF NOT EXISTS idx_opportunity_is_deleted ON opportunity(is_deleted);

ALTER TABLE opportunity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view opportunities they have access to"
  ON opportunity FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND crm_user_has_access('opportunity', opportunity_id, owner_type, owner_id)
  );

CREATE POLICY "Authenticated users can insert opportunities"
  ON opportunity FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update opportunities they own or are shared with write"
  ON opportunity FOR UPDATE
  TO authenticated
  USING (crm_user_has_access('opportunity', opportunity_id, owner_type, owner_id))
  WITH CHECK (modified_by = auth.uid());

-- ─────────────────────────────────────────────
-- Add FK from lead to opportunity (circular handled after table creation)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lead_qualified_opportunity_id_fkey'
  ) THEN
    ALTER TABLE lead
      ADD CONSTRAINT lead_qualified_opportunity_id_fkey
      FOREIGN KEY (qualified_opportunity_id) REFERENCES opportunity(opportunity_id);
  END IF;
END $$;
