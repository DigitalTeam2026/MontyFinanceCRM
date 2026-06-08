/*
  # Data / Validation Policies

  ## Overview
  Data Policies are reusable, entity-scoped governance rules that enforce
  data quality and regulatory constraints independently of any individual
  form's Business Rules. While Business Rules control UI behaviour
  (show/hide/lock fields), Data Policies enforce invariants on the *data
  itself* — they fire on save, import, API write, and stage transition, not
  just on form interactions.

  This separation gives administrators a single governance layer for:
    - Uniqueness constraints  (email uniqueness, account number uniqueness)
    - Format constraints      (phone E.164 format, postcode regex)
    - Mandatory presence      (owner field, country for regulated products)
    - Relational integrity    (contact required at Opportunity stage X)
    - Value locking           (currency locked once amount is populated)

  ## New Tables

  ### 1. data_policy
  Top-level definition.

  Columns:
  - data_policy_id      (uuid PK)
  - name, description
  - entity_logical_name — which entity this policy guards (e.g. 'opportunity')
  - policy_category     — 'uniqueness' | 'format' | 'mandatory' | 'relational'
                          | 'lock' | 'custom'
  - enforcement_level   — 'error' (blocks save) | 'warning' (allows save + alert)
                          | 'info' (informational only)
  - trigger_on          — array of trigger events: 'create','update','delete',
                          'stage_change','import','api'
  - applies_to_products — optional UUID[] list; empty = applies to all products
  - is_active, is_system
  - created_at, modified_at, deleted_at

  ### 2. data_policy_condition
  One or more conditions that must ALL match for the policy to fire (AND logic).
  Separate policies represent OR scenarios.

  Columns:
  - condition_id        (uuid PK)
  - data_policy_id      (FK → data_policy ON DELETE CASCADE)
  - field_name          — the record field to evaluate
  - operator            — 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
                          | 'is_null' | 'is_not_null' | 'matches_regex'
                          | 'not_matches_regex' | 'contains' | 'in'
  - value_text          — comparison value (or regex pattern for matches_regex)
  - display_order

  ### 3. data_policy_enforcement
  What happens when the policy fires (the violation action).

  Columns:
  - enforcement_id      (uuid PK)
  - data_policy_id      (FK → data_policy ON DELETE CASCADE)
  - enforcement_type    — 'block_save' | 'show_message' | 'require_field'
                          | 'lock_field' | 'set_value' | 'notify_user'
  - target_field        — nullable; which field to act on
  - message_text        — user-visible violation message
  - value_text          — for set_value enforcement type
  - display_order

  ## Security
  - RLS enabled on all three tables
  - Authenticated users can read; insert/update/delete require authentication

  ## Seed
  Eight system policy templates covering the most common fintech / enterprise
  data governance patterns described in the requirements.
*/

-- ─── data_policy ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_policy (
  data_policy_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  description         text NOT NULL DEFAULT '',
  entity_logical_name text NOT NULL DEFAULT 'opportunity',
  policy_category     text NOT NULL DEFAULT 'custom'
    CHECK (policy_category IN (
      'uniqueness', 'format', 'mandatory', 'relational', 'lock', 'custom'
    )),
  enforcement_level   text NOT NULL DEFAULT 'error'
    CHECK (enforcement_level IN ('error', 'warning', 'info')),
  trigger_on          text[] NOT NULL DEFAULT ARRAY['create','update'],
  applies_to_products uuid[],
  is_active           boolean NOT NULL DEFAULT true,
  is_system           boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

ALTER TABLE data_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read data policies"
  ON data_policy FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated users can insert data policies"
  ON data_policy FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update data policies"
  ON data_policy FOR UPDATE TO authenticated
  USING (deleted_at IS NULL) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete data policies"
  ON data_policy FOR DELETE TO authenticated
  USING (is_system = false);

CREATE INDEX IF NOT EXISTS idx_data_policy_entity
  ON data_policy(entity_logical_name) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_data_policy_category
  ON data_policy(policy_category) WHERE deleted_at IS NULL;

-- ─── data_policy_condition ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_policy_condition (
  condition_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_policy_id    uuid NOT NULL
    REFERENCES data_policy(data_policy_id) ON DELETE CASCADE,
  field_name        text NOT NULL,
  operator          text NOT NULL DEFAULT 'is_not_null'
    CHECK (operator IN (
      'eq','neq','gt','gte','lt','lte',
      'is_null','is_not_null',
      'matches_regex','not_matches_regex',
      'contains','in'
    )),
  value_text        text,
  display_order     int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_policy_condition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read policy conditions"
  ON data_policy_condition FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert policy conditions"
  ON data_policy_condition FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update policy conditions"
  ON data_policy_condition FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete policy conditions"
  ON data_policy_condition FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_data_policy_condition_policy
  ON data_policy_condition(data_policy_id);

-- ─── data_policy_enforcement ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_policy_enforcement (
  enforcement_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_policy_id    uuid NOT NULL
    REFERENCES data_policy(data_policy_id) ON DELETE CASCADE,
  enforcement_type  text NOT NULL DEFAULT 'show_message'
    CHECK (enforcement_type IN (
      'block_save', 'show_message', 'require_field',
      'lock_field', 'set_value', 'notify_user'
    )),
  target_field      text,
  message_text      text,
  value_text        text,
  display_order     int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_policy_enforcement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read policy enforcements"
  ON data_policy_enforcement FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert policy enforcements"
  ON data_policy_enforcement FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update policy enforcements"
  ON data_policy_enforcement FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete policy enforcements"
  ON data_policy_enforcement FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_data_policy_enforcement_policy
  ON data_policy_enforcement(data_policy_id);

-- ─── Seed: System Policy Templates ────────────────────────────────────────────

DO $$
DECLARE
  v_id uuid;
BEGIN

  -- 1. Email Uniqueness (Contact)
  INSERT INTO data_policy (name, description, entity_logical_name, policy_category, enforcement_level, trigger_on, is_system)
  VALUES ('Email Uniqueness', 'Prevents two Contact records sharing the same email address.', 'contact', 'uniqueness', 'error', ARRAY['create','update'], true)
  RETURNING data_policy_id INTO v_id;
  INSERT INTO data_policy_condition (data_policy_id, field_name, operator, display_order)
  VALUES (v_id, 'emailaddress1', 'is_not_null', 1);
  INSERT INTO data_policy_enforcement (data_policy_id, enforcement_type, target_field, message_text, display_order)
  VALUES (v_id, 'block_save', 'emailaddress1', 'A Contact with this email address already exists.', 1);

  -- 2. Phone Format Policy (Contact / Lead)
  INSERT INTO data_policy (name, description, entity_logical_name, policy_category, enforcement_level, trigger_on, is_system)
  VALUES ('Phone Number Format', 'Validates that phone numbers use E.164 format (+countrycode number).', 'contact', 'format', 'warning', ARRAY['create','update'], true)
  RETURNING data_policy_id INTO v_id;
  INSERT INTO data_policy_condition (data_policy_id, field_name, operator, value_text, display_order)
  VALUES (v_id, 'telephone1', 'not_matches_regex', '^\+[1-9]\d{6,14}$', 1);
  INSERT INTO data_policy_enforcement (data_policy_id, enforcement_type, target_field, message_text, display_order)
  VALUES (v_id, 'show_message', 'telephone1', 'Phone number should be in E.164 format, e.g. +447911123456.', 1);

  -- 3. Owner Mandatory (Opportunity)
  INSERT INTO data_policy (name, description, entity_logical_name, policy_category, enforcement_level, trigger_on, is_system)
  VALUES ('Owner Required', 'Every Opportunity must have an assigned owner before it can be saved.', 'opportunity', 'mandatory', 'error', ARRAY['create','update'], true)
  RETURNING data_policy_id INTO v_id;
  INSERT INTO data_policy_condition (data_policy_id, field_name, operator, display_order)
  VALUES (v_id, 'ownerid', 'is_null', 1);
  INSERT INTO data_policy_enforcement (data_policy_id, enforcement_type, target_field, message_text, display_order)
  VALUES (v_id, 'block_save', 'ownerid', 'An owner must be assigned before this record can be saved.', 1);

  -- 4. Country Required for Regulated Products
  INSERT INTO data_policy (name, description, entity_logical_name, policy_category, enforcement_level, trigger_on, is_system)
  VALUES ('Country Required (Regulated Products)', 'Enforces that a country is specified on all Opportunity records linked to regulated products.', 'opportunity', 'mandatory', 'error', ARRAY['create','update','stage_change'], true)
  RETURNING data_policy_id INTO v_id;
  INSERT INTO data_policy_condition (data_policy_id, field_name, operator, display_order)
  VALUES (v_id, 'address1_country', 'is_null', 1);
  INSERT INTO data_policy_enforcement (data_policy_id, enforcement_type, target_field, message_text, display_order)
  VALUES
    (v_id, 'require_field', 'address1_country', null, 1),
    (v_id, 'show_message', null, 'Country is required for regulated product opportunities.', 2);

  -- 5. Currency Lock (Opportunity)
  INSERT INTO data_policy (name, description, entity_logical_name, policy_category, enforcement_level, trigger_on, is_system)
  VALUES ('Currency Lock After Amount Set', 'Prevents the currency being changed once an estimated value has been entered on the Opportunity.', 'opportunity', 'lock', 'error', ARRAY['update'], true)
  RETURNING data_policy_id INTO v_id;
  INSERT INTO data_policy_condition (data_policy_id, field_name, operator, display_order)
  VALUES (v_id, 'estimatedvalue', 'is_not_null', 1);
  INSERT INTO data_policy_enforcement (data_policy_id, enforcement_type, target_field, message_text, display_order)
  VALUES (v_id, 'lock_field', 'transactioncurrencyid', 'Currency cannot be changed once an estimated value has been recorded.', 1);

  -- 6. Contact Required at Stage (Opportunity)
  INSERT INTO data_policy (name, description, entity_logical_name, policy_category, enforcement_level, trigger_on, is_system)
  VALUES ('Contact Required at Proposal Stage', 'An Opportunity must have at least one linked Contact before it can progress to the Proposal stage.', 'opportunity', 'relational', 'error', ARRAY['stage_change'], true)
  RETURNING data_policy_id INTO v_id;
  INSERT INTO data_policy_condition (data_policy_id, field_name, operator, value_text, display_order)
  VALUES (v_id, 'stagecode', 'eq', 'proposal', 1);
  INSERT INTO data_policy_enforcement (data_policy_id, enforcement_type, message_text, display_order)
  VALUES (v_id, 'block_save', 'At least one Contact must be linked to this Opportunity before progressing to Proposal stage.', 1);

  -- 7. Account Number Uniqueness
  INSERT INTO data_policy (name, description, entity_logical_name, policy_category, enforcement_level, trigger_on, is_system)
  VALUES ('Account Number Uniqueness', 'Account numbers must be unique across all active Account records.', 'account', 'uniqueness', 'error', ARRAY['create','update'], true)
  RETURNING data_policy_id INTO v_id;
  INSERT INTO data_policy_condition (data_policy_id, field_name, operator, display_order)
  VALUES (v_id, 'accountnumber', 'is_not_null', 1);
  INSERT INTO data_policy_enforcement (data_policy_id, enforcement_type, target_field, message_text, display_order)
  VALUES (v_id, 'block_save', 'accountnumber', 'This account number is already in use. Account numbers must be unique.', 1);

  -- 8. Lead Email Format
  INSERT INTO data_policy (name, description, entity_logical_name, policy_category, enforcement_level, trigger_on, is_system)
  VALUES ('Lead Email Format', 'Validates email address format on Lead records on save.', 'lead', 'format', 'warning', ARRAY['create','update','import'], true)
  RETURNING data_policy_id INTO v_id;
  INSERT INTO data_policy_condition (data_policy_id, field_name, operator, value_text, display_order)
  VALUES (v_id, 'emailaddress1', 'not_matches_regex', '^[^@\s]+@[^@\s]+\.[^@\s]+$', 1);
  INSERT INTO data_policy_enforcement (data_policy_id, enforcement_type, target_field, message_text, display_order)
  VALUES (v_id, 'show_message', 'emailaddress1', 'The email address does not appear to be valid.', 1);

END $$;
