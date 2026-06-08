/*
  # Add state_code and status_reason columns to industry table

  1. Modified Tables
    - `industry`
      - Add `state_code` (integer, default 1 = Active)
      - Add `status_reason` (integer, default 1 = Active)

  2. Data Backfill
    - All existing active rows (is_active = true) get state_code=1
    - Inactive rows get state_code=2

  3. Important Notes
    - Aligns industry table with the standard entity status model
    - statecode_definition entries already exist for this entity
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'industry' AND column_name = 'state_code'
  ) THEN
    ALTER TABLE industry ADD COLUMN state_code integer NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'industry' AND column_name = 'status_reason'
  ) THEN
    ALTER TABLE industry ADD COLUMN status_reason integer NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Backfill based on is_active
UPDATE industry SET state_code = 1, status_reason = 1 WHERE is_active = true;
UPDATE industry SET state_code = 2, status_reason = 2 WHERE is_active = false;

CREATE INDEX IF NOT EXISTS idx_industry_state_code ON industry(state_code);
