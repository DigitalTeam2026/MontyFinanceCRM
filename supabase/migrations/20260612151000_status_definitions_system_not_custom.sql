/*
  # Reclassify all statecodes and status reasons as system (managed)

  1. Changes
    - Set `statecode_definition.is_system = true` for every row.
    - Set `status_reason_definition.is_system = true` for every row.
    - System status values render with the managed/system styling in Admin Studio
      and are protected from deletion/rename (the status admin UI gates destructive
      actions on is_system). The reason_value / state_value codes, labels, colors
      and entity links are untouched — only the classification flag changes.

  2. Affected Tables
    - `statecode_definition`        - is_system only
    - `status_reason_definition`    - is_system only

  3. Notes
    - Idempotent: the WHERE clause skips rows already marked system.
    - Applies across ALL entities (account, lead, opportunity, prospect, …).
*/

UPDATE statecode_definition
SET is_system = true
WHERE is_system IS DISTINCT FROM true;

UPDATE status_reason_definition
SET is_system = true
WHERE is_system IS DISTINCT FROM true;
