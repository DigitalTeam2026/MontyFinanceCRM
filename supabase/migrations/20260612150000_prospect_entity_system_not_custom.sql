/*
  # Reclassify the `prospect` entity as a system (managed) entity

  1. Changes
    - Set `entity_definition.is_custom = false` for the `prospect` entity.
    - This flips its admin classification from "Custom" to "System/Managed":
      it is shown with the system styling, and is protected from deletion
      (system entities cannot be soft-deleted — see entityService.softDeleteEntity).
    - The physical table and all records are untouched; record CRUD continues to
      work via the metadata-driven path (recordService keys runtime behavior off
      the static ENTITY_TABLE map, not this flag).

  2. Affected Tables
    - `entity_definition` - prospect row, is_custom only
*/

UPDATE entity_definition
SET is_custom = false,
    modified_at = now()
WHERE (logical_name = 'prospect' OR physical_table_name = 'crm_prospect')
  AND is_custom = true;
