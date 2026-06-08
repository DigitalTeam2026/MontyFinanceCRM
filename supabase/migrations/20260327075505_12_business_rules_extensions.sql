
/*
  # Migration 12: Business Rules Extensions

  ## Overview
  Extends the existing business_rule table with richer metadata needed by
  the Business Rules designer: run_order for priority, deleted_at for
  soft-delete, and a snapshot field for the last modifier.

  ## Modified Tables

  ### business_rule
  - `run_order` (integer, default 0) — Execution priority; lower numbers run first
  - `deleted_at` (timestamptz) — Soft-delete support; null means active
  - `modified_by` (uuid → crm_user) — Last user who saved the rule

  ## Security
  - Adds missing DELETE policy so editors can remove their own rules
  - No existing policies are changed

  ## Notes
  - All changes use safe IF NOT EXISTS / DO $$ guards
  - RLS remains enabled from the original migration
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_rule' AND column_name = 'run_order'
  ) THEN
    ALTER TABLE business_rule ADD COLUMN run_order integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_rule' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE business_rule ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_rule' AND column_name = 'modified_by'
  ) THEN
    ALTER TABLE business_rule ADD COLUMN modified_by uuid REFERENCES crm_user(user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'business_rule' AND policyname = 'Users can delete their own rules'
  ) THEN
    CREATE POLICY "Users can delete their own rules"
      ON business_rule FOR DELETE
      TO authenticated
      USING (created_by = auth.uid());
  END IF;
END $$;
