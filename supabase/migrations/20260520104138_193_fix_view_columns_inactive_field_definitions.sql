/*
  # Fix view columns referencing inactive field definitions

  1. Changes
    - Updates view_column rows that reference the inactive `industrycode`
      field_definition to use the active `industry` field_definition instead
    - Only affects account entity view columns pointing at
      `478f7797-9b20-4ea4-9761-6a5a9f307a96` (inactive industrycode)

  2. Affected Tables
    - view_column (field_definition_id only)
*/

UPDATE view_column
SET field_definition_id = '39e20333-7de6-49db-9d76-c327f37879fb'
WHERE field_definition_id = '478f7797-9b20-4ea4-9761-6a5a9f307a96';
