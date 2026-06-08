/*
  # Business Process Flows

  ## Overview
  Adds a fully configurable Business Process Flow (Pipeline) system to the CRM platform.
  This defines the lifecycle structure of entities — separate from Workflows which automate actions.

  ## New Tables

  ### process_flow
  - The top-level pipeline definition
  - Columns: process_flow_id, name, description, entity_definition_id, line_of_business,
    product_line, stage_field, is_active, is_system, default_stage_id (deferred FK),
    created_at, created_by, modified_at, modified_by, deleted_at

  ### process_stage
  - Child stages belonging to a process flow
  - Columns: process_stage_id, process_flow_id (FK), name, description, stage_key,
    display_order, stage_color, stage_type, is_default, probability,
    entry_rules (jsonb), exit_rules (jsonb), allowed_transitions (text[])

  ### process_flow_transition
  - Explicit allowed transitions between stages
  - Columns: transition_id, process_flow_id, from_stage_id, to_stage_id,
    transition_name, requires_fields, created_at

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read; only is_system_admin() can write

  ## Seed Data
  - Lead Pipeline (new → contacted → qualified → converted | disqualified)
  - Opportunity Pipeline (qualify → develop → propose → close → won/lost)
  - Ticket Resolution Flow (active → in_progress → waiting → resolved → closed | cancelled)
*/

-- ─── process_flow ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS process_flow (
  process_flow_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  description         text NOT NULL DEFAULT '',
  entity_definition_id uuid NOT NULL REFERENCES entity_definition(entity_definition_id),
  line_of_business    text NOT NULL DEFAULT '',
  product_line        text NOT NULL DEFAULT '',
  stage_field         text NOT NULL DEFAULT 'status_code',
  is_active           boolean NOT NULL DEFAULT true,
  is_system           boolean NOT NULL DEFAULT false,
  default_stage_id    uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  modified_by         uuid REFERENCES auth.users(id),
  deleted_at          timestamptz
);

-- ─── process_stage ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS process_stage (
  process_stage_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_flow_id     uuid NOT NULL REFERENCES process_flow(process_flow_id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text NOT NULL DEFAULT '',
  stage_key           text NOT NULL,
  display_order       integer NOT NULL DEFAULT 0,
  stage_color         text NOT NULL DEFAULT '#3b82f6',
  stage_type          text NOT NULL DEFAULT 'active'
                        CHECK (stage_type IN ('active', 'terminal_success', 'terminal_failure', 'terminal_neutral')),
  is_default          boolean NOT NULL DEFAULT false,
  probability         integer CHECK (probability >= 0 AND probability <= 100),
  entry_rules         jsonb NOT NULL DEFAULT '[]'::jsonb,
  exit_rules          jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_transitions text[],
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_flow_id, stage_key)
);

-- ─── Deferred FK: process_flow.default_stage_id → process_stage ──────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_process_flow_default_stage'
      AND table_name = 'process_flow'
  ) THEN
    ALTER TABLE process_flow
      ADD CONSTRAINT fk_process_flow_default_stage
      FOREIGN KEY (default_stage_id)
      REFERENCES process_stage(process_stage_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- ─── process_flow_transition ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS process_flow_transition (
  transition_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_flow_id     uuid NOT NULL REFERENCES process_flow(process_flow_id) ON DELETE CASCADE,
  from_stage_id       uuid NOT NULL REFERENCES process_stage(process_stage_id) ON DELETE CASCADE,
  to_stage_id         uuid NOT NULL REFERENCES process_stage(process_stage_id) ON DELETE CASCADE,
  transition_name     text NOT NULL DEFAULT '',
  requires_fields     text[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_stage_id, to_stage_id)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_process_flow_entity        ON process_flow(entity_definition_id);
CREATE INDEX IF NOT EXISTS idx_process_flow_active        ON process_flow(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_stage_flow         ON process_stage(process_flow_id);
CREATE INDEX IF NOT EXISTS idx_process_stage_order        ON process_stage(process_flow_id, display_order);
CREATE INDEX IF NOT EXISTS idx_process_transition_flow    ON process_flow_transition(process_flow_id);
CREATE INDEX IF NOT EXISTS idx_process_transition_from    ON process_flow_transition(from_stage_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE process_flow           ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_stage          ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_flow_transition ENABLE ROW LEVEL SECURITY;

-- process_flow policies
CREATE POLICY "Authenticated users can read process flows"
  ON process_flow FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins can insert process flows"
  ON process_flow FOR INSERT
  TO authenticated
  WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can update process flows"
  ON process_flow FOR UPDATE
  TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can delete process flows"
  ON process_flow FOR DELETE
  TO authenticated
  USING (public.is_system_admin());

-- process_stage policies
CREATE POLICY "Authenticated users can read process stages"
  ON process_stage FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert process stages"
  ON process_stage FOR INSERT
  TO authenticated
  WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can update process stages"
  ON process_stage FOR UPDATE
  TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can delete process stages"
  ON process_stage FOR DELETE
  TO authenticated
  USING (public.is_system_admin());

-- process_flow_transition policies
CREATE POLICY "Authenticated users can read process transitions"
  ON process_flow_transition FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert process transitions"
  ON process_flow_transition FOR INSERT
  TO authenticated
  WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can update process transitions"
  ON process_flow_transition FOR UPDATE
  TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

CREATE POLICY "Admins can delete process transitions"
  ON process_flow_transition FOR DELETE
  TO authenticated
  USING (public.is_system_admin());

-- ─── Seed: Built-in process flows ────────────────────────────────────────────

DO $$
DECLARE
  v_lead_entity_id        uuid;
  v_opp_entity_id         uuid;
  v_ticket_entity_id      uuid;

  v_lead_flow_id          uuid;
  v_opp_flow_id           uuid;
  v_ticket_flow_id        uuid;

  v_s_new                 uuid;
  v_s_contacted           uuid;
  v_s_qualified           uuid;
  v_s_converted           uuid;
  v_s_disqualified        uuid;

  v_s_qualify             uuid;
  v_s_develop             uuid;
  v_s_propose             uuid;
  v_s_close               uuid;
  v_s_won                 uuid;
  v_s_lost                uuid;

  v_s_active              uuid;
  v_s_in_progress         uuid;
  v_s_waiting             uuid;
  v_s_resolved            uuid;
  v_s_closed_t            uuid;
  v_s_cancelled_t         uuid;
BEGIN
  SELECT entity_definition_id INTO v_lead_entity_id   FROM entity_definition WHERE logical_name = 'lead'        LIMIT 1;
  SELECT entity_definition_id INTO v_opp_entity_id    FROM entity_definition WHERE logical_name = 'opportunity' LIMIT 1;
  SELECT entity_definition_id INTO v_ticket_entity_id FROM entity_definition WHERE logical_name = 'ticket'      LIMIT 1;

  -- ── Lead Pipeline ──────────────────────────────────────────────────────────
  IF v_lead_entity_id IS NOT NULL THEN
    INSERT INTO process_flow (name, description, entity_definition_id, stage_field, is_active, is_system)
    VALUES ('Lead Pipeline', 'Standard lead qualification and conversion flow', v_lead_entity_id, 'status_code', true, true)
    RETURNING process_flow_id INTO v_lead_flow_id;

    INSERT INTO process_stage (process_flow_id, name, description, stage_key, display_order, stage_color, stage_type, is_default)
    VALUES
      (v_lead_flow_id, 'New',          'Freshly created lead',                       'new',         0, '#6b7280', 'active',           true),
      (v_lead_flow_id, 'Contacted',    'Initial contact made with lead',              'contacted',   1, '#3b82f6', 'active',           false),
      (v_lead_flow_id, 'Qualified',    'Lead meets qualification criteria',           'qualified',   2, '#f59e0b', 'active',           false),
      (v_lead_flow_id, 'Converted',    'Lead successfully converted to opportunity',  'converted',   3, '#10b981', 'terminal_success', false),
      (v_lead_flow_id, 'Disqualified', 'Lead does not meet criteria',                 'disqualified',4, '#ef4444', 'terminal_failure', false);

    SELECT process_stage_id INTO v_s_new          FROM process_stage WHERE process_flow_id = v_lead_flow_id AND stage_key = 'new';
    SELECT process_stage_id INTO v_s_contacted    FROM process_stage WHERE process_flow_id = v_lead_flow_id AND stage_key = 'contacted';
    SELECT process_stage_id INTO v_s_qualified    FROM process_stage WHERE process_flow_id = v_lead_flow_id AND stage_key = 'qualified';
    SELECT process_stage_id INTO v_s_converted    FROM process_stage WHERE process_flow_id = v_lead_flow_id AND stage_key = 'converted';
    SELECT process_stage_id INTO v_s_disqualified FROM process_stage WHERE process_flow_id = v_lead_flow_id AND stage_key = 'disqualified';

    UPDATE process_flow SET default_stage_id = v_s_new WHERE process_flow_id = v_lead_flow_id;

    INSERT INTO process_flow_transition (process_flow_id, from_stage_id, to_stage_id, transition_name)
    VALUES
      (v_lead_flow_id, v_s_new,       v_s_contacted,    'Make Contact'),
      (v_lead_flow_id, v_s_contacted, v_s_qualified,    'Qualify Lead'),
      (v_lead_flow_id, v_s_qualified, v_s_converted,    'Convert Lead'),
      (v_lead_flow_id, v_s_new,       v_s_disqualified, 'Disqualify'),
      (v_lead_flow_id, v_s_contacted, v_s_disqualified, 'Disqualify'),
      (v_lead_flow_id, v_s_qualified, v_s_disqualified, 'Disqualify');
  END IF;

  -- ── Opportunity Pipeline ───────────────────────────────────────────────────
  IF v_opp_entity_id IS NOT NULL THEN
    INSERT INTO process_flow (name, description, entity_definition_id, stage_field, is_active, is_system)
    VALUES ('Opportunity Pipeline', 'Standard opportunity sales cycle', v_opp_entity_id, 'stage', true, true)
    RETURNING process_flow_id INTO v_opp_flow_id;

    INSERT INTO process_stage (process_flow_id, name, description, stage_key, display_order, stage_color, stage_type, is_default, probability)
    VALUES
      (v_opp_flow_id, 'Qualify',  'Determine if opportunity is viable',        'qualify', 0, '#6b7280', 'active',           true,  10),
      (v_opp_flow_id, 'Develop',  'Build solution and establish value',         'develop', 1, '#3b82f6', 'active',           false, 30),
      (v_opp_flow_id, 'Propose',  'Present formal proposal to customer',        'propose', 2, '#f59e0b', 'active',           false, 60),
      (v_opp_flow_id, 'Close',    'Final negotiations and contract signing',    'close',   3, '#0ea5e9', 'active',           false, 80),
      (v_opp_flow_id, 'Won',      'Opportunity successfully closed as won',     'won',     4, '#10b981', 'terminal_success', false, 100),
      (v_opp_flow_id, 'Lost',     'Opportunity closed without winning',         'lost',    5, '#ef4444', 'terminal_failure', false, 0);

    SELECT process_stage_id INTO v_s_qualify FROM process_stage WHERE process_flow_id = v_opp_flow_id AND stage_key = 'qualify';
    SELECT process_stage_id INTO v_s_develop FROM process_stage WHERE process_flow_id = v_opp_flow_id AND stage_key = 'develop';
    SELECT process_stage_id INTO v_s_propose FROM process_stage WHERE process_flow_id = v_opp_flow_id AND stage_key = 'propose';
    SELECT process_stage_id INTO v_s_close   FROM process_stage WHERE process_flow_id = v_opp_flow_id AND stage_key = 'close';
    SELECT process_stage_id INTO v_s_won     FROM process_stage WHERE process_flow_id = v_opp_flow_id AND stage_key = 'won';
    SELECT process_stage_id INTO v_s_lost    FROM process_stage WHERE process_flow_id = v_opp_flow_id AND stage_key = 'lost';

    UPDATE process_flow SET default_stage_id = v_s_qualify WHERE process_flow_id = v_opp_flow_id;

    INSERT INTO process_flow_transition (process_flow_id, from_stage_id, to_stage_id, transition_name)
    VALUES
      (v_opp_flow_id, v_s_qualify, v_s_develop, 'Move to Develop'),
      (v_opp_flow_id, v_s_develop, v_s_propose, 'Move to Propose'),
      (v_opp_flow_id, v_s_propose, v_s_close,   'Move to Close'),
      (v_opp_flow_id, v_s_close,   v_s_won,     'Mark as Won'),
      (v_opp_flow_id, v_s_close,   v_s_lost,    'Mark as Lost'),
      (v_opp_flow_id, v_s_qualify, v_s_lost,    'Disqualify'),
      (v_opp_flow_id, v_s_develop, v_s_lost,    'Mark as Lost'),
      (v_opp_flow_id, v_s_propose, v_s_lost,    'Mark as Lost');
  END IF;

  -- ── Ticket Pipeline ────────────────────────────────────────────────────────
  IF v_ticket_entity_id IS NOT NULL THEN
    INSERT INTO process_flow (name, description, entity_definition_id, stage_field, is_active, is_system)
    VALUES ('Ticket Resolution Flow', 'Standard customer support ticket lifecycle', v_ticket_entity_id, 'status_code', true, true)
    RETURNING process_flow_id INTO v_ticket_flow_id;

    INSERT INTO process_stage (process_flow_id, name, description, stage_key, display_order, stage_color, stage_type, is_default)
    VALUES
      (v_ticket_flow_id, 'Active',      'Ticket created and awaiting assignment',   'active',      0, '#3b82f6', 'active',           true),
      (v_ticket_flow_id, 'In Progress', 'Agent is actively working on the ticket',  'in_progress', 1, '#f59e0b', 'active',           false),
      (v_ticket_flow_id, 'Waiting',     'Waiting for customer or third party',       'waiting',     2, '#0ea5e9', 'active',           false),
      (v_ticket_flow_id, 'Resolved',    'Issue has been resolved',                   'resolved',    3, '#10b981', 'active',           false),
      (v_ticket_flow_id, 'Closed',      'Ticket closed after resolution confirmed',  'closed',      4, '#6b7280', 'terminal_success', false),
      (v_ticket_flow_id, 'Cancelled',   'Ticket cancelled without resolution',       'cancelled',   5, '#ef4444', 'terminal_neutral', false);

    SELECT process_stage_id INTO v_s_active      FROM process_stage WHERE process_flow_id = v_ticket_flow_id AND stage_key = 'active';
    SELECT process_stage_id INTO v_s_in_progress FROM process_stage WHERE process_flow_id = v_ticket_flow_id AND stage_key = 'in_progress';
    SELECT process_stage_id INTO v_s_waiting     FROM process_stage WHERE process_flow_id = v_ticket_flow_id AND stage_key = 'waiting';
    SELECT process_stage_id INTO v_s_resolved    FROM process_stage WHERE process_flow_id = v_ticket_flow_id AND stage_key = 'resolved';
    SELECT process_stage_id INTO v_s_closed_t    FROM process_stage WHERE process_flow_id = v_ticket_flow_id AND stage_key = 'closed';
    SELECT process_stage_id INTO v_s_cancelled_t FROM process_stage WHERE process_flow_id = v_ticket_flow_id AND stage_key = 'cancelled';

    UPDATE process_flow SET default_stage_id = v_s_active WHERE process_flow_id = v_ticket_flow_id;

    INSERT INTO process_flow_transition (process_flow_id, from_stage_id, to_stage_id, transition_name)
    VALUES
      (v_ticket_flow_id, v_s_active,      v_s_in_progress, 'Start Work'),
      (v_ticket_flow_id, v_s_in_progress, v_s_waiting,     'Waiting on Customer'),
      (v_ticket_flow_id, v_s_waiting,     v_s_in_progress, 'Resume Work'),
      (v_ticket_flow_id, v_s_in_progress, v_s_resolved,    'Mark Resolved'),
      (v_ticket_flow_id, v_s_resolved,    v_s_closed_t,    'Close Ticket'),
      (v_ticket_flow_id, v_s_resolved,    v_s_in_progress, 'Reopen'),
      (v_ticket_flow_id, v_s_active,      v_s_cancelled_t, 'Cancel'),
      (v_ticket_flow_id, v_s_in_progress, v_s_cancelled_t, 'Cancel'),
      (v_ticket_flow_id, v_s_waiting,     v_s_cancelled_t, 'Cancel');
  END IF;
END $$;
