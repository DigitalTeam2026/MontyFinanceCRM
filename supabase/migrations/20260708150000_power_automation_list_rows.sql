-- Power Automation — allow the new 'list_rows' action type.
begin;

alter table public.automation_rule_action
  drop constraint if exists automation_rule_action_action_type_check;

alter table public.automation_rule_action
  add constraint automation_rule_action_action_type_check
  check (action_type in ('send_email','update_field','generate_document','list_rows'));

commit;
