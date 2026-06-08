/*
  # Fix Sources entity display name and ensure privilege rows

  1. Problem
    - Sources entity has `display_name = 'Sources'` (plural) instead of singular like
      all other entities (Account, Campaign, Country, etc.)
    - The "System Administrator" role is missing a `role_privilege` row for Sources,
      which may cause inconsistent rendering in the Privileges grid.

  2. Fix
    - Update `display_name` to 'Source' (singular) to match the convention.
    - Ensure every active security role has a `role_privilege` row for 'sources'.
      Missing rows are inserted with all privileges defaulted to false.
*/

-- Fix display_name to singular
UPDATE entity_definition
SET display_name = 'Source',
    modified_at = now()
WHERE logical_name = 'sources'
  AND display_name = 'Sources';

-- Insert missing role_privilege rows for 'sources' for any role that doesn't have one
INSERT INTO role_privilege (role_id, entity_name, can_create, can_read, can_write, can_delete, can_assign, can_share)
SELECT sr.role_id, 'sources', false, false, false, false, false, false
FROM security_role sr
WHERE sr.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM role_privilege rp
    WHERE rp.role_id = sr.role_id AND rp.entity_name = 'sources'
  );
