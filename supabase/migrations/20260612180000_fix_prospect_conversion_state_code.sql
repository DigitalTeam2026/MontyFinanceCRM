/*
  # Fix Prospect→Lead conversion — canonical NUMERIC state_code

  ## Problem
  The original Prospect→Lead conversion migration (20260612160000) wrote the
  Digital-Rule visibility conditions and the RPC using TEXT status labels
  ('active' / 'converted'), but every other entity on the platform stores
  `state_code` as the numeric state_value ('1' = Active, '2' = Inactive,
  '3' = Converted/terminal). The "Active Records" system view even filters
  `statecode = 1`.

  Because an Active Prospect actually stores `state_code = '1'`, the Convert
  button rule's condition `state_code = 'active'` never matched, so the
  Convert-to-Lead command was filtered out and never rendered.

  ## Fix
  1. Re-point both seeded Digital Rules to the numeric state values.
  2. Make the RPC write numeric state_code (Lead = '1', Prospect = '3')
     and accept the numeric value on the Active validation.
  3. Normalise any existing crm_prospect / lead rows that were written with
     the textual label by the old code path.

  Idempotent: safe to run repeatedly.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  RE-POINT DIGITAL RULES TO NUMERIC state_code
-- ─────────────────────────────────────────────────────────────────────────────

-- Convert-to-Lead button: visible when Active ('1') and not yet converted.
UPDATE digital_rule
SET visible_when = '[
    {"field": "state_code",        "operator": "equals", "value": "1"},
    {"field": "converted_lead_id", "operator": "equals", "value": ""}
  ]'::jsonb
WHERE digital_rule_id = 'd1000000-0001-4000-8000-000000000001';

-- Converted Prospect read-only governance rule: locks form when Converted ('3').
UPDATE digital_rule
SET visible_when = '[{"field": "state_code", "operator": "equals", "value": "3"}]'::jsonb
WHERE digital_rule_id = 'd1000000-0002-4000-8000-000000000001';

-- Mirror into digital_rule_condition rows if any were materialised for these rules.
UPDATE digital_rule_condition SET value = '1'
WHERE digital_rule_id = 'd1000000-0001-4000-8000-000000000001'
  AND field = 'state_code' AND value IN ('active', 'Active');

UPDATE digital_rule_condition SET value = '3'
WHERE digital_rule_id = 'd1000000-0002-4000-8000-000000000001'
  AND field = 'state_code' AND value IN ('converted', 'Converted');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  NORMALISE EXISTING DATA TO NUMERIC state_code
-- ─────────────────────────────────────────────────────────────────────────────
-- Any rows written by the old text-based code path are migrated to numeric.

UPDATE crm_prospect SET state_code = '3' WHERE state_code IN ('converted', 'Converted');
UPDATE crm_prospect SET state_code = '1' WHERE state_code IN ('active', 'Active');
UPDATE crm_prospect SET state_code = '2' WHERE state_code IN ('inactive', 'Inactive');

UPDATE lead SET state_code = '1' WHERE state_code IN ('active', 'Active');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  RPC: write numeric state_code; accept numeric Active on validation
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION convert_prospect_to_lead(
  p_prospect_id  uuid,
  p_user_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
DECLARE
  v_prospect              jsonb;
  v_entity_def_id         uuid;
  v_rule                  record;
  v_mapping               record;
  v_source_val            text;
  v_lead_data             jsonb := '{}';
  v_missing_required      text[] := '{}';
  v_lead_id               uuid   := gen_random_uuid();
  v_lead_name             text;
  v_converted_sc_id       uuid;
  v_converted_state_value int;
  v_converted_reason      int;
  v_lead_def_id           uuid;
  v_lead_active_reason    int;
  v_set_clause            text;
BEGIN
  -- ── 1. Lock the prospect row (prevents concurrent double-conversion) ─────
  SELECT row_to_json(cp)::jsonb INTO v_prospect
  FROM crm_prospect cp
  WHERE cp.prospect_id = p_prospect_id
    AND (cp.is_deleted IS NULL OR cp.is_deleted = false)
  FOR UPDATE;

  IF v_prospect IS NULL THEN
    RAISE EXCEPTION 'Prospect % not found or has been deleted', p_prospect_id;
  END IF;

  -- ── 2. Validate: must be Active ──────────────────────────────────────────
  -- Canonical state_code is the numeric state_value ('1' = Active). Text
  -- labels are also accepted for backward-compatibility with legacy rows.
  IF (v_prospect->>'state_code') NOT IN ('1', 'active', 'Active') THEN
    RAISE EXCEPTION 'Only Active prospects can be converted. Current state: %',
      COALESCE(v_prospect->>'state_code', 'unknown');
  END IF;

  -- ── 3. Validate: not already converted ───────────────────────────────────
  IF v_prospect->>'converted_lead_id' IS NOT NULL THEN
    RAISE EXCEPTION 'Prospect % has already been converted to Lead %',
      p_prospect_id, v_prospect->>'converted_lead_id';
  END IF;

  -- ── 4. Load the default Prospect→Lead conversion rule ───────────────────
  SELECT * INTO v_rule
  FROM entity_conversion_rule
  WHERE source_entity = 'prospect'
    AND target_entity = 'lead'
    AND is_active     = true
    AND deleted_at    IS NULL
  ORDER BY is_default DESC, created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active Prospect→Lead conversion rule found. Please configure one in Admin Studio.';
  END IF;

  -- ── 5. Build lead data from field mappings ───────────────────────────────
  FOR v_mapping IN
    SELECT *
    FROM entity_conversion_field_mapping
    WHERE entity_conversion_rule_id = v_rule.entity_conversion_rule_id
    ORDER BY display_order
  LOOP
    CASE v_mapping.mapping_type
      WHEN 'default_value' THEN
        v_source_val := v_mapping.default_value;
      WHEN 'lookup' THEN
        v_source_val := v_prospect->>v_mapping.source_field;
      ELSE
        v_source_val := v_prospect->>v_mapping.source_field;
    END CASE;

    IF v_mapping.is_required AND (v_source_val IS NULL OR trim(v_source_val) = '') THEN
      v_missing_required := array_append(v_missing_required, v_mapping.source_field);
    END IF;

    IF v_source_val IS NOT NULL AND v_source_val <> '' THEN
      IF v_mapping.target_field ~ '^[a-z_][a-z0-9_]*$' THEN
        v_lead_data := v_lead_data || jsonb_build_object(v_mapping.target_field, v_source_val);
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_missing_required, 1) > 0 THEN
    RAISE EXCEPTION 'Conversion blocked – required fields are empty on the Prospect: %',
      array_to_string(v_missing_required, ', ');
  END IF;

  -- ── 6. Resolve default Active status reason for the new Lead ────────────
  SELECT entity_definition_id INTO v_lead_def_id
  FROM entity_definition
  WHERE logical_name = 'lead'
  LIMIT 1;

  IF v_lead_def_id IS NOT NULL THEN
    SELECT srd.reason_value INTO v_lead_active_reason
    FROM status_reason_definition srd
    JOIN statecode_definition sc ON srd.statecode_id = sc.statecode_id
    WHERE sc.entity_definition_id = v_lead_def_id
      AND sc.state_value           = 1
      AND srd.is_default           = true
    LIMIT 1;
  END IF;

  -- ── 7. Insert the new Lead (system columns only) ─────────────────────────
  -- state_code is the canonical numeric Active value ('1').
  INSERT INTO lead (
    lead_id,
    state_code,
    status_reason,
    created_by,
    owner_id,
    owner_type,
    originating_prospect_id,
    created_at,
    modified_at
  )
  VALUES (
    v_lead_id,
    '1',
    COALESCE(v_lead_active_reason::text, '1'),
    p_user_id,
    p_user_id,
    'user',
    p_prospect_id,
    now(),
    now()
  );

  -- ── 8. Apply mapped field values to the Lead ────────────────────────────
  IF v_lead_data <> '{}' THEN
    SELECT string_agg(format('%I = %L', key, value), ', ')
    INTO   v_set_clause
    FROM   jsonb_each_text(v_lead_data)
    WHERE  key ~ '^[a-z_][a-z0-9_]*$';

    IF v_set_clause IS NOT NULL AND v_set_clause <> '' THEN
      EXECUTE format('UPDATE lead SET %s WHERE lead_id = %L', v_set_clause, v_lead_id);
    END IF;
  END IF;

  -- ── 9. Build a human-readable lead name for the response ────────────────
  v_lead_name := trim(
    coalesce(v_lead_data->>'first_name', '') || ' ' ||
    coalesce(v_lead_data->>'last_name',  '')
  );
  IF v_lead_name = '' OR v_lead_name IS NULL THEN
    v_lead_name := coalesce(v_lead_data->>'company_name', v_lead_id::text);
  END IF;

  -- ── 10. Resolve "Converted" statecode + "Converted to Lead" reason ──────
  SELECT entity_definition_id INTO v_entity_def_id
  FROM entity_definition
  WHERE logical_name = 'prospect' OR physical_table_name = 'crm_prospect'
  LIMIT 1;

  IF v_entity_def_id IS NOT NULL THEN
    SELECT state_value INTO v_converted_state_value
    FROM statecode_definition
    WHERE entity_definition_id = v_entity_def_id
      AND state_value           = 3
    LIMIT 1;

    IF v_converted_state_value IS NULL THEN
      SELECT state_value INTO v_converted_state_value
      FROM statecode_definition
      WHERE entity_definition_id = v_entity_def_id
        AND lower(display_label)  = 'converted'
      LIMIT 1;
    END IF;

    SELECT sc.statecode_id INTO v_converted_sc_id
    FROM statecode_definition sc
    WHERE sc.entity_definition_id = v_entity_def_id
      AND sc.state_value           = COALESCE(v_converted_state_value, 3)
    LIMIT 1;

    IF v_converted_sc_id IS NOT NULL THEN
      SELECT srd.reason_value INTO v_converted_reason
      FROM status_reason_definition srd
      WHERE srd.statecode_id          = v_converted_sc_id
        AND lower(srd.display_label) LIKE '%converted%'
      ORDER BY srd.is_default DESC, srd.sort_order
      LIMIT 1;
    END IF;
  END IF;

  -- ── 11. Update the Prospect to Converted (numeric state_code) ───────────
  UPDATE crm_prospect
  SET
    state_code         = COALESCE(v_converted_state_value::text, '3'),
    status_reason      = COALESCE(v_converted_reason::text, ''),
    converted_lead_id  = v_lead_id,
    converted_at       = now(),
    converted_by       = p_user_id,
    modified_at        = now()
  WHERE prospect_id = p_prospect_id;

  -- ── 12. Audit log ────────────────────────────────────────────────────────
  INSERT INTO digital_rule_execution_log (
    rule_name, entity_logical_name, record_id, user_id,
    action_taken, success, executed_at
  )
  VALUES (
    'convert_prospect_to_lead', 'prospect', p_prospect_id, p_user_id,
    format('Lead %s created from Prospect %s using rule %s',
           v_lead_id, p_prospect_id, v_rule.entity_conversion_rule_id),
    true, now()
  );

  -- ── 13. Return result ────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',     true,
    'prospectId',  p_prospect_id,
    'leadId',      v_lead_id,
    'leadName',    v_lead_name,
    'ruleId',      v_rule.entity_conversion_rule_id
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO digital_rule_execution_log (
    rule_name, entity_logical_name, record_id, user_id,
    action_taken, success, error_message, executed_at
  )
  VALUES (
    'convert_prospect_to_lead', 'prospect', p_prospect_id, p_user_id,
    'conversion_failed', false, SQLERRM, now()
  );
  RAISE;
END;
$$;
