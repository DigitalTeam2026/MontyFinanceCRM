/*
  # Approval Process Configuration

  ## Overview
  Provides a fully configurable approval matrix system. Instead of hardcoding
  approval stages (compliance, operations, settlement, etc.) administrators can
  define named Approval Processes — each with ordered or parallel approval steps
  — and attach trigger conditions (entity, product, amount threshold, business
  unit, pipeline stage). At runtime the system evaluates which process applies
  and routes the record through the configured steps.

  ## New Tables

  ### 1. approval_process
  Top-level definition of one approval workflow template.

  Columns:
  - approval_process_id (uuid PK)
  - name, description
  - entity_logical_name  — which entity this applies to (e.g. 'opportunity', 'order')
  - step_execution_mode  — 'sequential' | 'parallel'
                          Sequential: steps run one after another.
                          Parallel: all steps are triggered simultaneously.
  - is_active, is_system
  - created_at, modified_at, deleted_at

  ### 2. approval_condition
  Trigger conditions that must ALL match for this process to apply.
  Multiple rows = AND logic; use separate processes for OR scenarios.

  Columns:
  - approval_condition_id (uuid PK)
  - approval_process_id (FK)
  - condition_type  — 'product' | 'lob' | 'amount_gte' | 'amount_lte'
                      | 'business_unit' | 'stage' | 'field_value' | 'always'
  - field_name      — for 'field_value' type: the record field to check
  - operator        — 'eq' | 'neq' | 'gte' | 'lte' | 'contains' | 'in'
  - value_text      — scalar text value or JSON array for 'in'
  - value_number    — numeric threshold (for amount_gte / amount_lte)
  - ref_id          — UUID reference for product_id, lob_id, business_unit_id, stage_id
  - display_order

  ### 3. approval_step
  One step in the approval sequence/parallel set.
  Each step is assigned to a user, role, or team.

  Columns:
  - approval_step_id (uuid PK)
  - approval_process_id (FK)
  - step_name               — e.g. "Compliance Review", "Operations Sign-off"
  - description
  - display_order           — controls sequence for sequential mode
  - approver_type           — 'user' | 'role' | 'team' | 'manager' | 'record_owner'
  - approver_user_id        — uuid FK (nullable) → crm_user
  - approver_role_id        — uuid FK (nullable) → security_role
  - approver_team_id        — uuid FK (nullable) → team
  - approval_action         — 'approve' | 'reject' | 'delegate' | 'reassign'
    (Which actions this step's approver is allowed to take)
  - requires_comment        — boolean: must the approver leave a comment?
  - escalation_after_hours  — nullable int: auto-escalate after N hours
  - escalation_to_user_id   — nullable uuid: who to escalate to
  - is_active

  ## Security
  - RLS enabled on all three tables
  - Authenticated users can read; insert/update/delete require authentication

  ## Seed
  Three system approval processes covering common enterprise approval patterns.
*/

-- ─── approval_process ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_process (
  approval_process_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  description           text NOT NULL DEFAULT '',
  entity_logical_name   text NOT NULL DEFAULT 'opportunity',
  step_execution_mode   text NOT NULL DEFAULT 'sequential'
                          CHECK (step_execution_mode IN ('sequential', 'parallel')),
  is_active             boolean NOT NULL DEFAULT true,
  is_system             boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  modified_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

ALTER TABLE approval_process ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read approval processes"
  ON approval_process FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated users can insert approval processes"
  ON approval_process FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update approval processes"
  ON approval_process FOR UPDATE TO authenticated
  USING (deleted_at IS NULL) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete approval processes"
  ON approval_process FOR DELETE TO authenticated
  USING (is_system = false);

CREATE INDEX IF NOT EXISTS idx_approval_process_entity
  ON approval_process(entity_logical_name) WHERE deleted_at IS NULL;

-- ─── approval_condition ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_condition (
  approval_condition_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_process_id    uuid NOT NULL
    REFERENCES approval_process(approval_process_id) ON DELETE CASCADE,
  condition_type         text NOT NULL
    CHECK (condition_type IN (
      'always', 'product', 'lob', 'amount_gte', 'amount_lte',
      'business_unit', 'stage', 'field_value'
    )),
  field_name             text,
  operator               text NOT NULL DEFAULT 'eq'
    CHECK (operator IN ('eq', 'neq', 'gte', 'lte', 'contains', 'in')),
  value_text             text,
  value_number           numeric,
  ref_id                 uuid,
  display_order          int NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE approval_condition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read approval conditions"
  ON approval_condition FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert approval conditions"
  ON approval_condition FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update approval conditions"
  ON approval_condition FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete approval conditions"
  ON approval_condition FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_approval_condition_process
  ON approval_condition(approval_process_id);

-- ─── approval_step ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_step (
  approval_step_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_process_id     uuid NOT NULL
    REFERENCES approval_process(approval_process_id) ON DELETE CASCADE,
  step_name               text NOT NULL,
  description             text NOT NULL DEFAULT '',
  display_order           int NOT NULL DEFAULT 0,
  approver_type           text NOT NULL DEFAULT 'role'
    CHECK (approver_type IN ('user', 'role', 'team', 'manager', 'record_owner')),
  approver_user_id        uuid,
  approver_role_id        uuid,
  approver_team_id        uuid,
  allowed_actions         text[] NOT NULL DEFAULT ARRAY['approve','reject'],
  requires_comment        boolean NOT NULL DEFAULT false,
  escalation_after_hours  int,
  escalation_to_user_id   uuid,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  modified_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE approval_step ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read approval steps"
  ON approval_step FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert approval steps"
  ON approval_step FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update approval steps"
  ON approval_step FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete approval steps"
  ON approval_step FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_approval_step_process
  ON approval_step(approval_process_id, display_order);

-- ─── Seed: Three system approval processes ────────────────────────────────────

DO $$
DECLARE
  v_compliance_id  uuid;
  v_high_value_id  uuid;
  v_technical_id   uuid;
BEGIN

  -- 1. Compliance & Operations (sequential, always applies to opportunities)
  INSERT INTO approval_process (name, description, entity_logical_name, step_execution_mode, is_active, is_system)
  VALUES (
    'Compliance & Operations Review',
    'Standard sequential review for all opportunities. Compliance reviews first, then Operations signs off.',
    'opportunity', 'sequential', true, true
  ) RETURNING approval_process_id INTO v_compliance_id;

  INSERT INTO approval_condition (approval_process_id, condition_type, display_order)
  VALUES (v_compliance_id, 'always', 1);

  INSERT INTO approval_step (approval_process_id, step_name, description, display_order, approver_type, allowed_actions, requires_comment)
  VALUES
    (v_compliance_id, 'Compliance Review',  'Legal and regulatory compliance check',    1, 'role', ARRAY['approve','reject','delegate'], true),
    (v_compliance_id, 'Operations Sign-off','Operational feasibility and capacity check',2, 'role', ARRAY['approve','reject'],            false);


  -- 2. High-Value Deal Approval (sequential, triggered by amount >= 100,000)
  INSERT INTO approval_process (name, description, entity_logical_name, step_execution_mode, is_active, is_system)
  VALUES (
    'High-Value Deal Approval',
    'Sequential approval chain for deals above £100,000. Requires Manager, then VP approval.',
    'opportunity', 'sequential', true, true
  ) RETURNING approval_process_id INTO v_high_value_id;

  INSERT INTO approval_condition (approval_process_id, condition_type, operator, value_number, display_order)
  VALUES (v_high_value_id, 'amount_gte', 'gte', 100000, 1);

  INSERT INTO approval_step (approval_process_id, step_name, description, display_order, approver_type, allowed_actions, requires_comment, escalation_after_hours)
  VALUES
    (v_high_value_id, 'Line Manager Approval', 'Direct line manager review and approval', 1, 'manager',      ARRAY['approve','reject','delegate'], true,  48),
    (v_high_value_id, 'VP / Director Approval','Senior leadership sign-off required',     2, 'role',         ARRAY['approve','reject'],            true,  72),
    (v_high_value_id, 'Settlement Review',     'Finance and settlement terms verification',3, 'role',        ARRAY['approve','reject'],            false, null);


  -- 3. Technical & QA Review (parallel, product-agnostic but system-seeded)
  INSERT INTO approval_process (name, description, entity_logical_name, step_execution_mode, is_active, is_system)
  VALUES (
    'Technical & QA Review',
    'Parallel review by Technical and QA teams simultaneously. Both must approve before the deal progresses.',
    'opportunity', 'parallel', true, true
  ) RETURNING approval_process_id INTO v_technical_id;

  INSERT INTO approval_condition (approval_process_id, condition_type, display_order)
  VALUES (v_technical_id, 'always', 1);

  INSERT INTO approval_step (approval_process_id, step_name, description, display_order, approver_type, allowed_actions, requires_comment)
  VALUES
    (v_technical_id, 'Technical Review', 'Engineering and technical architecture assessment', 1, 'role', ARRAY['approve','reject','delegate'], true),
    (v_technical_id, 'QA Review',        'Quality assurance and acceptance criteria check',  2, 'role', ARRAY['approve','reject'],            true);

END $$;
