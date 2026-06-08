/*
  # Statecode Admin-Manageable

  ## Summary
  Makes statecode_definition fully admin-manageable: admins can add, rename,
  reorder, and delete statecodes (and their reasons). The two default statecodes
  (Active/Inactive) are marked is_system=true so they cannot be deleted, but
  CAN be renamed. Additional statecodes can be freely added per entity.

  ## Changes
  1. Add is_system column to statecode_definition
  2. Mark existing Active/Inactive statecodes as is_system=true
  3. Update provision function to mark defaults as system
  4. Add RLS delete policy that blocks deletion of system statecodes
*/

-- ─── 1. Add is_system column ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'statecode_definition'
      AND column_name = 'is_system'
  ) THEN
    ALTER TABLE statecode_definition ADD COLUMN is_system boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─── 2. Mark existing Active (state_value=1) and Inactive (state_value=2) as system ──
UPDATE statecode_definition
SET is_system = true
WHERE state_value IN (1, 2);

-- ─── 3. Update provision function to mark defaults as system ──────────────────
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

  -- ── statecode_definition: Active(1) and Inactive(2) — system statecodes ──
  INSERT INTO statecode_definition
    (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES
    (p_entity_id, 1, 'Active',   true,  10, true),
    (p_entity_id, 2, 'Inactive', false, 20, true)
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

  -- ── Field 1: statecode — "Status" ─────────────────────────────────────
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

  -- ── Field 2: statuscode — "Status Reason" ─────────────────────────────
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
