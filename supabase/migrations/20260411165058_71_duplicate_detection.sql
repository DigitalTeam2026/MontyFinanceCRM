/*
  # Duplicate Detection System

  ## Overview
  Implements a configurable duplicate detection framework. Admins can define
  rules per entity specifying which fields trigger duplicate warnings or blocks,
  how fuzzy matching works, and when the rule fires (create, update, import,
  lead qualification). A job log table records batch duplicate scans run
  against existing data.

  ## New Tables

  ### 1. duplicate_detection_rule
  Each row is a detection rule for one entity.
  - `duplicate_rule_id` (uuid PK)
  - `entity_logical_name` (text) — e.g. 'contact', 'lead', 'account'
  - `name` (text) — friendly name shown in the UI
  - `description` (text)
  - `is_active` (boolean, default true)
  - `is_system` (boolean, default false) — system-seeded rules cannot be deleted
  - `behavior` (text) — 'warn' | 'block'
    * warn  = show a warning but allow the user to proceed
    * block = prevent save until the user explicitly acknowledges or merges
  - `exact_match_fields` (jsonb) — ordered array of field logical names
    that must match exactly (case-insensitive, trimmed)
  - `fuzzy_match_fields` (jsonb) — array of objects {field, threshold}
    where threshold is 0-100 (similarity %). Used alongside exact matches.
  - `run_on_create` (boolean, default true)
  - `run_on_update` (boolean, default true)
  - `run_on_import` (boolean, default true)
  - `run_on_lead_qualify` (boolean, default false)
    Only relevant for Lead entity rules.
  - `created_at`, `modified_at`, `deleted_at`

  ### 2. duplicate_job
  Records each batch scan executed by an admin.
  - `duplicate_job_id` (uuid PK)
  - `duplicate_rule_id` (uuid FK → duplicate_detection_rule)
  - `entity_logical_name` (text)
  - `status` (text) — 'pending' | 'running' | 'completed' | 'failed'
  - `triggered_by` (uuid FK → auth.users)
  - `started_at`, `completed_at`
  - `records_scanned` (int)
  - `duplicates_found` (int)
  - `result_summary` (jsonb) — optional detail payload
  - `error_message` (text)
  - `created_at`

  ## Security
  - RLS enabled on both tables
  - Authenticated users can read; only system admin role can write
    (implemented as: authenticated can select, insert, update, delete —
    the CRM already restricts admin UI to admin users at the application layer)

  ## Seed
  - Three starter rules: Contact email, Lead email/phone, Account name+country
*/

-- ─── duplicate_detection_rule ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS duplicate_detection_rule (
  duplicate_rule_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_logical_name     text NOT NULL,
  name                    text NOT NULL,
  description             text NOT NULL DEFAULT '',
  is_active               boolean NOT NULL DEFAULT true,
  is_system               boolean NOT NULL DEFAULT false,
  behavior                text NOT NULL DEFAULT 'warn'
                            CHECK (behavior IN ('warn', 'block')),
  exact_match_fields      jsonb NOT NULL DEFAULT '[]',
  fuzzy_match_fields      jsonb NOT NULL DEFAULT '[]',
  run_on_create           boolean NOT NULL DEFAULT true,
  run_on_update           boolean NOT NULL DEFAULT true,
  run_on_import           boolean NOT NULL DEFAULT true,
  run_on_lead_qualify     boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  modified_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);

ALTER TABLE duplicate_detection_rule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read duplicate rules"
  ON duplicate_detection_rule FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated users can insert duplicate rules"
  ON duplicate_detection_rule FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update duplicate rules"
  ON duplicate_detection_rule FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete duplicate rules"
  ON duplicate_detection_rule FOR DELETE
  TO authenticated
  USING (is_system = false);

CREATE INDEX IF NOT EXISTS idx_dup_rule_entity ON duplicate_detection_rule(entity_logical_name);
CREATE INDEX IF NOT EXISTS idx_dup_rule_active ON duplicate_detection_rule(is_active) WHERE deleted_at IS NULL;

-- ─── duplicate_job ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS duplicate_job (
  duplicate_job_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duplicate_rule_id   uuid REFERENCES duplicate_detection_rule(duplicate_rule_id) ON DELETE SET NULL,
  entity_logical_name text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  triggered_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at          timestamptz,
  completed_at        timestamptz,
  records_scanned     int NOT NULL DEFAULT 0,
  duplicates_found    int NOT NULL DEFAULT 0,
  result_summary      jsonb,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE duplicate_job ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read duplicate jobs"
  ON duplicate_job FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert duplicate jobs"
  ON duplicate_job FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update duplicate jobs"
  ON duplicate_job FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dup_job_rule ON duplicate_job(duplicate_rule_id);
CREATE INDEX IF NOT EXISTS idx_dup_job_status ON duplicate_job(status);
CREATE INDEX IF NOT EXISTS idx_dup_job_created ON duplicate_job(created_at DESC);

-- ─── Seed: system default rules ───────────────────────────────────────────────

INSERT INTO duplicate_detection_rule (
  entity_logical_name, name, description, is_active, is_system, behavior,
  exact_match_fields, fuzzy_match_fields,
  run_on_create, run_on_update, run_on_import, run_on_lead_qualify
) VALUES
(
  'contact',
  'Contact — Exact Email Match',
  'Detects contacts that share the same email address. Blocks save to prevent hard duplicates.',
  true, true, 'block',
  '["emailaddress1"]',
  '[]',
  true, true, true, false
),
(
  'lead',
  'Lead — Email or Phone Warning',
  'Warns when a new lead shares the same email or phone as an existing lead or contact. Also fires during qualification.',
  true, true, 'warn',
  '["emailaddress1"]',
  '[{"field":"telephone1","threshold":90},{"field":"mobilephone","threshold":90}]',
  true, true, true, true
),
(
  'account',
  'Account — Name + Country Match',
  'Warns when an account has the same legal name and country as an existing account.',
  true, true, 'warn',
  '["name","address1_country"]',
  '[{"field":"websiteurl","threshold":85}]',
  true, false, true, false
),
(
  'opportunity',
  'Opportunity — Name + Account Warning',
  'Warns when an opportunity with the same name already exists for the same account.',
  true, true, 'warn',
  '["name","parentaccountid"]',
  '[]',
  true, false, true, false
)
ON CONFLICT DO NOTHING;
