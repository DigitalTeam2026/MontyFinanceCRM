/*
  # MontyPay Opportunity Flow 1: Payment Gateway / SOFT POS

  ## Summary
  Creates the MontyPay Payment Gateway & SOFT POS Opportunity Process Flow.
  This flow is shared by both the Payment Gateway and SOFT POS products
  (assignment rules in migration 150 will route both products here).

  ## Process Flow: "MontyPay PG / SOFT POS Flow"
  - Entity: opportunity
  - Stage field: stage
  - lob_id: MontyPay LOB
  - product_id: MontyPay Payment Gateway (primary; SOFT POS routes here via assignment rule)

  ## Stages (in order)

  1. Qualify (default, category: qualification, SLA: none)
     - Gate: none
     - Visible: standard opportunity fields

  2. Develop (category: development, SLA: 72h warning: 48h)
     - Gate required: estimated_avg_transactions_per_month, estimated_average_volume,
       estimated_volume, setup_currency_id, setup_fees, setup_vat,
       monthly_currency_id, monthly_fees, monthly_vat,
       local_rate, international_rate, profit_margin,
       minimum_transaction_amount, maximum_transaction_amount,
       settlement_frequency, settlement_account
     - Visible: all commercial/rate fields

  3. Approval Stage (category: approval, SLA: 48h warning: 24h)
     - Gate required: technical_status, technical_approved_by, technical_approved_on,
       compliance_status, compliance_approved_by, compliance_approved_on,
       operation_status, operations_approved_by, operations_approved_on,
       settlement_status, settlement_approved_by, settlement_approved_on
     - Visible: all approval status + approver fields

  4. Agreement Stage (category: agreement, SLA: 96h warning: 48h)
     - Gate required: agreement_sent_to_merchant, signed,
       integration_completed, partner_agreement_signed, ok_to_proceed
     - Visible: agreement checklist booleans

  5. Quality Assurance (category: qa, SLA: 48h warning: 24h)
     - Gate: none (QA fields are informational)
     - Visible: qa_status, qa_approved_by, qa_approved_on, qa_check, test_integration

  6. Go Live (terminal_success, category: post_sale)
     - Gate: none
     - Visible: training_completed, uploaded_and_live

  ## Transitions
  Linear: qualify→develop→approval→agreement→qa→go_live

  ## Notes
  - All approval status fields use the approval_status option set.
  - product_locked is set to true by app logic when stage advances beyond qualify.
*/

DO $$
DECLARE
  v_eid_opp    uuid;
  v_lob_id     uuid;
  v_pg_id      uuid;
  v_flow_id    uuid;

  -- stage ids
  v_s_qualify  uuid;
  v_s_develop  uuid;
  v_s_approval uuid;
  v_s_agreement uuid;
  v_s_qa       uuid;
  v_s_golive   uuid;
BEGIN

  SELECT entity_definition_id INTO v_eid_opp FROM entity_definition WHERE logical_name = 'opportunity' LIMIT 1;
  SELECT lob_id  INTO v_lob_id FROM line_of_business WHERE code = 'MONTYPAY' LIMIT 1;
  SELECT product_id INTO v_pg_id FROM product WHERE code = 'MP-PG' LIMIT 1;

  -- ── Process flow ──────────────────────────────────────────────────────────

  INSERT INTO process_flow (
    name, description, entity_definition_id, lob_id, product_id,
    stage_field, is_active, is_system
  ) VALUES (
    'MontyPay PG / SOFT POS Flow',
    'Opportunity flow for MontyPay Payment Gateway and SOFT POS products. Covers commercial setup, multi-team approval, agreement, QA and go-live.',
    v_eid_opp, v_lob_id, v_pg_id,
    'stage', true, false
  )
  ON CONFLICT DO NOTHING
  RETURNING process_flow_id INTO v_flow_id;

  IF v_flow_id IS NULL THEN
    SELECT process_flow_id INTO v_flow_id FROM process_flow WHERE name = 'MontyPay PG / SOFT POS Flow' LIMIT 1;
  END IF;

  -- ── Stages ────────────────────────────────────────────────────────────────

  INSERT INTO process_stage (process_flow_id, name, description, stage_key, display_order, stage_color, stage_type, stage_category, is_default, probability, sla_hours, warning_hours)
  VALUES
    (v_flow_id, 'Qualify',          'Verify merchant details and confirm product selection.',               'qualify',   10, '#3b82f6', 'active',           'qualification', true,  10,  NULL, NULL),
    (v_flow_id, 'Develop',          'Define commercial terms: fees, rates, volumes, settlement details.',   'develop',   20, '#f59e0b', 'active',           'development',   false, 30,  72,   48),
    (v_flow_id, 'Approval Stage',   'Multi-team internal approval: Technical, Compliance, Ops, Settlement.','approval',  30, '#f97316', 'active',           'approval',      false, 60,  48,   24),
    (v_flow_id, 'Agreement Stage',  'Send, sign and confirm merchant agreement and integration.',           'agreement', 40, '#8b5cf6', 'active',           'agreement',     false, 80,  96,   48),
    (v_flow_id, 'Quality Assurance','QA testing and sign-off before go-live.',                             'qa',        50, '#06b6d4', 'active',           'qa',            false, 90,  48,   24),
    (v_flow_id, 'Go Live',          'Merchant is live on the MontyPay platform.',                          'go_live',   60, '#10b981', 'terminal_success', 'post_sale',     false, 100, NULL, NULL)
  ON CONFLICT (process_flow_id, stage_key) DO NOTHING;

  -- ── Resolve stage IDs ─────────────────────────────────────────────────────

  SELECT process_stage_id INTO v_s_qualify   FROM process_stage WHERE process_flow_id = v_flow_id AND stage_key = 'qualify';
  SELECT process_stage_id INTO v_s_develop   FROM process_stage WHERE process_flow_id = v_flow_id AND stage_key = 'develop';
  SELECT process_stage_id INTO v_s_approval  FROM process_stage WHERE process_flow_id = v_flow_id AND stage_key = 'approval';
  SELECT process_stage_id INTO v_s_agreement FROM process_stage WHERE process_flow_id = v_flow_id AND stage_key = 'agreement';
  SELECT process_stage_id INTO v_s_qa        FROM process_stage WHERE process_flow_id = v_flow_id AND stage_key = 'qa';
  SELECT process_stage_id INTO v_s_golive    FROM process_stage WHERE process_flow_id = v_flow_id AND stage_key = 'go_live';

  UPDATE process_flow SET default_stage_id = v_s_qualify WHERE process_flow_id = v_flow_id;

  -- ── Transitions ───────────────────────────────────────────────────────────

  INSERT INTO process_flow_transition (process_flow_id, from_stage_id, to_stage_id, transition_name, requires_fields, allowed_role_ids, allowed_business_unit_ids, allowed_team_ids)
  VALUES
    (v_flow_id, v_s_qualify,  v_s_develop,   'Start Development', ARRAY[]::text[], '{}', '{}', '{}'),
    (v_flow_id, v_s_develop,  v_s_approval,  'Submit for Approval',
      ARRAY['estimatedavgtxpermonth','estimatedaveragevolume','estimatedvolume',
            'setupcurrencyid','setupfees','monthlycurrencyid','monthlyfees',
            'localrate','internationalrate','profitmargin',
            'minimumtransactionamount','maximumtransactionamount',
            'settlementfrequency','settlementaccount'],
      '{}', '{}', '{}'),
    (v_flow_id, v_s_approval, v_s_agreement, 'Start Agreement',
      ARRAY['technicalstatus','technicalapprovedby','technicalapprovedon',
            'compliancestatus','complianceapprovedby','complianceapprovedon',
            'operationstatus','operationsapprovedby','operationsapprovedon',
            'settlementstatus','settlementapprovedby','settlementapprovedon'],
      '{}', '{}', '{}'),
    (v_flow_id, v_s_agreement,v_s_qa,        'Start QA',
      ARRAY['agreementsenttomerchant','signed','integrationcompleted','partneragreementsigned','oktoproceed'],
      '{}', '{}', '{}'),
    (v_flow_id, v_s_qa,       v_s_golive,    'Go Live', ARRAY[]::text[], '{}', '{}', '{}')
  ON CONFLICT (from_stage_id, to_stage_id) DO NOTHING;

  -- ── process_stage_fields ──────────────────────────────────────────────────

  -- Qualify: standard opp fields visible
  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_s_qualify, v_flow_id, 'name',               true, true,  false, 10),
    (v_s_qualify, v_flow_id, 'parentaccountid',     true, true,  false, 20),
    (v_s_qualify, v_flow_id, 'productid',           true, true,  true,  30),
    (v_s_qualify, v_flow_id, 'ownerid',             true, false, false, 40),
    (v_s_qualify, v_flow_id, 'estimatedclosedate',  true, false, false, 50),
    (v_s_qualify, v_flow_id, 'sendnote',            true, false, false, 60)
  ON CONFLICT (process_stage_id, field_logical_name) DO NOTHING;

  -- Develop: commercial and rate fields
  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_s_develop, v_flow_id, 'setupfees',                          true, true,  false, 10),
    (v_s_develop, v_flow_id, 'setupcurrencyid',                    true, true,  false, 20),
    (v_s_develop, v_flow_id, 'setupvat',                           true, false, false, 30),
    (v_s_develop, v_flow_id, 'monthlyfees',                        true, true,  false, 40),
    (v_s_develop, v_flow_id, 'monthlycurrencyid',                  true, true,  false, 50),
    (v_s_develop, v_flow_id, 'monthlyvat',                         true, false, false, 60),
    (v_s_develop, v_flow_id, 'localrate',                          true, true,  false, 70),
    (v_s_develop, v_flow_id, 'internationalrate',                   true, true,  false, 80),
    (v_s_develop, v_flow_id, 'profitmargin',                       true, true,  false, 90),
    (v_s_develop, v_flow_id, 'estimatedavgtxpermonth',             true, true,  false, 100),
    (v_s_develop, v_flow_id, 'estimatedaveragevolume',             true, true,  false, 110),
    (v_s_develop, v_flow_id, 'estimatedvolume',                    true, true,  false, 120),
    (v_s_develop, v_flow_id, 'processingrate',                     true, false, false, 130),
    (v_s_develop, v_flow_id, 'processingcurrencyid',               true, false, false, 140),
    (v_s_develop, v_flow_id, 'montypayestimatedrevenue',           true, false, false, 150),
    (v_s_develop, v_flow_id, 'minimumtransactionamount',           true, true,  false, 160),
    (v_s_develop, v_flow_id, 'maximumtransactionamount',           true, true,  false, 170),
    (v_s_develop, v_flow_id, 'ukcard',                             true, false, false, 180),
    (v_s_develop, v_flow_id, 'premiumlocal',                       true, false, false, 190),
    (v_s_develop, v_flow_id, 'internationalprocessing',            true, false, false, 200),
    (v_s_develop, v_flow_id, 'devbanktransfer',                    true, false, false, 210),
    (v_s_develop, v_flow_id, 'walletfee',                          true, false, false, 220),
    (v_s_develop, v_flow_id, 'devqris',                            true, false, false, 230),
    (v_s_develop, v_flow_id, 'settlementfrequency',                true, true,  false, 240),
    (v_s_develop, v_flow_id, 'settlementaccount',                  true, true,  false, 250),
    (v_s_develop, v_flow_id, 'settlementclient',                   true, false, false, 260),
    (v_s_develop, v_flow_id, 'settlementcontact',                  true, false, false, 270),
    (v_s_develop, v_flow_id, 'bankname',                           true, false, false, 280),
    (v_s_develop, v_flow_id, 'wallettype',                         true, false, false, 290),
    (v_s_develop, v_flow_id, 'sendquestionnairefile',              true, false, false, 300),
    (v_s_develop, v_flow_id, 'documentsreceived',                  true, false, false, 310)
  ON CONFLICT (process_stage_id, field_logical_name) DO NOTHING;

  -- Approval Stage: approval status fields
  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_s_approval, v_flow_id, 'technicalstatus',        true, true,  false, 10),
    (v_s_approval, v_flow_id, 'technicalapprovedby',    true, true,  false, 20),
    (v_s_approval, v_flow_id, 'technicalapprovedon',    true, true,  false, 30),
    (v_s_approval, v_flow_id, 'compliancestatus',       true, true,  false, 40),
    (v_s_approval, v_flow_id, 'complianceapprovedby',   true, true,  false, 50),
    (v_s_approval, v_flow_id, 'complianceapprovedon',   true, true,  false, 60),
    (v_s_approval, v_flow_id, 'operationstatus',        true, true,  false, 70),
    (v_s_approval, v_flow_id, 'operationsapprovedby',   true, true,  false, 80),
    (v_s_approval, v_flow_id, 'operationsapprovedon',   true, true,  false, 90),
    (v_s_approval, v_flow_id, 'settlementstatus',       true, true,  false, 100),
    (v_s_approval, v_flow_id, 'settlementapprovedby',   true, true,  false, 110),
    (v_s_approval, v_flow_id, 'settlementapprovedon',   true, true,  false, 120),
    (v_s_approval, v_flow_id, 'startagreementapproval', true, false, false, 130),
    (v_s_approval, v_flow_id, 'softcopyavailable',      true, false, false, 140)
  ON CONFLICT (process_stage_id, field_logical_name) DO NOTHING;

  -- Agreement Stage: agreement checklist
  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_s_agreement, v_flow_id, 'agreementsenttomerchant',       true, true,  false, 10),
    (v_s_agreement, v_flow_id, 'signed',                        true, true,  false, 20),
    (v_s_agreement, v_flow_id, 'integrationcompleted',          true, true,  false, 30),
    (v_s_agreement, v_flow_id, 'partneragreementsigned',        true, true,  false, 40),
    (v_s_agreement, v_flow_id, 'oktoproceed',                   true, true,  false, 50),
    (v_s_agreement, v_flow_id, 'technicalintegrationcompleted', true, false, false, 60)
  ON CONFLICT (process_stage_id, field_logical_name) DO NOTHING;

  -- QA Stage
  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_s_qa, v_flow_id, 'qastatus',       true, false, false, 10),
    (v_s_qa, v_flow_id, 'qaapprovedby',   true, false, false, 20),
    (v_s_qa, v_flow_id, 'qaapprovedon',   true, false, false, 30),
    (v_s_qa, v_flow_id, 'qacheck',        true, false, false, 40),
    (v_s_qa, v_flow_id, 'testintegration',true, false, false, 50)
  ON CONFLICT (process_stage_id, field_logical_name) DO NOTHING;

  -- Go Live
  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_s_golive, v_flow_id, 'trainingcompleted', true, false, false, 10),
    (v_s_golive, v_flow_id, 'uploadedandlive',   true, false, false, 20)
  ON CONFLICT (process_stage_id, field_logical_name) DO NOTHING;

  -- ── JSONB gate/visible fields (backwards compat) ──────────────────────────

  UPDATE process_stage SET
    gate_required_fields = '[]'::jsonb,
    stage_visible_fields = '[{"field":"name"},{"field":"parentaccountid"},{"field":"productid"},{"field":"ownerid"},{"field":"estimatedclosedate"},{"field":"sendnote"}]'::jsonb
  WHERE process_stage_id = v_s_qualify;

  UPDATE process_stage SET
    gate_required_fields = '[
      {"field":"estimatedavgtxpermonth","label":"Est. Avg. Transactions/Month"},
      {"field":"estimatedaveragevolume","label":"Est. Average Volume"},
      {"field":"estimatedvolume","label":"Est. Monthly Volume"},
      {"field":"setupcurrencyid","label":"Setup Currency"},
      {"field":"setupfees","label":"Setup Fees"},
      {"field":"monthlycurrencyid","label":"Monthly Currency"},
      {"field":"monthlyfees","label":"Monthly Fees"},
      {"field":"localrate","label":"Local Rate"},
      {"field":"internationalrate","label":"International Rate"},
      {"field":"profitmargin","label":"Profit Margin"},
      {"field":"minimumtransactionamount","label":"Min. Transaction Amount"},
      {"field":"maximumtransactionamount","label":"Max. Transaction Amount"},
      {"field":"settlementfrequency","label":"Settlement Frequency"},
      {"field":"settlementaccount","label":"Settlement Account"}
    ]'::jsonb
  WHERE process_stage_id = v_s_develop;

  UPDATE process_stage SET
    gate_required_fields = '[
      {"field":"technicalstatus","label":"Technical Status"},
      {"field":"technicalapprovedby","label":"Technical Approved By"},
      {"field":"technicalapprovedon","label":"Technical Approved On"},
      {"field":"compliancestatus","label":"Compliance Status"},
      {"field":"complianceapprovedby","label":"Compliance Approved By"},
      {"field":"complianceapprovedon","label":"Compliance Approved On"},
      {"field":"operationstatus","label":"Operation Status"},
      {"field":"operationsapprovedby","label":"Operations Approved By"},
      {"field":"operationsapprovedon","label":"Operations Approved On"},
      {"field":"settlementstatus","label":"Settlement Status"},
      {"field":"settlementapprovedby","label":"Settlement Approved By"},
      {"field":"settlementapprovedon","label":"Settlement Approved On"}
    ]'::jsonb
  WHERE process_stage_id = v_s_approval;

  UPDATE process_stage SET
    gate_required_fields = '[
      {"field":"agreementsenttomerchant","label":"Agreement Sent to Merchant"},
      {"field":"signed","label":"Signed"},
      {"field":"integrationcompleted","label":"Integration Completed"},
      {"field":"partneragreementsigned","label":"Partner Agreement Signed"},
      {"field":"oktoproceed","label":"OK to Proceed"}
    ]'::jsonb
  WHERE process_stage_id = v_s_agreement;

  UPDATE process_stage SET gate_required_fields = '[]'::jsonb WHERE process_stage_id IN (v_s_qa, v_s_golive);

END $$;
