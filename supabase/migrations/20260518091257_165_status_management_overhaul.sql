/*
  # Status Management Overhaul

  ## Summary
  Replaces the old flat Option Set implementation with a proper hierarchical
  statecode → statusreason system modelled on Dynamics 365.

  ## Changes

  ### 1. Enhance status_reason_definition
  - No destructive changes; adds a `description` column for optional notes.

  ### 2. Backfill richer default status reasons
  Every entity gets the full Dynamics-style default set:
    statecode = Active (state_value = 1):
      - "Active"     (reason_value = 1, is_system = true)
      - "In Progress" (reason_value = 3, is_system = false)
      - "Pending"     (reason_value = 4, is_system = false)
    statecode = Inactive (state_value = 2):
      - "Inactive"   (reason_value = 2, is_system = true)
      - "Cancelled"   (reason_value = 5, is_system = false)
      - "Rejected"    (reason_value = 6, is_system = false)

  ### 3. Replace provision_entity_statecodes
  Updated to also create three standard system views on every new entity:
    - "Active Records"   → filter statecode = 1
    - "Inactive Records" → filter statecode = 2
    - "All Records"      → no filter (is_default = true)

  ### 4. Backfill missing standard views for all existing entities

  ### 5. Provision statecodes + views for any entities that were missed
  (prospect, relations_test etc.)
*/

-- ─── 1. Add description column to status_reason_definition (idempotent) ───────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'status_reason_definition'
      AND column_name = 'description'
  ) THEN
    ALTER TABLE status_reason_definition ADD COLUMN description text DEFAULT '' NOT NULL;
  END IF;
END $$;

-- ─── 2. Backfill richer default status reasons for all existing entities ───────
DO $$
DECLARE
  v_entity RECORD;
  v_active_sc_id   uuid;
  v_inactive_sc_id uuid;
  v_max_reason     integer;
BEGIN
  FOR v_entity IN
    SELECT entity_definition_id FROM entity_definition
  LOOP
    -- Get Active statecode id
    SELECT statecode_id INTO v_active_sc_id
    FROM statecode_definition
    WHERE entity_definition_id = v_entity.entity_definition_id
      AND state_value = 1;

    -- Get Inactive statecode id
    SELECT statecode_id INTO v_inactive_sc_id
    FROM statecode_definition
    WHERE entity_definition_id = v_entity.entity_definition_id
      AND state_value = 2;

    -- Skip if statecodes don't exist yet (will be provisioned later)
    CONTINUE WHEN v_active_sc_id IS NULL OR v_inactive_sc_id IS NULL;

    -- Get current max reason_value for this entity
    SELECT COALESCE(MAX(reason_value), 0) INTO v_max_reason
    FROM status_reason_definition
    WHERE entity_definition_id = v_entity.entity_definition_id;

    -- Insert "In Progress" under Active if missing
    INSERT INTO status_reason_definition
      (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_active, is_system, description)
    SELECT v_active_sc_id, v_entity.entity_definition_id, GREATEST(v_max_reason, 2) + 1,
           'In Progress', '#3B82F6', 20, false, true, false, ''
    WHERE NOT EXISTS (
      SELECT 1 FROM status_reason_definition
      WHERE entity_definition_id = v_entity.entity_definition_id
        AND display_label = 'In Progress'
    );

    -- Refresh max
    SELECT COALESCE(MAX(reason_value), 0) INTO v_max_reason
    FROM status_reason_definition
    WHERE entity_definition_id = v_entity.entity_definition_id;

    -- Insert "Pending" under Active if missing
    INSERT INTO status_reason_definition
      (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_active, is_system, description)
    SELECT v_active_sc_id, v_entity.entity_definition_id, v_max_reason + 1,
           'Pending', '#F59E0B', 30, false, true, false, ''
    WHERE NOT EXISTS (
      SELECT 1 FROM status_reason_definition
      WHERE entity_definition_id = v_entity.entity_definition_id
        AND display_label = 'Pending'
    );

    -- Refresh max
    SELECT COALESCE(MAX(reason_value), 0) INTO v_max_reason
    FROM status_reason_definition
    WHERE entity_definition_id = v_entity.entity_definition_id;

    -- Insert "Cancelled" under Inactive if missing
    INSERT INTO status_reason_definition
      (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_active, is_system, description)
    SELECT v_inactive_sc_id, v_entity.entity_definition_id, v_max_reason + 1,
           'Cancelled', '#EF4444', 20, false, true, false, ''
    WHERE NOT EXISTS (
      SELECT 1 FROM status_reason_definition
      WHERE entity_definition_id = v_entity.entity_definition_id
        AND display_label = 'Cancelled'
    );

    -- Refresh max
    SELECT COALESCE(MAX(reason_value), 0) INTO v_max_reason
    FROM status_reason_definition
    WHERE entity_definition_id = v_entity.entity_definition_id;

    -- Insert "Rejected" under Inactive if missing
    INSERT INTO status_reason_definition
      (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_active, is_system, description)
    SELECT v_inactive_sc_id, v_entity.entity_definition_id, v_max_reason + 1,
           'Rejected', '#DC2626', 30, false, true, false, ''
    WHERE NOT EXISTS (
      SELECT 1 FROM status_reason_definition
      WHERE entity_definition_id = v_entity.entity_definition_id
        AND display_label = 'Rejected'
    );
  END LOOP;
END $$;

-- ─── 3. Replace provision_entity_statecodes to also create standard views ─────
CREATE OR REPLACE FUNCTION provision_entity_statecodes(p_entity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_choice_type_id  uuid;
  v_active_sc_id    uuid;
  v_inactive_sc_id  uuid;
  v_max_reason      integer;
  v_entity_exists   boolean;
BEGIN
  -- Check entity exists
  SELECT EXISTS (
    SELECT 1 FROM entity_definition WHERE entity_definition_id = p_entity_id
  ) INTO v_entity_exists;
  IF NOT v_entity_exists THEN RETURN; END IF;

  -- Get 'choice' field type id
  SELECT field_type_id INTO v_choice_type_id
  FROM field_type WHERE name = 'choice' LIMIT 1;

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
  -- Active reasons
  INSERT INTO status_reason_definition
    (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_active, is_system, description)
  VALUES
    (v_active_sc_id, p_entity_id, 1, 'Active',      '#10B981', 10, true,  true, true, ''),
    (v_active_sc_id, p_entity_id, 3, 'In Progress', '#3B82F6', 20, false, true, false, ''),
    (v_active_sc_id, p_entity_id, 4, 'Pending',     '#F59E0B', 30, false, true, false, '')
  ON CONFLICT DO NOTHING;

  -- Inactive reasons
  INSERT INTO status_reason_definition
    (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_active, is_system, description)
  VALUES
    (v_inactive_sc_id, p_entity_id, 2, 'Inactive',   '#6B7280', 10, true,  true, true, ''),
    (v_inactive_sc_id, p_entity_id, 5, 'Cancelled',  '#EF4444', 20, false, true, false, ''),
    (v_inactive_sc_id, p_entity_id, 6, 'Rejected',   '#DC2626', 30, false, true, false, '')
  ON CONFLICT DO NOTHING;

  -- ── Field definitions ──────────────────────────────────────────────────
  -- statecode field
  INSERT INTO field_definition
    (entity_definition_id, field_type_id, logical_name, display_name,
     physical_column_name, is_system, is_required, is_searchable,
     is_sortable, is_filterable, is_custom, is_active, sort_order,
     config_json)
  VALUES
    (p_entity_id, v_choice_type_id, 'statecode', 'Status',
     'state_code', true, false, true, true, true, false, true, 9000,
     '{"choices":[]}'::jsonb)
  ON CONFLICT (entity_definition_id, logical_name)
  WHERE deleted_at IS NULL
  DO UPDATE SET display_name = EXCLUDED.display_name;

  -- statusreason field
  INSERT INTO field_definition
    (entity_definition_id, field_type_id, logical_name, display_name,
     physical_column_name, is_system, is_required, is_searchable,
     is_sortable, is_filterable, is_custom, is_active, sort_order,
     config_json)
  VALUES
    (p_entity_id, v_choice_type_id, 'statusreason', 'Status Reason',
     'status_reason_code', true, false, true, true, true, false, true, 9001,
     '{"linked_statecode_logical_name":"statecode"}'::jsonb)
  ON CONFLICT (entity_definition_id, logical_name)
  WHERE deleted_at IS NULL
  DO UPDATE SET config_json = EXCLUDED.config_json;

  -- ── Standard system views ──────────────────────────────────────────────
  -- Active Records
  INSERT INTO view_definition
    (entity_definition_id, name, view_type, is_default, is_system, is_deletable,
     filter_json, sort_json, is_active)
  VALUES
    (p_entity_id, 'Active Records', 'public', false, true, false,
     '{"operator":"AND","conditions":[{"field_logical_name":"statecode","field_type_name":"choice","field_display_name":"Status","operator":"eq","value":"1"}]}'::jsonb,
     '[]'::jsonb, true)
  ON CONFLICT DO NOTHING;

  -- Inactive Records
  INSERT INTO view_definition
    (entity_definition_id, name, view_type, is_default, is_system, is_deletable,
     filter_json, sort_json, is_active)
  VALUES
    (p_entity_id, 'Inactive Records', 'public', false, true, false,
     '{"operator":"AND","conditions":[{"field_logical_name":"statecode","field_type_name":"choice","field_display_name":"Status","operator":"eq","value":"2"}]}'::jsonb,
     '[]'::jsonb, true)
  ON CONFLICT DO NOTHING;

  -- All Records (default)
  INSERT INTO view_definition
    (entity_definition_id, name, view_type, is_default, is_system, is_deletable,
     filter_json, sort_json, is_active)
  VALUES
    (p_entity_id, 'All Records', 'public', true, true, false,
     NULL, '[]'::jsonb, true)
  ON CONFLICT DO NOTHING;

END $$;

-- ─── 4. Backfill standard views for all existing entities ─────────────────────
DO $$
DECLARE
  v_entity RECORD;
BEGIN
  FOR v_entity IN
    SELECT entity_definition_id FROM entity_definition
  LOOP
    -- Active Records
    INSERT INTO view_definition
      (entity_definition_id, name, view_type, is_default, is_system, is_deletable,
       filter_json, sort_json, is_active)
    VALUES
      (v_entity.entity_definition_id, 'Active Records', 'public', false, true, false,
       '{"operator":"AND","conditions":[{"field_logical_name":"statecode","field_type_name":"choice","field_display_name":"Status","operator":"eq","value":"1"}]}'::jsonb,
       '[]'::jsonb, true)
    ON CONFLICT DO NOTHING;

    -- Inactive Records
    INSERT INTO view_definition
      (entity_definition_id, name, view_type, is_default, is_system, is_deletable,
       filter_json, sort_json, is_active)
    VALUES
      (v_entity.entity_definition_id, 'Inactive Records', 'public', false, true, false,
       '{"operator":"AND","conditions":[{"field_logical_name":"statecode","field_type_name":"choice","field_display_name":"Status","operator":"eq","value":"2"}]}'::jsonb,
       '[]'::jsonb, true)
    ON CONFLICT DO NOTHING;

    -- All Records (only set as default if entity has no default view yet)
    INSERT INTO view_definition
      (entity_definition_id, name, view_type, is_default, is_system, is_deletable,
       filter_json, sort_json, is_active)
    VALUES
      (v_entity.entity_definition_id, 'All Records', 'public',
       NOT EXISTS (
         SELECT 1 FROM view_definition
         WHERE entity_definition_id = v_entity.entity_definition_id
           AND is_default = true
           AND deleted_at IS NULL
       ),
       true, false,
       NULL, '[]'::jsonb, true)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ─── 5. Provision missing entities (prospect, relations_test, etc.) ───────────
DO $$
DECLARE
  v_entity RECORD;
BEGIN
  FOR v_entity IN
    SELECT ed.entity_definition_id
    FROM entity_definition ed
    WHERE NOT EXISTS (
      SELECT 1 FROM statecode_definition sd
      WHERE sd.entity_definition_id = ed.entity_definition_id
    )
  LOOP
    PERFORM provision_entity_statecodes(v_entity.entity_definition_id);
  END LOOP;
END $$;

-- ─── 6. RLS for new tables (idempotent) ───────────────────────────────────────
ALTER TABLE statecode_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_reason_definition ENABLE ROW LEVEL SECURITY;

-- statecode_definition: readable by all authenticated; write only by system admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'statecode_definition' AND policyname = 'Authenticated users can read statecodes'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can read statecodes"
      ON statecode_definition FOR SELECT TO authenticated USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'statecode_definition' AND policyname = 'Admins can insert statecodes'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins can insert statecodes"
      ON statecode_definition FOR INSERT TO authenticated
      WITH CHECK (is_system_admin())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'statecode_definition' AND policyname = 'Admins can update statecodes'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins can update statecodes"
      ON statecode_definition FOR UPDATE TO authenticated
      USING (is_system_admin()) WITH CHECK (is_system_admin())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'statecode_definition' AND policyname = 'Admins can delete statecodes'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins can delete statecodes"
      ON statecode_definition FOR DELETE TO authenticated
      USING (is_system_admin())';
  END IF;
END $$;

-- status_reason_definition: readable by all authenticated; write only by system admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'status_reason_definition' AND policyname = 'Authenticated users can read status reasons'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can read status reasons"
      ON status_reason_definition FOR SELECT TO authenticated USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'status_reason_definition' AND policyname = 'Admins can insert status reasons'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins can insert status reasons"
      ON status_reason_definition FOR INSERT TO authenticated
      WITH CHECK (is_system_admin())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'status_reason_definition' AND policyname = 'Admins can update status reasons'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins can update status reasons"
      ON status_reason_definition FOR UPDATE TO authenticated
      USING (is_system_admin()) WITH CHECK (is_system_admin())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'status_reason_definition' AND policyname = 'Admins can delete status reasons'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins can delete status reasons"
      ON status_reason_definition FOR DELETE TO authenticated
      USING (is_system_admin())';
  END IF;
END $$;
