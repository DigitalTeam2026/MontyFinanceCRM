/*
  # Record Transformation Rules

  ## Overview
  A generic system that allows administrators to configure rules for transforming
  records of one entity type into one or more records of other entity types.
  Similar to Lead Qualification but generalised for any source entity.

  ## New Tables

  ### record_transformation_rule
  - Defines a named rule with source entity, trigger settings, execution mode,
    conditions (when to fire), and metadata.
  - Fields:
    - record_transformation_rule_id (uuid, PK)
    - name (text) - Display label
    - description (text) - Internal notes
    - source_entity (text) - e.g. 'lead', 'opportunity', 'contact'
    - trigger_type (text) - 'manual' | 'on_create' | 'on_status_change'
    - trigger_status_value (text) - status value that fires the rule (on_status_change only)
    - button_label (text) - Label shown on the action button in the record form
    - execution_mode (text) - 'create_only' | 'create_or_update' | 'create_or_delete'
    - is_active, is_default, is_system flags
    - conditions_json (jsonb) - Condition group tree (when rule applies)
    - created_at, modified_at, deleted_at

  ### record_transformation_target
  - Defines each target entity the rule will create/update.
  - One row per target entity per rule.
  - Fields:
    - record_transformation_target_id (uuid, PK)
    - rule_id (uuid, FK → record_transformation_rule)
    - target_entity (text) - e.g. 'account', 'contact', 'opportunity'
    - creation_mode (text) - 'always' | 'optional' | 'never'
    - display_order (int) - Order shown in UI

  ### record_transformation_field_mapping
  - Field-level mapping rows: source field → target field.
  - Fields:
    - record_transformation_field_mapping_id (uuid, PK)
    - rule_id (uuid, FK → record_transformation_rule)
    - target_entity (text) - which target this mapping belongs to
    - source_field (text) - logical name on source entity
    - target_field (text) - logical name on target entity
    - value_type (text) - 'field' | 'static' | 'expression'
    - static_value (text) - used when value_type = 'static'
    - expression_value (text) - used when value_type = 'expression'
    - is_required (boolean)
    - display_order (int)

  ## Security
  - RLS enabled on all three tables
  - All operations restricted to authenticated users
  - System rules cannot be deleted
*/

-- =============================================
-- record_transformation_rule
-- =============================================
CREATE TABLE IF NOT EXISTS record_transformation_rule (
  record_transformation_rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  source_entity text NOT NULL CHECK (source_entity IN ('lead', 'opportunity', 'contact', 'account')),
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'on_create', 'on_status_change')),
  trigger_status_value text,
  button_label text NOT NULL DEFAULT 'Transform Record',
  execution_mode text NOT NULL DEFAULT 'create_only' CHECK (execution_mode IN ('create_only', 'create_or_update', 'create_or_delete')),
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  conditions_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rtr_source_entity ON record_transformation_rule (source_entity) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rtr_active ON record_transformation_rule (is_active) WHERE deleted_at IS NULL;

ALTER TABLE record_transformation_rule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view transformation rules"
  ON record_transformation_rule FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated users can insert transformation rules"
  ON record_transformation_rule FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update transformation rules"
  ON record_transformation_rule FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete non-system transformation rules"
  ON record_transformation_rule FOR DELETE
  TO authenticated
  USING (is_system = false);

-- =============================================
-- record_transformation_target
-- =============================================
CREATE TABLE IF NOT EXISTS record_transformation_target (
  record_transformation_target_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES record_transformation_rule (record_transformation_rule_id) ON DELETE CASCADE,
  target_entity text NOT NULL CHECK (target_entity IN ('lead', 'opportunity', 'contact', 'account', 'ticket')),
  creation_mode text NOT NULL DEFAULT 'always' CHECK (creation_mode IN ('always', 'optional', 'never')),
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rtt_rule_id ON record_transformation_target (rule_id);

ALTER TABLE record_transformation_target ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view transformation targets"
  ON record_transformation_target FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert transformation targets"
  ON record_transformation_target FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update transformation targets"
  ON record_transformation_target FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete transformation targets"
  ON record_transformation_target FOR DELETE
  TO authenticated
  USING (true);

-- =============================================
-- record_transformation_field_mapping
-- =============================================
CREATE TABLE IF NOT EXISTS record_transformation_field_mapping (
  record_transformation_field_mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES record_transformation_rule (record_transformation_rule_id) ON DELETE CASCADE,
  target_entity text NOT NULL,
  source_field text NOT NULL,
  target_field text NOT NULL,
  value_type text NOT NULL DEFAULT 'field' CHECK (value_type IN ('field', 'static', 'expression')),
  static_value text,
  expression_value text,
  is_required boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rtfm_rule_id ON record_transformation_field_mapping (rule_id);
CREATE INDEX IF NOT EXISTS idx_rtfm_rule_target ON record_transformation_field_mapping (rule_id, target_entity);

ALTER TABLE record_transformation_field_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view transformation field mappings"
  ON record_transformation_field_mapping FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert transformation field mappings"
  ON record_transformation_field_mapping FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update transformation field mappings"
  ON record_transformation_field_mapping FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete transformation field mappings"
  ON record_transformation_field_mapping FOR DELETE
  TO authenticated
  USING (true);

-- =============================================
-- Trigger: auto-update modified_at
-- =============================================
CREATE OR REPLACE FUNCTION update_rtr_modified_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.modified_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rtr_modified_at
  BEFORE UPDATE ON record_transformation_rule
  FOR EACH ROW EXECUTE FUNCTION update_rtr_modified_at();
