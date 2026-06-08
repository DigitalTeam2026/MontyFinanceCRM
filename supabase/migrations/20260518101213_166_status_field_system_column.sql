/*
  # Status Field System Column

  ## Summary
  Adds a third managed system field `status` to every entity — a fixed two-value
  choice (Active / Inactive) that is fully system-controlled and cannot be edited,
  renamed, or deleted by admins. Also ensures the provision function creates this
  field for all new entities.

  ## Changes

  ### 1. Add physical `status` column to all entity tables
  Adds a `status` TEXT column (default 'active') to every entity physical table
  where it doesn't already exist.

  ### 2. Upsert `status` field definition for every entity
  Creates a system-locked 'choice' field_definition named `status` with
  config_json choices = [Active, Inactive]. is_system = true, no editing allowed.

  ### 3. Update provision_entity_statecodes to also create the status field

  ### 4. Backfill existing entities

  ## Notes
  - Status is separate from statecode/statusreason; it is a simple binary field
  - statecode/statusreason remain the Dynamics-style hierarchical system
  - status physical column is `status` on each entity table
*/

-- ─── Helper: add status column to a physical table if missing ─────────────────
CREATE OR REPLACE FUNCTION _add_status_column_if_missing(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'status'
  ) THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN status text NOT NULL DEFAULT ''active''', p_table);
  END IF;
END $$;

-- ─── Backfill physical column + field definition for all existing entities ────
DO $$
DECLARE
  v_entity    RECORD;
  v_type_id   uuid;
  v_choices   jsonb;
BEGIN
  SELECT field_type_id INTO v_type_id FROM field_type WHERE name = 'choice' LIMIT 1;

  v_choices := '[{"value":"active","label":"Active"},{"value":"inactive","label":"Inactive"}]'::jsonb;

  FOR v_entity IN
    SELECT ed.entity_definition_id, ed.physical_table_name
    FROM entity_definition ed
  LOOP
    -- Add physical column
    PERFORM _add_status_column_if_missing(v_entity.physical_table_name);

    -- Upsert field definition
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name,
       physical_column_name, is_system, is_required, is_searchable,
       is_sortable, is_filterable, is_custom, is_active, sort_order,
       config_json)
    VALUES
      (v_entity.entity_definition_id, v_type_id, 'status', 'Status',
       'status', true, false, true, true, true, false, true, 8999,
       jsonb_build_object('choices', v_choices, 'is_status_field', true))
    ON CONFLICT (entity_definition_id, logical_name)
    WHERE deleted_at IS NULL
    DO UPDATE SET
      config_json = jsonb_build_object('choices', v_choices, 'is_status_field', true),
      is_system   = true;
  END LOOP;
END $$;

-- ─── Update provision_entity_statecodes to also create the status field ───────
CREATE OR REPLACE FUNCTION provision_entity_statecodes(p_entity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_choice_type_id  uuid;
  v_active_sc_id    uuid;
  v_inactive_sc_id  uuid;
  v_entity_table    text;
  v_entity_exists   boolean;
  v_status_choices  jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM entity_definition WHERE entity_definition_id = p_entity_id
  ) INTO v_entity_exists;
  IF NOT v_entity_exists THEN RETURN; END IF;

  SELECT field_type_id INTO v_choice_type_id
  FROM field_type WHERE name = 'choice' LIMIT 1;

  SELECT physical_table_name INTO v_entity_table
  FROM entity_definition WHERE entity_definition_id = p_entity_id;

  v_status_choices := '[{"value":"active","label":"Active"},{"value":"inactive","label":"Inactive"}]'::jsonb;

  -- ── Statecode definitions ──────────────────────────────────────────────
  INSERT INTO statecode_definition
    (entity_definition_id, state_value, display_label, is_active_state, sort_order)
  VALUES
    (p_entity_id, 1, 'Active',   true,  10),
    (p_entity_id, 2, 'Inactive', false, 20)
  ON CONFLICT DO NOTHING;

  SELECT statecode_id INTO v_active_sc_id
  FROM statecode_definition
  WHERE entity_definition_id = p_entity_id AND state_value = 1;

  SELECT statecode_id INTO v_inactive_sc_id
  FROM statecode_definition
  WHERE entity_definition_id = p_entity_id AND state_value = 2;

  -- ── Status reason definitions ──────────────────────────────────────────
  INSERT INTO status_reason_definition
    (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_active, is_system, description)
  VALUES
    (v_active_sc_id,   p_entity_id, 1, 'Active',      '#10B981', 10, true,  true, true, ''),
    (v_active_sc_id,   p_entity_id, 3, 'In Progress', '#3B82F6', 20, false, true, false, ''),
    (v_active_sc_id,   p_entity_id, 4, 'Pending',     '#F59E0B', 30, false, true, false, ''),
    (v_inactive_sc_id, p_entity_id, 2, 'Inactive',    '#6B7280', 10, true,  true, true, ''),
    (v_inactive_sc_id, p_entity_id, 5, 'Cancelled',   '#EF4444', 20, false, true, false, ''),
    (v_inactive_sc_id, p_entity_id, 6, 'Rejected',    '#DC2626', 30, false, true, false, '')
  ON CONFLICT DO NOTHING;

  -- ── status field (fixed Active/Inactive — fully system-locked) ────────
  PERFORM _add_status_column_if_missing(v_entity_table);

  INSERT INTO field_definition
    (entity_definition_id, field_type_id, logical_name, display_name,
     physical_column_name, is_system, is_required, is_searchable,
     is_sortable, is_filterable, is_custom, is_active, sort_order,
     config_json)
  VALUES
    (p_entity_id, v_choice_type_id, 'status', 'Status',
     'status', true, false, true, true, true, false, true, 8999,
     jsonb_build_object('choices', v_status_choices, 'is_status_field', true))
  ON CONFLICT (entity_definition_id, logical_name)
  WHERE deleted_at IS NULL
  DO UPDATE SET
    config_json = jsonb_build_object('choices', v_status_choices, 'is_status_field', true),
    is_system   = true;

  -- ── statecode field ────────────────────────────────────────────────────
  INSERT INTO field_definition
    (entity_definition_id, field_type_id, logical_name, display_name,
     physical_column_name, is_system, is_required, is_searchable,
     is_sortable, is_filterable, is_custom, is_active, sort_order,
     config_json)
  VALUES
    (p_entity_id, v_choice_type_id, 'statecode', 'Status Category',
     'state_code', true, false, true, true, true, false, true, 9000,
     '{"choices":[],"is_statecode_field":true}'::jsonb)
  ON CONFLICT (entity_definition_id, logical_name)
  WHERE deleted_at IS NULL
  DO UPDATE SET
    display_name = 'Status Category',
    config_json  = '{"choices":[],"is_statecode_field":true}'::jsonb;

  -- ── statusreason field ─────────────────────────────────────────────────
  INSERT INTO field_definition
    (entity_definition_id, field_type_id, logical_name, display_name,
     physical_column_name, is_system, is_required, is_searchable,
     is_sortable, is_filterable, is_custom, is_active, sort_order,
     config_json)
  VALUES
    (p_entity_id, v_choice_type_id, 'statusreason', 'Status Reason',
     'status_reason_code', true, false, true, true, true, false, true, 9001,
     '{"linked_statecode_logical_name":"statecode","is_statusreason_field":true}'::jsonb)
  ON CONFLICT (entity_definition_id, logical_name)
  WHERE deleted_at IS NULL
  DO UPDATE SET
    config_json = '{"linked_statecode_logical_name":"statecode","is_statusreason_field":true}'::jsonb;

  -- ── Standard system views ──────────────────────────────────────────────
  INSERT INTO view_definition
    (entity_definition_id, name, view_type, is_default, is_system, is_deletable,
     filter_json, sort_json, is_active)
  VALUES
    (p_entity_id, 'Active Records', 'public', false, true, false,
     '{"operator":"AND","conditions":[{"field_logical_name":"statecode","field_type_name":"choice","field_display_name":"Status Category","operator":"eq","value":"1"}]}'::jsonb,
     '[]'::jsonb, true),
    (p_entity_id, 'Inactive Records', 'public', false, true, false,
     '{"operator":"AND","conditions":[{"field_logical_name":"statecode","field_type_name":"choice","field_display_name":"Status Category","operator":"eq","value":"2"}]}'::jsonb,
     '[]'::jsonb, true),
    (p_entity_id, 'All Records', 'public', true, true, false,
     NULL, '[]'::jsonb, true)
  ON CONFLICT DO NOTHING;

END $$;

-- ─── Update statecode field display_name for all existing entities ────────────
UPDATE field_definition fd
SET display_name = 'Status Category',
    config_json  = config_json || '{"is_statecode_field":true}'::jsonb
WHERE fd.logical_name = 'statecode'
  AND fd.is_system = true
  AND fd.deleted_at IS NULL;

-- ─── Update statusreason config for all existing entities ─────────────────────
UPDATE field_definition fd
SET config_json = config_json || '{"is_statusreason_field":true}'::jsonb
WHERE fd.logical_name = 'statusreason'
  AND fd.is_system = true
  AND fd.deleted_at IS NULL;
