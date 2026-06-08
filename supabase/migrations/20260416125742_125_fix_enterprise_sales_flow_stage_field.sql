/*
  # Fix Enterprise Sales Flow stage_field and opportunity stage constraint

  ## Problem
  1. The "Enterprise Sales Flow" process flow was created with stage_field = 'status_code',
     causing dynamic stage keys (e.g. 'stage_1776272850327') to be written into status_code,
     which violates the opportunity_status_code_check constraint.

  2. The opportunity_stage_check constraint hardcodes legacy stage values (qualify, develop,
     propose, close, won, lost) but the dynamic process flow system writes arbitrary stage keys
     into that column.

  ## Fix
  1. Update Enterprise Sales Flow stage_field to 'stage' (the physical column for stagecode)
  2. Drop the opportunity_stage_check constraint so dynamic stage keys are accepted
  3. Keep status_code constrained to valid semantic values (open, won, lost, cancelled)
*/

UPDATE process_flow
SET stage_field = 'stage'
WHERE name = 'Enterprise Sales Flow'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'opportunity'
  );

ALTER TABLE opportunity DROP CONSTRAINT IF EXISTS opportunity_stage_check;
