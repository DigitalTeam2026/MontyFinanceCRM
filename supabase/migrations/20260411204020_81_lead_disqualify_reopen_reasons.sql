/*
  # Lead Disqualification & Reopen Tracking

  ## Summary
  Adds structured tracking for lead disqualification and reopen events, including:
  - Mandatory reason text captured at disqualification time
  - Timestamp and user recorded for disqualification
  - Mandatory reason text captured when re-opening a disqualified lead
  - Timestamp and user recorded for reopen

  ## New Columns on `lead`

  | Column | Type | Notes |
  |---|---|---|
  | `disqualify_reason` | text | Why the lead was disqualified (e.g. "No budget") |
  | `disqualified_at` | timestamptz | When the lead was disqualified |
  | `disqualified_by` | uuid | FK → crm_user who disqualified |
  | `reopen_reason` | text | Why the lead was re-opened (e.g. "Customer re-engaged") |
  | `reopened_at` | timestamptz | When the lead was re-opened |
  | `reopened_by` | uuid | FK → crm_user who re-opened |

  ## Security
  RLS is inherited from the existing `lead` table policies — no new tables are created.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'disqualify_reason'
  ) THEN
    ALTER TABLE lead ADD COLUMN disqualify_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'disqualified_at'
  ) THEN
    ALTER TABLE lead ADD COLUMN disqualified_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'disqualified_by'
  ) THEN
    ALTER TABLE lead ADD COLUMN disqualified_by uuid REFERENCES crm_user(user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'reopen_reason'
  ) THEN
    ALTER TABLE lead ADD COLUMN reopen_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'reopened_at'
  ) THEN
    ALTER TABLE lead ADD COLUMN reopened_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'reopened_by'
  ) THEN
    ALTER TABLE lead ADD COLUMN reopened_by uuid REFERENCES crm_user(user_id);
  END IF;
END $$;
