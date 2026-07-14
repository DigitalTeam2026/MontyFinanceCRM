-- Power Automation — 'related_export_email' action.
--
-- A triggered flow can now, starting FROM the trigger record, walk the relationship
-- graph (follow N:1 lookups to parent records, and expand a 1:N child list into
-- rows), pick columns across all those entities, build an Excel/CSV report, and
-- email it as an attachment. Example: when opportunity.start_approval = yes →
-- follow originating_lead_id to the Lead → list that Lead's SupplementartCards →
-- one row per card carrying opportunity + lead + card columns.

begin;

alter table public.automation_rule_action
  drop constraint if exists automation_rule_action_action_type_check;

alter table public.automation_rule_action
  add constraint automation_rule_action_action_type_check
  check (action_type in
    ('send_email','update_field','generate_document','list_rows',
     'export_view_email','related_export_email'));

commit;
