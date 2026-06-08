/*
  # Add Created By / Modified By system fields + remove Department from Contact

  ## Changes

  1. Deactivate 'department' field_definition on contact (already inactive, ensure it's gone from form)
  2. Remove department control from Contact Main Form layout_json
  3. Add 'createdby' and 'modifiedby' system lookup field_definitions to all core entities
     that have physical created_by / modified_by columns:
     account, contact, lead, opportunity, ticket, product, product_family,
     campaign, industry, country, crm_user, team, business_unit
  4. Add createdby/modifiedby controls to the System tab of all entity main forms

  ## Field specs
  - logical_name: 'createdby' / 'modifiedby'
  - display_name: 'Created By' / 'Modified By'
  - physical_column_name: 'created_by' / 'modified_by'
  - field_type: lookup → crm_user entity
  - is_system: true, is_custom: false, is_deletable: false, is_schema_editable: false
  - is_readonly on form: true
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ensure department is deactivated on contact
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE field_definition
SET is_active = false
WHERE field_definition_id = 'ea69b275-8897-41a1-ba9c-3d2b53975fd6';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Remove department control from Contact Main Form layout
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE form_definition
SET layout_json = jsonb_set(
  layout_json,
  '{tabs,0,sections,0,controls}',
  (
    SELECT COALESCE(jsonb_agg(ctrl ORDER BY (ctrl->>'display_order')::int), '[]'::jsonb)
    FROM jsonb_array_elements(layout_json->'tabs'->0->'sections'->0->'controls') ctrl
    WHERE (ctrl->>'field_logical_name') != 'department'
  )
)
WHERE form_id = '5ecf4f62-3a9a-48e3-97e7-25a9f6e9b958';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Insert createdby / modifiedby field_definitions for all core entities
--    that have physical created_by/modified_by columns
--    Entities: account, contact, lead, opportunity, ticket, product, product_family,
--              campaign, industry, country, crm_user, team, business_unit
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_lookup_ft_id  uuid := '1923fc3b-b2d4-49b0-988f-31773bed353e';
  v_crm_user_eid  uuid := 'a02e5785-a461-447c-b61b-1051dafcfe74';

  v_entities uuid[] := ARRAY[
    'e8c85d9b-2883-416e-8b49-1e83e641c530'::uuid, -- account
    'bbb2b0af-2d11-46dc-9316-52106b816825'::uuid, -- contact
    '2892cad3-04be-47c2-8de0-cc16509e1fcf'::uuid, -- lead
    'e9482035-8715-40fa-a9d3-794c5b963c95'::uuid, -- opportunity
    '4a5cfe79-23d5-49b2-91ec-357b1469d00c'::uuid, -- ticket
    'd1a4b318-4987-4c58-b583-33434042a54d'::uuid, -- product
    '419cbc86-dcf8-47a3-ace8-2662da11b22c'::uuid, -- product_family
    '5240711c-012a-4263-9c71-698055653413'::uuid, -- campaign
    '94380ccc-b23a-4fe6-ac53-8919507fa7c0'::uuid, -- industry
    'abcb18a7-77e3-44e6-8fd0-9cd422dace0e'::uuid, -- country
    'a02e5785-a461-447c-b61b-1051dafcfe74'::uuid, -- crm_user
    'b057f86e-9e38-4a5b-b543-273cd9899175'::uuid, -- team
    '33d6f250-7376-4f10-acab-49cbba9a9e9a'::uuid  -- business_unit
  ];
  v_eid uuid;
BEGIN
  FOREACH v_eid IN ARRAY v_entities LOOP
    -- Insert createdby if missing
    INSERT INTO field_definition (
      entity_definition_id, logical_name, display_name, physical_column_name,
      field_type_id, lookup_entity_id,
      is_required, is_searchable, is_sortable, is_filterable,
      is_system, is_custom, is_active, is_deletable, is_schema_editable,
      sort_order, created_at, modified_at
    )
    SELECT
      v_eid, 'createdby', 'Created By', 'created_by',
      v_lookup_ft_id, v_crm_user_eid,
      false, false, false, true,
      true, false, true, false, false,
      950, now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM field_definition
      WHERE entity_definition_id = v_eid AND logical_name = 'createdby'
    );

    -- Insert modifiedby if missing
    INSERT INTO field_definition (
      entity_definition_id, logical_name, display_name, physical_column_name,
      field_type_id, lookup_entity_id,
      is_required, is_searchable, is_sortable, is_filterable,
      is_system, is_custom, is_active, is_deletable, is_schema_editable,
      sort_order, created_at, modified_at
    )
    SELECT
      v_eid, 'modifiedby', 'Modified By', 'modified_by',
      v_lookup_ft_id, v_crm_user_eid,
      false, false, false, true,
      true, false, true, false, false,
      960, now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM field_definition
      WHERE entity_definition_id = v_eid AND logical_name = 'modifiedby'
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Add createdby/modifiedby to System tab of all entity main forms
--    for the 13 core entities listed above
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_form record;
  v_cb_fd_id uuid;
  v_mb_fd_id uuid;
  v_sys_tab_idx int;
  v_sys_sec_idx int;
  v_controls jsonb;
  v_has_cb boolean;
  v_has_mb boolean;
  v_new_controls jsonb;
  v_max_order int;
BEGIN
  FOR v_form IN
    SELECT fd.form_id, fd.entity_definition_id, fd.layout_json
    FROM form_definition fd
    JOIN entity_definition ed ON ed.entity_definition_id = fd.entity_definition_id
    WHERE fd.form_type = 'main'
      AND fd.deleted_at IS NULL
      AND fd.layout_json IS NOT NULL
      AND ed.logical_name IN (
        'account','contact','lead','opportunity','ticket',
        'product','product_family','campaign','industry','country',
        'crm_user','team','business_unit'
      )
  LOOP
    -- Get field_definition_ids for this entity
    SELECT field_definition_id INTO v_cb_fd_id
    FROM field_definition
    WHERE entity_definition_id = v_form.entity_definition_id
      AND logical_name = 'createdby' AND is_active = true
    LIMIT 1;

    SELECT field_definition_id INTO v_mb_fd_id
    FROM field_definition
    WHERE entity_definition_id = v_form.entity_definition_id
      AND logical_name = 'modifiedby' AND is_active = true
    LIMIT 1;

    IF v_cb_fd_id IS NULL AND v_mb_fd_id IS NULL THEN CONTINUE; END IF;

    -- Find the system tab index (look for tab with name='system' or label='System')
    SELECT idx - 1 INTO v_sys_tab_idx
    FROM jsonb_array_elements(v_form.layout_json->'tabs') WITH ORDINALITY AS t(tab, idx)
    WHERE (t.tab->>'name' ILIKE 'system' OR t.tab->>'label' ILIKE 'System')
    LIMIT 1;

    IF v_sys_tab_idx IS NULL THEN
      v_sys_tab_idx := jsonb_array_length(v_form.layout_json->'tabs') - 1;
    END IF;

    -- Find the first section of the system tab
    v_sys_sec_idx := 0;

    -- Get current controls in that section
    v_controls := v_form.layout_json->'tabs'->v_sys_tab_idx->'sections'->v_sys_sec_idx->'controls';
    IF v_controls IS NULL THEN v_controls := '[]'::jsonb; END IF;

    -- Check if already present
    v_has_cb := EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_controls) c
      WHERE c->>'field_logical_name' = 'createdby'
    );
    v_has_mb := EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_controls) c
      WHERE c->>'field_logical_name' = 'modifiedby'
    );

    IF v_has_cb AND v_has_mb THEN CONTINUE; END IF;

    -- Get max display_order in current controls
    SELECT COALESCE(MAX((c->>'display_order')::int), -1) INTO v_max_order
    FROM jsonb_array_elements(v_controls) c;

    v_new_controls := v_controls;

    IF NOT v_has_cb AND v_cb_fd_id IS NOT NULL THEN
      v_max_order := v_max_order + 1;
      v_new_controls := v_new_controls || jsonb_build_array(jsonb_build_object(
        'id', 'ctrl_createdby_' || left(v_form.form_id::text, 8),
        'control_type', 'field',
        'field_logical_name', 'createdby',
        'field_display_name', 'Created By',
        'field_type_name', 'lookup',
        'field_definition_id', v_cb_fd_id::text,
        'column_span', 1,
        'display_order', v_max_order,
        'is_visible', true,
        'is_readonly', true,
        'is_required_override', false,
        'label_override', null,
        'subgrid_config', null
      ));
    END IF;

    IF NOT v_has_mb AND v_mb_fd_id IS NOT NULL THEN
      v_max_order := v_max_order + 1;
      v_new_controls := v_new_controls || jsonb_build_array(jsonb_build_object(
        'id', 'ctrl_modifiedby_' || left(v_form.form_id::text, 8),
        'control_type', 'field',
        'field_logical_name', 'modifiedby',
        'field_display_name', 'Modified By',
        'field_type_name', 'lookup',
        'field_definition_id', v_mb_fd_id::text,
        'column_span', 1,
        'display_order', v_max_order,
        'is_visible', true,
        'is_readonly', true,
        'is_required_override', false,
        'label_override', null,
        'subgrid_config', null
      ));
    END IF;

    -- Write updated controls back using dynamic path
    UPDATE form_definition
    SET layout_json = jsonb_set(
      layout_json,
      ARRAY['tabs', v_sys_tab_idx::text, 'sections', v_sys_sec_idx::text, 'controls'],
      v_new_controls
    )
    WHERE form_id = v_form.form_id;

  END LOOP;
END $$;
