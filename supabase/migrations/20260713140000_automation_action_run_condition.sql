-- Power Automation — per-step "Only run if" gate (enables branching flows).
--
-- Each action already has run_after (success/failure/always). This adds an
-- OPTIONAL field-to-field condition so a single flow can BRANCH: e.g. two
-- send_email steps — one that runs only when {{record.owner_id}} equals
-- {{steps.Opp.raw(ownerid)}} and one that runs only when it does NOT. The worker
-- resolves BOTH sides (tokens allowed) and compares them as text; a step whose
-- gate fails is recorded as 'skipped' (the rest of the run continues).
--
--   run_condition shape:
--     { "left": "<template>", "operator": "equals|not_equals|is_empty|is_not_empty", "right": "<template>" }
--   null / absent  =>  the step always runs (subject to run_after).
--
-- Safe/idempotent: the worker treats a missing column as "always run", so this can
-- be applied before or after deploying the worker.

alter table public.automation_rule_action
  add column if not exists run_condition jsonb;

comment on column public.automation_rule_action.run_condition is
  'Optional per-step gate {left, operator, right} of resolved token templates. Null = always run. Compared as text by the worker.';
