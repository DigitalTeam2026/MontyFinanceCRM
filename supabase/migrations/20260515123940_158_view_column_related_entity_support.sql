/*
  # View Column Related Entity Support

  ## Summary
  Adds support for columns from related entities in view definitions.

  ## Changes

  ### Modified Tables
  - `view_column`
    - New column: `relationship_definition_id` (uuid, nullable, FK to relationship_definition)
      Used to identify that a column comes from a related entity accessed via a specific relationship.
      NULL = column is from the view's own entity.
      Non-NULL = column is from the related entity on the other end of this relationship.

  ### Security
  - Existing system-admin-only insert/update/delete policies are preserved.
  - Two new policies added so that view owners (the user who created the view) can
    insert, update, and delete columns on their own views — required for personal/public
    view column management from the UI.
  - SELECT policy unchanged (all authenticated users can read view columns).
*/

-- 1. Add nullable FK column to view_column
ALTER TABLE view_column
  ADD COLUMN IF NOT EXISTS relationship_definition_id uuid
    REFERENCES relationship_definition(relationship_definition_id)
    ON DELETE SET NULL;

-- 2. Index for fast lookup by relationship
CREATE INDEX IF NOT EXISTS idx_view_column_relationship_id
  ON view_column(relationship_definition_id)
  WHERE relationship_definition_id IS NOT NULL;

-- 3. Allow view owners to insert columns on their own views
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'view_column' AND policyname = 'View owners can insert their view columns'
  ) THEN
    CREATE POLICY "View owners can insert their view columns"
      ON view_column
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM view_definition vd
          WHERE vd.view_id = view_column.view_id
            AND vd.created_by = auth.uid()
        )
      );
  END IF;
END $$;

-- 4. Allow view owners to update columns on their own views
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'view_column' AND policyname = 'View owners can update their view columns'
  ) THEN
    CREATE POLICY "View owners can update their view columns"
      ON view_column
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM view_definition vd
          WHERE vd.view_id = view_column.view_id
            AND vd.created_by = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM view_definition vd
          WHERE vd.view_id = view_column.view_id
            AND vd.created_by = auth.uid()
        )
      );
  END IF;
END $$;

-- 5. Allow view owners to delete columns on their own views
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'view_column' AND policyname = 'View owners can delete their view columns'
  ) THEN
    CREATE POLICY "View owners can delete their view columns"
      ON view_column
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM view_definition vd
          WHERE vd.view_id = view_column.view_id
            AND vd.created_by = auth.uid()
        )
      );
  END IF;
END $$;
