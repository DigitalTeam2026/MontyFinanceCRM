-- Power Automation — reference/demo rule.
--   WHEN opportunity.start_approval changes to Yes
--   THEN email the sales team.
--
-- Seeded disabled (enabled = false) so it never fires unexpectedly in an
-- existing environment. Enable it from Admin Studio > Power Automation to try it.
-- Email transport defaults to the "stub" driver (logs + records in run history);
-- set SEND_EMAIL_FN_URL to route through the real Microsoft Graph sender.

begin;

do $$
declare v_rule_id uuid;
begin
  if not exists (
    select 1 from public.automation_rule
     where name = 'Notify sales when approval starts'
       and table_logical_name = 'opportunity'
  ) then
    insert into public.automation_rule
      (name, description, table_logical_name, trigger_event, field_logical_name,
       operator, trigger_value, conditions, enabled, is_published, run_as)
    values
      ('Notify sales when approval starts',
       'Emails the sales team when an opportunity''s approval is started.',
       'opportunity', 'update', 'start_approval',
       'changes_to', 'true'::jsonb, '[]'::jsonb, false, false, 'system')
    returning automation_rule_id into v_rule_id;

    insert into public.automation_rule_action
      (rule_id, sort_order, action_type, config)
    values
      (v_rule_id, 0, 'send_email', jsonb_build_object(
        'to_static', jsonb_build_array('sales@montyholding.com'),
        'to_fields', jsonb_build_array(),
        'subject', 'Approval started: {{opportunity.topic}}',
        'body', '<p>Approval has started for <strong>{{opportunity.topic}}</strong>.</p>'
             || '<p><a href="{{record.url}}">Open the opportunity</a></p>'
      ));
  end if;
end $$;

commit;
