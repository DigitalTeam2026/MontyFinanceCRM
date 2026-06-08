
/*
  # Normalize state_code values and view filter_json

  ## Problem
  - All entity tables store state_code as "1"/"2" numeric strings (or integers),
    except crm_source which correctly stores "active"/"inactive".
  - View filter_json conditions inconsistently use "1"/"2" vs "active"/"inactive".

  ## Changes
  1. Convert integer state_code columns to text (industry, product, product_family, test_entity)
  2. Migrate all state_code values: 1/"1" -> "active", 2/"2" -> "inactive"
  3. Normalize all view filter_json to use "active"/"inactive" with consistent structure
*/

-- Step 1: Convert integer state_code columns to text
ALTER TABLE industry       ALTER COLUMN state_code TYPE text USING state_code::text;
ALTER TABLE product        ALTER COLUMN state_code TYPE text USING state_code::text;
ALTER TABLE product_family ALTER COLUMN state_code TYPE text USING state_code::text;
ALTER TABLE test_entity    ALTER COLUMN state_code TYPE text USING state_code::text;

-- Step 2: Migrate all text tables (those that stored "1"/"2")
UPDATE account         SET state_code = 'active'   WHERE state_code = '1';
UPDATE account         SET state_code = 'inactive' WHERE state_code = '2';

UPDATE business_unit   SET state_code = 'active'   WHERE state_code = '1';
UPDATE business_unit   SET state_code = 'inactive' WHERE state_code = '2';

UPDATE campaign        SET state_code = 'active'   WHERE state_code = '1';
UPDATE campaign        SET state_code = 'inactive' WHERE state_code = '2';

UPDATE contact         SET state_code = 'active'   WHERE state_code = '1';
UPDATE contact         SET state_code = 'inactive' WHERE state_code = '2';

UPDATE country         SET state_code = 'active'   WHERE state_code = '1';
UPDATE country         SET state_code = 'inactive' WHERE state_code = '2';

UPDATE crm_user        SET state_code = 'active'   WHERE state_code = '1';
UPDATE crm_user        SET state_code = 'inactive' WHERE state_code = '2';

UPDATE currency        SET state_code = 'active'   WHERE state_code = '1';
UPDATE currency        SET state_code = 'inactive' WHERE state_code = '2';

UPDATE event           SET state_code = 'active'   WHERE state_code = '1';
UPDATE event           SET state_code = 'inactive' WHERE state_code = '2';

UPDATE industry        SET state_code = 'active'   WHERE state_code = '1';
UPDATE industry        SET state_code = 'inactive' WHERE state_code = '2';

UPDATE journey         SET state_code = 'active'   WHERE state_code = '1';
UPDATE journey         SET state_code = 'inactive' WHERE state_code = '2';

UPDATE lead            SET state_code = 'active'   WHERE state_code = '1';
UPDATE lead            SET state_code = 'inactive' WHERE state_code = '2';

UPDATE marketing_email SET state_code = 'active'   WHERE state_code = '1';
UPDATE marketing_email SET state_code = 'inactive' WHERE state_code = '2';

UPDATE opportunity     SET state_code = 'active'   WHERE state_code = '1';
UPDATE opportunity     SET state_code = 'inactive' WHERE state_code = '2';

UPDATE organization    SET state_code = 'active'   WHERE state_code = '1';
UPDATE organization    SET state_code = 'inactive' WHERE state_code = '2';

UPDATE product         SET state_code = 'active'   WHERE state_code = '1';
UPDATE product         SET state_code = 'inactive' WHERE state_code = '2';

UPDATE product_family  SET state_code = 'active'   WHERE state_code = '1';
UPDATE product_family  SET state_code = 'inactive' WHERE state_code = '2';

UPDATE security_role   SET state_code = 'active'   WHERE state_code = '1';
UPDATE security_role   SET state_code = 'inactive' WHERE state_code = '2';

UPDATE segment         SET state_code = 'active'   WHERE state_code = '1';
UPDATE segment         SET state_code = 'inactive' WHERE state_code = '2';

UPDATE team            SET state_code = 'active'   WHERE state_code = '1';
UPDATE team            SET state_code = 'inactive' WHERE state_code = '2';

UPDATE test_entity     SET state_code = 'active'   WHERE state_code = '1';
UPDATE test_entity     SET state_code = 'inactive' WHERE state_code = '2';

UPDATE ticket          SET state_code = 'active'   WHERE state_code = '1';
UPDATE ticket          SET state_code = 'inactive' WHERE state_code = '2';

-- Step 3: Normalize all view filter_json conditions on statecode from "1"/"2" to "active"/"inactive"
-- and ensure consistent structure with field_type_name = 'statecode'
UPDATE view_definition
SET filter_json = jsonb_set(
  COALESCE(filter_json, '{}'::jsonb) || '{"id":"root","groups":[],"operator":"AND"}'::jsonb,
  '{conditions}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN cond->>'field_logical_name' = 'statecode' AND cond->>'value' = '1'
          THEN (cond - 'value' - 'field_type_name')
            || '{"value":"active","field_type_name":"statecode"}'::jsonb
        WHEN cond->>'field_logical_name' = 'statecode' AND cond->>'value' = '2'
          THEN (cond - 'value' - 'field_type_name')
            || '{"value":"inactive","field_type_name":"statecode"}'::jsonb
        WHEN cond->>'field_logical_name' = 'statecode'
          THEN (cond - 'field_type_name')
            || '{"field_type_name":"statecode"}'::jsonb
        ELSE cond
      END
    )
    FROM jsonb_array_elements(filter_json->'conditions') AS cond
  ),
  true
)
WHERE filter_json IS NOT NULL
  AND deleted_at IS NULL
  AND filter_json ? 'conditions';
