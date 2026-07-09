-- Permanently removes the legacy Workflows feature.
--
-- The feature ran entirely client-side (the browser workflow engine) plus these
-- database tables + one RPC. Nothing outside the feature references INTO these
-- tables (only outbound FKs to entity_definition / crm_user, which are parents
-- and unaffected by dropping the children), so this teardown is self-contained.
--
-- Replaced by the new "Power Automation" automation-rules engine
-- (see 20260708130000_power_automation_engine.sql).
--
-- A JSON backup of all row data was taken before this ran.

begin;

-- Drop child tables first, then parents. CASCADE also removes the run/step-log
-- FKs, policies, and the entity/user FKs on workflow_definition.
drop table if exists public.workflow_step_log        cascade;
drop table if exists public.workflow_run_log         cascade;
drop table if exists public.scheduled_workflow_step  cascade;
drop table if exists public.workflow_step            cascade;
drop table if exists public.workflow_definition      cascade;

-- The run-count helper RPC used only by the workflow engine.
drop function if exists public.increment_workflow_run_count(uuid);

-- The shared notifications table keeps its 'workflow_alert' type value: existing
-- rows may still reference it and the column is shared with the Notifications
-- feature. Intentionally left in place (harmless, non-workflow-owned).

commit;
