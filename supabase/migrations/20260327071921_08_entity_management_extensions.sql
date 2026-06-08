
/*
  # Migration 8: Entity Management Extensions

  ## Overview
  Extends the entity_definition table with the additional columns required by the
  Admin Studio Entity Management module. Adds soft-delete support, ownership model,
  and feature toggles.

  ## Modified Tables

  ### entity_definition
  - `ownership_type` — Who owns records of this entity: 'user', 'team', or 'organization'
  - `enable_activities` — Whether activity tracking (calls, tasks, appointments) is enabled
  - `enable_notes` — Whether the notes timeline is enabled for this entity
  - `enable_audit` — Whether field-level audit logging is enabled
  - `deleted_at` — Soft delete timestamp; NULL means the entity is active

  ## Notes
  - All new columns use safe IF NOT EXISTS patterns
  - No data is dropped or destroyed
  - Existing rows default to sensible values
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definition' AND column_name = 'ownership_type'
  ) THEN
    ALTER TABLE entity_definition
      ADD COLUMN ownership_type text NOT NULL DEFAULT 'user'
        CHECK (ownership_type IN ('user', 'team', 'organization'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definition' AND column_name = 'enable_activities'
  ) THEN
    ALTER TABLE entity_definition ADD COLUMN enable_activities boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definition' AND column_name = 'enable_notes'
  ) THEN
    ALTER TABLE entity_definition ADD COLUMN enable_notes boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definition' AND column_name = 'enable_audit'
  ) THEN
    ALTER TABLE entity_definition ADD COLUMN enable_audit boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definition' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE entity_definition ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_entity_definition_deleted ON entity_definition(deleted_at);

CREATE POLICY "Authenticated users can delete entity definitions"
  ON entity_definition FOR DELETE
  TO authenticated
  USING (true);
