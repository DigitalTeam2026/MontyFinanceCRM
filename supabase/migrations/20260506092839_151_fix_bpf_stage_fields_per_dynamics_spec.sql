/*
  # Fix BPF Stage Fields to Match Dynamics Spec

  ## Summary
  Corrects all process_stage_fields rows across all four MontyPay flows to exactly
  match the field order and stage placement extracted from the original Dynamics BPF.
  This is a full replace (DELETE + INSERT) for each affected stage so the result
  is authoritative and idempotent.

  ## Changes per flow/stage

  ### Lead Flow — Qualify
  - Remove: ownerid, firstname, lastname, companyname, emailaddress
  - Add: owningbusinessunitid (first)
  - Keep: productid
  - Order: owningbusinessunitid → productid

  ### PG / SOFT POS — Develop
  - Add: sendnote (first, moved from Qualify where it was wrong)
  - Reorder entire stage to match Dynamics exactly:
    sendnote → estimatedavgtxpermonth → estimatedaveragevolume →
    setupcurrencyid → setupfees → setupvat →
    monthlycurrencyid → monthlyfees → monthlyvat →
    ukcard → localrate → premiumlocal → internationalrate →
    internationalprocessing → processingrate → processingcurrencyid →
    profitmargin → estimatedvolume → montypayestimatedrevenue →
    devbanktransfer → walletfee → devqris → wallettype →
    minimumtransactionamount → maximumtransactionamount →
    settlementfrequency → settlementaccount → settlementclient →
    settlementcontact → bankname
  - Remove: sendquestionnairefile, documentsreceived (belong in Approval)

  ### PG / SOFT POS — Approval
  - Add first: sendquestionnairefile, documentsreceived
  - Keep: technical×3, compliance×3, operation×3, settlement×4, startagreementapproval
  - Remove: softcopyavailable (belongs in Agreement)
  - Order matches Dynamics exactly

  ### PG / SOFT POS — Agreement
  - Add: softcopyavailable (position 3), testintegration (position 6)
  - Fix order: agreementsenttomerchant → signed → softcopyavailable →
    technicalintegrationcompleted → integrationcompleted → testintegration →
    partneragreementsigned → oktoproceed

  ### PG / SOFT POS — QA
  - Reorder: qacheck (first) → qastatus → qaapprovedby → qaapprovedon
  - Remove: testintegration (moved to Agreement)

  ### PG / SOFT POS — Qualify
  - Remove: sendnote (moved to Develop)

  ### Website Dev — Develop
  - Remove: monthlyfees, monthlycurrencyid, monthlyvat
  - Add: contentmanagement (last)
  - Order: commercialproposalshared → setupfees → monthlycost →
    setupcurrencyid → contentmanagement

  ### Website Dev — Technical
  - Add: websitetype (first), startagreementapproval (last)
  - Remove: testintegration (not in Dynamics spec for this stage)
  - Order: websitetype → technicalstatus → technicalapprovedby →
    technicalapprovedon → startagreementapproval

  ### Website Dev — Go Live
  - Remove: trainingcompleted (not in Dynamics spec for Website Dev)
  - Keep: uploadedandlive only

  ## Notes
  - All changes use DELETE + INSERT pattern within each stage for clean replacement.
  - Also updates gate_required_fields JSONB on affected stages for backwards compat.
  - owningbusinessunitid maps to the physical column owning_business_unit_id on lead.
*/

DO $$
DECLARE
  -- Lead flow
  v_lead_flow_id     uuid;
  v_lead_qualify     uuid;

  -- PG / SOFT POS flow
  v_pg_flow_id       uuid;
  v_pg_qualify       uuid;
  v_pg_develop       uuid;
  v_pg_approval      uuid;
  v_pg_agreement     uuid;
  v_pg_qa            uuid;
  v_pg_golive        uuid;

  -- Website Dev flow
  v_wd_flow_id       uuid;
  v_wd_develop       uuid;
  v_wd_technical     uuid;
  v_wd_golive        uuid;

BEGIN

  -- ── Resolve flow IDs ──────────────────────────────────────────────────────
  SELECT process_flow_id INTO v_lead_flow_id FROM process_flow WHERE name = 'MontyPay Lead Flow'                LIMIT 1;
  SELECT process_flow_id INTO v_pg_flow_id   FROM process_flow WHERE name = 'MontyPay PG / SOFT POS Flow'      LIMIT 1;
  SELECT process_flow_id INTO v_wd_flow_id   FROM process_flow WHERE name = 'MontyPay Website Development Flow' LIMIT 1;

  -- ── Resolve stage IDs ─────────────────────────────────────────────────────
  SELECT process_stage_id INTO v_lead_qualify  FROM process_stage WHERE process_flow_id = v_lead_flow_id AND stage_key = 'qualify';

  SELECT process_stage_id INTO v_pg_qualify    FROM process_stage WHERE process_flow_id = v_pg_flow_id AND stage_key = 'qualify';
  SELECT process_stage_id INTO v_pg_develop    FROM process_stage WHERE process_flow_id = v_pg_flow_id AND stage_key = 'develop';
  SELECT process_stage_id INTO v_pg_approval   FROM process_stage WHERE process_flow_id = v_pg_flow_id AND stage_key = 'approval';
  SELECT process_stage_id INTO v_pg_agreement  FROM process_stage WHERE process_flow_id = v_pg_flow_id AND stage_key = 'agreement';
  SELECT process_stage_id INTO v_pg_qa         FROM process_stage WHERE process_flow_id = v_pg_flow_id AND stage_key = 'qa';
  SELECT process_stage_id INTO v_pg_golive     FROM process_stage WHERE process_flow_id = v_pg_flow_id AND stage_key = 'go_live';

  SELECT process_stage_id INTO v_wd_develop    FROM process_stage WHERE process_flow_id = v_wd_flow_id AND stage_key = 'develop';
  SELECT process_stage_id INTO v_wd_technical  FROM process_stage WHERE process_flow_id = v_wd_flow_id AND stage_key = 'technical';
  SELECT process_stage_id INTO v_wd_golive     FROM process_stage WHERE process_flow_id = v_wd_flow_id AND stage_key = 'go_live';

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. LEAD FLOW — Qualify
  -- ══════════════════════════════════════════════════════════════════════════

  DELETE FROM process_stage_fields WHERE process_stage_id = v_lead_qualify;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_lead_qualify, v_lead_flow_id, 'owningbusinessunitid', true, false, false, 10),
    (v_lead_qualify, v_lead_flow_id, 'productid',            true, true,  false, 20);

  UPDATE process_stage SET
    gate_required_fields = '[{"field":"productid","label":"Product"}]'::jsonb,
    stage_visible_fields  = '[{"field":"owningbusinessunitid"},{"field":"productid"}]'::jsonb
  WHERE process_stage_id = v_lead_qualify;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. PG / SOFT POS — Qualify (remove sendnote which moves to Develop)
  -- ══════════════════════════════════════════════════════════════════════════

  DELETE FROM process_stage_fields WHERE process_stage_id = v_pg_qualify;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_pg_qualify, v_pg_flow_id, 'name',              true, true,  false, 10),
    (v_pg_qualify, v_pg_flow_id, 'parentaccountid',   true, true,  false, 20),
    (v_pg_qualify, v_pg_flow_id, 'productid',         true, true,  true,  30),
    (v_pg_qualify, v_pg_flow_id, 'ownerid',           true, false, false, 40),
    (v_pg_qualify, v_pg_flow_id, 'estimatedclosedate',true, false, false, 50);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. PG / SOFT POS — Develop (exact Dynamics order, sendnote first)
  -- ══════════════════════════════════════════════════════════════════════════

  DELETE FROM process_stage_fields WHERE process_stage_id = v_pg_develop;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_pg_develop, v_pg_flow_id, 'sendnote',                   true, false, false,  10),
    (v_pg_develop, v_pg_flow_id, 'estimatedavgtxpermonth',     true, false, false,  20),
    (v_pg_develop, v_pg_flow_id, 'estimatedaveragevolume',     true, false, false,  30),
    (v_pg_develop, v_pg_flow_id, 'setupcurrencyid',            true, false, false,  40),
    (v_pg_develop, v_pg_flow_id, 'setupfees',                  true, false, false,  50),
    (v_pg_develop, v_pg_flow_id, 'setupvat',                   true, false, false,  60),
    (v_pg_develop, v_pg_flow_id, 'monthlycurrencyid',          true, false, false,  70),
    (v_pg_develop, v_pg_flow_id, 'monthlyfees',                true, false, false,  80),
    (v_pg_develop, v_pg_flow_id, 'monthlyvat',                 true, false, false,  90),
    (v_pg_develop, v_pg_flow_id, 'ukcard',                     true, false, false, 100),
    (v_pg_develop, v_pg_flow_id, 'localrate',                  true, false, false, 110),
    (v_pg_develop, v_pg_flow_id, 'premiumlocal',               true, false, false, 120),
    (v_pg_develop, v_pg_flow_id, 'internationalrate',          true, false, false, 130),
    (v_pg_develop, v_pg_flow_id, 'internationalprocessing',    true, false, false, 140),
    (v_pg_develop, v_pg_flow_id, 'processingrate',             true, false, false, 150),
    (v_pg_develop, v_pg_flow_id, 'processingcurrencyid',       true, false, false, 160),
    (v_pg_develop, v_pg_flow_id, 'profitmargin',               true, false, false, 170),
    (v_pg_develop, v_pg_flow_id, 'estimatedvolume',            true, false, false, 180),
    (v_pg_develop, v_pg_flow_id, 'montypayestimatedrevenue',   true, false, false, 190),
    (v_pg_develop, v_pg_flow_id, 'devbanktransfer',            true, false, false, 200),
    (v_pg_develop, v_pg_flow_id, 'walletfee',                  true, false, false, 210),
    (v_pg_develop, v_pg_flow_id, 'devqris',                    true, false, false, 220),
    (v_pg_develop, v_pg_flow_id, 'wallettype',                 true, false, false, 230),
    (v_pg_develop, v_pg_flow_id, 'minimumtransactionamount',   true, false, false, 240),
    (v_pg_develop, v_pg_flow_id, 'maximumtransactionamount',   true, false, false, 250),
    (v_pg_develop, v_pg_flow_id, 'settlementfrequency',        true, false, false, 260),
    (v_pg_develop, v_pg_flow_id, 'settlementaccount',          true, false, false, 270),
    (v_pg_develop, v_pg_flow_id, 'settlementclient',           true, false, false, 280),
    (v_pg_develop, v_pg_flow_id, 'settlementcontact',          true, false, false, 290),
    (v_pg_develop, v_pg_flow_id, 'bankname',                   true, false, false, 300);

  -- gate: none required on develop (transition gate handled by transition.requires_fields)
  UPDATE process_stage SET gate_required_fields = '[]'::jsonb WHERE process_stage_id = v_pg_develop;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. PG / SOFT POS — Approval (sendquestionnaire + documentsreceived first)
  -- ══════════════════════════════════════════════════════════════════════════

  DELETE FROM process_stage_fields WHERE process_stage_id = v_pg_approval;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_pg_approval, v_pg_flow_id, 'sendquestionnairefile',  true, false, false,  10),
    (v_pg_approval, v_pg_flow_id, 'documentsreceived',      true, false, false,  20),
    (v_pg_approval, v_pg_flow_id, 'technicalstatus',        true, false, false,  30),
    (v_pg_approval, v_pg_flow_id, 'technicalapprovedby',    true, false, false,  40),
    (v_pg_approval, v_pg_flow_id, 'technicalapprovedon',    true, false, false,  50),
    (v_pg_approval, v_pg_flow_id, 'compliancestatus',       true, false, false,  60),
    (v_pg_approval, v_pg_flow_id, 'complianceapprovedby',   true, false, false,  70),
    (v_pg_approval, v_pg_flow_id, 'complianceapprovedon',   true, false, false,  80),
    (v_pg_approval, v_pg_flow_id, 'operationstatus',        true, false, false,  90),
    (v_pg_approval, v_pg_flow_id, 'operationsapprovedby',   true, false, false, 100),
    (v_pg_approval, v_pg_flow_id, 'operationsapprovedon',   true, false, false, 110),
    (v_pg_approval, v_pg_flow_id, 'settlementstatus',       true, false, false, 120),
    (v_pg_approval, v_pg_flow_id, 'settlementapprovedby',   true, false, false, 130),
    (v_pg_approval, v_pg_flow_id, 'settlementapprovedon',   true, false, false, 140),
    (v_pg_approval, v_pg_flow_id, 'startagreementapproval', true, false, false, 150);

  UPDATE process_stage SET gate_required_fields = '[]'::jsonb WHERE process_stage_id = v_pg_approval;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 5. PG / SOFT POS — Agreement (add softcopyavailable + testintegration)
  -- ══════════════════════════════════════════════════════════════════════════

  DELETE FROM process_stage_fields WHERE process_stage_id = v_pg_agreement;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_pg_agreement, v_pg_flow_id, 'agreementsenttomerchant',       true, false, false, 10),
    (v_pg_agreement, v_pg_flow_id, 'signed',                        true, false, false, 20),
    (v_pg_agreement, v_pg_flow_id, 'softcopyavailable',             true, false, false, 30),
    (v_pg_agreement, v_pg_flow_id, 'technicalintegrationcompleted', true, false, false, 40),
    (v_pg_agreement, v_pg_flow_id, 'integrationcompleted',          true, false, false, 50),
    (v_pg_agreement, v_pg_flow_id, 'testintegration',               true, false, false, 60),
    (v_pg_agreement, v_pg_flow_id, 'partneragreementsigned',        true, false, false, 70),
    (v_pg_agreement, v_pg_flow_id, 'oktoproceed',                   true, false, false, 80);

  UPDATE process_stage SET gate_required_fields = '[]'::jsonb WHERE process_stage_id = v_pg_agreement;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 6. PG / SOFT POS — QA (qacheck first, remove testintegration)
  -- ══════════════════════════════════════════════════════════════════════════

  DELETE FROM process_stage_fields WHERE process_stage_id = v_pg_qa;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_pg_qa, v_pg_flow_id, 'qacheck',     true, false, false, 10),
    (v_pg_qa, v_pg_flow_id, 'qastatus',    true, false, false, 20),
    (v_pg_qa, v_pg_flow_id, 'qaapprovedby',true, false, false, 30),
    (v_pg_qa, v_pg_flow_id, 'qaapprovedon',true, false, false, 40);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 7. PG / SOFT POS — Go Live (unchanged, just confirming correct)
  -- ══════════════════════════════════════════════════════════════════════════
  -- trainingcompleted + uploadedandlive already correct for PG/SOFTPOS

  -- ══════════════════════════════════════════════════════════════════════════
  -- 8. WEBSITE DEV — Develop (remove monthly fields, add contentmanagement)
  -- ══════════════════════════════════════════════════════════════════════════

  DELETE FROM process_stage_fields WHERE process_stage_id = v_wd_develop;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_wd_develop, v_wd_flow_id, 'commercialproposalshared', true, false, false, 10),
    (v_wd_develop, v_wd_flow_id, 'setupfees',                true, false, false, 20),
    (v_wd_develop, v_wd_flow_id, 'monthlycost',              true, false, false, 30),
    (v_wd_develop, v_wd_flow_id, 'setupcurrencyid',          true, false, false, 40),
    (v_wd_develop, v_wd_flow_id, 'contentmanagement',        true, false, false, 50);

  UPDATE process_stage SET gate_required_fields = '[]'::jsonb WHERE process_stage_id = v_wd_develop;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 9. WEBSITE DEV — Technical (websitetype first, add startagreementapproval)
  -- ══════════════════════════════════════════════════════════════════════════

  DELETE FROM process_stage_fields WHERE process_stage_id = v_wd_technical;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_wd_technical, v_wd_flow_id, 'websitetype',            true, false, false, 10),
    (v_wd_technical, v_wd_flow_id, 'technicalstatus',        true, false, false, 20),
    (v_wd_technical, v_wd_flow_id, 'technicalapprovedby',    true, false, false, 30),
    (v_wd_technical, v_wd_flow_id, 'technicalapprovedon',    true, false, false, 40),
    (v_wd_technical, v_wd_flow_id, 'startagreementapproval', true, false, false, 50);

  UPDATE process_stage SET gate_required_fields = '[]'::jsonb WHERE process_stage_id = v_wd_technical;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 10. WEBSITE DEV — Go Live (uploadedandlive only, remove trainingcompleted)
  -- ══════════════════════════════════════════════════════════════════════════

  DELETE FROM process_stage_fields WHERE process_stage_id = v_wd_golive;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_wd_golive, v_wd_flow_id, 'uploadedandlive', true, false, false, 10);

END $$;
