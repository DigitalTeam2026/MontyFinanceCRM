/*
  # Clean up stale 'delete' and 'assign' action permission rows

  ## Summary
  The action permission system has been refactored so that single-record Delete and
  Assign operations are controlled exclusively by the Privileges system (role_privilege
  table with can_delete / can_assign flags and access levels). The Action Permissions
  system now governs only bulk and special operations:

    - Bulk Delete, Bulk Assign, Bulk Edit
    - Activate, Deactivate
    - Export to CSV, Export to Excel
    - Import from Excel

  ## Changes
  1. Removes any existing rows in `action_permission` where `action_key` is 'delete' or 'assign'
     These are legacy entries that duplicated the Privileges system and are no longer
     referenced by any frontend code.

  ## Security
  - No RLS changes
  - No schema changes
  - Data-only cleanup of obsolete permission entries

  ## Important Notes
  - This is a data cleanup only; no columns or tables are altered
  - The frontend no longer checks `isActionAllowed(entity, 'delete')` or
    `isActionAllowed(entity, 'assign')` — those action keys are defunct
*/

DELETE FROM action_permission
WHERE action_key IN ('delete', 'assign');
