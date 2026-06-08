/*
  # Extend Digital Rules for Lifecycle Actions

  1. Schema Changes
    - Widen `digital_rule.trigger_event` CHECK to support lifecycle triggers:
      before_delete, after_delete, qualify_lead, reactivate_lead,
      close_opportunity_won, close_opportunity_lost, reopen_opportunity
    - Widen `digital_rule_action.action_type` CHECK to support lifecycle actions:
      (existing) + set_status, create_record, update_record, show_dialog,
      use_field_mappings, clear_fields, refresh_ui
    - Add columns to `digital_rule`:
      - `command_label`       : text shown on the command bar button
      - `command_icon`        : lucide icon name for button
      - `command_style`       : CSS color theme for button (emerald, red, blue, amber)
      - `requires_dialog`     : whether rule shows a dialog before execution
      - `dialog_type`         : type of dialog (qualify, requalify, reopen, close_won, close_lost, reopen_opportunity, confirm)
      - `dialog_config`       : jsonb for dialog-specific settings
      - `visible_when`        : jsonb array of state conditions for button visibility
      - `category`            : rule category (delete, lifecycle, automation)
    - Add columns to `digital_rule_action`:
      - `action_config`       : jsonb for complex action parameters (field mappings ref, status codes, etc.)

  2. Notes
    - Existing delete rules remain backward-compatible
    - All new columns have sensible defaults
    - No existing data is dropped or modified
*/

-- 1. Drop and re-create the trigger_event CHECK on digital_rule
ALTER TABLE digital_rule DROP CONSTRAINT IF EXISTS digital_rule_trigger_event_check;
ALTER TABLE digital_rule ADD CONSTRAINT digital_rule_trigger_event_check
  CHECK (trigger_event IN (
    'before_delete', 'after_delete',
    'qualify_lead', 'reactivate_lead',
    'close_opportunity_won', 'close_opportunity_lost',
    'reopen_opportunity'
  ));

-- 2. Drop and re-create the action_type CHECK on digital_rule_action
ALTER TABLE digital_rule_action DROP CONSTRAINT IF EXISTS digital_rule_action_action_type_check;
ALTER TABLE digital_rule_action ADD CONSTRAINT digital_rule_action_action_type_check
  CHECK (action_type IN (
    'reopen_related', 'delete_related', 'block_delete', 'clear_lookup',
    'update_field', 'confirm_before_delete', 'cascade_delete',
    'set_status', 'create_record', 'update_record', 'show_dialog',
    'use_field_mappings', 'clear_fields', 'refresh_ui'
  ));

-- 3. Add new columns to digital_rule
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='digital_rule' AND column_name='command_label') THEN
    ALTER TABLE digital_rule ADD COLUMN command_label text DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='digital_rule' AND column_name='command_icon') THEN
    ALTER TABLE digital_rule ADD COLUMN command_icon text DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='digital_rule' AND column_name='command_style') THEN
    ALTER TABLE digital_rule ADD COLUMN command_style text DEFAULT 'blue';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='digital_rule' AND column_name='requires_dialog') THEN
    ALTER TABLE digital_rule ADD COLUMN requires_dialog boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='digital_rule' AND column_name='dialog_type') THEN
    ALTER TABLE digital_rule ADD COLUMN dialog_type text DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='digital_rule' AND column_name='dialog_config') THEN
    ALTER TABLE digital_rule ADD COLUMN dialog_config jsonb DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='digital_rule' AND column_name='visible_when') THEN
    ALTER TABLE digital_rule ADD COLUMN visible_when jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='digital_rule' AND column_name='category') THEN
    ALTER TABLE digital_rule ADD COLUMN category text NOT NULL DEFAULT 'delete';
  END IF;
END $$;

-- 4. Add action_config to digital_rule_action
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='digital_rule_action' AND column_name='action_config') THEN
    ALTER TABLE digital_rule_action ADD COLUMN action_config jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;
