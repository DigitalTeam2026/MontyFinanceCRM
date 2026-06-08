/*
  # Transformation Target: Add relationship_definition_id

  ## Summary
  Adds a structured FK reference from record_transformation_target to relationship_definition.
  This allows the recordTransformationEngine to resolve the linking FK column from metadata
  rather than relying on the hardcoded account→contact→opportunity chain.

  ## Changes

  ### record_transformation_target
  - Add nullable `relationship_definition_id` (uuid, FK → relationship_definition)
  - Existing implicit auto-linking logic is preserved as fallback — no behavior change

  ## Backfill Strategy
  For each target row, find the single unambiguous active relationship between:
    - The rule's source entity (mapped to entity_definition via logical_name)
    - The target entity (mapped to entity_definition via logical_name)
  Set relationship_definition_id where exactly one match exists.
  Leave null where zero or multiple matches exist — admin resolves in the UI.

  ## Engine Behavior
  Dual-path resolution in recordTransformationEngine:
  1. If relationship_definition_id is set: use field_definition.physical_column_name to set the FK
  2. If null: existing hardcoded behavior preserved (account_id, contact_id auto-linking)

  ## Security
  Inherits from record_transformation_target table's existing policies.
*/

-- 1. Add relationship_definition_id to record_transformation_target
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'record_transformation_target'
      AND column_name = 'relationship_definition_id'
  ) THEN
    ALTER TABLE record_transformation_target
      ADD COLUMN relationship_definition_id uuid
        REFERENCES relationship_definition(relationship_definition_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transformation_target_rel_def
  ON record_transformation_target (relationship_definition_id);

-- 2. Backfill using a subquery that counts candidates per (source_entity, target_entity) pair
-- Only applies when exactly one unambiguous active lookup relationship exists.
UPDATE record_transformation_target rtt
SET relationship_definition_id = candidates.relationship_definition_id
FROM (
  SELECT
    rtr.record_transformation_rule_id,
    rtt2.target_entity,
    MIN(rd.relationship_definition_id::text)::uuid AS relationship_definition_id,
    COUNT(*) AS match_count
  FROM record_transformation_target rtt2
  JOIN record_transformation_rule rtr
    ON rtr.record_transformation_rule_id = rtt2.rule_id
  JOIN entity_definition src_ent
    ON src_ent.logical_name = rtr.source_entity
  JOIN entity_definition tgt_ent
    ON tgt_ent.logical_name = rtt2.target_entity
  JOIN relationship_definition rd
    ON rd.source_entity_id = src_ent.entity_definition_id
   AND rd.target_entity_id = tgt_ent.entity_definition_id
   AND rd.is_active = true
   AND rd.relationship_storage_type = 'lookup'
  WHERE rtt2.relationship_definition_id IS NULL
  GROUP BY rtr.record_transformation_rule_id, rtt2.target_entity
  HAVING COUNT(*) = 1
) AS candidates
WHERE rtt.rule_id = candidates.record_transformation_rule_id
  AND rtt.target_entity = candidates.target_entity
  AND rtt.relationship_definition_id IS NULL;
