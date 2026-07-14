-- Power Automation — Scheduled (recurring) flows + "export a view & email it" action.
--
-- Two additions to the engine:
--   1. A rule can be a SCHEDULE flow (trigger_type='schedule') that fires on a
--      cadence (hourly/daily/weekly/monthly) instead of on a record change. The
--      worker's scheduler enqueues a job whenever now() >= next_run_at, then
--      advances next_run_at to the following slot.
--   2. A new action type 'export_view_email' — runs a saved VIEW (its columns +
--      filters), builds an Excel/CSV file, and emails it as an attachment to a
--      custom recipient list. Composes the existing view metadata, label
--      resolution, and email transport.
--
-- Local DB notes: no `authenticated`/`anon` roles here — grants/policies use TO
-- public (the app server connects as superuser and bypasses RLS anyway).

begin;

-- ── 1. Schedule columns on automation_rule ──────────────────────────────────
alter table public.automation_rule
  add column if not exists trigger_type text not null default 'event'
    check (trigger_type in ('event','schedule'));

-- {frequency:'hourly'|'daily'|'weekly'|'monthly', minute, hour, weekday(0=Sun), monthday}
alter table public.automation_rule
  add column if not exists schedule_config jsonb;

-- The next moment this schedule rule should fire (server local time). NULL until
-- the worker initialises it from schedule_config, or the editor sets it on save.
alter table public.automation_rule
  add column if not exists next_run_at timestamptz;

-- Scheduler poll index: enabled schedule rules that are due.
create index if not exists idx_automation_rule_schedule_due
  on public.automation_rule (next_run_at)
  where trigger_type = 'schedule' and enabled = true;

-- ── 2. Allow the new action type ─────────────────────────────────────────────
alter table public.automation_rule_action
  drop constraint if exists automation_rule_action_action_type_check;

alter table public.automation_rule_action
  add constraint automation_rule_action_action_type_check
  check (action_type in
    ('send_email','update_field','generate_document','list_rows','export_view_email'));

commit;
