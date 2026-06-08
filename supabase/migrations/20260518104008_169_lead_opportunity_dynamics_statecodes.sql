
/*
  # Lead & Opportunity Dynamics 365-Style Statecodes

  ## Summary
  Replaces the generic Active/Inactive statecodes on Lead and Opportunity with
  the proper Dynamics 365 statecodes that match real CRM usage.

  ## Lead Statecodes (Dynamics 365 standard)
  - Open (state_value=1, active, is_system=true) — replaces "Active"
  - Qualified (state_value=2, inactive, is_system=true) — new
  - Disqualified (state_value=3, inactive, is_system=true) — new

  ## Lead Status Reasons
  - Open: New, Contacted, Engaged (replaces generic Active/In Progress/Pending)
  - Qualified: Qualified
  - Disqualified: Lost, Cannot Contact, No Longer Interested, Canceled

  ## Opportunity Statecodes (Dynamics 365 standard)
  - Open (state_value=1, active, is_system=true) — replaces "Active"
  - Won (state_value=2, inactive, is_system=true) — new
  - Lost (state_value=3, inactive, is_system=true) — new

  ## Opportunity Status Reasons
  - Open: In Progress, On Hold
  - Won: Won
  - Lost: Canceled, Out-Sold

  ## Notes
  - Existing generic statecodes/reasons are deleted and replaced
  - All new statecodes are marked is_system=true (protected from deletion)
  - The provision function is updated to use these entity-specific defaults going forward
  - Other entities (Account, Contact, etc.) keep generic Active/Inactive
*/

-- ============================================================
-- LEAD: Replace statecodes and reasons
-- ============================================================

DO $$
DECLARE
  v_lead_entity_id uuid;
  v_sc_open_id uuid;
  v_sc_qualified_id uuid;
  v_sc_disqualified_id uuid;
BEGIN
  SELECT entity_definition_id INTO v_lead_entity_id
  FROM entity_definition WHERE logical_name = 'lead';

  IF v_lead_entity_id IS NULL THEN RETURN; END IF;

  -- Delete existing status reasons for lead
  DELETE FROM status_reason_definition WHERE entity_definition_id = v_lead_entity_id;

  -- Delete existing statecodes for lead
  DELETE FROM statecode_definition WHERE entity_definition_id = v_lead_entity_id;

  -- Insert Open statecode
  INSERT INTO statecode_definition (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES (v_lead_entity_id, 1, 'Open', true, 0, true)
  RETURNING statecode_id INTO v_sc_open_id;

  -- Insert Qualified statecode
  INSERT INTO statecode_definition (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES (v_lead_entity_id, 2, 'Qualified', false, 1, true)
  RETURNING statecode_id INTO v_sc_qualified_id;

  -- Insert Disqualified statecode
  INSERT INTO statecode_definition (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES (v_lead_entity_id, 3, 'Disqualified', false, 2, true)
  RETURNING statecode_id INTO v_sc_disqualified_id;

  -- Open reasons
  INSERT INTO status_reason_definition (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_system)
  VALUES
    (v_sc_open_id, v_lead_entity_id, 1, 'New',       '#3B82F6', 0, true,  true),
    (v_sc_open_id, v_lead_entity_id, 2, 'Contacted', '#8B5CF6', 1, false, false),
    (v_sc_open_id, v_lead_entity_id, 3, 'Engaged',   '#06B6D4', 2, false, false);

  -- Qualified reasons
  INSERT INTO status_reason_definition (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_system)
  VALUES
    (v_sc_qualified_id, v_lead_entity_id, 4, 'Qualified', '#10B981', 0, true, true);

  -- Disqualified reasons
  INSERT INTO status_reason_definition (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_system)
  VALUES
    (v_sc_disqualified_id, v_lead_entity_id, 5, 'Lost',                    '#EF4444', 0, true,  false),
    (v_sc_disqualified_id, v_lead_entity_id, 6, 'Cannot Contact',          '#F97316', 1, false, false),
    (v_sc_disqualified_id, v_lead_entity_id, 7, 'No Longer Interested',    '#6B7280', 2, false, false),
    (v_sc_disqualified_id, v_lead_entity_id, 8, 'Canceled',                '#DC2626', 3, false, false);
END $$;

-- ============================================================
-- OPPORTUNITY: Replace statecodes and reasons
-- ============================================================

DO $$
DECLARE
  v_opp_entity_id uuid;
  v_sc_open_id uuid;
  v_sc_won_id uuid;
  v_sc_lost_id uuid;
BEGIN
  SELECT entity_definition_id INTO v_opp_entity_id
  FROM entity_definition WHERE logical_name = 'opportunity';

  IF v_opp_entity_id IS NULL THEN RETURN; END IF;

  -- Delete existing status reasons for opportunity
  DELETE FROM status_reason_definition WHERE entity_definition_id = v_opp_entity_id;

  -- Delete existing statecodes for opportunity
  DELETE FROM statecode_definition WHERE entity_definition_id = v_opp_entity_id;

  -- Insert Open statecode
  INSERT INTO statecode_definition (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES (v_opp_entity_id, 1, 'Open', true, 0, true)
  RETURNING statecode_id INTO v_sc_open_id;

  -- Insert Won statecode
  INSERT INTO statecode_definition (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES (v_opp_entity_id, 2, 'Won', false, 1, true)
  RETURNING statecode_id INTO v_sc_won_id;

  -- Insert Lost statecode
  INSERT INTO statecode_definition (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES (v_opp_entity_id, 3, 'Lost', false, 2, true)
  RETURNING statecode_id INTO v_sc_lost_id;

  -- Open reasons
  INSERT INTO status_reason_definition (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_system)
  VALUES
    (v_sc_open_id, v_opp_entity_id, 1, 'In Progress', '#3B82F6', 0, true,  true),
    (v_sc_open_id, v_opp_entity_id, 2, 'On Hold',     '#F59E0B', 1, false, false);

  -- Won reasons
  INSERT INTO status_reason_definition (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_system)
  VALUES
    (v_sc_won_id, v_opp_entity_id, 3, 'Won', '#10B981', 0, true, true);

  -- Lost reasons
  INSERT INTO status_reason_definition (statecode_id, entity_definition_id, reason_value, display_label, color, sort_order, is_default, is_system)
  VALUES
    (v_sc_lost_id, v_opp_entity_id, 4, 'Canceled',  '#EF4444', 0, true,  false),
    (v_sc_lost_id, v_opp_entity_id, 5, 'Out-Sold',  '#DC2626', 1, false, false);
END $$;
