/*
  # Auto-generated Account Number

  ## Summary
  Adds a system-generated, unique account number to every account record.
  Account numbers follow the format ACC-000001, ACC-000002, etc.

  ## Changes

  ### New Sequence
  - `account_number_seq` - integer sequence starting at 1

  ### Modified Tables
  - `account`
    - New column: `account_number` (text, unique, not null, auto-generated from sequence)
    - Default: 'ACC-' || zero-padded 6-digit sequence number

  ### field_definition Update
  - Re-activates the `accountnumber` field definition
  - Maps physical_column_name to the new `account_number` column
  - Marks it as read-only / non-editable (is_schema_editable = false)

  ## Notes
  1. The sequence starts at 1 so existing records backfilled will get their numbers
  2. Existing rows will be backfilled with sequential numbers on migration
  3. New inserts get the number automatically from the DEFAULT expression
  4. The field is system-managed and should never be manually editable
*/

CREATE SEQUENCE IF NOT EXISTS account_number_seq START 1;

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS account_number text;

UPDATE account
SET account_number = 'ACC-' || LPAD(nextval('account_number_seq')::text, 6, '0')
WHERE account_number IS NULL;

ALTER TABLE account
  ALTER COLUMN account_number SET DEFAULT ('ACC-' || LPAD(nextval('account_number_seq')::text, 6, '0'));

ALTER TABLE account
  ALTER COLUMN account_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'account' AND constraint_name = 'account_account_number_key'
  ) THEN
    ALTER TABLE account ADD CONSTRAINT account_account_number_key UNIQUE (account_number);
  END IF;
END $$;

UPDATE field_definition fd
SET
  physical_column_name = 'account_number',
  is_active            = true,
  is_schema_editable   = false,
  is_deletable         = false
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'account'
  AND fd.logical_name = 'accountnumber';
