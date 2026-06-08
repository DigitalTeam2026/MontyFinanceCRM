/*
  # Seed System Fields for Business Unit Entity

  ## Summary
  This migration adds system field definitions for the Business Unit entity,
  which was missing from the earlier field seeding migrations.

  ## New Field Definitions
  Maps each physical column in the `business_unit` table to a metadata record
  in `field_definition` so the Admin Studio Fields page can display them.

  ### Fields Added (all marked is_system = true, is_custom = false)
  - **Name** (text) - primary field, required
  - **Description** (text) - optional description
  - **Is Active** (boolean) - active/inactive flag
  - **Parent Business Unit** (lookup → business_unit) - hierarchical parent
  - **Created At** (datetime) - system audit
  - **Modified At** (datetime) - system audit

  ## Notes
  - All fields are non-deletable (is_deletable = false) as they are system fields
  - Schema editing is disabled (is_schema_editable = false)
  - Sort order follows the logical grouping: primary, details, hierarchy, audit
*/

DO $$
DECLARE
  v_entity_id   uuid := '33d6f250-7376-4f10-acab-49cbba9a9e9a';
  v_text_type   uuid := '42369027-c4a5-446c-affd-df4c45b053ec';
  v_bool_type   uuid := '8075b5c4-3a68-4064-8ebf-accbc6a78237';
  v_dt_type     uuid := 'bc47ce59-27fc-43ba-8ef7-5ea87de7bccf';
  v_lookup_type uuid := '1923fc3b-b2d4-49b0-988f-31773bed353e';
  v_bu_entity   uuid := '33d6f250-7376-4f10-acab-49cbba9a9e9a';
BEGIN

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, lookup_entity_id,
    logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable,
    is_custom, is_system, is_deletable, is_schema_editable, is_active,
    sort_order
  ) VALUES
    (v_entity_id, v_text_type,   NULL,        'name',                    'Name',                  'name',                    true,  true,  true,  true,  false, true, false, false, true, 10),
    (v_entity_id, v_text_type,   NULL,        'description',             'Description',           'description',             false, true,  false, false, false, true, false, false, true, 20),
    (v_entity_id, v_bool_type,   NULL,        'is_active',               'Is Active',             'is_active',               false, false, true,  true,  false, true, false, false, true, 30),
    (v_entity_id, v_lookup_type, v_bu_entity, 'parent_business_unit_id', 'Parent Business Unit',  'parent_business_unit_id', false, false, true,  true,  false, true, false, false, true, 40),
    (v_entity_id, v_dt_type,     NULL,        'created_at',              'Created At',            'created_at',              false, false, true,  true,  false, true, false, false, true, 90),
    (v_entity_id, v_dt_type,     NULL,        'modified_at',             'Modified At',           'modified_at',             false, false, true,  true,  false, true, false, false, true, 91)
  ON CONFLICT DO NOTHING;

END $$;
