
/*
  # Clean Status System Rebuild

  ## Summary
  Complete teardown of old option_set-based status approach and rebuild with
  the canonical 3-column model: status (fixed Active/Inactive) + statecode
  (admin-manageable parent state) + statusreason (linked to statecode).

  ## Changes

  ### 1. Drop old option_set tables
  - Removes option_set and option_set_value tables

  ### 2. Hard-delete soft-deleted status/statusreason field definitions

  ### 3. Rename statuscode → statusreason field definitions
  - logical_name: 'statuscode' → 'statusreason'
  - physical_column_name: 'status_code' → 'status_reason'
  - config_json updated to is_statusreason_field: true

  ### 4. Rename physical column status_code → status_reason on entity tables

  ### 5. Re-create 'status' field on all entities (fixed Active/Inactive)

  ### 6. Update provision function for 3-field model

  ### 7. Backfill physical columns (status, state_code, status_reason)

  ## Security
  - RLS not changed
*/

-- ============================================================
-- 1. Drop old option_set tables
-- ============================================================
DROP TABLE IF EXISTS option_set_value CASCADE;
DROP TABLE IF EXISTS option_set CASCADE;

-- ============================================================
-- 2. Hard-delete soft-deleted status/statusreason field definitions
-- ============================================================
DELETE FROM field_definition
WHERE logical_name IN ('status', 'statusreason')
  AND deleted_at IS NOT NULL;

-- ============================================================
-- 3. Rename statuscode → statusreason in field_definition
-- ============================================================
UPDATE field_definition
SET
  logical_name         = 'statusreason',
  display_name         = 'Status Reason',
  physical_column_name = 'status_reason',
  config_json          = '{"is_statusreason_field":true}'::jsonb,
  modified_at          = now()
WHERE logical_name = 'statuscode'
  AND is_system = true
  AND deleted_at IS NULL;

-- ============================================================
-- 4. Update statecode field config (ensure correct)
-- ============================================================
UPDATE field_definition
SET
  config_json = '{"is_statecode_field":true}'::jsonb,
  modified_at = now()
WHERE logical_name = 'statecode'
  AND is_system = true
  AND deleted_at IS NULL;

-- ============================================================
-- 5. Re-create 'status' field on all entities
-- ============================================================
DO $$
DECLARE
  rec RECORD;
  v_choice_type_id uuid;
  v_sort_order int;
BEGIN
  SELECT field_type_id INTO v_choice_type_id FROM field_type WHERE name = 'choice';

  FOR rec IN
    SELECT DISTINCT entity_definition_id FROM field_definition
    WHERE logical_name = 'statecode' AND is_system = true AND deleted_at IS NULL
  LOOP
    SELECT COALESCE(MAX(sort_order), 0) + 10 INTO v_sort_order
    FROM field_definition WHERE entity_definition_id = rec.entity_definition_id AND deleted_at IS NULL;

    INSERT INTO field_definition (
      entity_definition_id, field_type_id, logical_name, display_name,
      physical_column_name, description, is_required, is_searchable, is_sortable,
      is_filterable, is_custom, is_active, is_system, is_deletable, is_schema_editable,
      is_managed, sort_order, config_json
    )
    SELECT
      rec.entity_definition_id, v_choice_type_id, 'status', 'Status',
      'status', 'Fixed status field: Active or Inactive',
      false, true, true, true, false, true, true, false, false, true,
      v_sort_order,
      '{"is_status_field":true,"choices":[{"value":"active","label":"Active"},{"value":"inactive","label":"Inactive"}]}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM field_definition
      WHERE entity_definition_id = rec.entity_definition_id
        AND logical_name = 'status'
        AND deleted_at IS NULL
    );
  END LOOP;
END $$;

-- ============================================================
-- 6. Rename physical column status_code → status_reason
--    Only on tables that exist and have the old column name
-- ============================================================
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT e.physical_table_name
    FROM entity_definition e
    WHERE e.is_active = true
      AND EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_name = e.physical_table_name AND t.table_schema = 'public'
      )
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = rec.physical_table_name AND column_name = 'status_code'
        AND table_schema = 'public'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = rec.physical_table_name AND column_name = 'status_reason'
        AND table_schema = 'public'
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN status_code TO status_reason', rec.physical_table_name);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 7. Backfill physical columns on entity tables
-- ============================================================
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT e.physical_table_name
    FROM entity_definition e
    WHERE e.is_active = true
      AND EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_name = e.physical_table_name AND t.table_schema = 'public'
      )
  LOOP
    -- status column (fixed Active/Inactive)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = rec.physical_table_name AND column_name = 'status' AND table_schema = 'public'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS status text DEFAULT ''active''', rec.physical_table_name);
    END IF;

    -- state_code column (statecode FK value)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = rec.physical_table_name AND column_name = 'state_code' AND table_schema = 'public'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS state_code text', rec.physical_table_name);
    END IF;

    -- status_reason column (linked to statecode)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = rec.physical_table_name AND column_name = 'status_reason' AND table_schema = 'public'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS status_reason text', rec.physical_table_name);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 8. Update provision_entity_statecodes() function
-- ============================================================
CREATE OR REPLACE FUNCTION provision_entity_statecodes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entity_id   uuid;
  v_sc_active   uuid;
  v_sc_inactive uuid;
  v_choice_type uuid;
  v_sort        int;
BEGIN
  v_entity_id := NEW.entity_definition_id;

  IF EXISTS (SELECT 1 FROM statecode_definition WHERE entity_definition_id = v_entity_id) THEN
    RETURN NEW;
  END IF;

  SELECT field_type_id INTO v_choice_type FROM field_type WHERE name = 'choice';

  INSERT INTO statecode_definition (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES (v_entity_id, 1, 'Active', true, 0, true)
  RETURNING statecode_id INTO v_sc_active;

  INSERT INTO statecode_definition (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES (v_entity_id, 2, 'Inactive', false, 1, true)
  RETURNING statecode_id INTO v_sc_inactive;

  INSERT INTO status_reason_definition (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_active, is_system)
  VALUES
    (v_sc_active,   v_entity_id, 1, 'Active',   '#10B981', 0, true, true, true),
    (v_sc_inactive, v_entity_id, 2, 'Inactive', '#6B7280', 0, true, true, true);

  SELECT COALESCE(MAX(sort_order), 0) + 10 INTO v_sort
  FROM field_definition WHERE entity_definition_id = v_entity_id AND deleted_at IS NULL;

  -- status field (fixed Active/Inactive)
  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name,
    physical_column_name, description, is_required, is_searchable, is_sortable,
    is_filterable, is_custom, is_active, is_system, is_deletable, is_schema_editable,
    is_managed, sort_order, config_json
  ) VALUES (
    v_entity_id, v_choice_type, 'status', 'Status', 'status',
    'Fixed status: Active or Inactive',
    false, true, true, true, false, true, true, false, false, true, v_sort,
    '{"is_status_field":true,"choices":[{"value":"active","label":"Active"},{"value":"inactive","label":"Inactive"}]}'::jsonb
  ) ON CONFLICT DO NOTHING;

  -- statecode field (admin-manageable parent state)
  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name,
    physical_column_name, description, is_required, is_searchable, is_sortable,
    is_filterable, is_custom, is_active, is_system, is_deletable, is_schema_editable,
    is_managed, sort_order, config_json
  ) VALUES (
    v_entity_id, v_choice_type, 'statecode', 'Statecode', 'state_code',
    'Parent state category (managed via statecode_definition)',
    false, true, true, true, false, true, true, false, false, true, v_sort + 10,
    '{"is_statecode_field":true}'::jsonb
  ) ON CONFLICT DO NOTHING;

  -- statusreason field (linked to statecode)
  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name,
    physical_column_name, description, is_required, is_searchable, is_sortable,
    is_filterable, is_custom, is_active, is_system, is_deletable, is_schema_editable,
    is_managed, sort_order, config_json
  ) VALUES (
    v_entity_id, v_choice_type, 'statusreason', 'Status Reason', 'status_reason',
    'Status reason linked to statecode',
    false, true, true, true, false, true, true, false, false, true, v_sort + 20,
    '{"is_statusreason_field":true}'::jsonb
  ) ON CONFLICT DO NOTHING;

  -- Default views
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'view_definition' AND table_schema = 'public') THEN
    INSERT INTO view_definition (entity_definition_id, name, display_name, view_type, is_default, is_system, is_active, layout_json, filter_json)
    VALUES
      (v_entity_id, 'active_records',   'Active Records',   'list', true,  true, true, '{"columns":[]}'::jsonb, '{"conditions":[{"field":"statecode","operator":"eq","value":"1"}]}'::jsonb),
      (v_entity_id, 'inactive_records', 'Inactive Records', 'list', false, true, true, '{"columns":[]}'::jsonb, '{"conditions":[{"field":"statecode","operator":"eq","value":"2"}]}'::jsonb),
      (v_entity_id, 'all_records',      'All Records',      'list', false, true, true, '{"columns":[]}'::jsonb, '{}'::jsonb)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
