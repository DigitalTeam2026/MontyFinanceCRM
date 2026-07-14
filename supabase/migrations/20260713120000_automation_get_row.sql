-- Power Automation — "Get row by ID" action.
--
--   get_row — read ONE row from any table by matching a column (default the
--     primary key) against a value passed from the flow (a trigger-record field,
--     an earlier step's output, or a static value). The fetched row is published
--     as a step ({{steps.<name>.first(<col>)}} / {{steps.<name>.rows}}), so a
--     later Send email / Update field step can use e.g. the owner's email.
--
-- Widens the automation_rule_action.action_type CHECK to allow 'get_row'.

begin;

alter table public.automation_rule_action
  drop constraint if exists automation_rule_action_action_type_check;

alter table public.automation_rule_action
  add constraint automation_rule_action_action_type_check
  check (action_type in
    ('send_email','update_field','generate_document','list_rows','get_row',
     'export_view_email','related_export_email',
     'create_related_record','update_related_record'));

commit;
