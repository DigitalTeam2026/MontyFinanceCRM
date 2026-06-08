
/*
  # Migration 13: Workflow / Automation Extensions

  ## Overview
  Extends the existing workflow_definition and workflow_step tables. The PK on
  workflow_definition is `workflow_id` and on workflow_step is `workflow_step_id`.

  ## Modified Tables

  ### workflow_definition
  - `deleted_at` (timestamptz) — Soft-delete support
  - `last_triggered_at` (timestamptz) — Last time this workflow ran
  - `run_count` (integer, default 0) — Total executions

  ### workflow_step
  - `position_x` (integer, default 0) — Canvas X hint
  - `position_y` (integer, default 0) — Canvas Y hint
  - `label` (text) — Human-readable display label
  - `description` (text) — Optional description

  ## Security
  - Adds DELETE policies for owners on both tables (guarded with IF NOT EXISTS)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_definition' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE workflow_definition ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_definition' AND column_name = 'last_triggered_at'
  ) THEN
    ALTER TABLE workflow_definition ADD COLUMN last_triggered_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_definition' AND column_name = 'run_count'
  ) THEN
    ALTER TABLE workflow_definition ADD COLUMN run_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_step' AND column_name = 'position_x'
  ) THEN
    ALTER TABLE workflow_step ADD COLUMN position_x integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_step' AND column_name = 'position_y'
  ) THEN
    ALTER TABLE workflow_step ADD COLUMN position_y integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_step' AND column_name = 'label'
  ) THEN
    ALTER TABLE workflow_step ADD COLUMN label text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_step' AND column_name = 'description'
  ) THEN
    ALTER TABLE workflow_step ADD COLUMN description text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workflow_definition' AND policyname = 'Users can delete their own workflows'
  ) THEN
    CREATE POLICY "Users can delete their own workflows"
      ON workflow_definition FOR DELETE
      TO authenticated
      USING (created_by = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workflow_step' AND policyname = 'Users can delete their own workflow steps'
  ) THEN
    CREATE POLICY "Users can delete their own workflow steps"
      ON workflow_step FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM workflow_definition wd
          WHERE wd.workflow_id = workflow_step.workflow_id
          AND wd.created_by = auth.uid()
        )
      );
  END IF;
END $$;
