/*
  # Add stage_visible_fields and gate_fields to process_stage

  ## Summary
  This migration extends `process_stage` to store the field-visibility rules and 
  gate (required-field) rules that were previously hardcoded in TypeScript. This 
  makes the process flow configuration the single source of truth for:

  1. **stage_visible_fields** — JSONB array of field visibility specs per stage.
     Each entry: { field: string, visible_from_this_stage: boolean }
     Meaning: when a record is in THIS stage, which fields become visible that 
     were hidden in earlier stages.

  2. **gate_required_fields** — JSONB array of field logical names that must be 
     filled before a record can advance INTO this stage.

  ## Changes
  - `process_stage.stage_visible_fields` (JSONB, default [])
    Array of { field: string } objects — fields that become visible starting from this stage.
  - `process_stage.gate_required_fields` (JSONB, default [])
    Array of { field: string, label: string } — fields required to enter this stage.
  - `process_stage.gate_conditions` (JSONB, default [])
    Array of { field: string, label: string, operator: string, value: any, message: string }
    — additional conditions that must hold to enter this stage.

  ## Notes
  - All columns default to empty arrays so existing rows are unaffected.
  - The seeded system stages (leads, opportunities, tickets) will be updated with 
    the data that was previously hardcoded in stageValidationService.ts.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'stage_visible_fields'
  ) THEN
    ALTER TABLE process_stage ADD COLUMN stage_visible_fields JSONB NOT NULL DEFAULT '[]';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'gate_required_fields'
  ) THEN
    ALTER TABLE process_stage ADD COLUMN gate_required_fields JSONB NOT NULL DEFAULT '[]';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'process_stage' AND column_name = 'gate_conditions'
  ) THEN
    ALTER TABLE process_stage ADD COLUMN gate_conditions JSONB NOT NULL DEFAULT '[]';
  END IF;
END $$;

-- ─── Seed Lead pipeline stages with the hardcoded data ───────────────────────

UPDATE process_stage
SET
  stage_visible_fields = '[]'::jsonb,
  gate_required_fields = '[]'::jsonb,
  gate_conditions      = '[]'::jsonb
WHERE stage_key = 'new'
  AND process_flow_id IN (
    SELECT process_flow_id FROM process_flow WHERE entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'lead' LIMIT 1
    )
  );

UPDATE process_stage
SET
  stage_visible_fields = '[
    {"field":"company_name"},
    {"field":"job_title"},
    {"field":"phone"},
    {"field":"lead_source"}
  ]'::jsonb,
  gate_required_fields = '[
    {"field":"full_name","label":"Full Name"},
    {"field":"email","label":"Email"}
  ]'::jsonb,
  gate_conditions = '[]'::jsonb
WHERE stage_key = 'contacted'
  AND process_flow_id IN (
    SELECT process_flow_id FROM process_flow WHERE entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'lead' LIMIT 1
    )
  );

UPDATE process_stage
SET
  stage_visible_fields = '[
    {"field":"annual_revenue"},
    {"field":"number_of_employees"},
    {"field":"rating"},
    {"field":"campaign_id"}
  ]'::jsonb,
  gate_required_fields = '[
    {"field":"full_name","label":"Full Name"},
    {"field":"email","label":"Email"},
    {"field":"company_name","label":"Company"}
  ]'::jsonb,
  gate_conditions = '[]'::jsonb
WHERE stage_key = 'qualified'
  AND process_flow_id IN (
    SELECT process_flow_id FROM process_flow WHERE entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'lead' LIMIT 1
    )
  );

UPDATE process_stage
SET
  stage_visible_fields = '[]'::jsonb,
  gate_required_fields = '[
    {"field":"full_name","label":"Full Name"},
    {"field":"email","label":"Email"},
    {"field":"company_name","label":"Company"},
    {"field":"phone","label":"Phone"}
  ]'::jsonb,
  gate_conditions = '[
    {"field":"statuscode","label":"Lead Status","operator":"neq","value":"disqualified","message":"Lead must not be disqualified to convert"}
  ]'::jsonb
WHERE stage_key = 'converted'
  AND process_flow_id IN (
    SELECT process_flow_id FROM process_flow WHERE entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'lead' LIMIT 1
    )
  );

-- ─── Seed Opportunity pipeline stages ────────────────────────────────────────

UPDATE process_stage
SET
  stage_visible_fields = '[]'::jsonb,
  gate_required_fields = '[]'::jsonb,
  gate_conditions      = '[]'::jsonb
WHERE stage_key = 'qualify'
  AND process_flow_id IN (
    SELECT process_flow_id FROM process_flow WHERE entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'opportunity' LIMIT 1
    )
  );

UPDATE process_stage
SET
  stage_visible_fields = '[
    {"field":"probability"},
    {"field":"lead_source"},
    {"field":"campaign_id"}
  ]'::jsonb,
  gate_required_fields = '[
    {"field":"name","label":"Opportunity Name"},
    {"field":"estimated_value","label":"Estimated Value"}
  ]'::jsonb,
  gate_conditions = '[]'::jsonb
WHERE stage_key = 'develop'
  AND process_flow_id IN (
    SELECT process_flow_id FROM process_flow WHERE entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'opportunity' LIMIT 1
    )
  );

UPDATE process_stage
SET
  stage_visible_fields = '[
    {"field":"close_date"},
    {"field":"budget_amount"},
    {"field":"purchase_process"},
    {"field":"decision_maker"}
  ]'::jsonb,
  gate_required_fields = '[
    {"field":"name","label":"Opportunity Name"},
    {"field":"estimated_value","label":"Estimated Value"},
    {"field":"close_date","label":"Close Date"}
  ]'::jsonb,
  gate_conditions = '[]'::jsonb
WHERE stage_key = 'propose'
  AND process_flow_id IN (
    SELECT process_flow_id FROM process_flow WHERE entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'opportunity' LIMIT 1
    )
  );

UPDATE process_stage
SET
  stage_visible_fields = '[
    {"field":"competitor"},
    {"field":"final_notes"}
  ]'::jsonb,
  gate_required_fields = '[
    {"field":"name","label":"Opportunity Name"},
    {"field":"estimated_value","label":"Estimated Value"},
    {"field":"close_date","label":"Close Date"}
  ]'::jsonb,
  gate_conditions = '[
    {"field":"estimated_value","label":"Estimated Value","operator":"gt","value":0,"message":"Estimated value must be greater than 0"}
  ]'::jsonb
WHERE stage_key = 'close'
  AND process_flow_id IN (
    SELECT process_flow_id FROM process_flow WHERE entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'opportunity' LIMIT 1
    )
  );

-- ─── Seed Ticket pipeline stages ─────────────────────────────────────────────

UPDATE process_stage
SET
  stage_visible_fields = '[]'::jsonb,
  gate_required_fields = '[]'::jsonb,
  gate_conditions      = '[]'::jsonb
WHERE stage_key = 'active'
  AND process_flow_id IN (
    SELECT process_flow_id FROM process_flow WHERE entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'ticket' LIMIT 1
    )
  );

UPDATE process_stage
SET
  stage_visible_fields = '[
    {"field":"resolution"},
    {"field":"first_response_at"},
    {"field":"assigned_to"}
  ]'::jsonb,
  gate_required_fields = '[
    {"field":"title","label":"Title"},
    {"field":"description","label":"Description"}
  ]'::jsonb,
  gate_conditions = '[]'::jsonb
WHERE stage_key = 'in_progress'
  AND process_flow_id IN (
    SELECT process_flow_id FROM process_flow WHERE entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'ticket' LIMIT 1
    )
  );

UPDATE process_stage
SET
  stage_visible_fields = '[
    {"field":"customer_wait_reason"}
  ]'::jsonb,
  gate_required_fields = '[
    {"field":"title","label":"Title"},
    {"field":"description","label":"Description"}
  ]'::jsonb,
  gate_conditions = '[]'::jsonb
WHERE stage_key = 'waiting'
  AND process_flow_id IN (
    SELECT process_flow_id FROM process_flow WHERE entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'ticket' LIMIT 1
    )
  );

UPDATE process_stage
SET
  stage_visible_fields = '[
    {"field":"resolved_at"},
    {"field":"resolution_notes"},
    {"field":"csat_score"}
  ]'::jsonb,
  gate_required_fields = '[
    {"field":"title","label":"Title"},
    {"field":"description","label":"Description"}
  ]'::jsonb,
  gate_conditions = '[]'::jsonb
WHERE stage_key = 'resolved'
  AND process_flow_id IN (
    SELECT process_flow_id FROM process_flow WHERE entity_definition_id = (
      SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'ticket' LIMIT 1
    )
  );
