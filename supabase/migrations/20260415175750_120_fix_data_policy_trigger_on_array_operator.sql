/*
  # Fix fn_evaluate_data_policies: text[] vs jsonb operator mismatch

  The 4-param overload of fn_evaluate_data_policies was using the jsonb
  containment operator (@> '["create"]'::jsonb) against trigger_on which is
  text[]. This caused the error:
    "operator does not exist: text[] @> jsonb"

  Fix: replace all jsonb containment checks on trigger_on with = ANY(array)
  which is correct for text[].
*/

CREATE OR REPLACE FUNCTION fn_evaluate_data_policies(
  p_entity_name  text,
  p_record       jsonb,
  p_tg_op        text,
  p_old_record   jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  r_policy       record;
  r_cond         record;
  v_field_val    text;
  v_all_match    boolean;
  v_message      text;
  v_stage_col    text := 'stage_code';
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
    IF p_tg_op = 'INSERT' THEN
      CONTINUE WHEN NOT ('create' = ANY(r_policy.trigger_on));
    ELSIF p_tg_op = 'UPDATE' THEN
      IF ('stage_change' = ANY(r_policy.trigger_on))
         AND NOT ('update' = ANY(r_policy.trigger_on)) THEN
        CONTINUE WHEN (p_old_record ->> v_stage_col)
                      IS NOT DISTINCT FROM (p_record ->> v_stage_col);
      ELSIF NOT ('update' = ANY(r_policy.trigger_on))
            AND NOT ('stage_change' = ANY(r_policy.trigger_on)) THEN
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

      IF NOT fn_check_policy_condition(r_cond.operator, v_field_val,
                                       COALESCE(r_cond.value_text, '')) THEN
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
