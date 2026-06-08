/*
  # Seed System Fields for Team Entity

  ## Summary
  Adds system field definitions for the Team entity so fields are
  visible and manageable in the admin studio.

  ## Fields Added (all is_system = true, is_custom = false, is_deletable = false)
  - **Name** (text) - team name, required, searchable
  - **Team Type** (text) - type classification (e.g. owner, access)
  - **Description** (text) - team description
  - **Business Unit** (lookup -> business_unit) - owning business unit
  - **Is Active** (boolean) - active/inactive flag
  - **Created On** (datetime) - creation timestamp
  - **Modified On** (datetime) - last modified timestamp
*/

DO $$
DECLARE
  v_entity_id   uuid := 'b057f86e-9e38-4a5b-b543-273cd9899175';
  v_bu_entity   uuid := '33d6f250-7376-4f10-acab-49cbba9a9e9a';
  v_text_type   uuid := '42369027-c4a5-446c-affd-df4c45b053ec';
  v_bool_type   uuid := '8075b5c4-3a68-4064-8ebf-accbc6a78237';
  v_dt_type     uuid := 'bc47ce59-27fc-43ba-8ef7-5ea87de7bccf';
  v_lookup_type uuid := '1923fc3b-b2d4-49b0-988f-31773bed353e';
BEGIN

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, lookup_entity_id,
    logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable,
    is_custom, is_system, is_deletable, is_schema_editable, is_active,
    sort_order
  ) VALUES
    (v_entity_id, v_text_type,   NULL,        'name',            'Name',          'name',            true,  true,  true,  true,  false, true, false, false, true, 10),
    (v_entity_id, v_text_type,   NULL,        'team_type',       'Team Type',     'team_type',       false, false, true,  true,  false, true, false, false, true, 20),
    (v_entity_id, v_text_type,   NULL,        'description',     'Description',   'description',     false, true,  false, false, false, true, false, false, true, 30),
    (v_entity_id, v_lookup_type, v_bu_entity, 'business_unit_id','Business Unit', 'business_unit_id',false, false, true,  true,  false, true, false, false, true, 40),
    (v_entity_id, v_bool_type,   NULL,        'is_active',       'Is Active',     'is_active',       false, false, true,  true,  false, true, false, false, true, 50),
    (v_entity_id, v_dt_type,     NULL,        'created_at',      'Created On',    'created_at',      false, false, true,  true,  false, true, false, false, true, 60),
    (v_entity_id, v_dt_type,     NULL,        'modified_at',     'Modified On',   'modified_at',     false, false, true,  true,  false, true, false, false, true, 70)
  ON CONFLICT DO NOTHING;

END $$;
