/*
  # MontyPay Opportunity Flow 2: Point of Sale

  ## Summary
  Creates the MontyPay Point of Sale Opportunity Process Flow.
  POS has a simpler flow than Payment Gateway — no Develop stage
  (commercial terms are simpler), goes directly from Qualify to Approval.

  ## Process Flow: "MontyPay POS Flow"
  - Entity: opportunity
  - Stage field: stage
  - lob_id: MontyPay LOB
  - product_id: MontyPay Point of Sale

  ## Stages (in order)

  1. Qualify (default, category: qualification)
     - Gate: none
     - Visible: standard opportunity fields + setup/monthly fee basics

  2. Approval Stage (category: approval, SLA: 48h warning: 24h)
     - Gate required: technical_status, technical_approved_by, technical_approved_on,
       compliance_status, compliance_approved_by, compliance_approved_on,
       operation_status, operations_approved_by, operations_approved_on
     - (No settlement approval for POS)
     - Visible: all approval status fields

  3. Agreement Stage (category: agreement, SLA: 96h warning: 48h)
     - Gate required: agreement_sent_to_merchant, signed, ok_to_proceed
     - Visible: agreement checklist

  4. Go Live (terminal_success, category: post_sale)
     - Gate: none
     - Visible: training_completed, uploaded_and_live

  ## Transitions
  Linear: qualify→approval→agreement→go_live
*/

DO $$
DECLARE
  v_eid_opp     uuid;
  v_lob_id      uuid;
  v_pos_id      uuid;
  v_flow_id     uuid;

  v_s_qualify   uuid;
  v_s_approval  uuid;
  v_s_agreement uuid;
  v_s_golive    uuid;
BEGIN

  SELECT entity_definition_id INTO v_eid_opp FROM entity_definition WHERE logical_name = 'opportunity' LIMIT 1;
  SELECT lob_id     INTO v_lob_id FROM line_of_business WHERE code = 'MONTYPAY' LIMIT 1;
  SELECT product_id INTO v_pos_id FROM product WHERE code = 'MP-POS' LIMIT 1;

  -- ── Process flow ──────────────────────────────────────────────────────────

  INSERT INTO process_flow (
    name, description, entity_definition_id, lob_id, product_id,
    stage_field, is_active, is_system
  ) VALUES (
    'MontyPay POS Flow',
    'Opportunity flow for MontyPay Point of Sale product. Streamlined path from qualification through approval, agreement and go-live.',
    v_eid_opp, v_lob_id, v_pos_id,
    'stage', true, false
  )
  ON CONFLICT DO NOTHING
  RETURNING process_flow_id INTO v_flow_id;

  IF v_flow_id IS NULL THEN
    SELECT process_flow_id INTO v_flow_id FROM process_flow WHERE name = 'MontyPay POS Flow' LIMIT 1;
  END IF;

  -- ── Stages ────────────────────────────────────────────────────────────────

  INSERT INTO process_stage (process_flow_id, name, description, stage_key, display_order, stage_color, stage_type, stage_category, is_default, probability, sla_hours, warning_hours)
  VALUES
    (v_flow_id, 'Qualify',         'Verify merchant and confirm POS product selection.',            'qualify',   10, '#3b82f6', 'active',           'qualification', true,  10,  NULL, NULL),
    (v_flow_id, 'Approval Stage',  'Internal approval: Technical, Compliance, and Operations.',     'approval',  20, '#f97316', 'active',           'approval',      false, 50,  48,   24),
    (v_flow_id, 'Agreement Stage', 'Send, sign and confirm merchant agreement.',                    'agreement', 30, '#8b5cf6', 'active',           'agreement',     false, 80,  96,   48),
    (v_flow_id, 'Go Live',         'Merchant POS device is deployed and live.',                     'go_live',   40, '#10b981', 'terminal_success', 'post_sale',     false, 100, NULL, NULL)
  ON CONFLICT (process_flow_id, stage_key) DO NOTHING;

  SELECT process_stage_id INTO v_s_qualify   FROM process_stage WHERE process_flow_id = v_flow_id AND stage_key = 'qualify';
  SELECT process_stage_id INTO v_s_approval  FROM process_stage WHERE process_flow_id = v_flow_id AND stage_key = 'approval';
  SELECT process_stage_id INTO v_s_agreement FROM process_stage WHERE process_flow_id = v_flow_id AND stage_key = 'agreement';
  SELECT process_stage_id INTO v_s_golive    FROM process_stage WHERE process_flow_id = v_flow_id AND stage_key = 'go_live';

  UPDATE process_flow SET default_stage_id = v_s_qualify WHERE process_flow_id = v_flow_id;

  -- ── Transitions ───────────────────────────────────────────────────────────

  INSERT INTO process_flow_transition (process_flow_id, from_stage_id, to_stage_id, transition_name, requires_fields, allowed_role_ids, allowed_business_unit_ids, allowed_team_ids)
  VALUES
    (v_flow_id, v_s_qualify,  v_s_approval,  'Submit for Approval', ARRAY[]::text[], '{}', '{}', '{}'),
    (v_flow_id, v_s_approval, v_s_agreement, 'Start Agreement',
      ARRAY['technicalstatus','technicalapprovedby','technicalapprovedon',
            'compliancestatus','complianceapprovedby','complianceapprovedon',
            'operationstatus','operationsapprovedby','operationsapprovedon'],
      '{}', '{}', '{}'),
    (v_flow_id, v_s_agreement,v_s_golive,    'Go Live',
      ARRAY['agreementsenttomerchant','signed','oktoproceed'],
      '{}', '{}', '{}')
  ON CONFLICT (from_stage_id, to_stage_id) DO NOTHING;

  -- ── process_stage_fields ──────────────────────────────────────────────────

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_s_qualify, v_flow_id, 'name',              true, true,  false, 10),
    (v_s_qualify, v_flow_id, 'parentaccountid',   true, true,  false, 20),
    (v_s_qualify, v_flow_id, 'productid',         true, true,  true,  30),
    (v_s_qualify, v_flow_id, 'ownerid',           true, false, false, 40),
    (v_s_qualify, v_flow_id, 'estimatedclosedate',true, false, false, 50),
    (v_s_qualify, v_flow_id, 'setupfees',         true, false, false, 60),
    (v_s_qualify, v_flow_id, 'setupcurrencyid',   true, false, false, 70),
    (v_s_qualify, v_flow_id, 'monthlyfees',       true, false, false, 80),
    (v_s_qualify, v_flow_id, 'monthlycurrencyid', true, false, false, 90)
  ON CONFLICT (process_stage_id, field_logical_name) DO NOTHING;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_s_approval, v_flow_id, 'technicalstatus',      true, true,  false, 10),
    (v_s_approval, v_flow_id, 'technicalapprovedby',  true, true,  false, 20),
    (v_s_approval, v_flow_id, 'technicalapprovedon',  true, true,  false, 30),
    (v_s_approval, v_flow_id, 'compliancestatus',     true, true,  false, 40),
    (v_s_approval, v_flow_id, 'complianceapprovedby', true, true,  false, 50),
    (v_s_approval, v_flow_id, 'complianceapprovedon', true, true,  false, 60),
    (v_s_approval, v_flow_id, 'operationstatus',      true, true,  false, 70),
    (v_s_approval, v_flow_id, 'operationsapprovedby', true, true,  false, 80),
    (v_s_approval, v_flow_id, 'operationsapprovedon', true, true,  false, 90),
    (v_s_approval, v_flow_id, 'documentsreceived',    true, false, false, 100),
    (v_s_approval, v_flow_id, 'softcopyavailable',    true, false, false, 110)
  ON CONFLICT (process_stage_id, field_logical_name) DO NOTHING;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_s_agreement, v_flow_id, 'agreementsenttomerchant', true, true,  false, 10),
    (v_s_agreement, v_flow_id, 'signed',                  true, true,  false, 20),
    (v_s_agreement, v_flow_id, 'oktoproceed',             true, true,  false, 30),
    (v_s_agreement, v_flow_id, 'partneragreementsigned',  true, false, false, 40),
    (v_s_agreement, v_flow_id, 'integrationcompleted',    true, false, false, 50)
  ON CONFLICT (process_stage_id, field_logical_name) DO NOTHING;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_s_golive, v_flow_id, 'trainingcompleted', true, false, false, 10),
    (v_s_golive, v_flow_id, 'uploadedandlive',   true, false, false, 20)
  ON CONFLICT (process_stage_id, field_logical_name) DO NOTHING;

  -- ── JSONB gate fields (backwards compat) ─────────────────────────────────

  UPDATE process_stage SET gate_required_fields = '[]'::jsonb WHERE process_stage_id = v_s_qualify;

  UPDATE process_stage SET gate_required_fields = '[
    {"field":"technicalstatus","label":"Technical Status"},
    {"field":"technicalapprovedby","label":"Technical Approved By"},
    {"field":"technicalapprovedon","label":"Technical Approved On"},
    {"field":"compliancestatus","label":"Compliance Status"},
    {"field":"complianceapprovedby","label":"Compliance Approved By"},
    {"field":"complianceapprovedon","label":"Compliance Approved On"},
    {"field":"operationstatus","label":"Operation Status"},
    {"field":"operationsapprovedby","label":"Operations Approved By"},
    {"field":"operationsapprovedon","label":"Operations Approved On"}
  ]'::jsonb WHERE process_stage_id = v_s_approval;

  UPDATE process_stage SET gate_required_fields = '[
    {"field":"agreementsenttomerchant","label":"Agreement Sent to Merchant"},
    {"field":"signed","label":"Signed"},
    {"field":"oktoproceed","label":"OK to Proceed"}
  ]'::jsonb WHERE process_stage_id = v_s_agreement;

  UPDATE process_stage SET gate_required_fields = '[]'::jsonb WHERE process_stage_id = v_s_golive;

END $$;
