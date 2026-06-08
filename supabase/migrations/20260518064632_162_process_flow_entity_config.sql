/*
  # Process Flow Entity Configuration

  1. New Tables
    - `process_flow_entity_config`
      - `config_id` (uuid, primary key)
      - `process_flow_id` (uuid, FK → process_flow)
      - `entity_definition_id` (uuid, FK → entity_definition) — the participating entity
      - `is_primary` (boolean) — true for the primary entity of the flow
      - `form_id` (uuid, nullable FK → form_definition) — form to open for this entity
      - `relationship_definition_id` (uuid, nullable FK → relationship_definition)
        how this entity connects to the primary entity (null for primary)
      - `relationship_column` (text) — physical FK column name on the related entity
        e.g. 'originating_lead_id' for Opportunity→Lead
      - `link_behavior` (text) — how to handle linking when advancing to this entity:
          'open_existing' | 'create_if_missing' | 'ask_user' | 'auto_create' | 'use_latest'
      - `display_order` (int) — ordering in the UI table
      - `created_at` (timestamptz)
      - `modified_at` (timestamptz)

  2. Security
    - Enable RLS
    - Authenticated users can read all configs
    - System admins (is_system_admin=true on crm_user joined via user_id) can insert/update/delete

  Note: crm_user uses `user_id` column linked via a security definer function `is_system_admin()`,
  following the same pattern used across all other admin-gated tables in this schema.
*/

CREATE TABLE IF NOT EXISTS process_flow_entity_config (
  config_id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  process_flow_id         uuid        NOT NULL REFERENCES process_flow(process_flow_id) ON DELETE CASCADE,
  entity_definition_id    uuid        NOT NULL REFERENCES entity_definition(entity_definition_id) ON DELETE CASCADE,
  is_primary              boolean     NOT NULL DEFAULT false,
  form_id                 uuid        REFERENCES form_definition(form_id) ON DELETE SET NULL,
  relationship_definition_id uuid     REFERENCES relationship_definition(relationship_definition_id) ON DELETE SET NULL,
  relationship_column     text        NOT NULL DEFAULT '',
  link_behavior           text        NOT NULL DEFAULT 'open_existing'
                          CHECK (link_behavior IN ('open_existing','create_if_missing','ask_user','auto_create','use_latest')),
  display_order           integer     NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  modified_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pfec_flow_entity
  ON process_flow_entity_config (process_flow_id, entity_definition_id);

CREATE INDEX IF NOT EXISTS idx_pfec_process_flow_id
  ON process_flow_entity_config (process_flow_id);

ALTER TABLE process_flow_entity_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read entity configs"
  ON process_flow_entity_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System admins can insert entity configs"
  ON process_flow_entity_config FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

CREATE POLICY "System admins can update entity configs"
  ON process_flow_entity_config FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

CREATE POLICY "System admins can delete entity configs"
  ON process_flow_entity_config FOR DELETE
  TO authenticated
  USING (is_system_admin());
