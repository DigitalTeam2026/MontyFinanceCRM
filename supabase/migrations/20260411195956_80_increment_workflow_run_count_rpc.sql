/*
  # Add increment_workflow_run_count RPC function

  Creates a database function to atomically increment the run_count
  on a workflow_definition row.

  1. New Functions
    - `increment_workflow_run_count(wf_id uuid)` - increments run_count by 1
*/

CREATE OR REPLACE FUNCTION increment_workflow_run_count(wf_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE workflow_definition
  SET run_count = COALESCE(run_count, 0) + 1
  WHERE workflow_id = wf_id;
$$;
