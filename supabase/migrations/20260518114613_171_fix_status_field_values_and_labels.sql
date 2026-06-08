
/*
  # Fix Status Field Values and Column Labels

  ## Summary
  - status field: Active = value 0, Inactive = value 1 (fixed, disabled)
  - statecode field: display_name = 'statecode', logical_name = 'statecode'
  - statusreason field: display_name = 'statusReason', logical_name = 'statusReason'
    (schema name and label both set to statusReason)
  - status field: display_name = 'Status'
*/

-- Fix status field choices: Active=0, Inactive=1
UPDATE field_definition
SET config_json = '{"is_status_field":true,"choices":[{"value":"0","label":"Active"},{"value":"1","label":"Inactive"}]}'::jsonb,
    modified_at = now()
WHERE logical_name = 'status'
  AND is_system = true
  AND deleted_at IS NULL;

-- Fix statecode display_name label
UPDATE field_definition
SET display_name = 'statecode',
    modified_at = now()
WHERE logical_name = 'statecode'
  AND is_system = true
  AND deleted_at IS NULL;

-- Fix statusreason display_name and logical_name to 'statusReason'
UPDATE field_definition
SET display_name         = 'statusReason',
    logical_name         = 'statusReason',
    physical_column_name = 'status_reason',
    modified_at = now()
WHERE logical_name IN ('statusreason', 'statusReason')
  AND is_system = true
  AND deleted_at IS NULL;

-- Status field display_name = 'Status'
UPDATE field_definition
SET display_name = 'Status',
    modified_at = now()
WHERE logical_name = 'status'
  AND is_system = true
  AND deleted_at IS NULL;
