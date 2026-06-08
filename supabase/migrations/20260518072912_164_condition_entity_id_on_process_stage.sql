/*
  # Add condition_entity_id to process_stage

  ## Summary
  Adds a `condition_entity_id` column to `process_stage` to support cross-entity
  condition components in Business Process Flows (BPF).

  ## Changes
  - `process_stage.condition_entity_id` (uuid, nullable, FK → entity_definition)
    Tracks which entity the condition component evaluates its field against.
    When NULL, the condition inherits the effective entity context at that point in the flow.

  ## Notes
  - Fully backwards-compatible: NULL means "inherit from context" (existing behaviour).
  - No RLS changes needed (inherits existing process_stage policies).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'condition_entity_id'
  ) THEN
    ALTER TABLE process_stage
      ADD COLUMN condition_entity_id uuid
        REFERENCES entity_definition(entity_definition_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_process_stage_condition_entity_id
  ON process_stage(condition_entity_id)
  WHERE condition_entity_id IS NOT NULL;
