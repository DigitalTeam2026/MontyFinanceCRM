/*
  # Reclassify the Prospect entity's "Lead" lookup field as system (managed)

  1. Changes
    - For the `lead` lookup field on the `prospect` entity, set
        is_system = true, is_custom = false.
    - This protects the field from deletion/rename in Admin Studio and renders it
      with managed styling. The lookup relationship, target entity and stored
      values are untouched — only the classification flag changes.

  2. Affected Tables
    - `field_definition` - the prospect entity's lead-lookup row, is_system / is_custom only

  3. Notes
    - Scoped to the prospect entity (by logical_name or physical table crm_prospect)
      and to the lead lookup field (logical_name lead/leadid/lead_id or display "Lead").
    - Idempotent: skips the row if already system + managed.
*/

UPDATE field_definition fd
SET is_system = true,
    is_custom = false
FROM entity_definition ed
WHERE fd.entity_definition_id = ed.entity_definition_id
  AND (ed.logical_name = 'prospect' OR ed.physical_table_name = 'crm_prospect')
  AND (
    fd.logical_name IN ('lead', 'leadid', 'lead_id')
    OR lower(fd.display_name) = 'lead'
  )
  AND (fd.is_system IS DISTINCT FROM true OR fd.is_custom IS DISTINCT FROM false);
