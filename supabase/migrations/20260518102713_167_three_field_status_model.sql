/*
  # Three-Field Status Model (Dynamics 365 aligned)

  ## Summary
  Collapses the 4-field status system into exactly 3 fields matching Dynamics 365:

  1. statecode  → "Status"        — parent state, fixed Active(0)/Inactive(1), read-only
  2. statuscode → "Status Reason" — child reason grouped by statecode, admin-configurable
  3. (Remove)   → "status"        — redundant with statecode, soft-deleted
  4. (Remove)   → "statusreason"  — replaced by statuscode, soft-deleted

  ## Changes

  ### 1. Soft-delete the redundant `status` and `statusreason` field definitions
  ### 2. Rename statecode display_name to "Status" (the actual parent state field)
  ### 3. Rename statuscode display_name to "Status Reason" and mark config with is_statuscode_field
  ### 4. Update provision_entity_statecodes to create the correct 3-field model
  ### 5. Ensure statuscode field exists on all 20 entities with correct config
*/

-- ─── 1. Soft-delete `status` field definitions on all entities ────────────────
UPDATE field_definition
SET deleted_at = now(), is_active = false
WHERE logical_name = 'status'
  AND is_system = true
  AND deleted_at IS NULL;

-- ─── 2. Soft-delete `statusreason` field definitions on all entities ──────────
UPDATE field_definition
SET deleted_at = now(), is_active = false
WHERE logical_name = 'statusreason'
  AND is_system = true
  AND deleted_at IS NULL;

-- ─── 3. Rename statecode display to "Status", update config ───────────────────
UPDATE field_definition
SET display_name = 'Status',
    config_json  = '{"choices":[],"is_statecode_field":true}'::jsonb
WHERE logical_name = 'statecode'
  AND is_system = true
  AND deleted_at IS NULL;

-- ─── 4. Rename statuscode display to "Status Reason", update config ───────────
UPDATE field_definition
SET display_name = 'Status Reason',
    config_json  = '{"choices":[],"is_statuscode_field":true}'::jsonb
WHERE logical_name = 'statuscode'
  AND is_system = true
  AND deleted_at IS NULL;

-- ─── 5. Ensure statuscode field exists on all entities that are missing it ─────
DO $$
DECLARE
  v_entity    RECORD;
  v_type_id   uuid;
BEGIN
  SELECT field_type_id INTO v_type_id FROM field_type WHERE name = 'choice' LIMIT 1;

  FOR v_entity IN
    SELECT ed.entity_definition_id
    FROM entity_definition ed
    WHERE NOT EXISTS (
      SELECT 1 FROM field_definition fd
      WHERE fd.entity_definition_id = ed.entity_definition_id
        AND fd.logical_name = 'statuscode'
        AND fd.deleted_at IS NULL
    )
  LOOP
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name,
       physical_column_name, is_system, is_required, is_searchable,
       is_sortable, is_filterable, is_custom, is_active, sort_order,
       config_json)
    VALUES
      (v_entity.entity_definition_id, v_type_id, 'statuscode', 'Status Reason',
       'status_code', true, false, false, true, true, false, true, 9001,
       '{"choices":[],"is_statuscode_field":true}'::jsonb);
  END LOOP;
END $$;

-- ─── 6. Ensure statecode sort_order is 9000, statuscode is 9001 ───────────────
UPDATE field_definition SET sort_order = 9000
WHERE logical_name = 'statecode' AND is_system = true AND deleted_at IS NULL;

UPDATE field_definition SET sort_order = 9001
WHERE logical_name = 'statuscode' AND is_system = true AND deleted_at IS NULL;

-- ─── 7. Replace provision_entity_statecodes with clean 3-field model ──────────
CREATE OR REPLACE FUNCTION provision_entity_statecodes(p_entity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_choice_type_id  uuid;
  v_active_sc_id    uuid;
  v_inactive_sc_id  uuid;
  v_entity_exists   boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM entity_definition WHERE entity_definition_id = p_entity_id
  ) INTO v_entity_exists;
  IF NOT v_entity_exists THEN RETURN; END IF;

  SELECT field_type_id INTO v_choice_type_id
  FROM field_type WHERE name = 'choice' LIMIT 1;

  -- ── statecode_definition: Active(1) and Inactive(2) ───────────────────
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

  -- ── status_reason_definition defaults ─────────────────────────────────
  INSERT INTO status_reason_definition
    (statecode_id, entity_definition_id, reason_value, display_label,
     color, sort_order, is_default, is_active, is_system, description)
  VALUES
    (v_active_sc_id,   p_entity_id, 1, 'Active',      '#10B981', 10, true,  true, true, ''),
    (v_active_sc_id,   p_entity_id, 3, 'In Progress', '#3B82F6', 20, false, true, false, ''),
    (v_active_sc_id,   p_entity_id, 4, 'Pending',     '#F59E0B', 30, false, true, false, ''),
    (v_inactive_sc_id, p_entity_id, 2, 'Inactive',    '#6B7280', 10, true,  true, true, ''),
    (v_inactive_sc_id, p_entity_id, 5, 'Cancelled',   '#EF4444', 20, false, true, false, ''),
    (v_inactive_sc_id, p_entity_id, 6, 'Rejected',    '#DC2626', 30, false, true, false, '')
  ON CONFLICT DO NOTHING;

  -- ── Field 1: statecode — "Status" — parent, read-only ─────────────────
  -- Physical column: state_code (TEXT)
  INSERT INTO field_definition
    (entity_definition_id, field_type_id, logical_name, display_name,
     physical_column_name, is_system, is_required, is_searchable,
     is_sortable, is_filterable, is_custom, is_active, sort_order, config_json)
  VALUES
    (p_entity_id, v_choice_type_id, 'statecode', 'Status',
     'state_code', true, false, true, true, true, false, true, 9000,
     '{"choices":[],"is_statecode_field":true}'::jsonb)
  ON CONFLICT (entity_definition_id, logical_name)
  WHERE deleted_at IS NULL
  DO UPDATE SET
    display_name = 'Status',
    config_json  = '{"choices":[],"is_statecode_field":true}'::jsonb;

  -- ── Field 2: statuscode — "Status Reason" — child, admin-configurable ─
  -- Physical column: status_code (TEXT)
  INSERT INTO field_definition
    (entity_definition_id, field_type_id, logical_name, display_name,
     physical_column_name, is_system, is_required, is_searchable,
     is_sortable, is_filterable, is_custom, is_active, sort_order, config_json)
  VALUES
    (p_entity_id, v_choice_type_id, 'statuscode', 'Status Reason',
     'status_code', true, false, false, true, true, false, true, 9001,
     '{"choices":[],"is_statuscode_field":true}'::jsonb)
  ON CONFLICT (entity_definition_id, logical_name)
  WHERE deleted_at IS NULL
  DO UPDATE SET
    display_name = 'Status Reason',
    config_json  = '{"choices":[],"is_statuscode_field":true}'::jsonb;

  -- ── Standard system views ──────────────────────────────────────────────
  INSERT INTO view_definition
    (entity_definition_id, name, view_type, is_default, is_system, is_deletable,
     filter_json, sort_json, is_active)
  VALUES
    (p_entity_id, 'Active Records', 'public', false, true, false,
     '{"operator":"AND","conditions":[{"field_logical_name":"statecode","field_type_name":"choice","field_display_name":"Status","operator":"eq","value":"1"}]}'::jsonb,
     '[]'::jsonb, true),
    (p_entity_id, 'Inactive Records', 'public', false, true, false,
     '{"operator":"AND","conditions":[{"field_logical_name":"statecode","field_type_name":"choice","field_display_name":"Status","operator":"eq","value":"2"}]}'::jsonb,
     '[]'::jsonb, true),
    (p_entity_id, 'All Records', 'public', true, true, false,
     NULL, '[]'::jsonb, true)
  ON CONFLICT DO NOTHING;

END $$;
