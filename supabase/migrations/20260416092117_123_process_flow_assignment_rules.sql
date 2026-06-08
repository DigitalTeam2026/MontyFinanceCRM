/*
  # Process Flow Assignment Rules

  ## Summary
  Auto-assignment rules that determine which process flow a new record gets,
  based on field conditions (e.g. estimated_value > 10000 → Enterprise Sales Flow).

  ## New Table: process_flow_assignment_rule

  ### Columns
  - `rule_id` (uuid, PK)
  - `entity_definition_id` (FK → entity_definition)
  - `process_flow_id` (FK → process_flow)
  - `name` (text)
  - `conditions` (jsonb): array of { field, operator, value }; AND logic
  - `priority` (integer): lower = higher priority; first match wins
  - `is_active` (boolean)
  - `created_at`, `modified_at`, `created_by`

  ## Security
  - RLS enabled; system admins manage, authenticated users can read active rules
*/

CREATE TABLE IF NOT EXISTS process_flow_assignment_rule (
  rule_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_definition_id uuid NOT NULL REFERENCES entity_definition(entity_definition_id) ON DELETE CASCADE,
  process_flow_id     uuid NOT NULL REFERENCES process_flow(process_flow_id) ON DELETE CASCADE,
  name                text NOT NULL DEFAULT '',
  conditions          jsonb NOT NULL DEFAULT '[]',
  priority            integer NOT NULL DEFAULT 100,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES crm_user(user_id) ON DELETE SET NULL
);

ALTER TABLE process_flow_assignment_rule ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pfar_entity ON process_flow_assignment_rule(entity_definition_id);
CREATE INDEX IF NOT EXISTS idx_pfar_flow ON process_flow_assignment_rule(process_flow_id);
CREATE INDEX IF NOT EXISTS idx_pfar_priority ON process_flow_assignment_rule(entity_definition_id, priority) WHERE is_active = true;

CREATE POLICY "Authenticated users can read active assignment rules"
  ON process_flow_assignment_rule FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can insert assignment rules"
  ON process_flow_assignment_rule FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can update assignment rules"
  ON process_flow_assignment_rule FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can delete assignment rules"
  ON process_flow_assignment_rule FOR DELETE
  TO authenticated
  USING (is_system_admin());
