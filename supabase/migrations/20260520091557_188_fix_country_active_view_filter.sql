/*
  # Fix country "Active Countries" view filter value

  1. Changes
    - Updates the "Active Countries" view filter from status='0' (numeric statecode)
      to status='active' (correct text value)
  
  2. Affected Views
    - Active Countries (country entity)
*/

UPDATE view_definition
SET filter_json = jsonb_set(
  filter_json,
  '{conditions,0,value}',
  '"active"'
)
WHERE deleted_at IS NULL
  AND name = 'Active Countries'
  AND filter_json->'conditions'->0->>'value' = '0';
