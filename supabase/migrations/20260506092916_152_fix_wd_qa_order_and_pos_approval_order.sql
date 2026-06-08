/*
  # Fix Website Dev QA field order and POS Approval field order

  ## Summary
  Two residual ordering mismatches found after migration 151 verification:

  1. Website Dev — QA: qacheck must come first (matches PG/SOFTPOS and Dynamics spec).
     DB currently has qastatus first.

  2. POS — Approval: Dynamics spec shows same Approval stage as PG/SOFTPOS
     (sendquestionnairefile + documentsreceived first, before the approval status blocks).
     DB currently has them at positions 100 and 110 (after all approval status fields).
*/

DO $$
DECLARE
  v_wd_flow_id   uuid;
  v_wd_qa        uuid;

  v_pos_flow_id  uuid;
  v_pos_approval uuid;
BEGIN

  SELECT process_flow_id INTO v_wd_flow_id  FROM process_flow WHERE name = 'MontyPay Website Development Flow' LIMIT 1;
  SELECT process_flow_id INTO v_pos_flow_id FROM process_flow WHERE name = 'MontyPay POS Flow'                 LIMIT 1;

  SELECT process_stage_id INTO v_wd_qa        FROM process_stage WHERE process_flow_id = v_wd_flow_id  AND stage_key = 'qa';
  SELECT process_stage_id INTO v_pos_approval FROM process_stage WHERE process_flow_id = v_pos_flow_id AND stage_key = 'approval';

  -- ── Website Dev QA: qacheck first ────────────────────────────────────────

  DELETE FROM process_stage_fields WHERE process_stage_id = v_wd_qa;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_wd_qa, v_wd_flow_id, 'qacheck',     true, false, false, 10),
    (v_wd_qa, v_wd_flow_id, 'qastatus',    true, false, false, 20),
    (v_wd_qa, v_wd_flow_id, 'qaapprovedby',true, false, false, 30),
    (v_wd_qa, v_wd_flow_id, 'qaapprovedon',true, false, false, 40);

  -- ── POS Approval: sendquestionnaire + documentsreceived first ─────────────

  DELETE FROM process_stage_fields WHERE process_stage_id = v_pos_approval;

  INSERT INTO process_stage_fields (process_stage_id, process_flow_id, field_logical_name, is_visible, is_required, is_readonly, display_order)
  VALUES
    (v_pos_approval, v_pos_flow_id, 'sendquestionnairefile', true, false, false,  10),
    (v_pos_approval, v_pos_flow_id, 'documentsreceived',     true, false, false,  20),
    (v_pos_approval, v_pos_flow_id, 'technicalstatus',       true, false, false,  30),
    (v_pos_approval, v_pos_flow_id, 'technicalapprovedby',   true, false, false,  40),
    (v_pos_approval, v_pos_flow_id, 'technicalapprovedon',   true, false, false,  50),
    (v_pos_approval, v_pos_flow_id, 'compliancestatus',      true, false, false,  60),
    (v_pos_approval, v_pos_flow_id, 'complianceapprovedby',  true, false, false,  70),
    (v_pos_approval, v_pos_flow_id, 'complianceapprovedon',  true, false, false,  80),
    (v_pos_approval, v_pos_flow_id, 'operationstatus',       true, false, false,  90),
    (v_pos_approval, v_pos_flow_id, 'operationsapprovedby',  true, false, false, 100),
    (v_pos_approval, v_pos_flow_id, 'operationsapprovedon',  true, false, false, 110),
    (v_pos_approval, v_pos_flow_id, 'softcopyavailable',     true, false, false, 120);

END $$;
