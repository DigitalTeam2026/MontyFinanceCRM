/*
  # Dashboard query engine — secure aggregate + record RPCs

  Both functions are SECURITY INVOKER: they run as the calling user, so the
  existing default-deny RLS on every CRM entity table (migration 20260615130000)
  filters rows automatically. A dashboard can therefore never surface a record
  the user could not already see on that entity's grid.

  No arbitrary SQL: the entity is resolved to a physical table via
  entity_definition; every column/alias is validated against information_schema
  (whitelist) and emitted through quote_ident(); every literal goes through
  quote_literal(). Unknown identifiers raise, they are never interpolated raw.
*/

-- ── shared helpers (private) ─────────────────────────────────────────────────

-- Resolve a logical/physical entity name to its real physical table, verifying
-- it is a base table in public. Raises on anything unknown.
CREATE OR REPLACE FUNCTION public.dashboard_resolve_table(p_entity text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE v_table text;
BEGIN
  SELECT physical_table_name INTO v_table
    FROM public.entity_definition
   WHERE (logical_name = p_entity OR physical_table_name = p_entity)
     AND deleted_at IS NULL
   ORDER BY (logical_name = p_entity) DESC
   LIMIT 1;

  IF v_table IS NULL THEN v_table := p_entity; END IF;  -- allow direct table name

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = v_table AND table_type = 'BASE TABLE'
  ) THEN
    RAISE EXCEPTION 'dashboard: unknown entity %', p_entity USING ERRCODE = '22023';
  END IF;
  RETURN v_table;
END;
$$;

-- Assert a column exists on a table; returns the column name (safe to quote_ident).
CREATE OR REPLACE FUNCTION public.dashboard_assert_column(p_table text, p_col text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_col = '*' THEN RETURN '*'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_col
  ) THEN
    RAISE EXCEPTION 'dashboard: column %.% not found', p_table, p_col USING ERRCODE = '22023';
  END IF;
  RETURN p_col;
END;
$$;

-- Validate an output alias (prevents injection through result keys).
CREATE OR REPLACE FUNCTION public.dashboard_safe_alias(p_alias text, p_fallback text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE a text := COALESCE(NULLIF(trim(p_alias), ''), p_fallback);
BEGIN
  IF a !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'dashboard: invalid alias %', p_alias USING ERRCODE = '22023';
  END IF;
  RETURN a;
END;
$$;

-- Build a single SQL predicate from {field, op, value, value2} against a table.
CREATE OR REPLACE FUNCTION public.dashboard_build_predicate(p_table text, p_f jsonb)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_col  text := public.dashboard_assert_column(p_table, p_f->>'field');
  v_op   text := lower(COALESCE(p_f->>'op', 'eq'));
  v_val  text := p_f->>'value';
  v_val2 text := p_f->>'value2';
  c      text := format('%I', v_col);
  v_in   text;
  e      jsonb;
BEGIN
  RETURN CASE v_op
    WHEN 'eq'           THEN format('%s = %L', c, v_val)
    WHEN 'neq'          THEN format('%s IS DISTINCT FROM %L', c, v_val)
    WHEN 'gt'           THEN format('%s > %L', c, v_val)
    WHEN 'gte'          THEN format('%s >= %L', c, v_val)
    WHEN 'lt'           THEN format('%s < %L', c, v_val)
    WHEN 'lte'          THEN format('%s <= %L', c, v_val)
    WHEN 'on'           THEN format('%s::date = %L::date', c, v_val)
    WHEN 'before'       THEN format('%s < %L', c, v_val)
    WHEN 'after'        THEN format('%s > %L', c, v_val)
    WHEN 'between'      THEN format('%s BETWEEN %L AND %L', c, v_val, v_val2)
    WHEN 'contains'     THEN format('%s::text ILIKE %L', c, '%' || COALESCE(v_val,'') || '%')
    WHEN 'not_contains' THEN format('%s::text NOT ILIKE %L', c, '%' || COALESCE(v_val,'') || '%')
    WHEN 'starts_with'  THEN format('%s::text ILIKE %L', c, COALESCE(v_val,'') || '%')
    WHEN 'ends_with'    THEN format('%s::text ILIKE %L', c, '%' || COALESCE(v_val,''))
    WHEN 'is_empty'     THEN format('(%s IS NULL OR %s::text = '''')', c, c)
    WHEN 'is_not_empty' THEN format('(%s IS NOT NULL AND %s::text <> '''')', c, c)
    WHEN 'in' THEN (
      SELECT CASE WHEN count(*) = 0 THEN 'false'
        ELSE format('%s IN (%s)', c, string_agg(format('%L', x.v), ',')) END
      FROM (SELECT jsonb_array_elements_text(COALESCE(p_f->'value', '[]'::jsonb)) AS v) x)
    WHEN 'not_in' THEN (
      SELECT CASE WHEN count(*) = 0 THEN 'true'
        ELSE format('%s NOT IN (%s)', c, string_agg(format('%L', x.v), ',')) END
      FROM (SELECT jsonb_array_elements_text(COALESCE(p_f->'value', '[]'::jsonb)) AS v) x)
    ELSE format('%s = %L', c, v_val)
  END;
END;
$$;

-- ── 1. Aggregate query engine ────────────────────────────────────────────────
--
-- config = {
--   entity, groupBy:[{field,dateGrain?,alias?}], aggregations:[{field,fn,alias}],
--   filters:[{field,op,value,value2}], filterLogic:'and'|'or',
--   orderBy:[{key,dir}], limit, includeDeleted
-- }
-- returns { rows: [ {alias: value, ...} ], rowCount }
CREATE OR REPLACE FUNCTION public.dashboard_aggregate(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_table   text := public.dashboard_resolve_table(p_config->>'entity');
  v_sel     text[] := '{}';
  v_group   text[] := '{}';
  v_preds   text[] := '{}';
  v_logic   text := CASE WHEN lower(COALESCE(p_config->>'filterLogic','and')) = 'or' THEN ' OR ' ELSE ' AND ' END;
  v_order   text := '';
  v_limit   int  := LEAST(GREATEST(COALESCE((p_config->>'limit')::int, 1000), 1), 50000);
  v_grain   text;
  v_expr    text;
  v_alias   text;
  v_fn      text;
  v_col     text;
  v_where   text := '';
  v_sql     text;
  v_rows    jsonb;
  g jsonb; a jsonb; f jsonb;
BEGIN
  -- GROUP BY dimensions
  FOR g IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'groupBy','[]'::jsonb))
  LOOP
    v_col := public.dashboard_assert_column(v_table, g->>'field');
    v_grain := lower(COALESCE(g->>'dateGrain',''));
    v_alias := public.dashboard_safe_alias(g->>'alias', v_col);
    IF v_grain IN ('year','quarter','month','week','day','hour') THEN
      v_expr := format('date_trunc(%L, %I)', v_grain, v_col);
    ELSE
      v_expr := format('%I', v_col);
    END IF;
    v_sel   := v_sel   || format('%s AS %I', v_expr, v_alias);
    v_group := v_group || v_expr;
  END LOOP;

  -- Aggregations
  FOR a IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'aggregations','[]'::jsonb))
  LOOP
    v_fn  := lower(COALESCE(a->>'fn','count'));
    v_col := public.dashboard_assert_column(v_table, COALESCE(a->>'field','*'));
    v_alias := public.dashboard_safe_alias(a->>'alias', v_fn);
    v_expr := CASE v_fn
      WHEN 'count'          THEN 'count(*)'
      WHEN 'count_distinct' THEN format('count(DISTINCT %I)', v_col)
      WHEN 'sum'            THEN format('coalesce(sum(%I),0)', v_col)
      WHEN 'avg'            THEN format('avg(%I)', v_col)
      WHEN 'min'            THEN format('min(%I)', v_col)
      WHEN 'max'            THEN format('max(%I)', v_col)
      ELSE 'count(*)'
    END;
    v_sel := v_sel || format('%s AS %I', v_expr, v_alias);
  END LOOP;

  IF array_length(v_sel, 1) IS NULL THEN
    v_sel := v_sel || 'count(*) AS count'::text;
  END IF;

  -- Filters
  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'filters','[]'::jsonb))
  LOOP
    v_preds := v_preds || public.dashboard_build_predicate(v_table, f);
  END LOOP;

  -- Soft-delete guard when the column exists and caller did not opt in.
  IF COALESCE((p_config->>'includeDeleted')::boolean, false) = false
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name=v_table AND column_name='is_deleted') THEN
    v_preds := array_prepend('is_deleted = false', v_preds);
  END IF;

  IF array_length(v_preds, 1) IS NOT NULL THEN
    v_where := ' WHERE ' || array_to_string(v_preds, v_logic);
  END IF;

  -- ORDER BY (validate keys against the emitted aliases)
  SELECT string_agg(
           format('%I %s', public.dashboard_safe_alias(o->>'key', 'count'),
                  CASE WHEN lower(COALESCE(o->>'dir','asc'))='desc' THEN 'DESC' ELSE 'ASC' END), ', ')
    INTO v_order
    FROM jsonb_array_elements(COALESCE(p_config->'orderBy','[]'::jsonb)) o;

  v_sql := format('SELECT %s FROM public.%I%s', array_to_string(v_sel, ', '), v_table, v_where);
  IF array_length(v_group, 1) IS NOT NULL THEN
    v_sql := v_sql || ' GROUP BY ' || array_to_string(v_group, ', ');
  END IF;
  IF COALESCE(v_order,'') <> '' THEN v_sql := v_sql || ' ORDER BY ' || v_order; END IF;
  v_sql := v_sql || format(' LIMIT %s', v_limit);

  EXECUTE format('SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', v_sql) INTO v_rows;
  RETURN jsonb_build_object('rows', v_rows, 'rowCount', jsonb_array_length(v_rows));
END;
$$;
REVOKE ALL ON FUNCTION public.dashboard_aggregate(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_aggregate(jsonb) TO authenticated;

-- ── 2. Record query (paginated raw rows for table/matrix visuals) ────────────
--
-- config = { entity, columns:[col,...], filters:[...], filterLogic,
--            orderBy:[{key,dir}], page, pageSize, includeDeleted }
-- returns { rows:[{col:val}], total }
CREATE OR REPLACE FUNCTION public.dashboard_record_query(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_table  text := public.dashboard_resolve_table(p_config->>'entity');
  v_cols   text[] := '{}';
  v_preds  text[] := '{}';
  v_logic  text := CASE WHEN lower(COALESCE(p_config->>'filterLogic','and'))='or' THEN ' OR ' ELSE ' AND ' END;
  v_page   int := GREATEST(COALESCE((p_config->>'page')::int, 0), 0);
  v_size   int := LEAST(GREATEST(COALESCE((p_config->>'pageSize')::int, 50), 1), 1000);
  v_where  text := '';
  v_order  text := '';
  v_sql    text;
  v_rows   jsonb;
  v_total  bigint;
  c text; f jsonb;
BEGIN
  FOR c IN SELECT jsonb_array_elements_text(COALESCE(p_config->'columns','[]'::jsonb))
  LOOP
    v_cols := v_cols || format('%I', public.dashboard_assert_column(v_table, c));
  END LOOP;
  IF array_length(v_cols,1) IS NULL THEN v_cols := v_cols || '*'::text; END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'filters','[]'::jsonb))
  LOOP
    v_preds := v_preds || public.dashboard_build_predicate(v_table, f);
  END LOOP;
  IF COALESCE((p_config->>'includeDeleted')::boolean, false) = false
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name=v_table AND column_name='is_deleted') THEN
    v_preds := array_prepend('is_deleted = false', v_preds);
  END IF;
  IF array_length(v_preds,1) IS NOT NULL THEN
    v_where := ' WHERE ' || array_to_string(v_preds, v_logic);
  END IF;

  SELECT string_agg(
           format('%I %s', public.dashboard_assert_column(v_table, o->>'key'),
                  CASE WHEN lower(COALESCE(o->>'dir','asc'))='desc' THEN 'DESC' ELSE 'ASC' END), ', ')
    INTO v_order
    FROM jsonb_array_elements(COALESCE(p_config->'orderBy','[]'::jsonb)) o;

  EXECUTE format('SELECT count(*) FROM public.%I%s', v_table, v_where) INTO v_total;

  v_sql := format('SELECT %s FROM public.%I%s', array_to_string(v_cols, ', '), v_table, v_where);
  IF COALESCE(v_order,'') <> '' THEN v_sql := v_sql || ' ORDER BY ' || v_order; END IF;
  v_sql := v_sql || format(' OFFSET %s LIMIT %s', v_page * v_size, v_size);

  EXECUTE format('SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', v_sql) INTO v_rows;
  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.dashboard_record_query(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_record_query(jsonb) TO authenticated;

-- helper grants
REVOKE ALL ON FUNCTION public.dashboard_resolve_table(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.dashboard_assert_column(text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.dashboard_build_predicate(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_resolve_table(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_assert_column(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_build_predicate(text, jsonb) TO authenticated;
