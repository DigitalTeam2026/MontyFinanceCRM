/*
  # Calculated Field Engine (Dynamics-365-style IF / THEN / ELSE)

  Server-side evaluator + BEFORE INSERT/UPDATE trigger so calculated columns hold
  the correct value on EVERY write path (forms, imports, raw API/SQL writes).
  Views, filters, exports and APIs then simply read the stored, typed column.

  Definition shape (field_definition.config_json -> 'calculation'):
    {
      "version": 2,
      "resultType": "text|number|currency|date|boolean|choice",
      "branches": [
        { "isDefault": false,
          "condition": { "logic": "and|or",
                         "rows": [ { "column": "<phys>", "fieldType": "...",
                                     "operator": "eq|neq|gt|gte|lt|lte|contains|starts_with|ends_with|is_empty|is_not_empty",
                                     "value": "..." } ] },
          "result": { "operands": [ {"kind":"field","column":"<phys>","fieldType":"..."} | {"kind":"value","value":"..."} ],
                      "operators": ["+","-","*","/"] } },
        { "isDefault": true, "condition": {...}, "result": {...} }   -- ELSE
      ]
    }

  This logic mirrors src/app/services/calcEngine.ts (used for the live form preview).
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Safe casting helpers (pure)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.crm_try_numeric(p text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p IS NULL OR p = '' THEN RETURN NULL; END IF;
  RETURN regexp_replace(p, '[,$\s]', '', 'g')::numeric;
EXCEPTION WHEN others THEN RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION security.crm_try_ts(p text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p IS NULL OR p = '' THEN RETURN NULL; END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN others THEN RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION security.crm_try_bool(p text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p IS NULL OR p = '' THEN RETURN NULL; END IF;
  IF lower(p) IN ('true','t','1','yes','y')  THEN RETURN true;  END IF;
  IF lower(p) IN ('false','f','0','no','n')  THEN RETURN false; END IF;
  RETURN NULL;
END; $$;

-- Extract a row cell as text from the row jsonb (handles json string vs scalar)
CREATE OR REPLACE FUNCTION security.crm_jsonb_text(p jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) = 'null' THEN NULL
    WHEN jsonb_typeof(p) = 'string' THEN p #>> '{}'
    ELSE p::text
  END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Operand resolution
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.crm_operand_text(p_op jsonb, p_row jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_op->>'kind' = 'field' THEN security.crm_jsonb_text(p_row -> (p_op->>'column'))
    ELSE p_op->>'value'
  END;
$$;

CREATE OR REPLACE FUNCTION security.crm_operand_num(p_op jsonb, p_row jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT security.crm_try_numeric(security.crm_operand_text(p_op, p_row));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Condition evaluation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.crm_eval_condition(p_cond jsonb, p_row jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_col  text := p_cond->>'column';
  v_ft   text := COALESCE(p_cond->>'fieldType','text');
  v_op   text := p_cond->>'operator';
  v_val  text := p_cond->>'value';
  v_raw  text := security.crm_jsonb_text(p_row -> v_col);
  an numeric; bn numeric;
  ad timestamptz; bd timestamptz;
  ab boolean; bb boolean;
  at text; bt text;
BEGIN
  IF v_op = 'is_empty'     THEN RETURN v_raw IS NULL OR v_raw = ''; END IF;
  IF v_op = 'is_not_empty' THEN RETURN v_raw IS NOT NULL AND v_raw <> ''; END IF;

  IF v_ft IN ('number','integer','whole_number','decimal','currency','calculated') THEN
    an := security.crm_try_numeric(v_raw); bn := security.crm_try_numeric(v_val);
    IF an IS NULL OR bn IS NULL THEN RETURN v_op = 'neq'; END IF;
    RETURN CASE v_op
      WHEN 'eq' THEN an = bn WHEN 'neq' THEN an <> bn
      WHEN 'gt' THEN an > bn WHEN 'gte' THEN an >= bn
      WHEN 'lt' THEN an < bn WHEN 'lte' THEN an <= bn ELSE false END;

  ELSIF v_ft IN ('date','datetime') THEN
    ad := security.crm_try_ts(v_raw); bd := security.crm_try_ts(v_val);
    IF ad IS NULL OR bd IS NULL THEN RETURN v_op = 'neq'; END IF;
    RETURN CASE v_op
      WHEN 'eq' THEN ad = bd WHEN 'neq' THEN ad <> bd
      WHEN 'gt' THEN ad > bd WHEN 'gte' THEN ad >= bd
      WHEN 'lt' THEN ad < bd WHEN 'lte' THEN ad <= bd ELSE false END;

  ELSIF v_ft IN ('boolean','two_options','twooptions','yesno') THEN
    ab := security.crm_try_bool(v_raw); bb := security.crm_try_bool(v_val);
    RETURN CASE WHEN v_op = 'neq' THEN ab IS DISTINCT FROM bb ELSE ab IS NOT DISTINCT FROM bb END;

  ELSE
    at := lower(COALESCE(v_raw,'')); bt := lower(COALESCE(v_val,''));
    RETURN CASE v_op
      WHEN 'eq'          THEN at = bt
      WHEN 'neq'         THEN at <> bt
      WHEN 'contains'    THEN position(bt in at) > 0
      WHEN 'starts_with' THEN at LIKE bt || '%'
      WHEN 'ends_with'   THEN at LIKE '%' || bt
      ELSE false END;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION security.crm_eval_group(p_group jsonb, p_row jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_logic text := COALESCE(p_group->>'logic','and');
  v_cond  jsonb;
  v_any   boolean := false;
  v_all   boolean := true;
  v_count int := 0;
BEGIN
  IF p_group IS NULL OR jsonb_typeof(p_group->'rows') <> 'array' THEN RETURN true; END IF;
  FOR v_cond IN SELECT value FROM jsonb_array_elements(p_group->'rows') LOOP
    v_count := v_count + 1;
    IF security.crm_eval_condition(v_cond, p_row) THEN v_any := true; ELSE v_all := false; END IF;
  END LOOP;
  IF v_count = 0 THEN RETURN true; END IF;
  RETURN CASE WHEN v_logic = 'or' THEN v_any ELSE v_all END;
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Expression + full calculation evaluation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.crm_eval_expr(p_expr jsonb, p_row jsonb, p_rt text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
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
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
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
-- 4. Trigger function — recompute every calculated column on the row
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.crm_compute_calculated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_catalog
AS $$
DECLARE
  v_entity      uuid;
  v_calc_type   uuid;
  v_row         jsonb;
  v_fld         record;
  v_val         jsonb;
  v_pass        int;
  v_changed     boolean;
BEGIN
  SELECT entity_definition_id INTO v_entity
    FROM public.entity_definition WHERE physical_table_name = TG_TABLE_NAME LIMIT 1;
  IF v_entity IS NULL THEN RETURN NEW; END IF;

  SELECT field_type_id INTO v_calc_type FROM public.field_type WHERE name = 'calculated';
  IF v_calc_type IS NULL THEN RETURN NEW; END IF;

  v_row := to_jsonb(NEW);

  -- Fixpoint loop so a calculated field that references another resolves correctly.
  -- (Circular references are rejected when the definition is saved.)
  FOR v_pass IN 1..8 LOOP
    v_changed := false;
    FOR v_fld IN
      SELECT physical_column_name AS col, config_json->'calculation' AS calc
      FROM public.field_definition
      WHERE entity_definition_id = v_entity
        AND field_type_id = v_calc_type
        AND is_active = true
        AND deleted_at IS NULL
        AND config_json ? 'calculation'
        AND physical_column_name IS NOT NULL
    LOOP
      IF v_row ? v_fld.col THEN
        v_val := security.crm_eval_calculation(v_fld.calc, v_row);
        IF (v_row -> v_fld.col) IS DISTINCT FROM COALESCE(v_val, 'null'::jsonb) THEN
          v_row := jsonb_set(v_row, ARRAY[v_fld.col], COALESCE(v_val, 'null'::jsonb), true);
          v_changed := true;
        END IF;
      END IF;
    END LOOP;
    EXIT WHEN NOT v_changed;
  END LOOP;

  NEW := jsonb_populate_record(NEW, v_row);
  RETURN NEW;
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Admin RPC: attach the trigger to an entity's table (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_calc_trigger(p_table text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_catalog
AS $$
DECLARE v_name text;
BEGIN
  IF NOT security.is_system_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;
  IF p_table !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN json_build_object('ok', false, 'error', 'Invalid table name');
  END IF;
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = p_table;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Table not found');
  END IF;

  v_name := 'trg_crm_calc_' || p_table;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_name) THEN
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION security.crm_compute_calculated()',
      v_name, p_table
    );
  END IF;
  RETURN json_build_object('ok', true, 'trigger', v_name);
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Admin RPC: recompute calculated columns for all existing rows of a table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_calculated_fields(p_table text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_catalog
AS $$
BEGIN
  IF NOT security.is_system_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;
  IF p_table !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN json_build_object('ok', false, 'error', 'Invalid table name');
  END IF;
  -- A no-op update fires the BEFORE UPDATE trigger and recomputes every row.
  BEGIN
    EXECUTE format('UPDATE public.%I SET modified_at = modified_at', p_table);
  EXCEPTION WHEN undefined_column THEN
    RETURN json_build_object('ok', false, 'error', 'Table has no modified_at column; recalc skipped');
  END;
  RETURN json_build_object('ok', true);
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Grants
--    This deployment has NO `anon` / `authenticated` / `service_role` roles
--    (roles are absent locally), so referencing them here — as the original
--    `REVOKE ... FROM public, anon` / `GRANT ... TO authenticated` did — aborts
--    the ENTIRE migration with `role "anon" does not exist`, which is why the
--    whole calc engine (evaluator, trigger fn, RPCs, trigger attachment) never
--    got installed and calculated columns never computed. Grant TO public
--    instead — the two admin RPCs already enforce security.is_system_admin()
--    in their own bodies, so public EXECUTE is safe. See the runtime-DDL
--    convention used elsewhere that avoids the same "role does not exist" error.
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.ensure_calc_trigger(text) TO public;
GRANT EXECUTE ON FUNCTION public.recalc_calculated_fields(text) TO public;
GRANT EXECUTE ON FUNCTION security.crm_compute_calculated() TO public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Attach the trigger to every table that already has a calculated field
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record; v_name text;
BEGIN
  FOR r IN
    SELECT DISTINCT e.physical_table_name AS t
    FROM public.field_definition fd
    JOIN public.entity_definition e ON e.entity_definition_id = fd.entity_definition_id
    JOIN public.field_type ft ON ft.field_type_id = fd.field_type_id AND ft.name = 'calculated'
    WHERE fd.is_active = true AND fd.deleted_at IS NULL
      AND fd.config_json ? 'calculation'   -- only v2 definitions need the trigger
      AND e.physical_table_name ~ '^[a-z][a-z0-9_]*$'
  LOOP
    v_name := 'trg_crm_calc_' || r.t;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_name) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION security.crm_compute_calculated()',
        v_name, r.t
      );
    END IF;
  END LOOP;
END $$;
