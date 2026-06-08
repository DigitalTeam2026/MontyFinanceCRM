/*
  # MontyPay Flow Assignment Rules

  ## Summary
  Creates process_flow_assignment_rule rows that automatically assign the
  correct MontyPay Opportunity flow when a new Opportunity is created from
  a qualified MontyPay lead.

  The assignment engine evaluates rules in priority order (lower = first).
  The first matching rule wins.

  ## Rules (all on 'opportunity' entity)

  | Priority | Condition | Assigned Flow |
  |---|---|---|
  | 10 | product_id = MontyPay Payment Gateway | MontyPay PG / SOFT POS Flow |
  | 11 | product_id = MontyPay SOFT POS | MontyPay PG / SOFT POS Flow |
  | 20 | product_id = MontyPay Point of Sale | MontyPay POS Flow |
  | 30 | product_id = MontyPay Website Development | MontyPay Website Development Flow |

  ## Rule Conditions
  Each rule uses conditions JSONB: [{ "field": "productid", "operator": "eq", "value": "<product_uuid>" }]

  ## Also creates lead assignment rule
  | Priority | Condition | Assigned Flow |
  |---|---|---|
  | 10 | lob = MontyPay (any product in MP-* codes) | MontyPay Lead Flow |
  This rule assigns MontyPay Lead Flow to any lead whose product_id belongs to MontyPay LOB.

  ## Notes
  - The assignment engine in processFlowEngine.ts reads these rules on record save
    and sets record.process_flow_id when it matches.
  - product_locked safeguard: once opportunity advances past qualify stage,
    product_id cannot change, so flow reassignment is blocked at app level.
*/

DO $$
DECLARE
  v_eid_lead    uuid;
  v_eid_opp     uuid;

  -- product ids
  v_pg_id       uuid;
  v_sp_id       uuid;
  v_pos_id      uuid;
  v_wd_id       uuid;

  -- flow ids
  v_flow_lead   uuid;
  v_flow_pg     uuid;
  v_flow_pos    uuid;
  v_flow_wd     uuid;
BEGIN

  SELECT entity_definition_id INTO v_eid_lead FROM entity_definition WHERE logical_name = 'lead'        LIMIT 1;
  SELECT entity_definition_id INTO v_eid_opp  FROM entity_definition WHERE logical_name = 'opportunity' LIMIT 1;

  SELECT product_id INTO v_pg_id  FROM product WHERE code = 'MP-PG'      LIMIT 1;
  SELECT product_id INTO v_sp_id  FROM product WHERE code = 'MP-SOFTPOS' LIMIT 1;
  SELECT product_id INTO v_pos_id FROM product WHERE code = 'MP-POS'     LIMIT 1;
  SELECT product_id INTO v_wd_id  FROM product WHERE code = 'MP-WD'      LIMIT 1;

  SELECT process_flow_id INTO v_flow_lead FROM process_flow WHERE name = 'MontyPay Lead Flow'                LIMIT 1;
  SELECT process_flow_id INTO v_flow_pg   FROM process_flow WHERE name = 'MontyPay PG / SOFT POS Flow'      LIMIT 1;
  SELECT process_flow_id INTO v_flow_pos  FROM process_flow WHERE name = 'MontyPay POS Flow'                LIMIT 1;
  SELECT process_flow_id INTO v_flow_wd   FROM process_flow WHERE name = 'MontyPay Website Development Flow' LIMIT 1;

  -- ── Lead assignment rule ──────────────────────────────────────────────────

  -- Payment Gateway lead
  INSERT INTO process_flow_assignment_rule (entity_definition_id, process_flow_id, name, conditions, priority, is_active)
  VALUES (
    v_eid_lead, v_flow_lead,
    'MontyPay Lead — Payment Gateway',
    jsonb_build_array(jsonb_build_object('field','productid','operator','eq','value',v_pg_id::text)),
    10, true
  ) ON CONFLICT DO NOTHING;

  -- SOFT POS lead
  INSERT INTO process_flow_assignment_rule (entity_definition_id, process_flow_id, name, conditions, priority, is_active)
  VALUES (
    v_eid_lead, v_flow_lead,
    'MontyPay Lead — SOFT POS',
    jsonb_build_array(jsonb_build_object('field','productid','operator','eq','value',v_sp_id::text)),
    11, true
  ) ON CONFLICT DO NOTHING;

  -- POS lead
  INSERT INTO process_flow_assignment_rule (entity_definition_id, process_flow_id, name, conditions, priority, is_active)
  VALUES (
    v_eid_lead, v_flow_lead,
    'MontyPay Lead — Point of Sale',
    jsonb_build_array(jsonb_build_object('field','productid','operator','eq','value',v_pos_id::text)),
    12, true
  ) ON CONFLICT DO NOTHING;

  -- Website Development lead
  INSERT INTO process_flow_assignment_rule (entity_definition_id, process_flow_id, name, conditions, priority, is_active)
  VALUES (
    v_eid_lead, v_flow_lead,
    'MontyPay Lead — Website Development',
    jsonb_build_array(jsonb_build_object('field','productid','operator','eq','value',v_wd_id::text)),
    13, true
  ) ON CONFLICT DO NOTHING;

  -- ── Opportunity assignment rules ──────────────────────────────────────────

  -- Payment Gateway → PG / SOFT POS flow
  INSERT INTO process_flow_assignment_rule (entity_definition_id, process_flow_id, name, conditions, priority, is_active)
  VALUES (
    v_eid_opp, v_flow_pg,
    'MontyPay Opportunity — Payment Gateway',
    jsonb_build_array(jsonb_build_object('field','productid','operator','eq','value',v_pg_id::text)),
    10, true
  ) ON CONFLICT DO NOTHING;

  -- SOFT POS → PG / SOFT POS flow (same flow)
  INSERT INTO process_flow_assignment_rule (entity_definition_id, process_flow_id, name, conditions, priority, is_active)
  VALUES (
    v_eid_opp, v_flow_pg,
    'MontyPay Opportunity — SOFT POS',
    jsonb_build_array(jsonb_build_object('field','productid','operator','eq','value',v_sp_id::text)),
    11, true
  ) ON CONFLICT DO NOTHING;

  -- Point of Sale → POS flow
  INSERT INTO process_flow_assignment_rule (entity_definition_id, process_flow_id, name, conditions, priority, is_active)
  VALUES (
    v_eid_opp, v_flow_pos,
    'MontyPay Opportunity — Point of Sale',
    jsonb_build_array(jsonb_build_object('field','productid','operator','eq','value',v_pos_id::text)),
    20, true
  ) ON CONFLICT DO NOTHING;

  -- Website Development → Website flow
  INSERT INTO process_flow_assignment_rule (entity_definition_id, process_flow_id, name, conditions, priority, is_active)
  VALUES (
    v_eid_opp, v_flow_wd,
    'MontyPay Opportunity — Website Development',
    jsonb_build_array(jsonb_build_object('field','productid','operator','eq','value',v_wd_id::text)),
    30, true
  ) ON CONFLICT DO NOTHING;

END $$;
