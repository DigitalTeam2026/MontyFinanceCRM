/*
  # Pipeline Stage Extensions

  ## Overview
  Adds new configuration fields to the `process_stage` table to support
  richer stage governance. These fields allow admins to configure per-stage
  rules around movement, approvals, and categorisation.

  ## Changes to process_stage

  ### New Columns
  - `stage_category` (text, default 'general')
    Logical grouping for display/filtering. Examples: 'prospecting', 'qualification',
    'proposal', 'negotiation', 'closing', 'post-sale', 'general'.

  - `is_terminal` (boolean, default false)
    Derived convenience flag — true when stage_type is any terminal variant.
    Kept as a real column so it can be queried/indexed without a computed expression.

  - `allow_backward_movement` (boolean, default true)
    When false, the stage bar prevents the user from moving backward to this stage
    (i.e. the stage cannot be re-entered once passed).

  - `requires_entry_approval` (boolean, default false)
    A manager/approver must approve before the record enters this stage.

  - `requires_exit_approval` (boolean, default false)
    A manager/approver must approve before the record can leave this stage.

  ## Security
  - No new tables; existing RLS on process_stage applies.

  ## Notes
  - Existing rows default to: stage_category = 'general', is_terminal = false,
    allow_backward_movement = true, requires_entry_approval = false, requires_exit_approval = false.
  - `is_terminal` is set via a trigger to keep it in sync with `stage_type`.
*/

-- ─── Add columns ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'stage_category'
  ) THEN
    ALTER TABLE process_stage ADD COLUMN stage_category text NOT NULL DEFAULT 'general';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'is_terminal'
  ) THEN
    ALTER TABLE process_stage ADD COLUMN is_terminal boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'allow_backward_movement'
  ) THEN
    ALTER TABLE process_stage ADD COLUMN allow_backward_movement boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'requires_entry_approval'
  ) THEN
    ALTER TABLE process_stage ADD COLUMN requires_entry_approval boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'requires_exit_approval'
  ) THEN
    ALTER TABLE process_stage ADD COLUMN requires_exit_approval boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─── Backfill is_terminal from existing stage_type ────────────────────────────

UPDATE process_stage
SET is_terminal = (stage_type IN ('terminal_success', 'terminal_failure', 'terminal_neutral'))
WHERE is_terminal = false;

-- ─── Trigger to keep is_terminal in sync ─────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_stage_is_terminal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_terminal := NEW.stage_type IN ('terminal_success', 'terminal_failure', 'terminal_neutral');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_stage_is_terminal ON process_stage;
CREATE TRIGGER trg_sync_stage_is_terminal
  BEFORE INSERT OR UPDATE OF stage_type ON process_stage
  FOR EACH ROW EXECUTE FUNCTION sync_stage_is_terminal();

-- ─── Index for category queries ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_process_stage_category ON process_stage(stage_category);
CREATE INDEX IF NOT EXISTS idx_process_stage_is_terminal ON process_stage(is_terminal);
