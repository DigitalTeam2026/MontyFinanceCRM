/*
  # Deactivate orphan sources entity and its views

  1. Changes
    - Deactivate entity_definition for 'sources' (physical table crm_sources does not exist)
    - Deactivate all view_definitions for the sources entity

  2. Important Notes
    - The crm_sources physical table was never created
    - Views referencing this entity cause 400 errors
    - Also deactivate the 'industries' entity if it exists (duplicate of 'industry')
*/

-- Deactivate views for 'sources' entity
UPDATE view_definition
SET is_active = false
WHERE entity_definition_id IN (
  SELECT entity_definition_id FROM entity_definition
  WHERE logical_name = 'sources'
);

-- Deactivate the sources entity itself
UPDATE entity_definition
SET is_active = false
WHERE logical_name = 'sources';

-- Also deactivate duplicate 'industries' entity (physical table crm_industries doesn't exist)
UPDATE view_definition
SET is_active = false
WHERE entity_definition_id IN (
  SELECT entity_definition_id FROM entity_definition
  WHERE logical_name = 'industries'
);

UPDATE entity_definition
SET is_active = false
WHERE logical_name = 'industries';
