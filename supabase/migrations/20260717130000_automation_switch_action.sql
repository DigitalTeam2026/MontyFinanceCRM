-- Power Automation — Switch (multi-branch) control-flow step.
--
--   switch — like Condition, but instead of two branches (yes/no) it fans out to
--     N named CASE branches plus a DEFAULT. Config is { on, cases:[{key,value}] }:
--       • on    — a token template (e.g. {{record.compliance_status}}) resolved at
--                 run time to a display value.
--       • cases — ordered list; each case's `value` is compared (equals, trimmed,
--                 case-insensitive) against the resolved `on` value. The FIRST case
--                 that matches wins and its branch runs; if none match, 'default' runs.
--     A case's child steps carry parent_action_id = <the switch id> and
--     branch = <that case's key>; the fallback steps carry branch = 'default'.
--
-- This reuses the existing action-tree machinery (parent_action_id + branch, the
-- worker's runList recursion) added for Condition — the only new thing a Switch
-- needs is (1) the action_type and (2) arbitrary branch keys, so the branch CHECK
-- (previously yes/no only) is relaxed to any non-empty string.

begin;

-- 1. Allow the new 'switch' action type.
alter table public.automation_rule_action
  drop constraint if exists automation_rule_action_action_type_check;

alter table public.automation_rule_action
  add constraint automation_rule_action_action_type_check
  check (action_type in
    ('send_email','update_field','generate_document','list_rows','get_row',
     'export_view_email','related_export_email',
     'create_related_record','update_related_record','condition','switch'));

-- 2. Relax the branch CHECK: a Condition still uses 'yes'/'no', but a Switch's
--    branch is one of its case keys (or 'default'). Keep it non-empty when set.
alter table public.automation_rule_action
  drop constraint if exists automation_rule_action_branch_check;

alter table public.automation_rule_action
  add constraint automation_rule_action_branch_check
  check (branch is null or length(btrim(branch)) > 0);

commit;
