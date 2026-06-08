/*
  # BPF Component Type Column

  Adds a `component_type` column to `process_stage` to differentiate
  between Stage, Condition, Data Step, Workflow, Action Step, and Flow Step
  components — matching Dynamics 365 BPF designer component palette.

  Default is 'stage' to keep backward compatibility with all existing rows.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'component_type'
  ) THEN
    ALTER TABLE process_stage
      ADD COLUMN component_type text NOT NULL DEFAULT 'stage'
        CHECK (component_type IN ('stage','condition','data_step','workflow','action_step','flow_step'));
  END IF;
END $$;
