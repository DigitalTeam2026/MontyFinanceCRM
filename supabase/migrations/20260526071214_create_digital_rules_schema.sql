/*
  # Digital Rules System

  1. New Tables
    - `digital_rule` — rule definitions for controlled record deletion and related-record handling
      - `digital_rule_id` (uuid, primary key)
      - `name` (text, rule display name)
      - `description` (text)
      - `entity_logical_name` (text, the entity this rule triggers on)
      - `trigger_event` (text, 'before_delete' or 'after_delete')
      - `is_active` (boolean)
      - `priority` (integer, lower runs first)
      - `is_system` (boolean, system-provided rules cannot be deleted)
      - `created_by`, `created_at`, `modified_at`, `deleted_at`

    - `digital_rule_condition` — conditions that must be met for the rule to fire
      - `condition_type` (related_record_exists, field_equals, status_equals, lookup_not_null, custom)
      - `target_entity`, `target_field`, `source_field`, `operator`, `value`

    - `digital_rule_action` — actions to execute when conditions are met
      - `action_type` (reopen_related, delete_related, block_delete, clear_lookup, update_field, confirm_before_delete, cascade_delete)
      - `target_entity`, `target_field`, `source_field`, `field_value`, `message`

    - `digital_rule_execution_log` — audit log for every rule execution
      - `rule_name`, `entity_logical_name`, `record_id`, `user_id`, `action_taken`, `success`, `error_message`, `executed_at`

  2. Security
    - RLS enabled on all tables
    - Authenticated users can read rules/conditions/actions
    - Only system admins can create/update/delete rules
    - Execution log readable by admins, insertable by authenticated users
*/

-- ── digital_rule ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS digital_rule (
  digital_rule_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  description         text DEFAULT '',
  entity_logical_name text NOT NULL,
  trigger_event       text NOT NULL DEFAULT 'before_delete'
                      CHECK (trigger_event IN ('before_delete', 'after_delete')),
  is_active           boolean NOT NULL DEFAULT true,
  priority            integer NOT NULL DEFAULT 100,
  is_system           boolean NOT NULL DEFAULT false,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

ALTER TABLE digital_rule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read digital rules"
  ON digital_rule FOR SELECT TO authenticated
  USING (security.is_system_admin() OR deleted_at IS NULL);

CREATE POLICY "System admins can insert digital rules"
  ON digital_rule FOR INSERT TO authenticated
  WITH CHECK (security.is_system_admin());

CREATE POLICY "System admins can update digital rules"
  ON digital_rule FOR UPDATE TO authenticated
  USING (security.is_system_admin())
  WITH CHECK (security.is_system_admin());

CREATE POLICY "System admins can delete non-system digital rules"
  ON digital_rule FOR DELETE TO authenticated
  USING (security.is_system_admin() AND is_system = false);

CREATE INDEX IF NOT EXISTS idx_digital_rule_entity ON digital_rule (entity_logical_name);
CREATE INDEX IF NOT EXISTS idx_digital_rule_active ON digital_rule (is_active) WHERE deleted_at IS NULL;

-- ── digital_rule_condition ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS digital_rule_condition (
  digital_rule_condition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digital_rule_id           uuid NOT NULL REFERENCES digital_rule(digital_rule_id) ON DELETE CASCADE,
  condition_type            text NOT NULL
                            CHECK (condition_type IN ('related_record_exists','field_equals','status_equals','lookup_not_null','custom')),
  target_entity             text,
  target_field              text,
  source_field              text,
  operator                  text DEFAULT 'equals'
                            CHECK (operator IN ('equals','not_equals','not_null','is_null','contains','in','greater_than','less_than')),
  value                     text,
  display_order             integer NOT NULL DEFAULT 0
);

ALTER TABLE digital_rule_condition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read digital rule conditions"
  ON digital_rule_condition FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM digital_rule dr WHERE dr.digital_rule_id = digital_rule_condition.digital_rule_id));

CREATE POLICY "Admins can insert digital rule conditions"
  ON digital_rule_condition FOR INSERT TO authenticated
  WITH CHECK (security.is_system_admin());

CREATE POLICY "Admins can update digital rule conditions"
  ON digital_rule_condition FOR UPDATE TO authenticated
  USING (security.is_system_admin())
  WITH CHECK (security.is_system_admin());

CREATE POLICY "Admins can delete digital rule conditions"
  ON digital_rule_condition FOR DELETE TO authenticated
  USING (security.is_system_admin());

CREATE INDEX IF NOT EXISTS idx_dr_condition_rule ON digital_rule_condition (digital_rule_id);

-- ── digital_rule_action ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS digital_rule_action (
  digital_rule_action_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digital_rule_id        uuid NOT NULL REFERENCES digital_rule(digital_rule_id) ON DELETE CASCADE,
  action_type            text NOT NULL
                         CHECK (action_type IN ('reopen_related','delete_related','block_delete','clear_lookup','update_field','confirm_before_delete','cascade_delete')),
  target_entity          text,
  target_field           text,
  source_field           text,
  field_value            text,
  message                text,
  display_order          integer NOT NULL DEFAULT 0
);

ALTER TABLE digital_rule_action ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read digital rule actions"
  ON digital_rule_action FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM digital_rule dr WHERE dr.digital_rule_id = digital_rule_action.digital_rule_id));

CREATE POLICY "Admins can insert digital rule actions"
  ON digital_rule_action FOR INSERT TO authenticated
  WITH CHECK (security.is_system_admin());

CREATE POLICY "Admins can update digital rule actions"
  ON digital_rule_action FOR UPDATE TO authenticated
  USING (security.is_system_admin())
  WITH CHECK (security.is_system_admin());

CREATE POLICY "Admins can delete digital rule actions"
  ON digital_rule_action FOR DELETE TO authenticated
  USING (security.is_system_admin());

CREATE INDEX IF NOT EXISTS idx_dr_action_rule ON digital_rule_action (digital_rule_id);

-- ── digital_rule_execution_log ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS digital_rule_execution_log (
  log_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digital_rule_id     uuid REFERENCES digital_rule(digital_rule_id),
  rule_name           text NOT NULL,
  entity_logical_name text NOT NULL,
  record_id           uuid NOT NULL,
  user_id             uuid NOT NULL REFERENCES auth.users(id),
  action_taken        text NOT NULL,
  success             boolean NOT NULL DEFAULT true,
  error_message       text,
  executed_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE digital_rule_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read digital rule logs"
  ON digital_rule_execution_log FOR SELECT TO authenticated
  USING (security.is_system_admin());

CREATE POLICY "Authenticated can insert digital rule logs"
  ON digital_rule_execution_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_dr_log_rule ON digital_rule_execution_log (digital_rule_id);
CREATE INDEX IF NOT EXISTS idx_dr_log_entity ON digital_rule_execution_log (entity_logical_name, record_id);
CREATE INDEX IF NOT EXISTS idx_dr_log_user ON digital_rule_execution_log (user_id);
