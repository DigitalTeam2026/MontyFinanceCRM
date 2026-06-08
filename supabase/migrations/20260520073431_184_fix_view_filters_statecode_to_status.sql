/*
  # Fix view filters statecode to status (correct JSON spacing)

  1. Changes
    - Same intent as migration 183 but with correct JSON spacing format
    - Updates field_logical_name from 'statecode' to 'status'
    - Updates filter values from '1' to 'active' and '2' to 'inactive'

  2. Notes
    - PostgreSQL jsonb serialization uses spaces after colons and commas
    - This migration handles that format correctly
*/

UPDATE view_definition
SET
  filter_json = replace(
    replace(
      replace(
        filter_json::text,
        '"field_logical_name": "statecode"',
        '"field_logical_name": "status"'
      ),
      '"value": "1"',
      '"value": "active"'
    ),
    '"value": "2"',
    '"value": "inactive"'
  )::jsonb,
  modified_at = now()
WHERE deleted_at IS NULL
AND filter_json::text LIKE '%"field_logical_name": "statecode"%';
