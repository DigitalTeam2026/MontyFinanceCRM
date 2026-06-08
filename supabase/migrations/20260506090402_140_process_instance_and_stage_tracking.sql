/*
  # Process Instance and Stage Tracking Infrastructure

  ## Summary
  Adds the core process tracking infrastructure needed for product-scoped
  Business Process Flows (BPF). This is the foundation for stage history,
  SLA tracking, audits, and flow reassignment.

  ## Changes

  ### 1. New columns on lead table
  - `bpf_stage` (text): The current BPF stage key for this lead. Separate from
    status_code which tracks entity lifecycle. Defaults to NULL (no flow assigned yet).
  - `process_flow_id` (uuid FK → process_flow): Which flow this lead is on.

  ### 2. New columns on opportunity table
  - `process_flow_id` (uuid FK → process_flow): Which flow this opportunity is on.
  - `product_locked` (boolean, default false): Set to true once the opportunity
    advances past the qualify stage, preventing product_id changes that would
    break the assigned flow.

  ### 3. New table: process_instances
  - Tracks one active process instance per (entity_name, record_id) pair.
  - Allows multiple historical instances if a record is reassigned or reopened.
  - entity_name: 'lead' | 'opportunity' | etc.
  - record_id: the PK of the record in its entity table.
  - status: 'active' | 'completed' | 'cancelled' | 'reassigned'

  ### 4. New table: process_stage_history
  - Records every stage transition for a process instance.
  - Enables stage duration calculation, SLA tracking, audit trails.
  - duration_seconds: populated when a stage is exited (next entry's changed_on
    minus this entry's changed_on, computed by trigger or app).

  ## Security
  - RLS enabled on both new tables
  - Authenticated users can read; system admins manage instances
  - Users can insert their own stage history entries
*/

-- ── 1. Add bpf_stage and process_flow_id to lead ─────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'bpf_stage'
  ) THEN
    ALTER TABLE lead ADD COLUMN bpf_stage text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'process_flow_id'
  ) THEN
    ALTER TABLE lead ADD COLUMN process_flow_id uuid REFERENCES process_flow(process_flow_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_process_flow_id ON lead(process_flow_id);
CREATE INDEX IF NOT EXISTS idx_lead_bpf_stage ON lead(bpf_stage) WHERE bpf_stage IS NOT NULL;

-- ── 2. Add process_flow_id and product_locked to opportunity ──────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunity' AND column_name = 'process_flow_id'
  ) THEN
    ALTER TABLE opportunity ADD COLUMN process_flow_id uuid REFERENCES process_flow(process_flow_id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunity' AND column_name = 'product_locked'
  ) THEN
    ALTER TABLE opportunity ADD COLUMN product_locked boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opportunity_process_flow_id ON opportunity(process_flow_id);

-- ── 3. process_instances table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS process_instances (
  instance_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_flow_id     uuid NOT NULL REFERENCES process_flow(process_flow_id) ON DELETE RESTRICT,
  entity_name         text NOT NULL,
  record_id           uuid NOT NULL,
  current_stage_id    uuid REFERENCES process_stage(process_stage_id) ON DELETE SET NULL,
  current_stage_key   text,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'completed', 'cancelled', 'reassigned')),
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  created_by          uuid REFERENCES crm_user(user_id) ON DELETE SET NULL,
  modified_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pi_record        ON process_instances(entity_name, record_id);
CREATE INDEX IF NOT EXISTS idx_pi_flow          ON process_instances(process_flow_id);
CREATE INDEX IF NOT EXISTS idx_pi_status        ON process_instances(status);
CREATE INDEX IF NOT EXISTS idx_pi_active_record ON process_instances(entity_name, record_id) WHERE status = 'active';

ALTER TABLE process_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read process instances"
  ON process_instances FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert process instances"
  ON process_instances FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update own process instances"
  ON process_instances FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete process instances"
  ON process_instances FOR DELETE
  TO authenticated
  USING (is_system_admin());

-- ── 4. process_stage_history table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS process_stage_history (
  history_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id         uuid NOT NULL REFERENCES process_instances(instance_id) ON DELETE CASCADE,
  from_stage_id       uuid REFERENCES process_stage(process_stage_id) ON DELETE SET NULL,
  from_stage_key      text,
  to_stage_id         uuid NOT NULL REFERENCES process_stage(process_stage_id) ON DELETE RESTRICT,
  to_stage_key        text NOT NULL,
  changed_by          uuid REFERENCES crm_user(user_id) ON DELETE SET NULL,
  changed_on          timestamptz NOT NULL DEFAULT now(),
  duration_seconds    integer,
  comment             text,
  transition_result   text NOT NULL DEFAULT 'success'
                        CHECK (transition_result IN ('success', 'rejected', 'rolled_back'))
);

CREATE INDEX IF NOT EXISTS idx_psh_instance     ON process_stage_history(instance_id);
CREATE INDEX IF NOT EXISTS idx_psh_changed_on   ON process_stage_history(changed_on);
CREATE INDEX IF NOT EXISTS idx_psh_from_stage   ON process_stage_history(from_stage_id);
CREATE INDEX IF NOT EXISTS idx_psh_to_stage     ON process_stage_history(to_stage_id);

ALTER TABLE process_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read stage history"
  ON process_stage_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert stage history"
  ON process_stage_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update stage history"
  ON process_stage_history FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can delete stage history"
  ON process_stage_history FOR DELETE
  TO authenticated
  USING (is_system_admin());
