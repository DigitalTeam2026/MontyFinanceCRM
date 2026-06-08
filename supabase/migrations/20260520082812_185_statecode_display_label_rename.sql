/*
  # Rename statecode field display_name to 'Statecode'

  1. Changes
    - Updates all `field_definition` rows where `logical_name = 'statecode'`
      to have `display_name = 'Statecode'` instead of 'Status' or 'statecode'
    - Ensures consistency across all entities

  2. Affected Entities
    - All entities that have a statecode field definition
*/

UPDATE field_definition
SET display_name = 'Statecode'
WHERE logical_name = 'statecode'
  AND display_name IS DISTINCT FROM 'Statecode';
