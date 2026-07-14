/*
  # Calculated Field Engine — Formula Functions

  Extends the calculated-field evaluator (20260610000003) with recursive formula
  functions so a result operand can be a FIELD, a static VALUE, or a FUNCTION call
  whose parameters are themselves operands (arbitrary nesting):

      DiffInDays(startApprovalOn, legalResponseOn)
      DiffInDays(startApprovalOn, Now())

  Supported functions (mirrors src/app/services/calcEngine.ts CALC_FUNCTIONS):
    - DiffInDays(a, b)    -> whole days    (trunc((b - a) seconds / 86400))
    - DiffInHours(a, b)   -> whole hours
    - DiffInMinutes(a, b) -> whole minutes
    - Now()               -> current timestamp
    - Today()             -> current date

  The operand shape adds a third kind alongside {kind:"field"} / {kind:"value"}:
      { "kind":"function", "fn":"DiffInDays", "args":[ <operand>, <operand> ] }

  Because Now()/Today() read the clock, the evaluation chain is STABLE (not
  IMMUTABLE). now() is fixed within a statement, so the trigger fixpoint loop
  still converges. Nothing else about the trigger / RPCs changes; existing v2
  definitions (field + value + arithmetic operators) keep working unchanged.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Recursive operand resolver — field | value | function -> text
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.crm_eval_operand(p_op jsonb, p_row jsonb)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_kind text := COALESCE(p_op->>'kind', 'value');
  v_fn   text;
  v_args jsonb;
  ta timestamptz;
  tb timestamptz;
  v_secs numeric;
BEGIN
  IF p_op IS NULL THEN RETURN NULL; END IF;

  IF v_kind = 'field' THEN
    RETURN security.crm_jsonb_text(p_row -> (p_op->>'column'));

  ELSIF v_kind = 'function' THEN
    v_fn   := p_op->>'fn';
    v_args := COALESCE(p_op->'args', '[]'::jsonb);

    IF v_fn = 'Now' THEN
      RETURN to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF');
    ELSIF v_fn = 'Today' THEN
      RETURN to_char(current_date, 'YYYY-MM-DD');
    ELSIF v_fn IN ('DiffInDays', 'DiffInHours', 'DiffInMinutes') THEN
      ta := security.crm_try_ts(security.crm_eval_operand(v_args->0, p_row));
      tb := security.crm_try_ts(security.crm_eval_operand(v_args->1, p_row));
      IF ta IS NULL OR tb IS NULL THEN RETURN NULL; END IF;
      v_secs := EXTRACT(EPOCH FROM (tb - ta));
      RETURN CASE v_fn
        WHEN 'DiffInDays'    THEN trunc(v_secs / 86400)
        WHEN 'DiffInHours'   THEN trunc(v_secs / 3600)
        WHEN 'DiffInMinutes' THEN trunc(v_secs / 60)
      END::text;
    END IF;

    RETURN NULL;  -- unknown function

  ELSE
    RETURN p_op->>'value';
  END IF;
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Operand accessors now delegate to the recursive resolver (STABLE)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.crm_operand_text(p_op jsonb, p_row jsonb)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT security.crm_eval_operand(p_op, p_row);
$$;

CREATE OR REPLACE FUNCTION security.crm_operand_num(p_op jsonb, p_row jsonb)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT security.crm_try_numeric(security.crm_eval_operand(p_op, p_row));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Expression + calculation evaluators — bodies unchanged, now STABLE
--    (they transitively call now()/current_date through function operands)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.crm_eval_expr(p_expr jsonb, p_row jsonb, p_rt text)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_ops   jsonb := COALESCE(p_expr->'operands','[]'::jsonb);
  v_oprs  jsonb := COALESCE(p_expr->'operators','[]'::jsonb);
  v_n     int   := jsonb_array_length(v_ops);
  v_acc   numeric; v_v numeric; v_op text; i int;
  v_text  text;
BEGIN
  IF v_n = 0 THEN RETURN NULL; END IF;

  IF p_rt IN ('number','currency') THEN
    v_acc := COALESCE(security.crm_operand_num(v_ops->0, p_row), 0);
    i := 1;
    WHILE i < v_n LOOP
      v_op := COALESCE(v_oprs->>(i-1), '+');
      v_v  := COALESCE(security.crm_operand_num(v_ops->i, p_row), 0);
      IF    v_op = '+' THEN v_acc := v_acc + v_v;
      ELSIF v_op = '-' THEN v_acc := v_acc - v_v;
      ELSIF v_op = '*' THEN v_acc := v_acc * v_v;
      ELSIF v_op = '/' THEN IF v_v = 0 THEN RETURN NULL; END IF; v_acc := v_acc / v_v;
      END IF;
      i := i + 1;
    END LOOP;
    RETURN to_jsonb(v_acc);
  ELSE
    v_text := security.crm_operand_text(v_ops->0, p_row);
    IF v_text IS NULL OR v_text = '' THEN RETURN NULL; END IF;
    IF p_rt = 'boolean' THEN RETURN to_jsonb(security.crm_try_bool(v_text)); END IF;
    RETURN to_jsonb(v_text);   -- text / choice / date (column cast handles date)
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION security.crm_eval_calculation(p_calc jsonb, p_row jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_rt     text := COALESCE(p_calc->>'resultType','text');
  v_branch jsonb;
BEGIN
  IF p_calc IS NULL OR jsonb_typeof(p_calc->'branches') <> 'array' THEN RETURN NULL; END IF;
  FOR v_branch IN SELECT value FROM jsonb_array_elements(p_calc->'branches') LOOP
    IF COALESCE((v_branch->>'isDefault')::boolean, false)
       OR security.crm_eval_group(v_branch->'condition', p_row) THEN
      RETURN security.crm_eval_expr(v_branch->'result', p_row, v_rt);
    END IF;
  END LOOP;
  RETURN NULL;
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants
--    This deployment has no `authenticated` role (roles are absent locally), so
--    grant EXECUTE on the new function TO public — matching how the runtime DDL
--    elsewhere avoids "role \"authenticated\" does not exist".
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION security.crm_eval_operand(jsonb, jsonb) TO public;
