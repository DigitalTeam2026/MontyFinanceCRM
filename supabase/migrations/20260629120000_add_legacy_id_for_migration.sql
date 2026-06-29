-- ============================================================================
-- Add a generic `legacy_id` field to entities being migrated from the old CRM.
--
-- `legacy_id` holds the old-CRM primary key (e.g. the D365 GUID). It lets the
-- Excel importer match records by a stable, unique key instead of by name —
-- and lets child/relation imports resolve their parent by the parent's old ID
-- (e.g. opportunity_partner → opportunity via the old opportunity GUID).
--
-- Driven by a list of entity logical names — add to TARGET_ENTITIES to cover
-- more tables (e.g. the relation tables you name). Nothing is hardcoded per
-- table; the column + field definition are created for each listed entity.
-- ============================================================================

DO $$
DECLARE
  -- >>> Add relation entity logical names here as you identify them <<<
  target_entities text[] := ARRAY['lead', 'opportunity'];
  v_logical       text;
  v_entity_id     uuid;
  v_table         text;
  v_text_type_id  uuid;
BEGIN
  SELECT field_type_id INTO v_text_type_id FROM field_type WHERE name = 'text' LIMIT 1;
  IF v_text_type_id IS NULL THEN
    RAISE EXCEPTION 'No "text" field_type found';
  END IF;

  FOREACH v_logical IN ARRAY target_entities LOOP
    SELECT entity_definition_id, physical_table_name
      INTO v_entity_id, v_table
      FROM entity_definition
      WHERE logical_name = v_logical
      LIMIT 1;

    IF v_entity_id IS NULL OR v_table IS NULL THEN
      RAISE NOTICE 'Skipping "%": entity not found', v_logical;
      CONTINUE;
    END IF;

    -- 1. Physical column
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS legacy_id text', v_table);

    -- 2. Index (fast lookups when resolving relations by old ID)
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (legacy_id) WHERE legacy_id IS NOT NULL',
      'idx_' || v_table || '_legacy_id', v_table
    );

    -- 3. Register as an importable field (so it appears in templates & resolves)
    IF NOT EXISTS (
      SELECT 1 FROM field_definition
      WHERE entity_definition_id = v_entity_id AND logical_name = 'legacy_id'
    ) THEN
      INSERT INTO field_definition (
        field_definition_id, entity_definition_id, field_type_id,
        logical_name, display_name, physical_column_name,
        is_required, is_searchable, is_sortable, is_filterable,
        is_custom, is_active, is_system, is_deletable, is_schema_editable, is_secured,
        config_json
      ) VALUES (
        gen_random_uuid(), v_entity_id, v_text_type_id,
        'legacy_id', 'Legacy Id', 'legacy_id',
        false, true, true, true,
        true, true, false, true, true, false,
        '{}'::jsonb
      );
    END IF;

    RAISE NOTICE 'legacy_id ready on "%" (table %)', v_logical, v_table;
  END LOOP;
END $$;

-- Refresh PostgREST so the new column/field is visible to the app immediately.
NOTIFY pgrst, 'reload schema';
