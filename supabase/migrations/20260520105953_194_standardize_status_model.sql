/*
  # Standardize Status Model: Remove status, keep statecode + statusreason

  1. Field Definition Changes
    - Deactivate ALL `status` field_definitions (logical_name='status') across all entities
    - Rename `statecode` display_name to 'Status' for all entities
    - Ensure `statusreason` display_name is 'Status Reason' for all entities

  2. View Changes
    - Update ALL view_definition filter_json: change status filters to use statecode
    - Remove any view_columns that reference deactivated status field_definitions

  3. Form Changes
    - Remove status field controls from ALL form layout_json

  4. Trigger Changes
    - Drop sync_state_code() trigger from all entity tables (no longer needed)
    - Update provision_entity_statecodes() to only create statecode + statusreason

  5. Notes
    - Physical `status` column is NOT dropped (data safety)
    - statecode (physical: state_code) becomes the primary status field displayed as "Status"
    - statusreason (physical: status_reason) displayed as "Status Reason"
*/

-- 1. Deactivate ALL status field_definitions
UPDATE field_definition
SET is_active = false
WHERE logical_name = 'status'
  AND is_active = true
  AND deleted_at IS NULL;

-- 2. Rename statecode display_name to 'Status'
UPDATE field_definition
SET display_name = 'Status'
WHERE logical_name = 'statecode'
  AND deleted_at IS NULL
  AND display_name IS DISTINCT FROM 'Status';

-- 3. Ensure statusreason display_name is 'Status Reason'
UPDATE field_definition
SET display_name = 'Status Reason'
WHERE logical_name IN ('statusreason', 'statusReason')
  AND deleted_at IS NULL
  AND display_name IS DISTINCT FROM 'Status Reason';

-- Also normalise logical_name to lowercase 'statusreason'
UPDATE field_definition
SET logical_name = 'statusreason'
WHERE logical_name = 'statusReason'
  AND deleted_at IS NULL;

-- 4. Update view filter_json: status='active' -> statecode='1'
UPDATE view_definition
SET filter_json = jsonb_set(
  jsonb_set(
    jsonb_set(
      filter_json,
      '{conditions,0,field_logical_name}',
      '"statecode"'
    ),
    '{conditions,0,value}',
    '"1"'
  ),
  '{conditions,0,field_display_name}',
  '"Status"'
)
WHERE filter_json->'conditions'->0->>'field_logical_name' = 'status'
  AND filter_json->'conditions'->0->>'value' IN ('active', '0')
  AND deleted_at IS NULL;

-- Update view filter_json: status='inactive' -> statecode='2'
UPDATE view_definition
SET filter_json = jsonb_set(
  jsonb_set(
    jsonb_set(
      filter_json,
      '{conditions,0,field_logical_name}',
      '"statecode"'
    ),
    '{conditions,0,value}',
    '"2"'
  ),
  '{conditions,0,field_display_name}',
  '"Status"'
)
WHERE filter_json->'conditions'->0->>'field_logical_name' = 'status'
  AND filter_json->'conditions'->0->>'value' IN ('inactive', '1')
  AND deleted_at IS NULL;

-- 5. Remove view_columns that reference deactivated status field_definitions
DELETE FROM view_column
WHERE field_definition_id IN (
  SELECT field_definition_id FROM field_definition
  WHERE logical_name = 'status' AND is_active = false
);

-- 6. Remove status controls from ALL form layout_json
-- Uses a PL/pgSQL block to iterate forms and strip controls with field_logical_name='status'
DO $$
DECLARE
  rec RECORD;
  new_layout jsonb;
  tab jsonb;
  sec jsonb;
  ctrl jsonb;
  new_tabs jsonb;
  new_sections jsonb;
  new_controls jsonb;
  t_idx int;
  s_idx int;
  c_idx int;
BEGIN
  FOR rec IN
    SELECT form_id, layout_json
    FROM form_definition
    WHERE layout_json IS NOT NULL
      AND layout_json::text LIKE '%"status"%'
  LOOP
    new_tabs := '[]'::jsonb;
    FOR t_idx IN 0..jsonb_array_length(rec.layout_json->'tabs') - 1
    LOOP
      tab := rec.layout_json->'tabs'->t_idx;
      new_sections := '[]'::jsonb;
      FOR s_idx IN 0..jsonb_array_length(tab->'sections') - 1
      LOOP
        sec := tab->'sections'->s_idx;
        new_controls := '[]'::jsonb;
        IF sec->'controls' IS NOT NULL THEN
          FOR c_idx IN 0..jsonb_array_length(sec->'controls') - 1
          LOOP
            ctrl := sec->'controls'->c_idx;
            IF ctrl->>'field_logical_name' IS DISTINCT FROM 'status' THEN
              new_controls := new_controls || jsonb_build_array(ctrl);
            END IF;
          END LOOP;
        END IF;
        new_sections := new_sections || jsonb_build_array(
          jsonb_set(sec, '{controls}', new_controls)
        );
      END LOOP;
      new_tabs := new_tabs || jsonb_build_array(
        jsonb_set(tab, '{sections}', new_sections)
      );
    END LOOP;
    new_layout := jsonb_set(rec.layout_json, '{tabs}', new_tabs);
    UPDATE form_definition SET layout_json = new_layout WHERE form_id = rec.form_id;
  END LOOP;
END $$;

-- 7. Drop sync_state_code() triggers from all entity tables
DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'account','contact','lead','opportunity','ticket',
    'campaign','event','journey','marketing_email','segment',
    'business_unit','team','security_role','currency',
    'organization','crm_user','country','industry',
    'line_of_business','product_family','product'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_state_code ON %I', tbl);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS sync_state_code() CASCADE;

-- 8. Update provision_entity_statecodes() to only create statecode + statusreason
CREATE OR REPLACE FUNCTION provision_entity_statecodes()
RETURNS TRIGGER AS $$
DECLARE
  v_entity_id uuid := NEW.entity_definition_id;
  v_ft_choice uuid;
  v_sc_active uuid;
  v_sc_inactive uuid;
BEGIN
  SELECT field_type_id INTO v_ft_choice FROM field_type WHERE name = 'choice' LIMIT 1;
  IF v_ft_choice IS NULL THEN RETURN NEW; END IF;

  -- statecode field (displayed as "Status")
  INSERT INTO field_definition (
    entity_definition_id, logical_name, physical_column_name, display_name,
    field_type_id, is_system, is_active, is_required,
    config_json
  )
  VALUES (
    v_entity_id, 'statecode', 'state_code', 'Status',
    v_ft_choice, true, true, false,
    '{"is_statecode_field": true}'::jsonb
  )
  ON CONFLICT DO NOTHING;

  -- statusreason field (displayed as "Status Reason")
  INSERT INTO field_definition (
    entity_definition_id, logical_name, physical_column_name, display_name,
    field_type_id, is_system, is_active, is_required,
    config_json
  )
  VALUES (
    v_entity_id, 'statusreason', 'status_reason', 'Status Reason',
    v_ft_choice, true, true, false,
    '{"is_statusreason_field": true}'::jsonb
  )
  ON CONFLICT DO NOTHING;

  -- Default statecodes: Active (1) and Inactive (2)
  INSERT INTO statecode_definition (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES
    (v_entity_id, 1, 'Active', true,  1, true),
    (v_entity_id, 2, 'Inactive', false, 2, true)
  ON CONFLICT DO NOTHING;

  -- Get statecode IDs
  SELECT statecode_id INTO v_sc_active
  FROM statecode_definition WHERE entity_definition_id = v_entity_id AND state_value = 1;
  SELECT statecode_id INTO v_sc_inactive
  FROM statecode_definition WHERE entity_definition_id = v_entity_id AND state_value = 2;

  -- Default status reasons
  IF v_sc_active IS NOT NULL THEN
    INSERT INTO status_reason_definition (statecode_id, reason_value, display_label, sort_order)
    VALUES
      (v_sc_active, 1, 'Active', 1),
      (v_sc_active, 3, 'In Progress', 2),
      (v_sc_active, 4, 'Pending', 3)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_sc_inactive IS NOT NULL THEN
    INSERT INTO status_reason_definition (statecode_id, reason_value, display_label, sort_order)
    VALUES
      (v_sc_inactive, 2, 'Inactive', 1),
      (v_sc_inactive, 5, 'Cancelled', 2),
      (v_sc_inactive, 6, 'Rejected', 3)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
