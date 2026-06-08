/*
  # Add is_qualified reset to Opportunity delete rule

  1. Changes
    - Adds an `update_field` action to the "Reopen Lead when Opportunity is deleted" digital rule
    - Sets `is_qualified` to false on the originating lead when the opportunity is deleted
    - This ensures the lead's qualified flag stays in sync with its state_code

  2. Important Notes
    - The rule already resets state_code to 1 and clears qualified_opportunity_id
    - This action completes the cleanup so `is_qualified` is also reset
*/

INSERT INTO digital_rule_action (
  digital_rule_id, action_type, target_entity, target_field,
  source_field, field_value, message, display_order, action_config
)
SELECT
  'a1b2c3d4-1111-4000-8000-000000000001',
  'update_field',
  'lead',
  'is_qualified',
  'originating_lead_id',
  'false',
  NULL,
  0,
  '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM digital_rule_action
  WHERE digital_rule_id = 'a1b2c3d4-1111-4000-8000-000000000001'
    AND target_field = 'is_qualified'
);
