/*
  # Fix "Active" view filters using wrong field/value

  1. Problem
    - "Active Accounts" and "Active Contacts" views had filter on `status` field with value '0'
    - The `status` column contains text values like 'active'/'inactive'
    - Correct approach is to filter on `state_code` field with value '1' (Active state)

  2. Changes
    - Update "Active Accounts" filter to use statecode = '1'
    - Update "Active Contacts" filter to use statecode = '1'
    - These now use the standard statecode field that integrates with the status management system
*/

UPDATE view_definition
SET filter_json = jsonb_build_object(
  'id', 'root',
  'operator', 'AND',
  'groups', '[]'::jsonb,
  'conditions', jsonb_build_array(
    jsonb_build_object(
      'id', 'c1',
      'field_logical_name', 'statecode',
      'field_display_name', 'Status',
      'field_type_name', 'choice',
      'operator', 'eq',
      'value', '1'
    )
  )
)
WHERE view_id = 'a7477a46-45b2-4552-8b32-db818d4cac09';

UPDATE view_definition
SET filter_json = jsonb_build_object(
  'id', 'root',
  'operator', 'AND',
  'groups', '[]'::jsonb,
  'conditions', jsonb_build_array(
    jsonb_build_object(
      'id', 'c1',
      'field_logical_name', 'statecode',
      'field_display_name', 'Status',
      'field_type_name', 'choice',
      'operator', 'eq',
      'value', '1'
    )
  )
)
WHERE view_id = 'a6817ffd-962f-41ed-ae53-4337c00e847b';
