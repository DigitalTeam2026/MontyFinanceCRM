/*
  # Add bpf_stage column to opportunity (fixes BPF auto-complete bug)

  The Business Process Flow's stage_field is `bpf_stage`. This column already
  exists on `lead` but was MISSING on `opportunity`. As a result, every BPF save
  on an Opportunity included the `bpf_stage` key, which saveRecord() rejected with
  a missingColumnsError ("loud save" drift guard). The thrown error hit the stage-
  change catch handler, which (incorrectly) flipped bpf_is_finished, making the bar
  falsely show "Completed" ~3s after opening any Opportunity.

  This adds bpf_stage to opportunity to match lead (text, nullable), and backfills
  it from the record's current active_process_stage_id so existing records render on
  their correct saved stage instead of being re-initialized.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunity' AND column_name = 'bpf_stage'
  ) THEN
    ALTER TABLE opportunity ADD COLUMN bpf_stage text;
  END IF;
END $$;

-- Backfill bpf_stage from the saved active stage so the bar loads on the correct
-- stage on first open (matching the per-record active_process_stage_id source of truth).
UPDATE opportunity o
SET bpf_stage = ps.stage_key
FROM process_stage ps
WHERE o.active_process_stage_id = ps.process_stage_id
  AND o.bpf_stage IS NULL;

-- Ask PostgREST to reload its schema cache so the new column is writable immediately.
NOTIFY pgrst, 'reload schema';
