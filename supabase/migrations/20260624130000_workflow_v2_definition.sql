-- Workflow engine v2: store the whole nested flow (trigger + nested steps) as one
-- JSON tree on the workflow, and keep the engine's run trace for audit history.
-- The old flat workflow_step rows remain until the v2 builder fully replaces them.
ALTER TABLE workflow_definition ADD COLUMN IF NOT EXISTS definition jsonb;
ALTER TABLE workflow_run_log     ADD COLUMN IF NOT EXISTS trace_json jsonb;
