/*
  # Add form_id to process_flow

  ## Summary
  Adds an optional `form_id` column to `process_flow` so that each flow
  (especially product-scoped flows) can declare which form definition should
  be loaded when a record is assigned to that flow.

  ## Changes
  - `process_flow.form_id` (uuid, nullable FK → form_definition.form_id)
    When set, the CRM app loads this form instead of the entity's default form
    whenever a record's active flow matches.

  ## Security
  No new RLS policies needed — existing policies on `process_flow` already
  govern read/write access.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_flow' AND column_name = 'form_id'
  ) THEN
    ALTER TABLE process_flow
      ADD COLUMN form_id uuid REFERENCES form_definition(form_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_process_flow_form_id
  ON process_flow (form_id)
  WHERE form_id IS NOT NULL;
