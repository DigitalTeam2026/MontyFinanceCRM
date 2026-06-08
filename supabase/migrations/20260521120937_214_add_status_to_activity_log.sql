/*
  # Add status column to activity_log

  ## Changes
  - Adds `status` column (text, default 'open') to `activity_log`
  - Backfills existing rows: completed_at IS NOT NULL → 'completed', else 'open'

  ## Notes
  - Matches the ActivityStatus type used in activityService.ts ('open' | 'completed')
*/

ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';

UPDATE activity_log
  SET status = 'completed'
  WHERE completed_at IS NOT NULL AND status = 'open';
