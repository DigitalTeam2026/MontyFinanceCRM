/*
  # MontyPay Lead Qualify Flow

  ## Summary
  Creates the MontyPay Lead Business Process Flow. This is a single-stage flow
  that gates lead qualification on having a product selected, then auto-creates
  a linked Opportunity upon advancing to the terminal "Qualified" stage.

  ## Process Flow: "MontyPay Lead Flow"
  - Entity: lead
  - Stage field: bpf_stage (not status_code)
  - lob_id: MontyPay LOB
  - product_id: NULL (shared across all 4 MontyPay products at lead level)

  ## Stages
  1. Qualify (default, active, category: qualification, SLA: none)
     - Gate required fields: productid
     - Stage visible fields: productid, ownerid, firstname, lastname, companyname, emailaddress

  2. Qualified (terminal_success, category: closed)
     - Represents the completed lead; linked Opportunity has been created.

  ## Transitions
  - Qualify → Qualified

  ## Notes
  - Opportunity auto-creation is handled by leadQualificationEngine.ts
    which reads process_flow_id and bpf_stage to pick the target flow.
*/

DO $$
DECLARE
  v_eid_lead       uuid;
  v_lob_id         uuid;
  v_flow_id        uuid;
  v_s_qualify      uuid;
  v_s_qualified    uuid;
BEGIN

  SELECT entity_definition_id INTO v_eid_lead FROM entity_definition WHERE logical_name = 'lead' LIMIT 1;
  SELECT lob_id INTO v_lob_id FROM line_of_business WHERE code = 'MONTYPAY' LIMIT 1;

  -- ── Insert process flow ───────────────────────────────────────────────────

  INSERT INTO process_flow (
    name, description, entity_definition_id, lob_id, product_id,
    stage_field, is_active, is_system
  ) VALUES (
    'MontyPay Lead Flow',
    'Lead qualification flow for MontyPay products. Gates qualification on product selection and auto-creates a product-scoped Opportunity.',
    v_eid_lead,
    v_lob_id,
    NULL,
    'bpf_stage',
    true,
    false
  )
  ON CONFLICT DO NOTHING
  RETURNING process_flow_id INTO v_flow_id;

  IF v_flow_id IS NULL THEN
    SELECT process_flow_id INTO v_flow_id FROM process_flow WHERE name = 'MontyPay Lead Flow' LIMIT 1;
  END IF;

  -- ── Insert stages ─────────────────────────────────────────────────────────

  INSERT INTO process_stage (
    process_flow_id, name, description, stage_key, display_order,
    stage_color, stage_type, stage_category, is_default, probability,
    sla_hours, warning_hours
  ) VALUES (
    v_flow_id, 'Qualify', 'Initial qualification stage. Select product and verify merchant details.',
    'qualify', 10, '#3b82f6', 'active', 'qualification', true, 20,
    NULL, NULL
  ) ON CONFLICT (process_flow_id, stage_key) DO NOTHING;

  INSERT INTO process_stage (
    process_flow_id, name, description, stage_key, display_order,
    stage_color, stage_type, stage_category, is_default, probability
  ) VALUES (
    v_flow_id, 'Qualified', 'Lead has been qualified and a product-scoped Opportunity has been created.',
    'qualified', 20, '#10b981', 'terminal_success', 'closed', false, 100
  ) ON CONFLICT (process_flow_id, stage_key) DO NOTHING;

  -- ── Resolve stage IDs ─────────────────────────────────────────────────────

  SELECT process_stage_id INTO v_s_qualify   FROM process_stage WHERE process_flow_id = v_flow_id AND stage_key = 'qualify';
  SELECT process_stage_id INTO v_s_qualified FROM process_stage WHERE process_flow_id = v_flow_id AND stage_key = 'qualified';

  -- ── Set default stage ─────────────────────────────────────────────────────

  UPDATE process_flow SET default_stage_id = v_s_qualify WHERE process_flow_id = v_flow_id;

  -- ── Transition: Qualify → Qualified ──────────────────────────────────────

  INSERT INTO process_flow_transition (
    process_flow_id, from_stage_id, to_stage_id, transition_name,
    requires_fields, allowed_role_ids, allowed_business_unit_ids, allowed_team_ids
  ) VALUES (
    v_flow_id, v_s_qualify, v_s_qualified,
    'Qualify Lead',
    ARRAY['productid'],
    '{}', '{}', '{}'
  ) ON CONFLICT (from_stage_id, to_stage_id) DO NOTHING;

  -- ── process_stage_fields for Qualify stage ────────────────────────────────

  INSERT INTO process_stage_fields (
    process_stage_id, process_flow_id, field_logical_name,
    is_visible, is_required, is_readonly, display_order
  ) VALUES
    (v_s_qualify, v_flow_id, 'productid',    true, true,  false, 10),
    (v_s_qualify, v_flow_id, 'ownerid',      true, false, false, 20),
    (v_s_qualify, v_flow_id, 'firstname',    true, false, false, 30),
    (v_s_qualify, v_flow_id, 'lastname',     true, false, false, 40),
    (v_s_qualify, v_flow_id, 'companyname',  true, false, false, 50),
    (v_s_qualify, v_flow_id, 'emailaddress', true, false, false, 60)
  ON CONFLICT (process_stage_id, field_logical_name) DO NOTHING;

  -- gate_required_fields JSONB (backwards compat with stageValidationService)
  UPDATE process_stage
  SET
    gate_required_fields = '[{"field":"productid","label":"Product"}]'::jsonb,
    stage_visible_fields = '[{"field":"productid"},{"field":"ownerid"},{"field":"firstname"},{"field":"lastname"},{"field":"companyname"},{"field":"emailaddress"}]'::jsonb
  WHERE process_stage_id = v_s_qualify;

END $$;
