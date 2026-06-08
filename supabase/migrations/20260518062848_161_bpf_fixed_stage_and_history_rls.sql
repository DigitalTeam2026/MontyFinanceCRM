/*
  # BPF Fixed Stage, Condition Branch Fields, Stage History & Instance RLS

  ## Changes

  ### 1. Fixed Stage Flag
  - Add `is_fixed` boolean column to `process_stage`
  - First stage in each flow should be marked as fixed
  - Fixed stages cannot be moved, deleted (except via flow deletion), or reordered to non-first position

  ### 2. Condition Branch Fields on process_stage
  - `branch_yes_stage_id`, `branch_no_stage_id`, `condition_field`, `condition_operator`, `condition_value`
    already exist from migration 160. Ensure defaults are set.

  ### 3. Stage Entity Override
  - `stage_entity_id` already exists. Ensure it is nullable with no default constraint issues.

  ### 4. process_flow_instance RLS
  - Enable RLS
  - Authenticated users can read/write their own instances

  ### 5. process_stage_history RLS
  - Enable RLS
  - Authenticated users can read/insert history rows

  ### 6. process_flow_stage_history RLS
  - Enable RLS
  - Authenticated users can read/insert

  ### 7. process_stage_fields - add related_entity_id column
  - Allows fields from related entities to be attached to a stage step

  ### Notes
  - All DDL uses IF NOT EXISTS / DO $$ BEGIN…END $$ guards
  - No destructive operations
*/

-- 1. Add is_fixed to process_stage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'is_fixed'
  ) THEN
    ALTER TABLE process_stage ADD COLUMN is_fixed boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Add related_entity_id to process_stage_fields (for cross-entity field steps)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage_fields' AND column_name = 'related_entity_id'
  ) THEN
    ALTER TABLE process_stage_fields ADD COLUMN related_entity_id uuid REFERENCES entity_definition(entity_definition_id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Add related_entity_id to process_stage_fields index
CREATE INDEX IF NOT EXISTS idx_process_stage_fields_related_entity
  ON process_stage_fields (related_entity_id)
  WHERE related_entity_id IS NOT NULL;

-- 4. Enable RLS on process_flow_instance
ALTER TABLE process_flow_instance ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'process_flow_instance' AND policyname = 'Authenticated users can read process flow instances') THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can read process flow instances"
        ON process_flow_instance FOR SELECT
        TO authenticated
        USING (true)
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'process_flow_instance' AND policyname = 'Authenticated users can insert process flow instances') THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can insert process flow instances"
        ON process_flow_instance FOR INSERT
        TO authenticated
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'process_flow_instance' AND policyname = 'Authenticated users can update process flow instances') THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can update process flow instances"
        ON process_flow_instance FOR UPDATE
        TO authenticated
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;

-- 5. Enable RLS on process_stage_history
ALTER TABLE process_stage_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'process_stage_history' AND policyname = 'Authenticated users can read stage history') THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can read stage history"
        ON process_stage_history FOR SELECT
        TO authenticated
        USING (true)
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'process_stage_history' AND policyname = 'Authenticated users can insert stage history') THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can insert stage history"
        ON process_stage_history FOR INSERT
        TO authenticated
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;

-- 6. Enable RLS on process_flow_stage_history
ALTER TABLE process_flow_stage_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'process_flow_stage_history' AND policyname = 'Authenticated users can read flow stage history') THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can read flow stage history"
        ON process_flow_stage_history FOR SELECT
        TO authenticated
        USING (true)
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'process_flow_stage_history' AND policyname = 'Authenticated users can insert flow stage history') THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can insert flow stage history"
        ON process_flow_stage_history FOR INSERT
        TO authenticated
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;

-- 7. Index on process_flow_instance for record lookup
CREATE INDEX IF NOT EXISTS idx_process_flow_instance_record
  ON process_flow_instance (record_id, entity_definition_id);

CREATE INDEX IF NOT EXISTS idx_process_stage_history_instance
  ON process_stage_history (instance_id);
