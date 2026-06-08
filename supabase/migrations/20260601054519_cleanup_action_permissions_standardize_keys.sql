/*
  # Standardize Action Permission keys

  1. Problem
    - Old action_permission rows used inconsistent keys: delete, assign, export, close_won, close_lost, qualify, resolve
    - The system now uses exactly 5 standard action keys: bulk_delete, import_from_excel, export_to_excel, bulk_assign, bulk_edit

  2. Changes
    - Remove all action_permission rows that do NOT use one of the 5 standard keys
    - This cleans up legacy rows (delete, assign, export, close_won, close_lost, qualify, resolve)
    - Standard keys are preserved: bulk_delete, import_from_excel, export_to_excel, bulk_assign, bulk_edit
*/

DELETE FROM action_permission
WHERE action_key NOT IN ('bulk_delete', 'import_from_excel', 'export_to_excel', 'bulk_assign', 'bulk_edit');
