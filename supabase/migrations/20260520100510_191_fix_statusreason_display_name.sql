/*
  # Fix statusreason display name

  1. Changes
    - Updates display_name from 'statusreason' to 'Status Reason' on all
      field definitions with logical_name = 'statusreason'

  2. Affected Tables
    - field_definition (display_name only)
*/

UPDATE field_definition
SET display_name = 'Status Reason'
WHERE logical_name = 'statusreason'
  AND display_name = 'statusreason';
