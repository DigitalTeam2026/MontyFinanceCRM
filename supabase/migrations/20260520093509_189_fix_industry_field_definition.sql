/*
  # Fix industry field definition on Account entity

  1. Changes
    - Updates the active `industry` field definition to use the real
      `industry_id` physical column instead of `custom_fields.industry`
    - Sets `is_custom = false` so the save path writes to the proper column

  2. Affected Tables
    - field_definition (metadata only)

  3. Notes
    - The account table already has an `industry_id` UUID column
    - Previously the field was routed to the JSON `custom_fields` blob,
      causing values to not persist correctly
*/

UPDATE field_definition
SET physical_column_name = 'industry_id',
    is_custom = false
WHERE field_definition_id = '39e20333-7de6-49db-9d76-c327f37879fb'
  AND logical_name = 'industry'
  AND physical_column_name = 'custom_fields.industry';
