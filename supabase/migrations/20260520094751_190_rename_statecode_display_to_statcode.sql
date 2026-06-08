/*
  # Rename Statecode display label to Statcode

  1. Changes
    - Updates display_name from 'Statecode' to 'Statcode' on all
      field definitions with logical_name = 'statecode'
    - Also updates any view_column label_override that says 'Statecode'

  2. Affected Tables
    - field_definition (display_name only)
    - view_column (label_override only)
*/

UPDATE field_definition
SET display_name = 'Statcode'
WHERE logical_name = 'statecode'
  AND display_name = 'Statecode';

UPDATE view_column
SET label_override = 'Statcode'
WHERE label_override = 'Statecode';
