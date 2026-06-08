/*
  # Currency Lock

  ## Summary
  Adds a `currency_locked` boolean flag to the three entities that carry monetary
  values and a `currency_id` foreign key: account, lead, and opportunity.

  ## Purpose
  Once any monetary field on a record is saved for the first time, the application
  will set `currency_locked = true`, preventing casual inline edits of the currency.
  Changing currency on a locked record requires a controlled "Change Record Currency"
  workflow performed by a privileged user (system administrator or custom privileged
  role), which clears affected monetary fields, logs the change to the audit trail,
  and requires explicit user confirmation.

  ## Changes

  ### Modified Tables
  - `account`   — adds `currency_locked boolean NOT NULL DEFAULT false`
  - `lead`      — adds `currency_locked boolean NOT NULL DEFAULT false`
  - `opportunity` — adds `currency_locked boolean NOT NULL DEFAULT false`

  ## Notes
  - Default is `false` so all existing records start unlocked.
  - The application layer is responsible for setting this flag to `true` when the
    first monetary value is persisted (not the database trigger, to keep the lock
    logic transparent and auditable in the application).
  - No RLS changes needed: the column follows the same RLS policies as its table.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account' AND column_name = 'currency_locked'
  ) THEN
    ALTER TABLE account ADD COLUMN currency_locked boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'currency_locked'
  ) THEN
    ALTER TABLE lead ADD COLUMN currency_locked boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunity' AND column_name = 'currency_locked'
  ) THEN
    ALTER TABLE opportunity ADD COLUMN currency_locked boolean NOT NULL DEFAULT false;
  END IF;
END $$;
