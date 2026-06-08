/*
  # Status-Based Currency Lock

  ## Summary
  Adds a `currency_lock_reason` column to the three monetary entities so the
  application can record WHY a record's currency became locked.

  Two complementary locking mechanisms now exist:
  1. Value-lock  — currency locks when the first monetary value is saved (existing behaviour)
  2. Status-lock — currency locks when the record's status passes a configured threshold
                   (e.g. lead becomes 'qualified'; opportunity becomes 'won' or 'lost';
                    account becomes 'active')

  The column stores a short machine-readable reason token:
    'value_saved'        — first monetary value was persisted
    'status_threshold'   — status advanced past a lock threshold
    'admin_override'     — privileged user changed and re-locked manually

  A NULL value means the record is not yet locked (currency is still editable).

  ## Modified Tables
  - `account`      — adds `currency_lock_reason text`
  - `lead`         — adds `currency_lock_reason text`
  - `opportunity`  — adds `currency_lock_reason text`

  ## Notes
  - Existing rows stay NULL (unlocked) unless they also have currency_locked = true,
    in which case we backfill 'value_saved' as the assumed historical reason.
  - The application layer is responsible for writing this column; no triggers used.
  - No RLS changes needed: follows the same policies as its table.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account' AND column_name = 'currency_lock_reason'
  ) THEN
    ALTER TABLE account ADD COLUMN currency_lock_reason text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'currency_lock_reason'
  ) THEN
    ALTER TABLE lead ADD COLUMN currency_lock_reason text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunity' AND column_name = 'currency_lock_reason'
  ) THEN
    ALTER TABLE opportunity ADD COLUMN currency_lock_reason text;
  END IF;
END $$;

UPDATE account
  SET currency_lock_reason = 'value_saved'
  WHERE currency_locked = true AND currency_lock_reason IS NULL;

UPDATE lead
  SET currency_lock_reason = 'value_saved'
  WHERE currency_locked = true AND currency_lock_reason IS NULL;

UPDATE opportunity
  SET currency_lock_reason = 'value_saved'
  WHERE currency_locked = true AND currency_lock_reason IS NULL;
