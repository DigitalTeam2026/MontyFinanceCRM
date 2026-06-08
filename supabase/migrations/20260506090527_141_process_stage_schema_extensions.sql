/*
  # Process Stage Schema Extensions

  ## Summary
  Extends the process flow infrastructure with enterprise-grade features:
  stage-level field management, SLA tracking, transition permissions,
  stage category enforcement, and a stub for future stage actions.

  ## Changes

  ### 1. process_stage enhancements
  - `sla_hours` (integer): Target SLA for completing this stage.
  - `warning_hours` (integer): Hours before SLA breach to show a warning indicator.
  - Stage category CHECK constraint added with full allowed-value list including
    legacy values from existing seeded flows.

  ### 2. process_flow_transition enhancements
  - `allowed_role_ids` (uuid[]): Security roles allowed to execute this transition.
  - `allowed_business_unit_ids` (uuid[]): Business units allowed.
  - `allowed_team_ids` (uuid[]): Teams allowed.
  - Empty arrays = no restriction.

  ### 3. New table: process_stage_fields
  Relational replacement for the JSONB stage_visible_fields/gate_required_fields arrays.
  Each row defines how a single field behaves in a single stage.

  ### 4. New stub table: process_stage_actions
  Schema-only stub for future stage automation actions.

  ## Notes
  - Existing stage categories (prospecting, proposal, negotiation, closing) are
    preserved in the CHECK constraint alongside the new MontyPay taxonomy.
  - Idempotent: all ALTER TABLE statements use IF NOT EXISTS guards.
*/

-- ── 1. SLA columns on process_stage ──────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'sla_hours'
  ) THEN
    ALTER TABLE process_stage ADD COLUMN sla_hours integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'warning_hours'
  ) THEN
    ALTER TABLE process_stage ADD COLUMN warning_hours integer;
  END IF;
END $$;

-- ── 2. Stage category CHECK constraint ───────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_process_stage_category'
  ) THEN
    ALTER TABLE process_stage
      ADD CONSTRAINT chk_process_stage_category
      CHECK (stage_category IN (
        'general', 'qualification', 'development', 'review',
        'approval', 'agreement', 'qa', 'post_sale', 'closed',
        'prospecting', 'proposal', 'negotiation', 'closing'
      ));
  END IF;
END $$;

-- ── 3. Transition permission columns ─────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_flow_transition' AND column_name = 'allowed_role_ids'
  ) THEN
    ALTER TABLE process_flow_transition ADD COLUMN allowed_role_ids uuid[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_flow_transition' AND column_name = 'allowed_business_unit_ids'
  ) THEN
    ALTER TABLE process_flow_transition ADD COLUMN allowed_business_unit_ids uuid[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_flow_transition' AND column_name = 'allowed_team_ids'
  ) THEN
    ALTER TABLE process_flow_transition ADD COLUMN allowed_team_ids uuid[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- ── 4. process_stage_fields table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS process_stage_fields (
  psf_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_stage_id    uuid NOT NULL REFERENCES process_stage(process_stage_id) ON DELETE CASCADE,
  process_flow_id     uuid NOT NULL REFERENCES process_flow(process_flow_id) ON DELETE CASCADE,
  field_logical_name  text NOT NULL,
  is_visible          boolean NOT NULL DEFAULT true,
  is_required         boolean NOT NULL DEFAULT false,
  is_readonly         boolean NOT NULL DEFAULT false,
  display_order       integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_stage_id, field_logical_name)
);

CREATE INDEX IF NOT EXISTS idx_psf_stage    ON process_stage_fields(process_stage_id);
CREATE INDEX IF NOT EXISTS idx_psf_flow     ON process_stage_fields(process_flow_id);
CREATE INDEX IF NOT EXISTS idx_psf_field    ON process_stage_fields(field_logical_name);
CREATE INDEX IF NOT EXISTS idx_psf_visible  ON process_stage_fields(process_stage_id) WHERE is_visible = true;
CREATE INDEX IF NOT EXISTS idx_psf_required ON process_stage_fields(process_stage_id) WHERE is_required = true;

ALTER TABLE process_stage_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read stage fields"
  ON process_stage_fields FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert stage fields"
  ON process_stage_fields FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can update stage fields"
  ON process_stage_fields FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can delete stage fields"
  ON process_stage_fields FOR DELETE
  TO authenticated
  USING (is_system_admin());

-- ── 5. process_stage_actions stub table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS process_stage_actions (
  action_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_stage_id    uuid NOT NULL REFERENCES process_stage(process_stage_id) ON DELETE CASCADE,
  process_flow_id     uuid NOT NULL REFERENCES process_flow(process_flow_id) ON DELETE CASCADE,
  action_type         text NOT NULL DEFAULT 'notify'
                        CHECK (action_type IN (
                          'notify', 'send_email', 'create_task', 'trigger_webhook',
                          'require_approval', 'lock_fields', 'assign_owner'
                        )),
  trigger_point       text NOT NULL DEFAULT 'on_enter'
                        CHECK (trigger_point IN ('on_enter', 'on_exit', 'on_sla_warning', 'on_sla_breach')),
  name                text NOT NULL DEFAULT '',
  config_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active           boolean NOT NULL DEFAULT true,
  display_order       integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psa_stage ON process_stage_actions(process_stage_id);
CREATE INDEX IF NOT EXISTS idx_psa_flow  ON process_stage_actions(process_flow_id);

ALTER TABLE process_stage_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read stage actions"
  ON process_stage_actions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert stage actions"
  ON process_stage_actions FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can update stage actions"
  ON process_stage_actions FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can delete stage actions"
  ON process_stage_actions FOR DELETE
  TO authenticated
  USING (is_system_admin());
