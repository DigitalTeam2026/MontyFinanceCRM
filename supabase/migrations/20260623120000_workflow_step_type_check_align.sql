/*
  # Align workflow_step.step_type CHECK with the engine vocabulary

  ## Problem
  The original CHECK on workflow_step.step_type allowed
    'assign', 'send_email', 'create_record', 'update_field', 'condition',
    'wait', 'approval', 'webhook', 'notification'
  but the workflow editor and workflowEngine.ts actually emit/execute
    'update_record', 'assign_record', 'send_notification', 'create_record',
    'condition', 'wait', 'webhook'
  so saving a workflow with an Update / Assign / Notification step violated the
  constraint and returned HTTP 400 on the workflow_step insert.

  ## Fix
  Replace the constraint with the canonical step-type set used by the engine
  (src/types/workflow.ts → WorkflowStepType). The table is currently empty, so
  no data migration of legacy values is required.
*/

ALTER TABLE workflow_step DROP CONSTRAINT IF EXISTS workflow_step_step_type_check;

ALTER TABLE workflow_step ADD CONSTRAINT workflow_step_step_type_check
  CHECK (step_type = ANY (ARRAY[
    'update_record',
    'assign_record',
    'send_notification',
    'create_record',
    'delete_record',
    'condition',
    'wait',
    'webhook'
  ]::text[]));
