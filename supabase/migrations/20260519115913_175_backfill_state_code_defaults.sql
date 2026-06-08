/*
  # Backfill state_code defaults

  1. Problem
    - All entity tables have a `state_code` column (text) with no default value
    - Existing records have NULL state_code, causing view filters like "Active Accounts" (state_code = '1') to return empty
    - The statecode_definition table defines state_value 1 = Active, 2 = Inactive

  2. Changes
    - Set state_code = '1' (Active) for all existing records where state_code is NULL
    - Add column default of '1' so new records are automatically Active
    - Applied to all 17 entity tables that have state_code column

  3. Affected Tables
    - account, contact, lead, opportunity, ticket
    - campaign, event, journey, marketing_email, segment
    - business_unit, team, security_role, currency, organization, crm_user, country
*/

-- Backfill existing records
UPDATE account SET state_code = '1' WHERE state_code IS NULL;
UPDATE contact SET state_code = '1' WHERE state_code IS NULL;
UPDATE lead SET state_code = '1' WHERE state_code IS NULL;
UPDATE opportunity SET state_code = '1' WHERE state_code IS NULL;
UPDATE ticket SET state_code = '1' WHERE state_code IS NULL;
UPDATE campaign SET state_code = '1' WHERE state_code IS NULL;
UPDATE event SET state_code = '1' WHERE state_code IS NULL;
UPDATE journey SET state_code = '1' WHERE state_code IS NULL;
UPDATE marketing_email SET state_code = '1' WHERE state_code IS NULL;
UPDATE segment SET state_code = '1' WHERE state_code IS NULL;
UPDATE business_unit SET state_code = '1' WHERE state_code IS NULL;
UPDATE team SET state_code = '1' WHERE state_code IS NULL;
UPDATE security_role SET state_code = '1' WHERE state_code IS NULL;
UPDATE currency SET state_code = '1' WHERE state_code IS NULL;
UPDATE organization SET state_code = '1' WHERE state_code IS NULL;
UPDATE crm_user SET state_code = '1' WHERE state_code IS NULL;
UPDATE country SET state_code = '1' WHERE state_code IS NULL;

-- Set column defaults for future records
ALTER TABLE account ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE contact ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE lead ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE opportunity ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE ticket ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE campaign ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE event ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE journey ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE marketing_email ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE segment ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE business_unit ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE team ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE security_role ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE currency ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE organization ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE crm_user ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE country ALTER COLUMN state_code SET DEFAULT '1';
