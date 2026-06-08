/*
  # Fix Data Policy Trigger: Respect trigger_on Field

  ## Summary
  The data policy backend trigger was firing every active block_save policy on
  every INSERT and UPDATE, ignoring the `trigger_on` array stored on each policy.
  This caused the "Contact Required at Proposal Stage" policy (trigger_on:
  ["stage_change"]) to block ALL new opportunity inserts, even when the stage
  was not being set to "proposal".

  ## Fix
  Rewrites fn_evaluate_data_policies to accept the trigger operation and the
  old row (for UPDATE), then filters policies by trigger_on:
  - "create"       → only on INSERT (TG_OP = 'INSERT')
  - "update"       → only on UPDATE (TG_OP = 'UPDATE')
  - "stage_change" → only on UPDATE when the stage column value has changed

  The trigger function fn_trigger_data_policy_check is updated to pass TG_OP
  and OLD (as jsonb, NULL on INSERT) to the evaluator.

  ## Tables Affected
  - No schema changes; only function replacements
*/

-- ─── 1. Updated core evaluator ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_evaluate_data_policies(
  p_entity_name text,
  p_record      jsonb,
  p_tg_op       text,      -- 'INSERT' or 'UPDATE'
  p_old_record  jsonb      -- NULL on INSERT, previous row on UPDATE
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
  v_stage_col    text := 'stage_code'; -- physical column name for stage
BEGIN
  FOR r_policy IN
    SELECT dp.data_policy_id, dp.name, dp.trigger_on
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
    -- Check if this policy applies to the current operation
    IF p_tg_op = 'INSERT' THEN
      CONTINUE WHEN NOT (r_policy.trigger_on @> '["create"]'::jsonb);
    ELSIF p_tg_op = 'UPDATE' THEN
      IF r_policy.trigger_on @> '["stage_change"]'::jsonb
         AND NOT (r_policy.trigger_on @> '["update"]'::jsonb) THEN
        -- Only fire on actual stage column change
        CONTINUE WHEN (p_old_record ->> v_stage_col) IS NOT DISTINCT FROM (p_record ->> v_stage_col);
      ELSIF NOT (r_policy.trigger_on @> '["update"]'::jsonb)
            AND NOT (r_policy.trigger_on @> '["stage_change"]'::jsonb) THEN
        CONTINUE;
      END IF;
    END IF;

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

-- ─── 2. Updated trigger function ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_trigger_data_policy_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entity_name text;
  v_old_record  jsonb;
BEGIN
  v_entity_name := TG_ARGV[0];
  v_old_record  := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  PERFORM fn_evaluate_data_policies(v_entity_name, to_jsonb(NEW), TG_OP, v_old_record);
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_evaluate_data_policies(text, jsonb, text, jsonb) TO authenticated;
