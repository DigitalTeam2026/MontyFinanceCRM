/*
  # Add activity pinning

  1. Changes
    - `activity_log`: new boolean column `is_pinned` (default false)
      Allows users to flag important activities so they surface at the top of the timeline.
  2. Index
    - `idx_activity_log_pinned` on (regarding_entity, regarding_id, is_pinned)
      for fast "pinned first" ordering queries.
  3. No RLS changes needed — existing policies already govern row access.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activity_log' AND column_name = 'is_pinned'
  ) THEN
    ALTER TABLE activity_log ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activity_log_pinned
  ON activity_log (regarding_entity, regarding_id, is_pinned);
