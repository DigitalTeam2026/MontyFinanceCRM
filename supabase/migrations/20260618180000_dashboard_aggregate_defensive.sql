/*
  # Dashboard query engine — defensive aggregate + record RPCs (never 400)

  Problem: dashboard_aggregate / dashboard_record_query RAISE on ANY invalid
  column or relationship path (e.g. clicking an Industry filter while a Lead card
  has no Industry field and no Lead→Industry path). PostgREST turns that RAISE
  into HTTP 400, so the card shows a red "Query failed" and one bad card can make
  the whole dashboard look broken.

  Fix (mirrors the per-source guard already used by dashboard_distinct_values):

  1. Per-predicate tolerance — each plain / semantic / related filter and each
     ORDER BY key is built inside its own BEGIN/EXCEPTION. A *compatibility* error
     (our own 22023 raises + Postgres undefined_column / undefined_table /
     undefined_function / datatype_mismatch / invalid_text_representation) means
     "this filter does not apply to this entity": the offending predicate is
     SKIPPED (the card stays affected by the filters that DO apply) instead of
     aborting. A genuine error re-raises to the outer handler.

  2. Outer tolerance — the whole body runs inside a BEGIN/EXCEPTION. A structural
     compatibility error that cannot be isolated (e.g. an invalid groupBy /
     aggregation column, or an unknown entity) returns a SAFE EMPTY result
        { ok:true, rows:[], rowCount:0 (or total:0), no_relation:true, message }
     so the card renders "No data" rather than crashing. Any other (real backend)
     error returns { ok:false, error, code } — still HTTP 200, so the frontend can
     surface a real failure WITHOUT a raw 400, and one card can never break the
     dashboard.

  3. Success now also carries ok:true (backward compatible: rows/rowCount/total
     are unchanged, callers that ignore `ok` keep working).

  Everything else is preserved verbatim from 20260618170000 (deleted_at-aware
  soft-delete guard, SECURITY INVOKER, validated + quoted identifiers). RLS on
  every touched table still governs visibility.
*/

-- ── classify a SQLSTATE as a "filter/relation compatibility" error ────────────
-- These mean a filter/column/path does not apply to the current entity (vs. a
-- genuine backend fault). Our intentional raises use 22023; the rest are the
-- Postgres codes a stale mapping / removed column / type mismatch would produce.
CREATE OR REPLACE FUNCTION public.dashboard_is_compat_sqlstate(p_state text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_state IN (
    '22023',  -- invalid_parameter_value (our own dashboard: … raises)
    '42703',  -- undefined_column
    '42P01',  -- undefined_table
    '42P02',  -- undefined_parameter
    '42704',  -- undefined_object
    '42883',  -- undefined_function
    '42804',  -- datatype_mismatch
    '42846',  -- cannot_coerce
    '22P02'   -- invalid_text_representation
  );
$$;
REVOKE ALL ON FUNCTION public.dashboard_is_compat_sqlstate(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_is_compat_sqlstate(text) TO authenticated;

-- ── aggregate engine — per-predicate + outer compatibility tolerance ──────────
CREATE OR REPLACE FUNCTION public.dashboard_aggregate(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_table    text;
  v_sel      text[] := '{}';
  v_group    text[] := '{}';
  v_preds    text[] := '{}';
  v_sempreds text[] := '{}';
  v_and      text[] := '{}';
  v_active   text := '';
  v_logic    text := CASE WHEN lower(COALESCE(p_config->>'filterLogic','and')) = 'or' THEN ' OR ' ELSE ' AND ' END;
  v_order    text := '';
  v_orderk   text[] := '{}';
  v_limit    int  := LEAST(GREATEST(COALESCE((p_config->>'limit')::int, 1000), 1), 50000);
  v_grain    text;
  v_expr     text;
  v_alias    text;
  v_fn       text;
  v_col      text;
  v_sem      text;
  v_where    text := '';
  v_sql      text;
  v_rows     jsonb;
  g jsonb; a jsonb; f jsonb; o jsonb;
BEGIN
  -- Unknown entity is itself a compatibility error → caught by the outer handler.
  v_table := public.dashboard_resolve_table(p_config->>'entity');

  -- GROUP BY dimensions (structural: an invalid groupBy → safe-empty card).
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

  -- Aggregations (structural).
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

  -- Plain filters — skip any that do not apply to this entity.
  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'filters','[]'::jsonb))
  LOOP
    BEGIN
      v_preds := v_preds || public.dashboard_build_predicate(v_table, f);
    EXCEPTION WHEN OTHERS THEN
      IF NOT public.dashboard_is_compat_sqlstate(SQLSTATE) THEN RAISE; END IF;
    END;
  END LOOP;

  -- Semantic (relationship-path) filters — skip any unresolvable path.
  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'semanticFilters','[]'::jsonb))
  LOOP
    BEGIN
      v_sem := public.dashboard_build_semantic_predicate(v_table, f);
      IF v_sem IS NOT NULL AND v_sem <> '' THEN v_sempreds := v_sempreds || v_sem; END IF;
    EXCEPTION WHEN OTHERS THEN
      IF NOT public.dashboard_is_compat_sqlstate(SQLSTATE) THEN RAISE; END IF;
    END;
  END LOOP;

  -- Interactive cross-entity filters (FK-column paths) — skip any unresolvable.
  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'relatedFilters','[]'::jsonb))
  LOOP
    BEGIN
      v_sem := public.dashboard_build_related_predicate(v_table, f);
      IF v_sem IS NOT NULL AND v_sem <> '' THEN v_sempreds := v_sempreds || v_sem; END IF;
    EXCEPTION WHEN OTHERS THEN
      IF NOT public.dashboard_is_compat_sqlstate(SQLSTATE) THEN RAISE; END IF;
    END;
  END LOOP;

  -- Soft-delete guard (deleted_at / is_deleted) — ALWAYS ANDed.
  IF COALESCE((p_config->>'includeDeleted')::boolean, false) = false THEN
    v_active := public.dashboard_active_pred(v_table, v_table);
  END IF;

  IF v_active <> '' THEN v_and := v_and || ('(' || v_active || ')'); END IF;
  IF array_length(v_preds, 1) IS NOT NULL THEN
    v_and := v_and || ('(' || array_to_string(v_preds, v_logic) || ')');
  END IF;
  IF array_length(v_sempreds, 1) IS NOT NULL THEN
    v_and := v_and || array_to_string(v_sempreds, ' AND ');
  END IF;
  IF array_length(v_and, 1) IS NOT NULL THEN
    v_where := ' WHERE ' || array_to_string(v_and, ' AND ');
  END IF;

  -- ORDER BY — skip any key that is not a valid emitted alias.
  FOR o IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'orderBy','[]'::jsonb))
  LOOP
    BEGIN
      v_orderk := v_orderk || format('%I %s', public.dashboard_safe_alias(o->>'key', 'count'),
                    CASE WHEN lower(COALESCE(o->>'dir','asc'))='desc' THEN 'DESC' ELSE 'ASC' END);
    EXCEPTION WHEN OTHERS THEN
      IF NOT public.dashboard_is_compat_sqlstate(SQLSTATE) THEN RAISE; END IF;
    END;
  END LOOP;
  IF array_length(v_orderk, 1) IS NOT NULL THEN v_order := array_to_string(v_orderk, ', '); END IF;

  v_sql := format('SELECT %s FROM public.%I%s', array_to_string(v_sel, ', '), v_table, v_where);
  IF array_length(v_group, 1) IS NOT NULL THEN
    v_sql := v_sql || ' GROUP BY ' || array_to_string(v_group, ', ');
  END IF;
  IF COALESCE(v_order,'') <> '' THEN v_sql := v_sql || ' ORDER BY ' || v_order; END IF;
  v_sql := v_sql || format(' LIMIT %s', v_limit);

  EXECUTE format('SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', v_sql) INTO v_rows;
  RETURN jsonb_build_object('ok', true, 'rows', v_rows, 'rowCount', jsonb_array_length(v_rows));

EXCEPTION WHEN OTHERS THEN
  -- Compatibility error we could not isolate (bad groupBy/agg/entity) → safe empty
  -- so the card shows "No data". Any other error → ok:false (still HTTP 200).
  IF public.dashboard_is_compat_sqlstate(SQLSTATE) THEN
    RETURN jsonb_build_object('ok', true, 'rows', '[]'::jsonb, 'rowCount', 0,
                              'no_relation', true, 'message', SQLERRM);
  END IF;
  RETURN jsonb_build_object('ok', false, 'rows', '[]'::jsonb, 'rowCount', 0,
                            'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

-- ── record query — per-predicate + outer compatibility tolerance ──────────────
CREATE OR REPLACE FUNCTION public.dashboard_record_query(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_table    text;
  v_cols     text[] := '{}';
  v_preds    text[] := '{}';
  v_sempreds text[] := '{}';
  v_and      text[] := '{}';
  v_active   text := '';
  v_logic    text := CASE WHEN lower(COALESCE(p_config->>'filterLogic','and'))='or' THEN ' OR ' ELSE ' AND ' END;
  v_page     int := GREATEST(COALESCE((p_config->>'page')::int, 0), 0);
  v_size     int := LEAST(GREATEST(COALESCE((p_config->>'pageSize')::int, 50), 1), 1000);
  v_where    text := '';
  v_order    text := '';
  v_orderk   text[] := '{}';
  v_sem      text;
  v_sql      text;
  v_rows     jsonb;
  v_total    bigint;
  c text; f jsonb; o jsonb;
BEGIN
  v_table := public.dashboard_resolve_table(p_config->>'entity');

  -- Columns (structural).
  FOR c IN SELECT jsonb_array_elements_text(COALESCE(p_config->'columns','[]'::jsonb))
  LOOP
    v_cols := v_cols || format('%I', public.dashboard_assert_column(v_table, c));
  END LOOP;
  IF array_length(v_cols,1) IS NULL THEN v_cols := v_cols || '*'::text; END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'filters','[]'::jsonb))
  LOOP
    BEGIN
      v_preds := v_preds || public.dashboard_build_predicate(v_table, f);
    EXCEPTION WHEN OTHERS THEN
      IF NOT public.dashboard_is_compat_sqlstate(SQLSTATE) THEN RAISE; END IF;
    END;
  END LOOP;

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'semanticFilters','[]'::jsonb))
  LOOP
    BEGIN
      v_sem := public.dashboard_build_semantic_predicate(v_table, f);
      IF v_sem IS NOT NULL AND v_sem <> '' THEN v_sempreds := v_sempreds || v_sem; END IF;
    EXCEPTION WHEN OTHERS THEN
      IF NOT public.dashboard_is_compat_sqlstate(SQLSTATE) THEN RAISE; END IF;
    END;
  END LOOP;

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'relatedFilters','[]'::jsonb))
  LOOP
    BEGIN
      v_sem := public.dashboard_build_related_predicate(v_table, f);
      IF v_sem IS NOT NULL AND v_sem <> '' THEN v_sempreds := v_sempreds || v_sem; END IF;
    EXCEPTION WHEN OTHERS THEN
      IF NOT public.dashboard_is_compat_sqlstate(SQLSTATE) THEN RAISE; END IF;
    END;
  END LOOP;

  IF COALESCE((p_config->>'includeDeleted')::boolean, false) = false THEN
    v_active := public.dashboard_active_pred(v_table, v_table);
  END IF;

  IF v_active <> '' THEN v_and := v_and || ('(' || v_active || ')'); END IF;
  IF array_length(v_preds, 1) IS NOT NULL THEN
    v_and := v_and || ('(' || array_to_string(v_preds, v_logic) || ')');
  END IF;
  IF array_length(v_sempreds, 1) IS NOT NULL THEN
    v_and := v_and || array_to_string(v_sempreds, ' AND ');
  END IF;
  IF array_length(v_and, 1) IS NOT NULL THEN
    v_where := ' WHERE ' || array_to_string(v_and, ' AND ');
  END IF;

  FOR o IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'orderBy','[]'::jsonb))
  LOOP
    BEGIN
      v_orderk := v_orderk || format('%I %s', public.dashboard_assert_column(v_table, o->>'key'),
                    CASE WHEN lower(COALESCE(o->>'dir','asc'))='desc' THEN 'DESC' ELSE 'ASC' END);
    EXCEPTION WHEN OTHERS THEN
      IF NOT public.dashboard_is_compat_sqlstate(SQLSTATE) THEN RAISE; END IF;
    END;
  END LOOP;
  IF array_length(v_orderk, 1) IS NOT NULL THEN v_order := array_to_string(v_orderk, ', '); END IF;

  EXECUTE format('SELECT count(*) FROM public.%I%s', v_table, v_where) INTO v_total;

  v_sql := format('SELECT %s FROM public.%I%s', array_to_string(v_cols, ', '), v_table, v_where);
  IF COALESCE(v_order,'') <> '' THEN v_sql := v_sql || ' ORDER BY ' || v_order; END IF;
  v_sql := v_sql || format(' OFFSET %s LIMIT %s', v_page * v_size, v_size);

  EXECUTE format('SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', v_sql) INTO v_rows;
  RETURN jsonb_build_object('ok', true, 'rows', v_rows, 'total', v_total);

EXCEPTION WHEN OTHERS THEN
  IF public.dashboard_is_compat_sqlstate(SQLSTATE) THEN
    RETURN jsonb_build_object('ok', true, 'rows', '[]'::jsonb, 'total', 0,
                              'no_relation', true, 'message', SQLERRM);
  END IF;
  RETURN jsonb_build_object('ok', false, 'rows', '[]'::jsonb, 'total', 0,
                            'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

NOTIFY pgrst, 'reload schema';
