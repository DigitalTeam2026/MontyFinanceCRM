/*
  # Deactivate field_definition rows for all inactive entities

  Any entity_definition with is_active=false should have no active field_definition rows.
  Stale active fields on inactive entities create false positives in the DB validation tool
  and clutter the field management UI.

  This migration deactivates all field_definition rows whose parent entity is inactive.
*/

UPDATE field_definition
SET is_active = FALSE
WHERE is_active = TRUE
  AND entity_definition_id IN (
    SELECT entity_definition_id
    FROM entity_definition
    WHERE is_active = FALSE
  );
