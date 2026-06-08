/*
  # Set "Active ..." views as the default for all entities

  1. Changes
    - For every entity, sets the "Active ..." view as the default
    - Clears `is_default` from any other views for those entities
    - Specifically fixes account and contact which had NO default view

  2. Affected Entities
    - All entities with system views
*/

-- Step 1: Clear all existing defaults
UPDATE view_definition
SET is_default = false
WHERE is_default = true
  AND deleted_at IS NULL;

-- Step 2: Set "Active ..." view as default for each entity
-- Match views whose name starts with 'Active ' and are system views
UPDATE view_definition
SET is_default = true
WHERE deleted_at IS NULL
  AND name LIKE 'Active %'
  AND is_system = true
  AND view_type IN ('system', 'public');
