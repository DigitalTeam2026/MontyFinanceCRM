/*
  # Add country_code columns to account, contact, and lead tables

  ## Changes
  - Adds `country_code` text column to `account`, `contact`, and `lead` tables
  - This column stores the ISO 2-letter country code (e.g. LB, US, FR)
  - Safe to run multiple times (IF NOT EXISTS guards)

  ## Notes
  - The existing `country` reference table already holds code + name pairs
  - The field_definition records will be re-activated in a follow-up migration
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account' AND column_name = 'country_code'
  ) THEN
    ALTER TABLE account ADD COLUMN country_code text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contact' AND column_name = 'country_code'
  ) THEN
    ALTER TABLE contact ADD COLUMN country_code text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'country_code'
  ) THEN
    ALTER TABLE lead ADD COLUMN country_code text;
  END IF;
END $$;
