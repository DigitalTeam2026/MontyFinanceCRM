/*
  # Add before_create trigger event and block_create action type

  1. Schema Changes
    - Widen `digital_rule.trigger_event` CHECK to include `before_create`
    - Widen `digital_rule_action.action_type` CHECK to include `block_create`

  2. New Rule: Opportunity Creation Source Control
    - Prevents manual Opportunity creation; only Lead Qualification can create Opportunities
    - Category: `governance` (new)
    - Trigger: `before_create` on entity `opportunity`
    - Action: `block_create` with message explaining the restriction
    - `admin_bypass` is explicitly set to false in action_config
    - This rule does NOT appear as a command bar button (no command_label)

  3. Notes
    - Existing rules are not modified
    - The new rule is a system rule and cannot be deleted by admins
*/

-- 1. Widen trigger_event CHECK
ALTER TABLE digital_rule DROP CONSTRAINT IF EXISTS digital_rule_trigger_event_check;
ALTER TABLE digital_rule ADD CONSTRAINT digital_rule_trigger_event_check
  CHECK (trigger_event IN (
    'before_delete', 'after_delete',
    'qualify_lead', 'reactivate_lead',
    'close_opportunity_won', 'close_opportunity_lost',
    'reopen_opportunity',
    'before_create'
  ));

-- 2. Widen action_type CHECK
ALTER TABLE digital_rule_action DROP CONSTRAINT IF EXISTS digital_rule_action_action_type_check;
ALTER TABLE digital_rule_action ADD CONSTRAINT digital_rule_action_action_type_check
  CHECK (action_type IN (
    'reopen_related', 'delete_related', 'block_delete', 'clear_lookup',
    'update_field', 'confirm_before_delete', 'cascade_delete',
    'set_status', 'create_record', 'update_record', 'show_dialog',
    'use_field_mappings', 'clear_fields', 'refresh_ui',
    'block_create'
  ));

-- 3. Seed the Opportunity Creation Source Control rule
INSERT INTO digital_rule (
  name, description, entity_logical_name, trigger_event,
  is_active, priority, is_system, category,
  command_label, command_icon, command_style,
  requires_dialog, dialog_type, dialog_config, visible_when
) VALUES (
  'Opportunity Creation Source Control',
  'Prevents manual Opportunity creation. Opportunities can only be created through Lead Qualification. This rule cannot be bypassed by admin access.',
  'opportunity', 'before_create', true, 1, true, 'governance',
  NULL, NULL, NULL,
  false, NULL, '{"admin_bypass":false}'::jsonb,
  '[]'::jsonb
);

-- 3a. No conditions needed — rule always applies to any manual create attempt

-- 3b. Single action: block_create with descriptive message
INSERT INTO digital_rule_action (
  digital_rule_id, action_type, target_entity, target_field,
  source_field, field_value, message, display_order, action_config
)
SELECT
  dr.digital_rule_id,
  'block_create',
  'opportunity',
  NULL,
  NULL,
  NULL,
  'Opportunities cannot be created manually. Please qualify a Lead to create an Opportunity.',
  1,
  '{"admin_bypass":false,"allowed_sources":["lead_qualification"]}'::jsonb
FROM digital_rule dr
WHERE dr.name = 'Opportunity Creation Source Control'
  AND dr.trigger_event = 'before_create'
  AND dr.entity_logical_name = 'opportunity';
