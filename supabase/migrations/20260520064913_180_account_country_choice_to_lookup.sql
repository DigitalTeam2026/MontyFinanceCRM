/*
  # Convert Account Country from Choice to Lookup

  1. Data Migration
    - Backfill `account.country_id` from `account.country_code` by matching `country.code`
    - Existing FK `account_country_id_fkey` already references `country(country_id)`

  2. Metadata Changes
    - Update `field_definition` for Account Country:
      - Change `field_type_id` from choice to lookup
      - Change `physical_column_name` from `country_code` to `country_id`
      - Set `lookup_entity_id` to the Country entity definition
      - Clear `config_json` (remove option set reference)

  3. Form Layout Changes
    - Update Account Main Form layout_json: change country control
      from `field_type_name: "choice"` to `field_type_name: "lookup"`

  4. Important Notes
    - The `country_code` column is NOT dropped to preserve data
    - The `country_id` column and FK already exist from a prior migration
*/

-- 1. Backfill country_id from country_code where missing
UPDATE account a
SET country_id = c.country_id
FROM country c
WHERE a.country_code = c.code
  AND a.country_id IS NULL
  AND a.country_code IS NOT NULL;

-- 2. Update field_definition: change from choice to lookup
UPDATE field_definition
SET
  field_type_id   = '1923fc3b-b2d4-49b0-988f-31773bed353e',  -- lookup type
  physical_column_name = 'country_id',
  lookup_entity_id = 'abcb18a7-77e3-44e6-8fd0-9cd422dace0e', -- Country entity
  config_json     = NULL,
  modified_at     = now()
WHERE field_definition_id = 'ae38b755-2f11-42fe-bbc5-2b5229860e64';

-- 3. Update Account Main Form layout_json: switch country control to lookup
UPDATE form_definition
SET layout_json = jsonb_set(
  layout_json,
  -- Path: tabs[1] (Address tab) -> sections[0] -> controls[1] (Country control)
  '{tabs,1,sections,0,controls,1,field_type_name}',
  '"lookup"'::jsonb
),
modified_at = now()
WHERE form_id = '8a6fcaf8-1259-4d8f-a25b-bdbeb285a52e';

-- 4. Add index on country_id for faster lookups (if not already present)
CREATE INDEX IF NOT EXISTS idx_account_country_id ON account(country_id);
