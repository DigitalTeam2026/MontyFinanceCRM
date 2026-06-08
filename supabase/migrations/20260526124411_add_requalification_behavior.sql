/*
  # Add re-qualification behavior setting to lead qualification rules

  1. Changes
    - Add `requalification_behavior` column to `lead_qualification_rule`
    - Values: 'update_existing', 'create_new', 'ask_user', 'do_nothing'
    - Default: 'ask_user' (safest option for existing installations)

  2. Purpose
    - When a previously qualified Lead is reactivated and re-qualified,
      this setting controls what happens with the Opportunity:
      - update_existing: Update the existing related Opportunity with mapped fields
      - create_new: Always create a new Opportunity
      - ask_user: Show a dialog letting the user choose
      - do_nothing: Skip Opportunity creation/update entirely
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_qualification_rule' AND column_name = 'requalification_behavior'
  ) THEN
    ALTER TABLE lead_qualification_rule
      ADD COLUMN requalification_behavior text NOT NULL DEFAULT 'ask_user';
  END IF;
END $$;
