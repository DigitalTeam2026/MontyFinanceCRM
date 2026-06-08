/*
  # Data Policy Backend Enforcement

  ## Summary
  Activates server-side enforcement for Data Policies. Previously, the Data
  Policy schema (data_policy, data_policy_condition, data_policy_enforcement)
  existed purely as a configuration store with no backend evaluation. This
  migration adds the execution layer.

  ## Architecture Decision
  Two distinct systems are now clearly separated:

  ### Business Rules → UX / Form Logic Only
  - Show/hide fields, lock/unlock fields, require fields, show messages
  - Evaluated client-side in real time as the user types
  - No backend execution; intentional — they are form guidance, not governance
  - Cannot be bypassed because they do not need to be enforced — they are UX aids

  ### Data Policies → Data Governance / Backend Enforcement
  - Enforce invariants on the data itself (format, uniqueness, mandatory, lock)
  - enforcement_level = 'error' with enforcement_type = 'block_save' → DB trigger blocks the save
  - enforcement_level = 'warning' / 'info' → evaluated client-side only (UX notification)
  - Fires on INSERT and UPDATE, independently of the frontend
  - Cannot be bypassed by API calls, bulk imports, or direct PostgREST access

  ## New Objects

  ### fn_evaluate_data_policies(entity_name, record_row)
  SECURITY DEFINER function. Loads all active 'error'-level block_save policies
  for the given entity, evaluates each condition against the incoming record,
  and raises an exception if any policy fires.

  ### fn_check_policy_condition(operator, field_value, compare_value)
  Helper that evaluates a single condition operator.

  ### trg_data_policy_* triggers
  BEFORE INSERT OR UPDATE triggers on account, contact, lead, opportunity tables.
  Each calls fn_evaluate_data_policies with its entity name and the NEW row.

  ## Supported Condition Operators
  - eq, neq, gt, gte, lt, lte
  - is_null, is_not_null
  - matches_regex, not_matches_regex
  - contains, in

  ## Supported Enforcement Actions (backend)
  Only enforcement_type = 'block_save' is enforced server-side.
  Other types (show_message, require_field, lock_field, set_value, notify_user)
  remain UX-only and are handled by the frontend policy engine.

  ## Tables Affected
  - No schema changes; triggers added to account, contact, lead, opportunity
*/

-- ─── 1. Single-condition evaluator ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_check_policy_condition(
  p_operator   text,
  p_field_val  text,
  p_cmp_val    text
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_operator
    WHEN 'is_null'     THEN RETURN (p_field_val IS NULL OR p_field_val = '');
    WHEN 'is_not_null' THEN RETURN (p_field_val IS NOT NULL AND p_field_val <> '');
    WHEN 'eq'          THEN RETURN p_field_val = p_cmp_val;
    WHEN 'neq'         THEN RETURN p_field_val <> p_cmp_val;
    WHEN 'contains'    THEN RETURN position(lower(p_cmp_val) in lower(p_field_val)) > 0;
    WHEN 'gt'          THEN RETURN p_field_val::numeric > p_cmp_val::numeric;
    WHEN 'gte'         THEN RETURN p_field_val::numeric >= p_cmp_val::numeric;
    WHEN 'lt'          THEN RETURN p_field_val::numeric < p_cmp_val::numeric;
    WHEN 'lte'         THEN RETURN p_field_val::numeric <= p_cmp_val::numeric;
    WHEN 'matches_regex'     THEN RETURN p_field_val ~ p_cmp_val;
    WHEN 'not_matches_regex' THEN RETURN NOT (p_field_val ~ p_cmp_val);
    WHEN 'in' THEN
      RETURN p_field_val = ANY(string_to_array(p_cmp_val, ','));
    ELSE
      RETURN true;
  END CASE;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END;
$$;

-- ─── 2. Core policy evaluator (operates on jsonb row representation) ──────────

CREATE OR REPLACE FUNCTION fn_evaluate_data_policies(
  p_entity_name text,
  p_record      jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r_policy       record;
  r_cond         record;
  v_field_val    text;
  v_all_match    boolean;
  v_message      text;
BEGIN
  FOR r_policy IN
    SELECT dp.data_policy_id, dp.name
    FROM data_policy dp
    WHERE dp.entity_logical_name = p_entity_name
      AND dp.is_active = true
      AND dp.deleted_at IS NULL
      AND 'error' = dp.enforcement_level
      AND EXISTS (
        SELECT 1 FROM data_policy_enforcement dpe
        WHERE dpe.data_policy_id = dp.data_policy_id
          AND dpe.enforcement_type = 'block_save'
      )
  LOOP
    v_all_match := true;

    FOR r_cond IN
      SELECT field_name, operator, value_text
      FROM data_policy_condition
      WHERE data_policy_id = r_policy.data_policy_id
      ORDER BY display_order
    LOOP
      v_field_val := p_record ->> r_cond.field_name;

      IF NOT fn_check_policy_condition(r_cond.operator, v_field_val, COALESCE(r_cond.value_text, '')) THEN
        v_all_match := false;
        EXIT;
      END IF;
    END LOOP;

    IF v_all_match THEN
      SELECT COALESCE(message_text, 'Data policy violation: ' || r_policy.name)
      INTO v_message
      FROM data_policy_enforcement
      WHERE data_policy_id = r_policy.data_policy_id
        AND enforcement_type = 'block_save'
      ORDER BY display_order
      LIMIT 1;

      RAISE EXCEPTION '%', v_message
        USING ERRCODE = 'check_violation',
              HINT    = 'Policy: ' || r_policy.name;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_evaluate_data_policies(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_check_policy_condition(text, text, text) TO authenticated;

-- ─── 3. Trigger function (generic — used by all entity triggers) ──────────────

CREATE OR REPLACE FUNCTION fn_trigger_data_policy_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entity_name text;
BEGIN
  v_entity_name := TG_ARGV[0];
  PERFORM fn_evaluate_data_policies(v_entity_name, to_jsonb(NEW));
  RETURN NEW;
END;
$$;

-- ─── 4. Account trigger ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_data_policy_account ON account;
CREATE TRIGGER trg_data_policy_account
  BEFORE INSERT OR UPDATE ON account
  FOR EACH ROW
  EXECUTE FUNCTION fn_trigger_data_policy_check('account');

-- ─── 5. Contact trigger ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_data_policy_contact ON contact;
CREATE TRIGGER trg_data_policy_contact
  BEFORE INSERT OR UPDATE ON contact
  FOR EACH ROW
  EXECUTE FUNCTION fn_trigger_data_policy_check('contact');

-- ─── 6. Lead trigger ─────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_data_policy_lead ON lead;
CREATE TRIGGER trg_data_policy_lead
  BEFORE INSERT OR UPDATE ON lead
  FOR EACH ROW
  EXECUTE FUNCTION fn_trigger_data_policy_check('lead');

-- ─── 7. Opportunity trigger ───────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_data_policy_opportunity ON opportunity;
CREATE TRIGGER trg_data_policy_opportunity
  BEFORE INSERT OR UPDATE ON opportunity
  FOR EACH ROW
  EXECUTE FUNCTION fn_trigger_data_policy_check('opportunity');

-- ─── 8. RPC: validate a record without saving (pre-flight check) ──────────────

CREATE OR REPLACE FUNCTION fn_preflight_data_policies(
  p_entity_name text,
  p_record      jsonb
) RETURNS TABLE (
  policy_name     text,
  message         text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  r_policy    record;
  r_cond      record;
  v_field_val text;
  v_all_match boolean;
  v_message   text;
BEGIN
  FOR r_policy IN
    SELECT dp.data_policy_id, dp.name
    FROM data_policy dp
    WHERE dp.entity_logical_name = p_entity_name
      AND dp.is_active = true
      AND dp.deleted_at IS NULL
      AND dp.enforcement_level = 'error'
      AND EXISTS (
        SELECT 1 FROM data_policy_enforcement dpe
        WHERE dpe.data_policy_id = dp.data_policy_id
          AND dpe.enforcement_type = 'block_save'
      )
  LOOP
    v_all_match := true;

    FOR r_cond IN
      SELECT field_name, operator, value_text
      FROM data_policy_condition
      WHERE data_policy_id = r_policy.data_policy_id
      ORDER BY display_order
    LOOP
      v_field_val := p_record ->> r_cond.field_name;
      IF NOT fn_check_policy_condition(r_cond.operator, v_field_val, COALESCE(r_cond.value_text, '')) THEN
        v_all_match := false;
        EXIT;
      END IF;
    END LOOP;

    IF v_all_match THEN
      SELECT COALESCE(message_text, 'Policy violation: ' || r_policy.name)
      INTO v_message
      FROM data_policy_enforcement
      WHERE data_policy_id = r_policy.data_policy_id
        AND enforcement_type = 'block_save'
      ORDER BY display_order
      LIMIT 1;

      RETURN QUERY SELECT r_policy.name, v_message;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_preflight_data_policies(text, jsonb) TO authenticated;
