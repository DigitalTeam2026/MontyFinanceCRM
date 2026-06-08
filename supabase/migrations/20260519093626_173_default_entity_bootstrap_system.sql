/*
  # Default Entity Bootstrap — System Columns, Views, and Forms

  ## Summary
  This migration implements the full Dynamics 365-style "bootstrap" for every entity:

  ## Changes

  ### 1. is_managed column on field_definition
  Adds `is_managed` (bool, default false) to flag fully platform-managed fields
  that cannot be modified at all. Already added in a prior migration — uses IF NOT EXISTS.

  ### 2. industrycode on Account — demote from system field
  The 'Industry' field on Account is a business-specific field, not a true system
  column. It is marked is_system=false, is_deletable=true, is_schema_editable=true
  so users can remove or rename it.

  ### 3. Ensure crm_user lookup_entity_id on all ownerid fields
  All ownerid fields must correctly reference the crm_user entity.

  ### 4. Default system fields for ALL existing entities
  For every entity_definition row, ensure the following system fields exist:
    - id (autonumber / pk proxy — display only, not editable)
    - createdon (datetime → created_at)
    - modifiedon (datetime → modified_at)
    - statecode / status / statusreason (already handled by migration 170)
    - ownerid (lookup → crm_user)

  ### 5. Default views (Active, Inactive, All) for every entity
  For each entity, ensure three system views exist (idempotent — skips if present).

  ### 6. Default forms (Main Form, Quick Create, Quick View) for every entity
  For each entity, ensure three system forms exist with a minimal but correct
  layout_json. The Main Form always contains the primary_field_name column.

  ### Security
  No new tables — existing RLS policies cover form_definition and view_definition.
*/

-- ─── 1. Add is_managed column if not present ──────────────────────────────────

ALTER TABLE field_definition
  ADD COLUMN IF NOT EXISTS is_managed boolean NOT NULL DEFAULT false;

-- ─── 2. Demote industrycode on account (not a true system column) ─────────────

UPDATE field_definition
SET
  is_system        = false,
  is_deletable     = true,
  is_schema_editable = true
WHERE logical_name = 'industrycode'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'account' LIMIT 1
  );

-- ─── 3. Main bootstrap procedure ─────────────────────────────────────────────

DO $$
DECLARE
  v_entity          RECORD;
  v_entity_id       uuid;
  v_primary_field   text;
  v_display_name    text;
  v_plural_name     text;

  -- field type ids
  ft_text       uuid;
  ft_datetime   uuid;
  ft_lookup     uuid;
  ft_choice     uuid;

  -- crm_user entity id (for ownerid lookup)
  v_crm_user_entity_id uuid;

  -- temp vars
  v_field_id    uuid;
  v_form_id     uuid;
  v_view_id     uuid;
  v_main_form_id uuid;

  -- layout json building
  v_primary_fd_id uuid;
  v_owner_fd_id   uuid;
  v_createdon_fd_id uuid;
  v_modifiedon_fd_id uuid;
  v_status_fd_id   uuid;
  v_layout        jsonb;

BEGIN
  -- resolve field types
  SELECT field_type_id INTO ft_text     FROM field_type WHERE name = 'text'     LIMIT 1;
  SELECT field_type_id INTO ft_datetime FROM field_type WHERE name = 'datetime' LIMIT 1;
  SELECT field_type_id INTO ft_lookup   FROM field_type WHERE name = 'lookup'   LIMIT 1;
  SELECT field_type_id INTO ft_choice   FROM field_type WHERE name = 'choice'   LIMIT 1;

  IF ft_text IS NULL THEN
    RAISE EXCEPTION 'field_type "text" not found — cannot bootstrap entities';
  END IF;

  -- resolve crm_user entity
  SELECT entity_definition_id INTO v_crm_user_entity_id
    FROM entity_definition WHERE logical_name = 'crm_user' LIMIT 1;

  -- ══════════════════════════════════════════════════════════════════════════
  -- Loop over every active entity
  -- ══════════════════════════════════════════════════════════════════════════
  FOR v_entity IN
    SELECT entity_definition_id, logical_name, display_name, display_name_plural, primary_field_name
    FROM entity_definition
    WHERE is_active = true
      AND deleted_at IS NULL
  LOOP
    v_entity_id     := v_entity.entity_definition_id;
    v_primary_field := COALESCE(v_entity.primary_field_name, 'name');
    v_display_name  := v_entity.display_name;
    v_plural_name   := v_entity.display_name_plural;

    -- ── 3a. Ensure createdon system field ────────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM field_definition
      WHERE entity_definition_id = v_entity_id
        AND logical_name = 'createdon'
    ) THEN
      INSERT INTO field_definition (
        entity_definition_id, field_type_id, logical_name, display_name,
        physical_column_name, is_required, is_searchable, is_sortable,
        is_filterable, is_custom, is_system, is_deletable, is_schema_editable,
        is_managed, is_active, sort_order
      ) VALUES (
        v_entity_id, COALESCE(ft_datetime, ft_text), 'createdon', 'Created On',
        'created_at', false, false, true, true, false, true, false, false, true, true, 900
      );
    END IF;

    -- ── 3b. Ensure modifiedon system field ───────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM field_definition
      WHERE entity_definition_id = v_entity_id
        AND logical_name = 'modifiedon'
    ) THEN
      INSERT INTO field_definition (
        entity_definition_id, field_type_id, logical_name, display_name,
        physical_column_name, is_required, is_searchable, is_sortable,
        is_filterable, is_custom, is_system, is_deletable, is_schema_editable,
        is_managed, is_active, sort_order
      ) VALUES (
        v_entity_id, COALESCE(ft_datetime, ft_text), 'modifiedon', 'Modified On',
        'modified_at', false, false, true, true, false, true, false, false, true, true, 910
      );
    END IF;

    -- ── 3c. Ensure ownerid system field ──────────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM field_definition
      WHERE entity_definition_id = v_entity_id
        AND logical_name = 'ownerid'
    ) THEN
      INSERT INTO field_definition (
        entity_definition_id, field_type_id, lookup_entity_id, logical_name, display_name,
        physical_column_name, is_required, is_searchable, is_sortable,
        is_filterable, is_custom, is_system, is_deletable, is_schema_editable,
        is_managed, is_active, sort_order
      ) VALUES (
        v_entity_id, COALESCE(ft_lookup, ft_text), v_crm_user_entity_id, 'ownerid', 'Owner',
        'owner_id', false, false, false, true, false, true, false, false, false, true, 920
      );
    END IF;

    -- Fix any existing ownerid that has NULL lookup_entity_id
    UPDATE field_definition
    SET lookup_entity_id = v_crm_user_entity_id
    WHERE entity_definition_id = v_entity_id
      AND logical_name = 'ownerid'
      AND lookup_entity_id IS NULL
      AND v_crm_user_entity_id IS NOT NULL;

    -- ── 3d. Ensure primary name field is marked system ────────────────────
    UPDATE field_definition
    SET
      is_system        = true,
      is_deletable     = false,
      is_schema_editable = false
    WHERE entity_definition_id = v_entity_id
      AND logical_name = v_primary_field
      AND (is_system = false OR is_system IS NULL);

    -- ── 3e. Ensure status system field ───────────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM field_definition
      WHERE entity_definition_id = v_entity_id
        AND logical_name = 'status'
    ) THEN
      INSERT INTO field_definition (
        entity_definition_id, field_type_id, logical_name, display_name,
        physical_column_name, description, is_required, is_searchable, is_sortable,
        is_filterable, is_custom, is_system, is_deletable, is_schema_editable,
        is_managed, is_active, sort_order, config_json
      ) VALUES (
        v_entity_id, COALESCE(ft_choice, ft_text), 'status', 'Status',
        'status', 'Active / Inactive status',
        false, true, true, true, false, true, false, false, true, true, 930,
        '{"is_status_field":true,"choices":[{"value":"active","label":"Active"},{"value":"inactive","label":"Inactive"}]}'::jsonb
      );
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- 4. Default system VIEWS
    -- ══════════════════════════════════════════════════════════════════════

    -- Active Records view (default)
    IF NOT EXISTS (
      SELECT 1 FROM view_definition
      WHERE entity_definition_id = v_entity_id
        AND name = 'Active ' || v_plural_name
        AND is_system = true
    ) THEN
      INSERT INTO view_definition (
        entity_definition_id, name, view_type, description,
        is_default, is_active, is_system, is_deletable,
        filter_json, sort_json
      ) VALUES (
        v_entity_id,
        'Active ' || v_plural_name,
        'public',
        'Shows only active ' || lower(v_plural_name) || '.',
        true, true, true, false,
        '{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"status","field_display_name":"Status","field_type_name":"choice","operator":"eq","value":"active"}],"groups":[]}'::jsonb,
        '[{"field_logical_name":"created_at","field_display_name":"Created On","direction":"desc","order":0}]'::jsonb
      );
    END IF;

    -- Inactive Records view
    IF NOT EXISTS (
      SELECT 1 FROM view_definition
      WHERE entity_definition_id = v_entity_id
        AND name = 'Inactive ' || v_plural_name
        AND is_system = true
    ) THEN
      INSERT INTO view_definition (
        entity_definition_id, name, view_type, description,
        is_default, is_active, is_system, is_deletable,
        filter_json, sort_json
      ) VALUES (
        v_entity_id,
        'Inactive ' || v_plural_name,
        'public',
        'Shows only inactive ' || lower(v_plural_name) || '.',
        false, true, true, false,
        '{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"status","field_display_name":"Status","field_type_name":"choice","operator":"eq","value":"inactive"}],"groups":[]}'::jsonb,
        '[{"field_logical_name":"created_at","field_display_name":"Created On","direction":"desc","order":0}]'::jsonb
      );
    END IF;

    -- All Records view
    IF NOT EXISTS (
      SELECT 1 FROM view_definition
      WHERE entity_definition_id = v_entity_id
        AND name = 'All ' || v_plural_name
        AND is_system = true
    ) THEN
      INSERT INTO view_definition (
        entity_definition_id, name, view_type, description,
        is_default, is_active, is_system, is_deletable,
        filter_json, sort_json
      ) VALUES (
        v_entity_id,
        'All ' || v_plural_name,
        'public',
        'Shows all ' || lower(v_plural_name) || ' records.',
        false, true, true, false,
        NULL,
        '[{"field_logical_name":"created_at","field_display_name":"Created On","direction":"desc","order":0}]'::jsonb
      );
    END IF;

    -- ── Add default view columns if missing ───────────────────────────────
    -- For each system view that has no columns, add the primary field + createdon + modifiedon

    -- Get field definition IDs for this entity
    SELECT field_definition_id INTO v_primary_fd_id
      FROM field_definition
      WHERE entity_definition_id = v_entity_id
        AND logical_name = v_primary_field
      LIMIT 1;

    SELECT field_definition_id INTO v_createdon_fd_id
      FROM field_definition
      WHERE entity_definition_id = v_entity_id
        AND logical_name = 'createdon'
      LIMIT 1;

    SELECT field_definition_id INTO v_modifiedon_fd_id
      FROM field_definition
      WHERE entity_definition_id = v_entity_id
        AND logical_name = 'modifiedon'
      LIMIT 1;

    SELECT field_definition_id INTO v_status_fd_id
      FROM field_definition
      WHERE entity_definition_id = v_entity_id
        AND logical_name = 'status'
      LIMIT 1;

    SELECT field_definition_id INTO v_owner_fd_id
      FROM field_definition
      WHERE entity_definition_id = v_entity_id
        AND logical_name = 'ownerid'
      LIMIT 1;

    -- Seed columns for every system view that is currently empty
    FOR v_view_id IN
      SELECT vd.view_id
      FROM view_definition vd
      WHERE vd.entity_definition_id = v_entity_id
        AND vd.is_system = true
        AND NOT EXISTS (
          SELECT 1 FROM view_column vc WHERE vc.view_id = vd.view_id
        )
    LOOP
      -- primary name column
      IF v_primary_fd_id IS NOT NULL THEN
        INSERT INTO view_column (view_id, field_definition_id, display_order, is_sortable, is_hidden)
        VALUES (v_view_id, v_primary_fd_id, 0, true, false)
        ON CONFLICT DO NOTHING;
      END IF;
      -- status column
      IF v_status_fd_id IS NOT NULL THEN
        INSERT INTO view_column (view_id, field_definition_id, display_order, is_sortable, is_hidden)
        VALUES (v_view_id, v_status_fd_id, 10, true, false)
        ON CONFLICT DO NOTHING;
      END IF;
      -- owner column
      IF v_owner_fd_id IS NOT NULL THEN
        INSERT INTO view_column (view_id, field_definition_id, display_order, is_sortable, is_hidden)
        VALUES (v_view_id, v_owner_fd_id, 20, false, false)
        ON CONFLICT DO NOTHING;
      END IF;
      -- createdon column
      IF v_createdon_fd_id IS NOT NULL THEN
        INSERT INTO view_column (view_id, field_definition_id, display_order, is_sortable, is_hidden)
        VALUES (v_view_id, v_createdon_fd_id, 30, true, false)
        ON CONFLICT DO NOTHING;
      END IF;
      -- modifiedon column
      IF v_modifiedon_fd_id IS NOT NULL THEN
        INSERT INTO view_column (view_id, field_definition_id, display_order, is_sortable, is_hidden)
        VALUES (v_view_id, v_modifiedon_fd_id, 40, true, false)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- ══════════════════════════════════════════════════════════════════════
    -- 5. Default system FORMS
    -- ══════════════════════════════════════════════════════════════════════

    -- Get the primary field definition id for layout construction
    SELECT field_definition_id INTO v_primary_fd_id
      FROM field_definition
      WHERE entity_definition_id = v_entity_id
        AND logical_name = v_primary_field
      LIMIT 1;

    -- Build a minimal but complete Main Form layout_json
    -- The primary name field always appears first in the General tab
    IF v_primary_fd_id IS NOT NULL THEN
      v_layout := jsonb_build_object(
        'tabs', jsonb_build_array(
          jsonb_build_object(
            'id', 'tab_general',
            'name', 'general',
            'label', 'General',
            'display_order', 0,
            'is_visible', true,
            'sections', jsonb_build_array(
              jsonb_build_object(
                'id', 'sec_main',
                'name', 'main_info',
                'label', v_display_name || ' Information',
                'columns', 2,
                'display_order', 0,
                'is_visible', true,
                'is_collapsed', false,
                'controls', jsonb_build_array(
                  jsonb_build_object(
                    'id', 'ctrl_primary',
                    'control_type', 'field',
                    'field_definition_id', v_primary_fd_id::text,
                    'field_logical_name', v_primary_field,
                    'field_display_name', v_display_name || ' Name',
                    'field_type_name', 'text',
                    'label_override', null,
                    'column_span', 2,
                    'is_visible', true,
                    'is_readonly', false,
                    'is_required_override', true,
                    'subgrid_config', null
                  )
                )
              )
            )
          ),
          jsonb_build_object(
            'id', 'tab_system',
            'name', 'system_info',
            'label', 'System',
            'display_order', 99,
            'is_visible', true,
            'sections', jsonb_build_array(
              jsonb_build_object(
                'id', 'sec_system',
                'name', 'system_fields',
                'label', 'System Information',
                'columns', 2,
                'display_order', 0,
                'is_visible', true,
                'is_collapsed', true,
                'controls', '[]'::jsonb
              )
            )
          )
        )
      );
    ELSE
      v_layout := '{"tabs":[{"id":"tab_general","name":"general","label":"General","display_order":0,"is_visible":true,"sections":[{"id":"sec_main","name":"main_info","label":"General Information","columns":2,"display_order":0,"is_visible":true,"is_collapsed":false,"controls":[]}]}]}'::jsonb;
    END IF;

    -- Main Form
    IF NOT EXISTS (
      SELECT 1 FROM form_definition
      WHERE entity_definition_id = v_entity_id
        AND form_type = 'main'
        AND is_system = true
    ) THEN
      INSERT INTO form_definition (
        entity_definition_id, name, form_type, description,
        is_default, is_active, is_published, is_system, is_deletable,
        layout_json
      ) VALUES (
        v_entity_id,
        v_display_name || ' Main Form',
        'main',
        'Primary data entry and editing form for ' || v_display_name || ' records.',
        true, true, true, true, false,
        v_layout
      );
    ELSE
      -- If main form exists but has no layout_json, inject the minimal layout
      UPDATE form_definition
      SET layout_json = v_layout
      WHERE entity_definition_id = v_entity_id
        AND form_type = 'main'
        AND is_system = true
        AND (layout_json IS NULL OR layout_json = '{}'::jsonb);
    END IF;

    -- Quick Create Form (minimal — only primary field)
    IF NOT EXISTS (
      SELECT 1 FROM form_definition
      WHERE entity_definition_id = v_entity_id
        AND form_type = 'quick_create'
        AND is_system = true
    ) THEN
      INSERT INTO form_definition (
        entity_definition_id, name, form_type, description,
        is_default, is_active, is_published, is_system, is_deletable,
        layout_json
      ) VALUES (
        v_entity_id,
        v_display_name || ' Quick Create',
        'quick_create',
        'Lightweight creation form with essential fields for ' || v_display_name || '.',
        true, true, true, true, false,
        CASE WHEN v_primary_fd_id IS NOT NULL THEN
          jsonb_build_object(
            'tabs', jsonb_build_array(
              jsonb_build_object(
                'id', 'tab_main',
                'name', 'main',
                'label', 'Details',
                'display_order', 0,
                'is_visible', true,
                'sections', jsonb_build_array(
                  jsonb_build_object(
                    'id', 'sec_qc',
                    'name', 'quick_create',
                    'label', 'Essential Information',
                    'columns', 1,
                    'display_order', 0,
                    'is_visible', true,
                    'is_collapsed', false,
                    'controls', jsonb_build_array(
                      jsonb_build_object(
                        'id', 'ctrl_qc_primary',
                        'control_type', 'field',
                        'field_definition_id', v_primary_fd_id::text,
                        'field_logical_name', v_primary_field,
                        'field_display_name', v_display_name || ' Name',
                        'field_type_name', 'text',
                        'label_override', null,
                        'column_span', 1,
                        'is_visible', true,
                        'is_readonly', false,
                        'is_required_override', true,
                        'subgrid_config', null
                      )
                    )
                  )
                )
              )
            )
          )
        ELSE
          '{"tabs":[{"id":"tab_main","name":"main","label":"Details","display_order":0,"is_visible":true,"sections":[{"id":"sec_qc","name":"quick_create","label":"Essential Information","columns":1,"display_order":0,"is_visible":true,"is_collapsed":false,"controls":[]}]}]}'::jsonb
        END
      );
    END IF;

    -- Quick View Form
    IF NOT EXISTS (
      SELECT 1 FROM form_definition
      WHERE entity_definition_id = v_entity_id
        AND form_type = 'quick_view'
        AND is_system = true
    ) THEN
      INSERT INTO form_definition (
        entity_definition_id, name, form_type, description,
        is_default, is_active, is_published, is_system, is_deletable,
        layout_json
      ) VALUES (
        v_entity_id,
        v_display_name || ' Quick View',
        'quick_view',
        'Read-only summary panel for ' || v_display_name || ' records.',
        true, true, true, true, false,
        CASE WHEN v_primary_fd_id IS NOT NULL THEN
          jsonb_build_object(
            'tabs', jsonb_build_array(
              jsonb_build_object(
                'id', 'tab_summary',
                'name', 'summary',
                'label', 'Summary',
                'display_order', 0,
                'is_visible', true,
                'sections', jsonb_build_array(
                  jsonb_build_object(
                    'id', 'sec_qv',
                    'name', 'quick_view',
                    'label', v_display_name || ' Details',
                    'columns', 1,
                    'display_order', 0,
                    'is_visible', true,
                    'is_collapsed', false,
                    'controls', jsonb_build_array(
                      jsonb_build_object(
                        'id', 'ctrl_qv_primary',
                        'control_type', 'field',
                        'field_definition_id', v_primary_fd_id::text,
                        'field_logical_name', v_primary_field,
                        'field_display_name', v_display_name || ' Name',
                        'field_type_name', 'text',
                        'label_override', null,
                        'column_span', 1,
                        'is_visible', true,
                        'is_readonly', true,
                        'is_required_override', false,
                        'subgrid_config', null
                      )
                    )
                  )
                )
              )
            )
          )
        ELSE
          '{"tabs":[{"id":"tab_summary","name":"summary","label":"Summary","display_order":0,"is_visible":true,"sections":[{"id":"sec_qv","name":"quick_view","label":"Details","columns":1,"display_order":0,"is_visible":true,"is_collapsed":false,"controls":[]}]}]}'::jsonb
        END
      );
    END IF;

  END LOOP; -- end entity loop

END $$;
