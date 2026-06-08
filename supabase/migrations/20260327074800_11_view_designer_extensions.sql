
/*
  # Migration 11: View Designer Extensions

  ## Overview
  Extends the view metadata tables to fully support the View Designer UI:
  column ordering, quick filters, filter conditions, sort definitions,
  and column-level display overrides.

  ## Modified Tables

  ### view_definition
  - `deleted_at` (timestamptz) — Soft-delete support
  - `quick_find_fields` (text[]) — Field logical names used for the top search bar
  - `column_config` (jsonb) — Snapshot of ordered columns with widths for fast load

  ### view_column
  - `label_override` (text) — Custom header label
  - `is_hidden` (boolean) — Hidden in the grid but still part of the definition

  ## Notes
  - All existing RLS policies remain; no security changes
  - Uses safe IF NOT EXISTS guards throughout
*/

-- view_definition extensions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='view_definition' AND column_name='deleted_at') THEN
    ALTER TABLE view_definition ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='view_definition' AND column_name='quick_find_fields') THEN
    ALTER TABLE view_definition ADD COLUMN quick_find_fields text[] DEFAULT '{}';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='view_definition' AND column_name='column_config') THEN
    ALTER TABLE view_definition ADD COLUMN column_config jsonb;
  END IF;
END $$;

-- view_column extensions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='view_column' AND column_name='label_override') THEN
    ALTER TABLE view_column ADD COLUMN label_override text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='view_column' AND column_name='is_hidden') THEN
    ALTER TABLE view_column ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
  END IF;
END $$;
