-- Power Automation — per-action "run after" (success / failure / always).
--
-- Mirrors Power Automate's "Configure run after". Each action declares WHEN it
-- runs relative to the actions before it in the same rule:
--   'success' (default) — run only if no earlier action has failed. This is the
--                         pre-existing behaviour, so every existing row keeps it.
--   'failure'           — run only if an earlier action failed (a "catch" step,
--                         e.g. Send email "the flow failed").
--   'always'            — run regardless (a "finally" step).
--
-- The worker no longer aborts the whole job on the first action failure: it
-- records the failure and keeps going so that failure/always branches can run.
-- The job still ends in a failed/dead state (and retries) if anything failed.

alter table public.automation_rule_action
  add column if not exists run_after text not null default 'success'
    check (run_after in ('success', 'failure', 'always'));

-- No Supabase roles on this DB (see other migrations); keep grants TO public.
grant all on public.automation_rule_action to public;
