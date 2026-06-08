/*
  # Add BPF and BPF-stage scopes to Business Rules

  1. Changes
    - Expand the `scope` CHECK constraint on `business_rule` to allow four values:
      - `all_forms` (entity-level, applies everywhere)
      - `specific_form` (applies only on a specific form)
      - `specific_bpf` (applies only when a specific Business Process Flow is active)
      - `specific_bpf_stage` (applies only when a specific BPF stage is active)
    - Add `target_process_flow_id` column (nullable UUID, FK to process_flow)
    - Add `target_process_stage_id` column (nullable UUID, FK to process_stage)

  2. Security
    - No RLS changes needed; existing policies on business_rule already cover these columns
*/

-- Drop existing scope CHECK constraint and replace with expanded one
ALTER TABLE business_rule DROP CONSTRAINT IF EXISTS business_rule_scope_check;
ALTER TABLE business_rule ADD CONSTRAINT business_rule_scope_check
  CHECK (scope = ANY (ARRAY['all_forms', 'specific_form', 'specific_bpf', 'specific_bpf_stage']));

-- Add target columns for BPF and stage scoping
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_rule' AND column_name = 'target_process_flow_id'
  ) THEN
    ALTER TABLE business_rule ADD COLUMN target_process_flow_id uuid
      REFERENCES process_flow(process_flow_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_rule' AND column_name = 'target_process_stage_id'
  ) THEN
    ALTER TABLE business_rule ADD COLUMN target_process_stage_id uuid
      REFERENCES process_stage(process_stage_id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for fast lookup by flow/stage
CREATE INDEX IF NOT EXISTS idx_business_rule_target_process_flow
  ON business_rule(target_process_flow_id) WHERE target_process_flow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_business_rule_target_process_stage
  ON business_rule(target_process_stage_id) WHERE target_process_stage_id IS NOT NULL;
