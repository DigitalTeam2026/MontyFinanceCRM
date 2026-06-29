-- workflow_run_log was missing the `status` column the v2 dispatcher writes
-- (completed | failed). Without it every run-log INSERT failed with
-- 42703 "column status does not exist", so runs never appeared in Run history.

ALTER TABLE workflow_run_log
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';

DO $$
BEGIN
  ALTER TABLE workflow_run_log
    ADD CONSTRAINT workflow_run_log_status_check
    CHECK (status IN ('running', 'completed', 'failed', 'partial'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
