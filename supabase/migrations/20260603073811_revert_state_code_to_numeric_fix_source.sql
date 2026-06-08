
/*
  # Revert state_code to numeric strings and fix Source entity

  Reverts the incorrect 'active'/'inactive' text migration back to numeric
  strings '1'/'2' matching statecode_definition.state_value. Fixes Source
  entity which was seeded with wrong text values and bad statecode_definition.
*/

UPDATE account         SET state_code = '1' WHERE state_code = 'active';
UPDATE account         SET state_code = '2' WHERE state_code = 'inactive';
UPDATE business_unit   SET state_code = '1' WHERE state_code = 'active';
UPDATE business_unit   SET state_code = '2' WHERE state_code = 'inactive';
UPDATE campaign        SET state_code = '1' WHERE state_code = 'active';
UPDATE campaign        SET state_code = '2' WHERE state_code = 'inactive';
UPDATE contact         SET state_code = '1' WHERE state_code = 'active';
UPDATE contact         SET state_code = '2' WHERE state_code = 'inactive';
UPDATE country         SET state_code = '1' WHERE state_code = 'active';
UPDATE country         SET state_code = '2' WHERE state_code = 'inactive';
UPDATE crm_user        SET state_code = '1' WHERE state_code = 'active';
UPDATE crm_user        SET state_code = '2' WHERE state_code = 'inactive';
UPDATE currency        SET state_code = '1' WHERE state_code = 'active';
UPDATE currency        SET state_code = '2' WHERE state_code = 'inactive';
UPDATE event           SET state_code = '1' WHERE state_code = 'active';
UPDATE event           SET state_code = '2' WHERE state_code = 'inactive';
UPDATE industry        SET state_code = '1' WHERE state_code = 'active';
UPDATE industry        SET state_code = '2' WHERE state_code = 'inactive';
UPDATE journey         SET state_code = '1' WHERE state_code = 'active';
UPDATE journey         SET state_code = '2' WHERE state_code = 'inactive';
UPDATE lead            SET state_code = '1' WHERE state_code = 'active';
UPDATE lead            SET state_code = '2' WHERE state_code = 'inactive';
UPDATE marketing_email SET state_code = '1' WHERE state_code = 'active';
UPDATE marketing_email SET state_code = '2' WHERE state_code = 'inactive';
UPDATE opportunity     SET state_code = '1' WHERE state_code = 'active';
UPDATE opportunity     SET state_code = '2' WHERE state_code = 'inactive';
UPDATE organization    SET state_code = '1' WHERE state_code = 'active';
UPDATE organization    SET state_code = '2' WHERE state_code = 'inactive';
UPDATE product         SET state_code = '1' WHERE state_code = 'active';
UPDATE product         SET state_code = '2' WHERE state_code = 'inactive';
UPDATE product_family  SET state_code = '1' WHERE state_code = 'active';
UPDATE product_family  SET state_code = '2' WHERE state_code = 'inactive';
UPDATE security_role   SET state_code = '1' WHERE state_code = 'active';
UPDATE security_role   SET state_code = '2' WHERE state_code = 'inactive';
UPDATE segment         SET state_code = '1' WHERE state_code = 'active';
UPDATE segment         SET state_code = '2' WHERE state_code = 'inactive';
UPDATE team            SET state_code = '1' WHERE state_code = 'active';
UPDATE team            SET state_code = '2' WHERE state_code = 'inactive';
UPDATE test_entity     SET state_code = '1' WHERE state_code = 'active';
UPDATE test_entity     SET state_code = '2' WHERE state_code = 'inactive';

-- Fix crm_source to use numeric strings
UPDATE crm_source SET state_code = '1' WHERE state_code = 'active';
UPDATE crm_source SET state_code = '2' WHERE state_code = 'inactive';
UPDATE crm_source SET state_code = '1' WHERE state_code IS NULL;
ALTER TABLE crm_source ALTER COLUMN state_code SET DEFAULT '1';

-- Fix Source statecode_definition: remove bad state_value=0
DELETE FROM statecode_definition
WHERE entity_definition_id = '672f0481-f23f-42b1-90f4-edc87570a8a1'
  AND state_value = 0;

-- Ensure state_value=1 (Active) exists for Source
INSERT INTO statecode_definition (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
SELECT '672f0481-f23f-42b1-90f4-edc87570a8a1', 1, 'Active', true, 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM statecode_definition
  WHERE entity_definition_id = '672f0481-f23f-42b1-90f4-edc87570a8a1' AND state_value = 1
);

-- Ensure state_value=2 (Inactive) exists for Source
INSERT INTO statecode_definition (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
SELECT '672f0481-f23f-42b1-90f4-edc87570a8a1', 2, 'Inactive', false, 1, true
WHERE NOT EXISTS (
  SELECT 1 FROM statecode_definition
  WHERE entity_definition_id = '672f0481-f23f-42b1-90f4-edc87570a8a1' AND state_value = 2
);

-- Fix all view filter_json: revert 'active'->'1', 'inactive'->'2', field_type_name->'choice'
UPDATE view_definition
SET filter_json = jsonb_set(
  filter_json,
  '{conditions}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN cond->>'field_logical_name' = 'statecode' AND cond->>'value' = 'active'
          THEN (cond - 'value' - 'field_type_name')
            || '{"value":"1","field_type_name":"choice"}'::jsonb
        WHEN cond->>'field_logical_name' = 'statecode' AND cond->>'value' = 'inactive'
          THEN (cond - 'value' - 'field_type_name')
            || '{"value":"2","field_type_name":"choice"}'::jsonb
        WHEN cond->>'field_logical_name' = 'statecode'
          THEN (cond - 'field_type_name') || '{"field_type_name":"choice"}'::jsonb
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

-- Restore column defaults for previously integer tables
ALTER TABLE industry       ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE product        ALTER COLUMN state_code SET DEFAULT '1';
ALTER TABLE product_family ALTER COLUMN state_code SET DEFAULT '1';
