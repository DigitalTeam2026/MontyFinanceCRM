-- Power Automation — Condition branches, nested steps, and per-action labels.
--
--   condition — a control-flow step. It evaluates a field-to-field comparison
--     (same shape as the per-step "Only run if" gate: left / operator / right)
--     and then runs ONE of two branches: 'yes' (comparison passed) or 'no'.
--     Actions in a branch carry parent_action_id = <the condition's id> and
--     branch in ('yes','no'). Branches nest arbitrarily (a condition can live
--     inside another condition's branch), so the worker walks the action TREE.
--
--   label — an optional human title for any action (e.g. "Get Opportunity
--     User") shown in the flow builder so big flows stay readable. Distinct
--     from a step's {{steps.<name>}} reference name.

begin;

-- 1. Allow the new 'condition' action type.
alter table public.automation_rule_action
  drop constraint if exists automation_rule_action_action_type_check;

alter table public.automation_rule_action
  add constraint automation_rule_action_action_type_check
  check (action_type in
    ('send_email','update_field','generate_document','list_rows','get_row',
     'export_view_email','related_export_email',
     'create_related_record','update_related_record','condition'));

-- 2. Tree structure + label. sort_order stays the ordering WITHIN a sibling
--    group (same parent_action_id + branch); null parent = top level.
alter table public.automation_rule_action
  add column if not exists parent_action_id uuid
    references public.automation_rule_action(automation_rule_action_id) on delete cascade,
  add column if not exists branch text
    check (branch is null or branch in ('yes','no')),
  add column if not exists label text;

create index if not exists idx_automation_rule_action_parent
  on public.automation_rule_action(parent_action_id);

commit;
