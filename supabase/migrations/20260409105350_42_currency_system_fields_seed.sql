/*
  # Seed System Fields for Currency Entity

  ## Summary
  Adds system field definitions for the Currency entity, which was missing
  from earlier field seeding migrations.

  ## Fields Added (all is_system = true, is_custom = false, is_deletable = false)
  - **Name** (text) - currency full name, required
  - **Code** (text) - ISO currency code (e.g. USD), required
  - **Symbol** (text) - display symbol (e.g. $)
  - **Exchange Rate** (decimal) - rate relative to base currency
  - **Is Base** (boolean) - flags the base/default currency
  - **Is Active** (boolean) - active/inactive flag
*/

DO $$
DECLARE
  v_entity_id   uuid := '9ddb2a99-5f32-4c97-a022-bc3eb63c449d';
  v_text_type   uuid := '42369027-c4a5-446c-affd-df4c45b053ec';
  v_bool_type   uuid := '8075b5c4-3a68-4064-8ebf-accbc6a78237';
  v_dec_type    uuid := 'd58f033c-ad60-4356-8d97-89e72ab4eb3a';
BEGIN

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, lookup_entity_id,
    logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable,
    is_custom, is_system, is_deletable, is_schema_editable, is_active,
    sort_order
  ) VALUES
    (v_entity_id, v_text_type, NULL, 'name',          'Name',          'name',          true,  true,  true,  true,  false, true, false, false, true, 10),
    (v_entity_id, v_text_type, NULL, 'code',          'Code',          'code',          true,  true,  true,  true,  false, true, false, false, true, 20),
    (v_entity_id, v_text_type, NULL, 'symbol',        'Symbol',        'symbol',        false, true,  true,  false, false, true, false, false, true, 30),
    (v_entity_id, v_dec_type,  NULL, 'exchange_rate', 'Exchange Rate', 'exchange_rate', false, false, true,  true,  false, true, false, false, true, 40),
    (v_entity_id, v_bool_type, NULL, 'is_base',       'Is Base',       'is_base',       false, false, true,  true,  false, true, false, false, true, 50),
    (v_entity_id, v_bool_type, NULL, 'is_active',     'Is Active',     'is_active',     false, false, true,  true,  false, true, false, false, true, 60)
  ON CONFLICT DO NOTHING;

END $$;
