/*
  # Sync state_code trigger and data normalization

  1. Problem
    - `state_code` and `status` columns can get out of sync
    - Some records have numeric status values ('1','2'), others have text ('active','inactive')
    - state_code must always reflect the canonical state for view filters to work correctly

  2. Changes
    - Normalize all existing `status` text values to numeric state_code equivalents
    - Create a trigger function that auto-syncs state_code when status changes (and vice versa)
    - Applied to: account, contact, lead, opportunity, ticket, campaign, event, journey,
      marketing_email, segment, business_unit, team, security_role, currency, organization, crm_user, country

  3. Logic
    - If state_code is explicitly set on INSERT/UPDATE, use that value
    - If status is set to a numeric value ('1','2',...), sync state_code to match
    - On INSERT, default state_code to '1' (Active) if not provided
*/

-- Trigger function: keeps state_code in sync
CREATE OR REPLACE FUNCTION sync_state_code()
RETURNS TRIGGER AS $$
BEGIN
  -- If state_code was explicitly changed, trust it
  IF TG_OP = 'UPDATE' AND NEW.state_code IS DISTINCT FROM OLD.state_code THEN
    RETURN NEW;
  END IF;

  -- If status is a numeric value that matches a valid state, sync state_code
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status ~ '^\d+$' THEN
      NEW.state_code := NEW.status;
      RETURN NEW;
    END IF;
  END IF;

  -- On INSERT, ensure state_code has a value
  IF TG_OP = 'INSERT' THEN
    IF NEW.state_code IS NULL OR NEW.state_code = '' THEN
      IF NEW.status IS NOT NULL AND NEW.status ~ '^\d+$' THEN
        NEW.state_code := NEW.status;
      ELSE
        NEW.state_code := '1';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all entity tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'account', 'contact', 'lead', 'opportunity', 'ticket',
    'campaign', 'event', 'journey', 'marketing_email', 'segment',
    'business_unit', 'team', 'security_role', 'currency',
    'organization', 'crm_user', 'country'
  ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_sync_state_code ON %I', tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trg_sync_state_code BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION sync_state_code()', tbl
    );
  END LOOP;
END $$;

-- Normalize existing data: where status is numeric, ensure state_code matches
UPDATE account SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE contact SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE lead SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE opportunity SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE ticket SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE campaign SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE event SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE journey SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE marketing_email SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE segment SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE business_unit SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE team SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE security_role SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE currency SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE organization SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE crm_user SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
UPDATE country SET state_code = status WHERE status ~ '^\d+$' AND state_code != status;
