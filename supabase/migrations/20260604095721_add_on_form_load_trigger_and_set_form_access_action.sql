/*
  # Add on_form_load trigger event and set_form_access action type

  ## Summary
  Extends the Digital Rules system to support form-level access control.

  ## Changes

  ### digital_rule table
  - Drops and recreates `digital_rule_trigger_event_check` to include `on_form_load`
  - `on_form_load` fires when a record form is opened; conditions checked against the record's state

  ### digital_rule_action table
  - Drops and recreates `digital_rule_action_action_type_check` to include `set_form_access`
  - `set_form_access` action controls form editability: field_value = 'allow_edit' | 'read_only' | 'not_allow'

  ## New Seeded Rules

  ### Rule: Lead Closed Edit Rule
  - Entity: lead
  - Trigger: on_form_load
  - Condition: state_code in ['2', '3'] (Qualified or Disqualified)
  - Action: set_form_access = 'read_only'
  - Replaces hardcoded isQualifiedLead || isDisqualifiedLead logic

  ### Rule: Opportunity Closed Edit Rule
  - Entity: opportunity
  - Trigger: on_form_load
  - Condition: state_code in ['2', '3'] (Won or Lost)
  - Action: set_form_access = 'read_only'
  - Replaces future hardcoded Won/Lost readonly logic

  ## Notes
  - Both rules are system rules (is_system = true), visible in admin Digital Rules page
  - Admins can change field_value to 'allow_edit' or 'not_allow' without touching code
  - The frontend evaluates these rules after record load, replacing hardcoded state checks
*/

-- ── Extend trigger_event CHECK ───────────────────────────────────────────────
ALTER TABLE digital_rule
  DROP CONSTRAINT digital_rule_trigger_event_check;

ALTER TABLE digital_rule
  ADD CONSTRAINT digital_rule_trigger_event_check CHECK (
    trigger_event IN (
      'before_delete',
      'after_delete',
      'qualify_lead',
      'reactivate_lead',
      'close_opportunity_won',
      'close_opportunity_lost',
      'reopen_opportunity',
      'before_create',
      'on_form_load'
    )
  );

-- ── Extend action_type CHECK ─────────────────────────────────────────────────
ALTER TABLE digital_rule_action
  DROP CONSTRAINT digital_rule_action_action_type_check;

ALTER TABLE digital_rule_action
  ADD CONSTRAINT digital_rule_action_action_type_check CHECK (
    action_type IN (
      'reopen_related',
      'delete_related',
      'block_delete',
      'clear_lookup',
      'update_field',
      'confirm_before_delete',
      'cascade_delete',
      'set_status',
      'create_record',
      'update_record',
      'show_dialog',
      'use_field_mappings',
      'clear_fields',
      'refresh_ui',
      'block_create',
      'set_form_access'
    )
  );

-- ── Seed: Lead Closed Edit Rule ───────────────────────────────────────────────
INSERT INTO digital_rule (
  digital_rule_id,
  name,
  description,
  entity_logical_name,
  trigger_event,
  is_active,
  priority,
  is_system,
  category,
  command_label,
  command_icon,
  command_style,
  requires_dialog,
  dialog_type,
  dialog_config,
  visible_when
) VALUES (
  'f1000000-0000-4000-8000-000000000001',
  'Lead Closed Edit Rule',
  'Controls form editability when a Lead is Qualified or Disqualified. Change the action to Allow Edit, Read Only, or Not Allow.',
  'lead',
  'on_form_load',
  true,
  10,
  true,
  'governance',
  NULL,
  NULL,
  'blue',
  false,
  NULL,
  '{}',
  '[{"field":"state_code","operator":"in","value":["2","3"]}]'
) ON CONFLICT (digital_rule_id) DO NOTHING;

INSERT INTO digital_rule_condition (
  digital_rule_condition_id,
  digital_rule_id,
  condition_type,
  target_entity,
  target_field,
  source_field,
  operator,
  value,
  display_order
) VALUES (
  'f1000000-0001-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'status_equals',
  NULL,
  'state_code',
  'state_code',
  'in',
  '2,3',
  0
) ON CONFLICT (digital_rule_condition_id) DO NOTHING;

INSERT INTO digital_rule_action (
  digital_rule_action_id,
  digital_rule_id,
  action_type,
  target_entity,
  target_field,
  source_field,
  field_value,
  message,
  display_order,
  action_config
) VALUES (
  'f1000000-0002-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'set_form_access',
  'lead',
  NULL,
  NULL,
  'read_only',
  'This lead is closed (Qualified or Disqualified) and is read-only. Reactivate to edit.',
  0,
  '{"access_level":"read_only"}'
) ON CONFLICT (digital_rule_action_id) DO NOTHING;

-- ── Seed: Opportunity Closed Edit Rule ───────────────────────────────────────
INSERT INTO digital_rule (
  digital_rule_id,
  name,
  description,
  entity_logical_name,
  trigger_event,
  is_active,
  priority,
  is_system,
  category,
  command_label,
  command_icon,
  command_style,
  requires_dialog,
  dialog_type,
  dialog_config,
  visible_when
) VALUES (
  'f2000000-0000-4000-8000-000000000001',
  'Opportunity Closed Edit Rule',
  'Controls form editability when an Opportunity is Won or Lost. Change the action to Allow Edit, Read Only, or Not Allow.',
  'opportunity',
  'on_form_load',
  true,
  10,
  true,
  'governance',
  NULL,
  NULL,
  'blue',
  false,
  NULL,
  '{}',
  '[{"field":"state_code","operator":"in","value":["2","3"]}]'
) ON CONFLICT (digital_rule_id) DO NOTHING;

INSERT INTO digital_rule_condition (
  digital_rule_condition_id,
  digital_rule_id,
  condition_type,
  target_entity,
  target_field,
  source_field,
  operator,
  value,
  display_order
) VALUES (
  'f2000000-0001-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'status_equals',
  NULL,
  'state_code',
  'state_code',
  'in',
  '2,3',
  0
) ON CONFLICT (digital_rule_condition_id) DO NOTHING;

INSERT INTO digital_rule_action (
  digital_rule_action_id,
  digital_rule_id,
  action_type,
  target_entity,
  target_field,
  source_field,
  field_value,
  message,
  display_order,
  action_config
) VALUES (
  'f2000000-0002-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'set_form_access',
  'opportunity',
  NULL,
  NULL,
  'read_only',
  'This opportunity is closed (Won or Lost) and is read-only. Reopen to edit.',
  0,
  '{"access_level":"read_only"}'
) ON CONFLICT (digital_rule_action_id) DO NOTHING;
