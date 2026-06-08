/*
  # Deactivate orphan Sources nav item

  The "Sources" entity was deactivated in migration 198 and its backing table
  `crm_sources` does not exist. However the navigation item remained active,
  causing a 400 error when users click it.

  1. Changes
    - Deactivate the Sources nav item so it no longer appears in the sidebar
*/

UPDATE nav_item
SET is_active = false, modified_at = now()
WHERE entity_name = 'sources' AND is_active = true;
