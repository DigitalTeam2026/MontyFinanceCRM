/*
  # Add stage field definition for opportunity entity

  ## Summary
  The `stage` column on the `opportunity` table was missing a `field_definition` record.
  Without it, the field mapping service skips the `stage` value when translating form
  values to physical DB columns, so it was never written on save (only the DB default
  'qualify' was used). This migration adds the missing field_definition so stage changes
  are properly persisted on both create and update.

  ## Changes
  - Inserts a `field_definition` row for `stage` on the `opportunity` entity.
*/

DO $$
DECLARE
  v_entity_id uuid;
  v_field_type_id uuid;
BEGIN
  SELECT entity_definition_id INTO v_entity_id
  FROM entity_definition
  WHERE logical_name = 'opportunity';

  SELECT field_type_id INTO v_field_type_id
  FROM field_type
  WHERE name = 'text'
  LIMIT 1;

  IF v_entity_id IS NOT NULL AND v_field_type_id IS NOT NULL THEN
    INSERT INTO field_definition (
      entity_definition_id,
      logical_name,
      display_name,
      physical_column_name,
      field_type_id,
      is_required,
      is_custom,
      is_system,
      is_active,
      sort_order
    )
    SELECT
      v_entity_id,
      'stage',
      'Stage',
      'stage',
      v_field_type_id,
      false,
      false,
      true,
      true,
      999
    WHERE NOT EXISTS (
      SELECT 1 FROM field_definition
      WHERE entity_definition_id = v_entity_id
      AND logical_name = 'stage'
    );
  END IF;
END $$;
