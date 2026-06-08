/*
  # Fix campaign Type field physical column mapping

  The campaign 'Type' field (logical_name='typecode') references physical_column_name='campaign_type'
  but that column does not exist in the campaign table. The column was never created as a physical
  column — campaign type is stored via custom_fields JSONB.

  This migration corrects the physical_column_name to use custom_fields storage.
*/

UPDATE field_definition
SET physical_column_name = 'custom_fields.typecode'
WHERE logical_name = 'typecode'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'campaign'
  )
  AND is_active = TRUE;
