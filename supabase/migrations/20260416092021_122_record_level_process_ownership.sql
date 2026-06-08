/*
  # Record-Level Process Flow Ownership (Dynamics 365-style)

  ## Summary
  Shifts process flow assignment from "system picks a flow globally" to
  "each record owns its process flow and active stage", matching Dynamics 365 BPF behavior.

  ## Changes

  ### 1. entity_definition
  - `default_process_flow_id` (uuid, nullable FK → process_flow): the flow auto-assigned to new records
  - `allow_manual_flow_switch` (boolean, default true): whether users can manually switch flows

  ### 2. opportunity
  - `active_process_flow_id` (uuid, nullable FK → process_flow): the flow this record is currently on
  - `active_process_stage_id` (uuid, nullable FK → process_stage): the current stage in that flow

  ### 3. lead
  - `active_process_flow_id` (uuid, nullable FK → process_flow)
  - `active_process_stage_id` (uuid, nullable FK → process_stage)

  ### 4. ticket
  - `active_process_flow_id` (uuid, nullable FK → process_flow)
  - `active_process_stage_id` (uuid, nullable FK → process_stage)

  ## Security
  - No new tables — RLS inherited from existing entity tables
  - FK indexes added for performance

  ## Notes
  - Existing records default to NULL; the engine falls back gracefully to entity default flow
  - `default_process_flow_id` on entity_definition seeds new records automatically
*/

-- 1. entity_definition: add default flow + allow switch flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definition' AND column_name = 'default_process_flow_id'
  ) THEN
    ALTER TABLE entity_definition
      ADD COLUMN default_process_flow_id uuid REFERENCES process_flow(process_flow_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definition' AND column_name = 'allow_manual_flow_switch'
  ) THEN
    ALTER TABLE entity_definition
      ADD COLUMN allow_manual_flow_switch boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- 2. opportunity: record-level process ownership
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunity' AND column_name = 'active_process_flow_id'
  ) THEN
    ALTER TABLE opportunity
      ADD COLUMN active_process_flow_id uuid REFERENCES process_flow(process_flow_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunity' AND column_name = 'active_process_stage_id'
  ) THEN
    ALTER TABLE opportunity
      ADD COLUMN active_process_stage_id uuid REFERENCES process_stage(process_stage_id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. lead: record-level process ownership
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'active_process_flow_id'
  ) THEN
    ALTER TABLE lead
      ADD COLUMN active_process_flow_id uuid REFERENCES process_flow(process_flow_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'active_process_stage_id'
  ) THEN
    ALTER TABLE lead
      ADD COLUMN active_process_stage_id uuid REFERENCES process_stage(process_stage_id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. ticket: record-level process ownership
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket' AND column_name = 'active_process_flow_id'
  ) THEN
    ALTER TABLE ticket
      ADD COLUMN active_process_flow_id uuid REFERENCES process_flow(process_flow_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket' AND column_name = 'active_process_stage_id'
  ) THEN
    ALTER TABLE ticket
      ADD COLUMN active_process_stage_id uuid REFERENCES process_stage(process_stage_id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_opportunity_active_process_flow ON opportunity(active_process_flow_id) WHERE active_process_flow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunity_active_process_stage ON opportunity(active_process_stage_id) WHERE active_process_stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_active_process_flow ON lead(active_process_flow_id) WHERE active_process_flow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_active_process_stage ON lead(active_process_stage_id) WHERE active_process_stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_active_process_flow ON ticket(active_process_flow_id) WHERE active_process_flow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_active_process_stage ON ticket(active_process_stage_id) WHERE active_process_stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entity_def_default_flow ON entity_definition(default_process_flow_id) WHERE default_process_flow_id IS NOT NULL;

-- 6. Seed: set system flows as the default for their entities
UPDATE entity_definition ed
SET default_process_flow_id = (
  SELECT pf.process_flow_id FROM process_flow pf
  WHERE pf.entity_definition_id = ed.entity_definition_id
    AND pf.is_system = true
    AND pf.is_active = true
    AND pf.deleted_at IS NULL
  ORDER BY pf.created_at ASC
  LIMIT 1
)
WHERE ed.logical_name IN ('opportunity', 'lead', 'ticket')
  AND ed.default_process_flow_id IS NULL;
