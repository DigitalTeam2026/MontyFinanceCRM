/*
  # Seed Lifecycle Digital Rules

  1. New Rules (7 total)
    - Qualify Lead, Reactivate Lead, Close Won, Close Lost, Reopen Won, Reopen Lost
    - Re-qualify is handled as a dialog variant of Qualify Lead
  2. All rules are system rules with command bar configuration
  3. Existing delete rules are not modified
*/

-- =========================================================================
-- RULE 1: Qualify Lead
-- =========================================================================
INSERT INTO digital_rule (
  name, description, entity_logical_name, trigger_event,
  is_active, priority, is_system, category,
  command_label, command_icon, command_style,
  requires_dialog, dialog_type, dialog_config, visible_when
) VALUES (
  'Qualify Lead',
  'Creates an Opportunity (and optionally Account/Contact) from a Lead using configured field mappings.',
  'lead', 'qualify_lead', true, 10, true, 'lifecycle',
  'Qualify', 'LogIn', 'emerald',
  true, 'qualify', '{"use_qualification_rule":true}'::jsonb,
  '[{"field":"state_code","operator":"in","value":["1"]},{"field":"is_qualified","operator":"not_equals","value":"true"}]'::jsonb
);

INSERT INTO digital_rule_condition (digital_rule_id, condition_type, source_field, operator, value, display_order)
SELECT dr.digital_rule_id, 'status_equals', 'state_code', 'in', '1', 1
FROM digital_rule dr WHERE dr.name='Qualify Lead' AND dr.trigger_event='qualify_lead' AND dr.category='lifecycle';

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'use_field_mappings', 'opportunity', null, null, null, null, 1,
  '{"source":"lead_qualification_rule","create_account":true,"create_contact":true,"create_opportunity":true}'::jsonb
FROM digital_rule dr WHERE dr.name='Qualify Lead' AND dr.trigger_event='qualify_lead' AND dr.category='lifecycle';

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'set_status', 'lead', 'state_code', null, '2', null, 2,
  '{"status_reason_default":4,"set_is_qualified":true}'::jsonb
FROM digital_rule dr WHERE dr.name='Qualify Lead' AND dr.trigger_event='qualify_lead' AND dr.category='lifecycle';

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'refresh_ui', null, null, null, null, null, 3,
  '{"refresh":["record","command_bar","bpf","subgrids"]}'::jsonb
FROM digital_rule dr WHERE dr.name='Qualify Lead' AND dr.trigger_event='qualify_lead' AND dr.category='lifecycle';

-- =========================================================================
-- RULE 2: Reactivate Lead
-- =========================================================================
INSERT INTO digital_rule (
  name, description, entity_logical_name, trigger_event,
  is_active, priority, is_system, category,
  command_label, command_icon, command_style,
  requires_dialog, dialog_type, dialog_config, visible_when
) VALUES (
  'Reactivate Lead',
  'Sets a Qualified or Disqualified Lead back to Open/Active status.',
  'lead', 'reactivate_lead', true, 10, true, 'lifecycle',
  'Reactivate', 'RefreshCw', 'blue',
  true, 'reopen', '{"status_reason_state":1}'::jsonb,
  '[{"field":"state_code","operator":"in","value":["2","3"]}]'::jsonb
);

INSERT INTO digital_rule_condition (digital_rule_id, condition_type, source_field, operator, value, display_order)
SELECT dr.digital_rule_id, 'status_equals', 'state_code', 'in', '2,3', 1
FROM digital_rule dr WHERE dr.name='Reactivate Lead' AND dr.trigger_event='reactivate_lead' AND dr.category='lifecycle';

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'set_status', 'lead', 'state_code', null, '1', null, 1,
  '{"status_reason_from_dialog":true,"set_is_qualified":false}'::jsonb
FROM digital_rule dr WHERE dr.name='Reactivate Lead' AND dr.trigger_event='reactivate_lead' AND dr.category='lifecycle';

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'clear_fields', 'lead', null, null, null, null, 2,
  '{"fields":["disqualify_reason","disqualified_at","disqualified_by"]}'::jsonb
FROM digital_rule dr WHERE dr.name='Reactivate Lead' AND dr.trigger_event='reactivate_lead' AND dr.category='lifecycle';

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'refresh_ui', null, null, null, null, null, 3,
  '{"refresh":["record","command_bar","bpf","subgrids"]}'::jsonb
FROM digital_rule dr WHERE dr.name='Reactivate Lead' AND dr.trigger_event='reactivate_lead' AND dr.category='lifecycle';

-- =========================================================================
-- RULE 3: Close Opportunity as Won
-- =========================================================================
INSERT INTO digital_rule (
  name, description, entity_logical_name, trigger_event,
  is_active, priority, is_system, category,
  command_label, command_icon, command_style,
  requires_dialog, dialog_type, dialog_config, visible_when
) VALUES (
  'Close Opportunity as Won',
  'Closes an Open Opportunity as Won with closing fields dialog.',
  'opportunity', 'close_opportunity_won', true, 10, true, 'lifecycle',
  'Close as Won', 'Trophy', 'emerald',
  true, 'close_won', '{"closing_fields":["actual_revenue","actual_close_date","description","status_reason"]}'::jsonb,
  '[{"field":"state_code","operator":"equals","value":"1"}]'::jsonb
);

INSERT INTO digital_rule_condition (digital_rule_id, condition_type, source_field, operator, value, display_order)
SELECT dr.digital_rule_id, 'status_equals', 'state_code', 'equals', '1', 1
FROM digital_rule dr WHERE dr.name='Close Opportunity as Won' AND dr.trigger_event='close_opportunity_won';

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'set_status', 'opportunity', 'state_code', null, '2', null, 1,
  '{"status_reason_default":3,"save_closing_fields":true}'::jsonb
FROM digital_rule dr WHERE dr.name='Close Opportunity as Won' AND dr.trigger_event='close_opportunity_won';

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'refresh_ui', null, null, null, null, null, 2,
  '{"refresh":["record","command_bar","bpf","subgrids"]}'::jsonb
FROM digital_rule dr WHERE dr.name='Close Opportunity as Won' AND dr.trigger_event='close_opportunity_won';

-- =========================================================================
-- RULE 4: Close Opportunity as Lost
-- =========================================================================
INSERT INTO digital_rule (
  name, description, entity_logical_name, trigger_event,
  is_active, priority, is_system, category,
  command_label, command_icon, command_style,
  requires_dialog, dialog_type, dialog_config, visible_when
) VALUES (
  'Close Opportunity as Lost',
  'Closes an Open Opportunity as Lost with loss reason dialog.',
  'opportunity', 'close_opportunity_lost', true, 10, true, 'lifecycle',
  'Close as Lost', 'XCircle', 'red',
  true, 'close_lost', '{"closing_fields":["loss_reason","actual_close_date","competitor_name","description","status_reason"]}'::jsonb,
  '[{"field":"state_code","operator":"equals","value":"1"}]'::jsonb
);

INSERT INTO digital_rule_condition (digital_rule_id, condition_type, source_field, operator, value, display_order)
SELECT dr.digital_rule_id, 'status_equals', 'state_code', 'equals', '1', 1
FROM digital_rule dr WHERE dr.name='Close Opportunity as Lost' AND dr.trigger_event='close_opportunity_lost';

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'set_status', 'opportunity', 'state_code', null, '3', null, 1,
  '{"status_reason_default":4,"save_closing_fields":true}'::jsonb
FROM digital_rule dr WHERE dr.name='Close Opportunity as Lost' AND dr.trigger_event='close_opportunity_lost';

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'refresh_ui', null, null, null, null, null, 2,
  '{"refresh":["record","command_bar","bpf","subgrids"]}'::jsonb
FROM digital_rule dr WHERE dr.name='Close Opportunity as Lost' AND dr.trigger_event='close_opportunity_lost';

-- =========================================================================
-- RULE 5: Reopen Won Opportunity
-- =========================================================================
INSERT INTO digital_rule (
  name, description, entity_logical_name, trigger_event,
  is_active, priority, is_system, category,
  command_label, command_icon, command_style,
  requires_dialog, dialog_type, dialog_config, visible_when
) VALUES (
  'Reopen Won Opportunity',
  'Reopens a Won Opportunity back to Open status.',
  'opportunity', 'reopen_opportunity', true, 10, true, 'lifecycle',
  'Reopen', 'RefreshCw', 'blue',
  true, 'reopen_opportunity', '{"clear_closing_fields":false}'::jsonb,
  '[{"field":"state_code","operator":"equals","value":"2"}]'::jsonb
);

INSERT INTO digital_rule_condition (digital_rule_id, condition_type, source_field, operator, value, display_order)
SELECT dr.digital_rule_id, 'status_equals', 'state_code', 'equals', '2', 1
FROM digital_rule dr WHERE dr.name='Reopen Won Opportunity' AND dr.trigger_event='reopen_opportunity';

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'set_status', 'opportunity', 'state_code', null, '1', null, 1,
  '{"status_reason_default":1}'::jsonb
FROM digital_rule dr WHERE dr.name='Reopen Won Opportunity' AND dr.trigger_event='reopen_opportunity';

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'refresh_ui', null, null, null, null, null, 2,
  '{"refresh":["record","command_bar","bpf","subgrids"]}'::jsonb
FROM digital_rule dr WHERE dr.name='Reopen Won Opportunity' AND dr.trigger_event='reopen_opportunity';

-- =========================================================================
-- RULE 6: Reopen Lost Opportunity
-- =========================================================================
INSERT INTO digital_rule (
  name, description, entity_logical_name, trigger_event,
  is_active, priority, is_system, category,
  command_label, command_icon, command_style,
  requires_dialog, dialog_type, dialog_config, visible_when
) VALUES (
  'Reopen Lost Opportunity',
  'Reopens a Lost Opportunity back to Open status.',
  'opportunity', 'reopen_opportunity', true, 20, true, 'lifecycle',
  'Reopen', 'RefreshCw', 'blue',
  true, 'reopen_opportunity', '{"clear_closing_fields":false}'::jsonb,
  '[{"field":"state_code","operator":"equals","value":"3"}]'::jsonb
);

INSERT INTO digital_rule_condition (digital_rule_id, condition_type, source_field, operator, value, display_order)
SELECT dr.digital_rule_id, 'status_equals', 'state_code', 'equals', '3', 1
FROM digital_rule dr WHERE dr.name='Reopen Lost Opportunity' AND dr.trigger_event='reopen_opportunity' AND dr.priority=20;

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'set_status', 'opportunity', 'state_code', null, '1', null, 1,
  '{"status_reason_default":1}'::jsonb
FROM digital_rule dr WHERE dr.name='Reopen Lost Opportunity' AND dr.trigger_event='reopen_opportunity' AND dr.priority=20;

INSERT INTO digital_rule_action (digital_rule_id, action_type, target_entity, target_field, source_field, field_value, message, display_order, action_config)
SELECT dr.digital_rule_id, 'refresh_ui', null, null, null, null, null, 2,
  '{"refresh":["record","command_bar","bpf","subgrids"]}'::jsonb
FROM digital_rule dr WHERE dr.name='Reopen Lost Opportunity' AND dr.trigger_event='reopen_opportunity' AND dr.priority=20;

-- Tag existing delete rules
UPDATE digital_rule SET category = 'delete'
WHERE trigger_event IN ('before_delete','after_delete') AND category != 'delete';
