-- Power Automation — showcase flow for the new "run after" (success/failure)
-- branches + the run-history drill-in.
--
--   TRIGGER  Opportunity · when "Send Note" changes to Yes
--   WHERE    Product = "MyMonty Business Wallet"
--   STEP 1   List rows  — enabled email recipients
--   STEP 2   Send email — (On success) HTML "Dear Team … find this note …" with a
--                         clickable link that opens the opportunity directly
--   STEP 3   Send email — (On failure) alert an admin the notification failed
--
-- Why "Send Note" on Opportunity and not the Note table: a note has no metadata
-- link to its opportunity, so a note-triggered rule can't read the opportunity's
-- Product. The Opportunity's "Send Note" boolean is the intended hook — a user
-- writes the note and flips "Send Note" to notify the team.
--
-- Seeded DISABLED so it never fires unexpectedly. Enable it from
-- Admin Studio > Power Automation. Requires 20260709140000_automation_action_run_after.

begin;

do $$
declare
  v_rule_id uuid;
  v_product_id text;
begin
  -- Resolve the real product GUID by name so the WHERE condition works as-is.
  select product_id::text into v_product_id
    from public.product where name = 'MyMonty Business Wallet' limit 1;

  if not exists (
    select 1 from public.automation_rule
     where name = 'Notify team of note on Business Wallet opportunity'
  ) then
    insert into public.automation_rule
      (name, description, table_logical_name, trigger_event, field_logical_name,
       operator, trigger_value, conditions, enabled, is_published, run_as)
    values
      ('Notify team of note on Business Wallet opportunity',
       'When "Send Note" is switched on for a MyMonty Business Wallet opportunity, '
         || 'email the team a link to open the opportunity and read the note.',
       'opportunity', 'update', 'send_note',
       'changes_to', 'true'::jsonb,
       case
         when v_product_id is null then '[]'::jsonb
         else jsonb_build_array(
                jsonb_build_object('field', 'product', 'operator', 'equals', 'value', v_product_id))
       end,
       false, false, 'system')
    returning automation_rule_id into v_rule_id;

    -- Step 1 — List rows: the enabled recipients (published as {{steps.recipients.*}}).
    insert into public.automation_rule_action (rule_id, sort_order, action_type, run_after, config)
    values (v_rule_id, 0, 'list_rows', 'success', jsonb_build_object(
      'step_name', 'recipients',
      'source_table', 'email_recipients',
      'filters', jsonb_build_array(
        jsonb_build_object('field', 'enabled', 'operator', 'equals', 'value', true)),
      'columns', jsonb_build_array('email', 'unit'),
      'limit', 100
    ));

    -- Step 2 — Send email (On success): HTML body + a clickable link to the opportunity.
    insert into public.automation_rule_action (rule_id, sort_order, action_type, run_after, config)
    values (v_rule_id, 1, 'send_email', 'success', jsonb_build_object(
      'to', '{{steps.recipients.join(email, '';'')}}',
      'to_static', jsonb_build_array(),
      'to_fields', jsonb_build_array(),
      'subject', 'New note to review: {{record.name}}',
      'body',
        '<p>Dear Team,</p>'
        || '<p>Kindly find this note for the opportunity <strong>{{record.name}}</strong>.</p>'
        || '<p><a href="{{record.url}}">Open the opportunity</a> to read the full note.</p>'
        || '<p style="color:#64748b;font-size:12px">Sent automatically by Power Automation.</p>'
    ));

    -- Step 3 — Catch (On failure): only runs if an earlier step failed.
    insert into public.automation_rule_action (rule_id, sort_order, action_type, run_after, config)
    values (v_rule_id, 2, 'send_email', 'failure', jsonb_build_object(
      'to', 'automation-admin@montyholding.com',
      'to_static', jsonb_build_array(),
      'to_fields', jsonb_build_array(),
      'subject', '[FAILED] Note notification for {{record.name}}',
      'body',
        '<p>The note-notification flow failed for opportunity '
        || '<strong>{{record.name}}</strong>.</p>'
        || '<p>Open Power Automation &gt; run history to see which step failed.</p>'
    ));
  end if;
end $$;

commit;
