/*
  # Fix Opportunity Form Layout - StatusReason Field

  1. Problem
    - The Opportunity Main Form layout_json has a control with field_logical_name = 'statuscode'
      but the actual field_definition it points to has logical_name = 'statusreason'
    - This mismatch causes the form renderer to treat it as a generic choice dropdown
      instead of the specialized StatusreasonSelect component that filters by state_code
    - As a result, the opportunity status reason dropdown shows all reasons regardless
      of whether the opportunity is Open, Won, or Lost

  2. Fix
    - Update the layout_json to use field_logical_name = 'statusreason' for that control
    - Also update the display_name to 'Status Reason' for clarity
*/

UPDATE form_definition
SET layout_json = jsonb_set(
  jsonb_set(
    layout_json,
    '{tabs,0,sections,0,controls,3,field_logical_name}',
    '"statusreason"'
  ),
  '{tabs,0,sections,0,controls,3,field_display_name}',
  '"Status Reason"'
),
modified_at = now()
WHERE form_id = '1a49940b-900e-4784-bda2-5d0bcc35ba90'
  AND layout_json->'tabs'->0->'sections'->0->'controls'->3->>'field_logical_name' = 'statuscode';
