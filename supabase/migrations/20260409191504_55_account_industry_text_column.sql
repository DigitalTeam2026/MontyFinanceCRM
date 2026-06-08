/*
  # Add industry text column to account table

  ## Summary
  The account table has an industry_id UUID FK column but the form
  stores industry as a string choice value (e.g. 'technology'). 
  This migration adds a text column 'industry' to store the choice 
  value directly, and activates the field_definition mapping for it.

  ## Changes
  - Adds `industry` text column to `account` table
  - Updates field_definition for `industrycode` to map to `industry` physical column and marks it active
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account' AND column_name = 'industry'
  ) THEN
    ALTER TABLE account ADD COLUMN industry text DEFAULT NULL;
  END IF;
END $$;

UPDATE field_definition
SET
  physical_column_name = 'industry',
  is_active = true
WHERE logical_name = 'industrycode'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'account'
  );
