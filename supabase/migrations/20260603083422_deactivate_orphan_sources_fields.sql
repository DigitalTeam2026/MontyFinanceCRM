/*
  # Deactivate orphan field_definition rows for stale 'sources' entity

  The entity_definition with logical_name='sources' and physical_table_name='crm_sources'
  was already deactivated (is_active=false). However, its field_definition rows remained
  active, causing the database validation tool to report false "broken column" issues.

  This migration deactivates all field_definition rows tied to that stale entity so the
  validation report only shows real problems.
*/

UPDATE field_definition
SET is_active = FALSE
WHERE entity_definition_id = '1766c119-5149-4cfa-b583-490bd2a9f573'
  AND is_active = TRUE;
