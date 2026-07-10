-- Power Automation — make "when a Note is created on an Opportunity" a real,
-- pickable trigger.
--
-- A note (physical `timeline_note`) links to its parent polymorphically via
-- `regarding_entity_name` + `regarding_record_id`; its text is in `body`. Those
-- columns exist physically but had no field_definition rows, so they never showed
-- up in the Power Automation trigger/condition pickers or token menus. This
-- migration exposes them (metadata only — the columns already exist), then
-- replaces the earlier send_note demo with a note-create flow:
--
--   TRIGGER  Note · on create · Regarding (Table) equals "opportunity"
--   STEP 1   List rows  — enabled recipients
--   STEP 2   Send email — (On success) HTML note + link that opens the opportunity
--   STEP 3   Send email — (On failure) alert an admin
--
-- Seeded DISABLED. Requires 20260709140000_automation_action_run_after.

begin;

-- ── 1. Expose the note's parent + body columns as fields ──────────────────────
do $$
declare
  v_note uuid;
  v_text uuid;
  v_long uuid;
  v_bool uuid;
begin
  select entity_definition_id into v_note from public.entity_definition where logical_name = 'note';
  select field_type_id into v_text from public.field_type where name = 'text' limit 1;
  select field_type_id into v_long from public.field_type where name = 'long_text' limit 1;
  select field_type_id into v_bool from public.field_type where name = 'boolean' limit 1;
  if v_note is null then return; end if;

  -- (logical, display, physical, type, sort)
  perform 1;
  insert into public.field_definition
    (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
     is_system, is_custom, is_deletable, is_schema_editable, is_active, sort_order)
  select v_note, t.type_id, t.logical, t.display, t.phys, true, false, false, false, true, t.sort
  from (values
    ('body',                  'Note',              'body',                  v_long, 20),
    ('regarding_entity_name', 'Regarding (Table)', 'regarding_entity_name', v_text, 30),
    ('regarding_record_id',   'Regarding (Record)','regarding_record_id',   v_text, 40),
    ('is_pinned',             'Pinned',            'is_pinned',             v_bool, 50)
  ) as t(logical, display, phys, type_id, sort)
  where not exists (
    select 1 from public.field_definition fd
     where fd.entity_definition_id = v_note and fd.logical_name = t.logical and fd.deleted_at is null
  );
end $$;

-- ── 2. Replace the earlier demo with the note-create flow ─────────────────────
delete from public.automation_rule
 where name in (
   'Notify team of note on Business Wallet opportunity',   -- prior send_note demo
   'Notify team when a note is added to an opportunity'     -- this one (idempotent re-run)
 );

do $$
declare v_rule_id uuid;
begin
  insert into public.automation_rule
    (name, description, table_logical_name, trigger_event, field_logical_name,
     operator, trigger_value, conditions, enabled, is_published, run_as)
  values
    ('Notify team when a note is added to an opportunity',
     'When a Note is created on an Opportunity, email the team the note with a link '
       || 'that opens the opportunity so they can see it.',
     'note', 'create', 'regarding_entity_name',
     'equals', '"opportunity"'::jsonb, '[]'::jsonb, false, false, 'system')
  returning automation_rule_id into v_rule_id;

  -- Step 1 — List rows: enabled recipients → {{steps.recipients.*}}
  insert into public.automation_rule_action (rule_id, sort_order, action_type, run_after, config)
  values (v_rule_id, 0, 'list_rows', 'success', jsonb_build_object(
    'step_name', 'recipients',
    'source_table', 'email_recipients',
    'filters', jsonb_build_array(
      jsonb_build_object('field', 'enabled', 'operator', 'equals', 'value', true)),
    'columns', jsonb_build_array('email', 'unit'),
    'limit', 100
  ));

  -- Step 2 — Send email (On success): the note + a link that opens the opportunity.
  insert into public.automation_rule_action (rule_id, sort_order, action_type, run_after, config)
  values (v_rule_id, 1, 'send_email', 'success', jsonb_build_object(
    'to', '{{steps.recipients.join(email, '';'')}}',
    'to_static', jsonb_build_array(),
    'to_fields', jsonb_build_array(),
    'subject', 'New note on the opportunity: {{record.title}}',
    'body',
      '<p>Dear Team,</p>'
      || '<p>Kindly find this note for this opportunity:</p>'
      || '<blockquote style="border-left:3px solid #cbd5e1;margin:0;padding:4px 12px;color:#334155">'
      || '<strong>{{record.title}}</strong><br>{{record.body}}</blockquote>'
      || '<p><a href="{{record.regarding.url}}">Open the opportunity</a> to see the note in context.</p>'
      || '<p style="color:#64748b;font-size:12px">Sent automatically by Power Automation.</p>'
  ));

  -- Step 3 — Catch (On failure): only runs if an earlier step failed.
  insert into public.automation_rule_action (rule_id, sort_order, action_type, run_after, config)
  values (v_rule_id, 2, 'send_email', 'failure', jsonb_build_object(
    'to', 'automation-admin@montyholding.com',
    'to_static', jsonb_build_array(),
    'to_fields', jsonb_build_array(),
    'subject', '[FAILED] Note notification',
    'body', '<p>The note-notification flow failed. Open Power Automation &gt; run history to see which step failed.</p>'
  ));
end $$;

commit;
