
/*
  # Deactivate phantom 'security' field on account entity

  ## Problem
  A field_definition row exists with logical_name='security' and physical_column_name='security'
  for the 'account' entity, but no such column exists on the account table.
  This causes a PGRST204 error (column not found in schema cache) whenever an account record
  is saved, because the save service maps this logical field to 'security' and tries to PATCH it.

  ## Changes
  - Deactivates the orphaned field_definition row so it is excluded from field mapping queries
*/

UPDATE field_definition
SET is_active = false
WHERE field_definition_id = '56e1ca52-1933-4abe-868a-1addddb14902'
  AND logical_name = 'security'
  AND physical_column_name = 'security';
