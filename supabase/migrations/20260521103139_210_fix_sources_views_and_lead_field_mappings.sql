/*
  # Fix Sources views and lead field mappings

  1. Remove owner_id view columns from crm_sources views (table has no owner_id column)
  2. These field definitions were auto-seeded from a template but the table never got owner columns

  No data loss — just removing invalid view columns that cause 400 errors.
*/

-- Remove owner_id view columns from all sources (crm_sources) views
DELETE FROM view_column
WHERE field_definition_id IN (
  SELECT fd.field_definition_id
  FROM field_definition fd
  JOIN entity_definition ed ON ed.entity_definition_id = fd.entity_definition_id
  WHERE ed.logical_name = 'sources'
    AND fd.physical_column_name = 'owner_id'
)
AND view_id IN (
  SELECT vd.view_id
  FROM view_definition vd
  JOIN entity_definition ed ON ed.entity_definition_id = vd.entity_definition_id
  WHERE ed.logical_name = 'sources'
);

-- Deactivate the owner_id field_definition for sources (table has no such column)
UPDATE field_definition
SET is_active = false
WHERE entity_definition_id = (
  SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'sources'
)
AND physical_column_name = 'owner_id';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
