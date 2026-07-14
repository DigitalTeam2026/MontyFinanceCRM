-- Power Automation — write actions on a RELATED (child) table.
--
--   create_related_record — insert a row into a child table X (linked to the
--     trigger record via a lookup on X), mapping fields from the trigger record or
--     from static/token values. Optional dedupe: skip if a linked record already
--     exists (so a No→Yes→No→Yes toggle never creates duplicates).
--   update_related_record — update the child rows of X linked to the trigger
--     record, setting fields from mappings.

begin;

alter table public.automation_rule_action
  drop constraint if exists automation_rule_action_action_type_check;

alter table public.automation_rule_action
  add constraint automation_rule_action_action_type_check
  check (action_type in
    ('send_email','update_field','generate_document','list_rows',
     'export_view_email','related_export_email',
     'create_related_record','update_related_record'));

commit;
