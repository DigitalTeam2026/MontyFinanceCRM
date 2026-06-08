/*
  # Process Stage: Add relationship_definition_id

  ## Summary
  Adds a structured FK reference from process_stage to relationship_definition,
  replacing the free-text target_relationship_name field as the canonical source
  for cross-entity relationship configuration.

  ## Changes

  ### process_stage
  - Add nullable `relationship_definition_id` (uuid, FK → relationship_definition)
  - Existing `target_relationship_name` text column is kept as fallback — not removed
  - Backfill: match existing stages to active relationship_definition rows where
    the stage's target_entity_id and target_relationship_name align with a known relationship

  ## Engine Behavior
  The processFlowEngine uses a dual-path resolution strategy:
  1. If relationship_definition_id is set: resolve via relationship_definition
     → source_lookup_field_id → field_definition.physical_column_name
  2. If relationship_definition_id is null: fall back to target_relationship_name text (existing behavior)
  This ensures zero regression for all existing process flows.

  ## Security
  No new RLS policy needed — inherits from process_stage table's existing policies.
*/

-- 1. Add relationship_definition_id to process_stage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage'
      AND column_name = 'relationship_definition_id'
  ) THEN
    ALTER TABLE process_stage
      ADD COLUMN relationship_definition_id uuid
        REFERENCES relationship_definition(relationship_definition_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_process_stage_rel_def
  ON process_stage (relationship_definition_id);

-- 2. Backfill: match via target_entity_id + target_relationship_name → physical_column_name
-- For each stage that has both target_entity_id and target_relationship_name set,
-- find the relationship_definition whose target_entity_id matches and whose
-- source_lookup_field's physical_column_name matches the stage's target_relationship_name.
UPDATE process_stage ps
SET relationship_definition_id = rd.relationship_definition_id
FROM relationship_definition rd
JOIN field_definition fd
  ON fd.field_definition_id = rd.source_lookup_field_id
WHERE ps.relationship_definition_id IS NULL
  AND ps.target_entity_id IS NOT NULL
  AND ps.target_relationship_name IS NOT NULL
  AND ps.target_relationship_name != ''
  AND rd.target_entity_id = ps.target_entity_id
  AND fd.physical_column_name = ps.target_relationship_name
  AND rd.is_active = true;
