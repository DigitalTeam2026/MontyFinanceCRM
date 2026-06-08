/*
  # Add full_name Generated Columns to contact and lead Tables

  ## Summary
  Adds a `full_name` GENERATED ALWAYS AS computed column to the `contact` and `lead`
  tables. This column is automatically maintained by the database whenever `first_name`
  or `last_name` is inserted or updated — no application-level logic required.

  ## Changes

  ### contact table
  - Adds `full_name` text column generated as `trim(first_name || ' ' || last_name)`

  ### lead table
  - Adds `full_name` text column generated as `trim(first_name || ' ' || last_name)`

  ## Notes
  - GENERATED ALWAYS AS (STORED) means the value is physically stored and indexed
  - The column is read-only — it cannot be written directly
  - Existing rows are back-filled automatically
  - The listService already computes full_name in JS; this aligns the DB with that logic
  - The LOOKUP_FETCH_CONFIG in RecordFormPage already selects full_name for contacts,
    which will now resolve correctly
*/

ALTER TABLE contact
  ADD COLUMN IF NOT EXISTS full_name text GENERATED ALWAYS AS (
    trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
  ) STORED;

ALTER TABLE lead
  ADD COLUMN IF NOT EXISTS full_name text GENERATED ALWAYS AS (
    trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
  ) STORED;
