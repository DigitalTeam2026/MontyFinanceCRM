/*
  # Migration 128: Record Transformation Enhancements

  ## Summary
  Adds advanced control fields to the record transformation system to support
  instance limiting, prerequisite entity checks, action visibility control,
  inherit mode for field mappings, and a full execution audit trail.

  ## Changes

  ### Modified Tables

  #### record_transformation_target
  - `max_instances_per_source` (integer, default 1) — limits how many target records
    can be created per source record (0 = unlimited)
  - `requires_source_entity` (text, nullable) — entity that must already have been
    created in the same execution run before this target can be created
  - `action_visibility` (text enum) — controls when the action button is shown:
    always | when_not_created | when_created | never
  - `blocked_message` (text, nullable) — user-facing message shown when the action
    is blocked (e.g. max instances reached)

  #### record_transformation_field_mapping
  - `inherit_mode` (text enum, default 'source') — how the field value is populated:
    source (copy from source field) | user_input (user provides at runtime) | default (fixed default)
  - `locked` (boolean, default false) — when true, the user cannot override this
    mapped value at execution time
  - `default_value` (text, nullable) — used when inherit_mode = 'default'

  ### New Tables

  #### record_transformation_instance
  Immutable audit log of every transformation execution attempt. One row is written
  per target entity per execution (completed, failed, skipped, or pending).

  ## Security
  - RLS enabled on record_transformation_instance
  - SELECT: any authenticated user
  - INSERT: authenticated users, enforced to set initiated_by = auth.uid()
  - No UPDATE or DELETE (instances are immutable)

  ## Notes
  1. max_instances_per_source defaults to 1 so existing targets behave as
     "single instance" without any data migration required
  2. requires_source_entity has no CHECK constraint because valid entity names
     are managed in the application layer
  3. The instance INSERT policy uses WITH CHECK (initiated_by = auth.uid()) to
     prevent users from inserting rows claiming to be another user
*/

-- ── 1. record_transformation_target: new columns ─────────────────────────────

ALTER TABLE record_transformation_target
  ADD COLUMN IF NOT EXISTS max_instances_per_source integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS requires_source_entity text,
  ADD COLUMN IF NOT EXISTS action_visibility text NOT NULL DEFAULT 'always'
    CHECK (action_visibility IN ('always', 'when_not_created', 'when_created', 'never')),
  ADD COLUMN IF NOT EXISTS blocked_message text;

-- ── 2. record_transformation_field_mapping: new columns ──────────────────────

ALTER TABLE record_transformation_field_mapping
  ADD COLUMN IF NOT EXISTS inherit_mode text NOT NULL DEFAULT 'source'
    CHECK (inherit_mode IN ('source', 'user_input', 'default')),
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_value text;

-- ── 3. record_transformation_instance ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS record_transformation_instance (
  record_transformation_instance_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES record_transformation_rule (record_transformation_rule_id) ON DELETE CASCADE,
  source_entity text NOT NULL,
  source_record_id uuid NOT NULL,
  target_entity text NOT NULL,
  target_record_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'skipped')),
  initiated_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_rti_rule_id
  ON record_transformation_instance (rule_id);

CREATE INDEX IF NOT EXISTS idx_rti_source_record
  ON record_transformation_instance (source_record_id, source_entity);

CREATE INDEX IF NOT EXISTS idx_rti_rule_source
  ON record_transformation_instance (rule_id, source_record_id, target_entity);

CREATE INDEX IF NOT EXISTS idx_rti_initiated_by
  ON record_transformation_instance (initiated_by);

ALTER TABLE record_transformation_instance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view transformation instances"
  ON record_transformation_instance FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert transformation instances"
  ON record_transformation_instance FOR INSERT
  TO authenticated
  WITH CHECK (initiated_by = auth.uid());
