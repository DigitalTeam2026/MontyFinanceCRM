/*
  # Fix lead country, lead_source and currency fields — mark as non-custom

  These three field_definitions were created with is_custom = true, which causes
  the record service to route their values into the custom_fields JSONB column
  instead of the real physical columns (country_id, source_id, currency_id).

  Setting is_custom = false ensures values are written directly to the physical columns.
*/

UPDATE field_definition
SET is_custom = false
WHERE entity_definition_id = (
  SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'lead'
)
AND logical_name IN ('country', 'lead_source', 'currency')
AND physical_column_name IN ('country_id', 'source_id', 'currency_id');
