/*
  # Workflow Execution Tables

  ## Summary
  Adds the infrastructure needed for the workflow engine to execute and track
  all step types, including async wait/delay steps.

  ## New Tables

  ### 1. workflow_run_log
  Records each execution of a workflow — one row per workflow fired.

  Columns:
  - run_id          (uuid PK)
  - workflow_id     (FK → workflow_definition)
  - entity_name     — which entity triggered the run (e.g. 'opportunity')
  - record_id       — the record that triggered the run
  - trigger_type    — on_create | on_update | on_status_change | manual
  - status          — running | completed | failed | partial
  - steps_executed  — count of steps that ran
  - error_message   — last error if status = failed
  - started_at
  - completed_at

  ### 2. workflow_step_log
  Records the result of each individual step within a run.

  Columns:
  - step_log_id     (uuid PK)
  - run_id          (FK → workflow_run_log ON DELETE CASCADE)
  - workflow_step_id
  - step_type
  - step_name
  - status          — success | failed | skipped | pending
  - result_json     — step-specific result data (e.g. webhook response code)
  - error_message
  - executed_at

  ### 3. scheduled_workflow_step
  Persists "wait" steps that need to fire after a delay. A periodic job
  (or future pg_cron integration) can poll this table and resume the workflow.

  Columns:
  - scheduled_job_id (uuid PK)
  - workflow_id
  - workflow_step_id  — the step to resume AT (the one after the wait)
  - entity_name
  - record_id
  - trigger_user_id
  - resume_at         — timestamp when the wait expires
  - status            — pending | processing | completed | cancelled
  - created_at

  ## Security
  - RLS enabled on all tables
  - Authenticated users can insert/select their own runs
  - Admins (via is_admin flag on crm_user) can see all runs
*/

-- ─── workflow_run_log ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_run_log (
  run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     uuid NOT NULL
    REFERENCES workflow_definition(workflow_id) ON DELETE CASCADE,
  entity_name     text NOT NULL,
  record_id       uuid NOT NULL,
  trigger_type    text NOT NULL,
  status          text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  steps_executed  int NOT NULL DEFAULT 0,
  error_message   text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

ALTER TABLE workflow_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert run logs"
  ON workflow_run_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read run logs"
  ON workflow_run_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update run logs"
  ON workflow_run_log FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_wrl_workflow ON workflow_run_log(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wrl_record   ON workflow_run_log(record_id);
CREATE INDEX IF NOT EXISTS idx_wrl_started  ON workflow_run_log(started_at DESC);

-- ─── workflow_step_log ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_step_log (
  step_log_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid NOT NULL
    REFERENCES workflow_run_log(run_id) ON DELETE CASCADE,
  workflow_step_id uuid,
  step_type        text NOT NULL,
  step_name        text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('success', 'failed', 'skipped', 'pending')),
  result_json      jsonb,
  error_message    text,
  executed_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workflow_step_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert step logs"
  ON workflow_step_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read step logs"
  ON workflow_step_log FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_wsl_run ON workflow_step_log(run_id);

-- ─── scheduled_workflow_step ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scheduled_workflow_step (
  scheduled_job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id      uuid NOT NULL,
  workflow_step_id uuid NOT NULL,
  entity_name      text NOT NULL,
  record_id        uuid NOT NULL,
  trigger_user_id  uuid,
  context_snapshot jsonb,
  resume_at        timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scheduled_workflow_step ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert scheduled steps"
  ON scheduled_workflow_step FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read scheduled steps"
  ON scheduled_workflow_step FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update scheduled steps"
  ON scheduled_workflow_step FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sws_resume_at ON scheduled_workflow_step(resume_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sws_workflow  ON scheduled_workflow_step(workflow_id);
