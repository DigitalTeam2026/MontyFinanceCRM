/*
  # Dashboard soft-delete guard — honour `deleted_at` everywhere (recycle bin)

  Two leaks are fixed so dashboards never count soft-deleted records:

  1. Base guards only checked `is_deleted = false`. Since migration
     20260618120000 standardised soft-delete on a nullable `deleted_at`
     timestamp (the Admin Studio recycle bin sets `deleted_at`, NOT `is_deleted`),
     recycle-binned rows were still counted in every KPI / funnel / chart / table.
     Now the guard excludes a row when EITHER `deleted_at IS NOT NULL` OR
     `is_deleted = true`, for whichever of those columns the table has.

  2. Relationship-path subqueries (the nested EXISTS in
     dashboard_build_semantic_predicate / dashboard_build_related_predicate and
     the JOIN chain in dashboard_source_distinct) applied NO soft-delete guard at
     all — so filtering Leads by Account.industry_id matched Leads whose Account
     was in the recycle bin. Every intermediate hop table now carries the same
     active-record guard.

  The guard is also ALWAYS ANDed onto the WHERE (previously it was folded into the
  user-filter array and joined with the visual's filterLogic, so an `OR` logic
  could resurrect a deleted row). Intermediate-hop guards are unconditional:
  `includeDeleted` only opts the BASE entity out of the guard, never the
  relationship records walked to reach it.

  All functions stay SECURITY INVOKER + identifiers validated/quoted, exactly as
  the migrations they supersede (20260617130100 / 150000 / 160000).
*/

-- ── shared helper: active-record predicate for a (possibly aliased) table ─────
-- Returns e.g. `"account"."deleted_at" IS NULL` (and/or `… "is_deleted" = false`)
-- qualified by p_ref, or '' when the table has neither soft-delete column.
CREATE OR REPLACE FUNCTION public.dashboard_active_pred(p_table text, p_ref text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE v_parts text[] := '{}';
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name=p_table AND column_name='deleted_at') THEN
    v_parts := v_parts || format('%I.%I IS NULL', p_ref, 'deleted_at');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name=p_table AND column_name='is_deleted') THEN
    v_parts := v_parts || format('%I.%I = false', p_ref, 'is_deleted');
  END IF;
  IF array_length(v_parts, 1) IS NULL THEN RETURN ''; END IF;
  RETURN array_to_string(v_parts, ' AND ');
END;
$$;
REVOKE ALL ON FUNCTION public.dashboard_active_pred(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_active_pred(text, text) TO authenticated;

-- ── relationship-path predicate (semantic) — guard every EXISTS hop ───────────
CREATE OR REPLACE FUNCTION public.dashboard_build_semantic_predicate(p_base_table text, p_sem jsonb)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_steps        jsonb := COALESCE(p_sem #> '{path,steps}', '[]'::jsonb);
  v_target_field uuid  := NULLIF(p_sem #>> '{path,targetFieldId}', '')::uuid;
  v_null         text  := lower(COALESCE(p_sem->>'nullBehavior', 'exclude'));
  v_prev_table   text  := p_base_table;
  v_prev_ref     text  := p_base_table;
  v_tables       text[] := '{}';
  v_aliases      text[] := '{}';
  v_joins        text[] := '{}';
  v_first_from   text;
  v_leaf_col     text;
  v_leaf_entity  uuid;
  v_leaf_table   text;
  v_inner        text;
  v_act          text;
  v_i            int := 0;
  step           jsonb;
  v_step         jsonb;
BEGIN
  IF jsonb_array_length(v_steps) = 0 THEN
    RETURN NULL;   -- direct mapping → handled client-side as a normal filter
  END IF;

  FOR step IN SELECT * FROM jsonb_array_elements(v_steps) LOOP
    v_i := v_i + 1;
    v_step := public.dashboard_resolve_lookup_step((step->>'lookupFieldId')::uuid, step->>'direction');
    IF (v_step->>'from_table') <> v_prev_table THEN
      RAISE EXCEPTION 'dashboard: relationship path break at step % (expected %, got %)',
        v_i, v_prev_table, v_step->>'from_table' USING ERRCODE = '22023';
    END IF;
    v_tables  := v_tables  || (v_step->>'to_table');
    v_aliases := v_aliases || ('sf' || v_i);
    v_joins   := v_joins   || format('%I.%I = %I.%I',
                               'sf' || v_i, v_step->>'to_col', v_prev_ref, v_step->>'from_col');
    IF v_i = 1 THEN v_first_from := v_step->>'from_col'; END IF;
    v_prev_ref   := 'sf' || v_i;
    v_prev_table := v_step->>'to_table';
  END LOOP;

  SELECT fd.physical_column_name, fd.entity_definition_id
    INTO v_leaf_col, v_leaf_entity
    FROM public.field_definition fd
   WHERE fd.field_definition_id = v_target_field AND fd.deleted_at IS NULL;
  IF v_leaf_col IS NULL THEN
    RAISE EXCEPTION 'dashboard: invalid target field %', v_target_field USING ERRCODE = '22023';
  END IF;
  SELECT physical_table_name INTO v_leaf_table FROM public.entity_definition WHERE entity_definition_id = v_leaf_entity;
  IF v_leaf_table IS DISTINCT FROM v_prev_table THEN
    RAISE EXCEPTION 'dashboard: target field not on final path entity' USING ERRCODE = '22023';
  END IF;

  SELECT string_agg(public.dashboard_predicate_expr(
           format('%I.%I', v_aliases[array_length(v_aliases, 1)], v_leaf_col), f), ' AND ')
    INTO v_inner
    FROM jsonb_array_elements(COALESCE(p_sem->'filters', '[]'::jsonb)) f;
  IF v_inner IS NULL OR v_inner = '' THEN RETURN NULL; END IF;

  -- assemble nested EXISTS from the innermost step outward, guarding each hop
  -- table against soft-deleted intermediate records.
  FOR v_i IN REVERSE array_length(v_tables, 1)..1 LOOP
    v_act := public.dashboard_active_pred(v_tables[v_i], v_aliases[v_i]);
    v_inner := format('EXISTS (SELECT 1 FROM public.%I %I WHERE %s%s AND %s)',
                      v_tables[v_i], v_aliases[v_i], v_joins[v_i],
                      CASE WHEN v_act <> '' THEN ' AND ' || v_act ELSE '' END,
                      v_inner);
  END LOOP;

  IF v_null = 'include' AND v_first_from IS NOT NULL THEN
    v_inner := format('(%s OR %I.%I IS NULL)', v_inner, p_base_table, v_first_from);
  END IF;

  RETURN v_inner;
END;
$$;

-- ── interactive cross-filter predicate (FK hops) — guard every EXISTS hop ──────
CREATE OR REPLACE FUNCTION public.dashboard_build_related_predicate(p_base_table text, p_rf jsonb)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_path     jsonb := COALESCE(p_rf->'path', '[]'::jsonb);
  v_prev_tbl text := p_base_table;
  v_prev_ref text := p_base_table;
  v_tables   text[] := '{}';
  v_aliases  text[] := '{}';
  v_joins    text[] := '{}';
  v_first_fk text;
  v_leaf_col text;
  v_inner    text;
  v_act      text;
  v_i        int := 0;
  hop        jsonb;
  v_tbl      text;
  v_pk       text;
  v_fk       text;
BEGIN
  IF jsonb_array_length(v_path) = 0 THEN
    RETURN NULL;   -- empty path = field on the base entity → normal filter
  END IF;

  FOR hop IN SELECT * FROM jsonb_array_elements(v_path) LOOP
    v_i  := v_i + 1;
    v_tbl := public.dashboard_resolve_table(hop->>'entity');
    v_fk  := public.dashboard_assert_column(v_prev_tbl, hop->>'fk');
    v_pk  := public.dashboard_pk_column(v_tbl);
    v_tables  := v_tables  || v_tbl;
    v_aliases := v_aliases || ('rf' || v_i);
    v_joins   := v_joins   || format('%I.%I = %I.%I', 'rf' || v_i, v_pk, v_prev_ref, v_fk);
    IF v_i = 1 THEN v_first_fk := v_fk; END IF;
    v_prev_ref := 'rf' || v_i;
    v_prev_tbl := v_tbl;
  END LOOP;

  v_leaf_col := public.dashboard_assert_column(v_prev_tbl, p_rf->>'field');
  v_inner := public.dashboard_predicate_expr(
               format('%I.%I', v_aliases[array_length(v_aliases, 1)], v_leaf_col), p_rf);

  FOR v_i IN REVERSE array_length(v_tables, 1)..1 LOOP
    v_act := public.dashboard_active_pred(v_tables[v_i], v_aliases[v_i]);
    v_inner := format('EXISTS (SELECT 1 FROM public.%I %I WHERE %s%s AND %s)',
                      v_tables[v_i], v_aliases[v_i], v_joins[v_i],
                      CASE WHEN v_act <> '' THEN ' AND ' || v_act ELSE '' END,
                      v_inner);
  END LOOP;
  RETURN v_inner;
END;
$$;

-- ── aggregate engine — deleted_at-aware base guard, ALWAYS ANDed ──────────────
CREATE OR REPLACE FUNCTION public.dashboard_aggregate(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_table    text := public.dashboard_resolve_table(p_config->>'entity');
  v_sel      text[] := '{}';
  v_group    text[] := '{}';
  v_preds    text[] := '{}';
  v_sempreds text[] := '{}';
  v_and      text[] := '{}';
  v_active   text := '';
  v_logic    text := CASE WHEN lower(COALESCE(p_config->>'filterLogic','and')) = 'or' THEN ' OR ' ELSE ' AND ' END;
  v_order    text := '';
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
  g jsonb; a jsonb; f jsonb;
BEGIN
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

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'filters','[]'::jsonb))
  LOOP
    v_preds := v_preds || public.dashboard_build_predicate(v_table, f);
  END LOOP;

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'semanticFilters','[]'::jsonb))
  LOOP
    v_sem := public.dashboard_build_semantic_predicate(v_table, f);
    IF v_sem IS NOT NULL AND v_sem <> '' THEN v_sempreds := v_sempreds || v_sem; END IF;
  END LOOP;

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'relatedFilters','[]'::jsonb))
  LOOP
    v_sem := public.dashboard_build_related_predicate(v_table, f);
    IF v_sem IS NOT NULL AND v_sem <> '' THEN v_sempreds := v_sempreds || v_sem; END IF;
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

-- ── record query — deleted_at-aware base guard, ALWAYS ANDed ──────────────────
CREATE OR REPLACE FUNCTION public.dashboard_record_query(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_table    text := public.dashboard_resolve_table(p_config->>'entity');
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
  v_sem      text;
  v_sql      text;
  v_rows     jsonb;
  v_total    bigint;
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

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'semanticFilters','[]'::jsonb))
  LOOP
    v_sem := public.dashboard_build_semantic_predicate(v_table, f);
    IF v_sem IS NOT NULL AND v_sem <> '' THEN v_sempreds := v_sempreds || v_sem; END IF;
  END LOOP;

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'relatedFilters','[]'::jsonb))
  LOOP
    v_sem := public.dashboard_build_related_predicate(v_table, f);
    IF v_sem IS NOT NULL AND v_sem <> '' THEN v_sempreds := v_sempreds || v_sem; END IF;
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

-- ── slicer source WHERE — deleted_at-aware base guard, ALWAYS ANDed ───────────
CREATE OR REPLACE FUNCTION public.dashboard_source_where(p_table text, p_source jsonb)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_preds   text[] := '{}';
  v_sem     text[] := '{}';
  v_and     text[] := '{}';
  v_active  text := '';
  v_logic   text := CASE WHEN lower(COALESCE(p_source->>'filterLogic','and')) = 'or' THEN ' OR ' ELSE ' AND ' END;
  v_where   text := '';
  v_one     text;
  f jsonb;
BEGIN
  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_source->'filters','[]'::jsonb)) LOOP
    v_preds := v_preds || public.dashboard_build_predicate(p_table, f);
  END LOOP;

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_source->'semanticFilters','[]'::jsonb)) LOOP
    v_one := public.dashboard_build_semantic_predicate(p_table, f);
    IF v_one IS NOT NULL AND v_one <> '' THEN v_sem := v_sem || v_one; END IF;
  END LOOP;
  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_source->'relatedFilters','[]'::jsonb)) LOOP
    v_one := public.dashboard_build_related_predicate(p_table, f);
    IF v_one IS NOT NULL AND v_one <> '' THEN v_sem := v_sem || v_one; END IF;
  END LOOP;

  IF COALESCE((p_source->>'includeDeleted')::boolean, false) = false THEN
    v_active := public.dashboard_active_pred(p_table, p_table);
  END IF;

  IF v_active <> '' THEN v_and := v_and || ('(' || v_active || ')'); END IF;
  IF array_length(v_preds, 1) IS NOT NULL THEN
    v_and := v_and || ('(' || array_to_string(v_preds, v_logic) || ')');
  END IF;
  IF array_length(v_sem, 1) IS NOT NULL THEN
    v_and := v_and || array_to_string(v_sem, ' AND ');
  END IF;
  IF array_length(v_and, 1) IS NOT NULL THEN
    v_where := array_to_string(v_and, ' AND ');     -- caller prepends ' WHERE '
  END IF;
  RETURN v_where;
END;
$$;

-- ── slicer distinct values — guard every joined path table ────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_source_distinct(p_source jsonb)
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_base      text := public.dashboard_resolve_table(p_source->>'entity');
  v_where     text := public.dashboard_source_where(v_base, p_source);
  v_base_sub  text;
  v_steps     jsonb := COALESCE(p_source #> '{path,steps}', '[]'::jsonb);
  v_target    uuid  := NULLIF(p_source #>> '{path,targetFieldId}', '')::uuid;
  v_prev_tbl  text  := v_base;
  v_prev_ref  text  := 'b0';
  v_joins     text  := '';
  v_acts      text  := '';     -- soft-delete guards for the joined path tables
  v_one_act   text;
  v_leaf_col  text;
  v_leaf_ent  uuid;
  v_leaf_tbl  text;
  v_leaf_ref  text;
  v_step      jsonb;
  v_i         int := 0;
  step        jsonb;
  v_sql       text;
BEGIN
  v_base_sub := format('(SELECT * FROM public.%I%s) b0', v_base,
                       CASE WHEN v_where <> '' THEN ' WHERE ' || v_where ELSE '' END);

  IF jsonb_array_length(v_steps) = 0 THEN
    v_leaf_col := public.dashboard_assert_column(v_base, p_source->>'field');
    v_sql := format('SELECT DISTINCT b0.%I::text FROM %s WHERE b0.%I IS NOT NULL',
                    v_leaf_col, v_base_sub, v_leaf_col);
    RETURN QUERY EXECUTE v_sql;
    RETURN;
  END IF;

  FOR step IN SELECT * FROM jsonb_array_elements(v_steps) LOOP
    v_i := v_i + 1;
    v_step := public.dashboard_resolve_lookup_step((step->>'lookupFieldId')::uuid, step->>'direction');
    IF (v_step->>'from_table') <> v_prev_tbl THEN
      RAISE EXCEPTION 'dashboard: relationship path break at step % (expected %, got %)',
        v_i, v_prev_tbl, v_step->>'from_table' USING ERRCODE = '22023';
    END IF;
    v_joins := v_joins || format(' JOIN public.%I %I ON %I.%I = %I.%I',
                 v_step->>'to_table', 'p' || v_i, 'p' || v_i, v_step->>'to_col',
                 v_prev_ref, v_step->>'from_col');
    v_one_act := public.dashboard_active_pred(v_step->>'to_table', 'p' || v_i);
    IF v_one_act <> '' THEN v_acts := v_acts || ' AND ' || v_one_act; END IF;
    v_prev_ref := 'p' || v_i;
    v_prev_tbl := v_step->>'to_table';
  END LOOP;
  v_leaf_ref := v_prev_ref;

  SELECT fd.physical_column_name, fd.entity_definition_id
    INTO v_leaf_col, v_leaf_ent
    FROM public.field_definition fd
   WHERE fd.field_definition_id = v_target AND fd.deleted_at IS NULL;
  IF v_leaf_col IS NULL THEN
    RAISE EXCEPTION 'dashboard: invalid target field %', v_target USING ERRCODE = '22023';
  END IF;
  SELECT physical_table_name INTO v_leaf_tbl FROM public.entity_definition WHERE entity_definition_id = v_leaf_ent;
  IF v_leaf_tbl IS DISTINCT FROM v_prev_tbl THEN
    RAISE EXCEPTION 'dashboard: target field not on final path entity' USING ERRCODE = '22023';
  END IF;

  v_sql := format('SELECT DISTINCT %I.%I::text FROM %s%s WHERE %I.%I IS NOT NULL%s',
                  v_leaf_ref, v_leaf_col, v_base_sub, v_joins, v_leaf_ref, v_leaf_col, v_acts);
  RETURN QUERY EXECUTE v_sql;
END;
$$;

-- ── slicer label resolution — deleted_at-aware guard on the master table ──────
CREATE OR REPLACE FUNCTION public.dashboard_distinct_values(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit        int := LEAST(GREATEST(COALESCE((p_config->>'limit')::int, 2000), 1), 10000);
  v_vals         text[] := '{}';
  v_ids          jsonb;
  v_options      jsonb;
  v_label_ent    text := NULLIF(p_config->>'labelEntity', '');
  v_label_tbl    text;
  v_label_col    text;
  v_label_pk     text;
  v_label_active text := '';
  v_sql          text;
  src jsonb;
BEGIN
  FOR src IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'sources','[]'::jsonb)) LOOP
    BEGIN
      v_vals := array_cat(v_vals, ARRAY(SELECT public.dashboard_source_distinct(src)));
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) INTO v_ids
    FROM (SELECT DISTINCT v FROM unnest(v_vals) v WHERE v IS NOT NULL ORDER BY v LIMIT v_limit) t(v);

  IF v_label_ent IS NULL OR jsonb_array_length(v_ids) = 0 THEN
    RETURN jsonb_build_object('values', v_ids, 'options', '[]'::jsonb);
  END IF;

  v_label_tbl := public.dashboard_resolve_table(v_label_ent);
  v_label_pk  := public.dashboard_pk_column(v_label_tbl);
  v_label_col := public.dashboard_assert_column(v_label_tbl, COALESCE(p_config->>'labelField', v_label_pk));

  IF COALESCE((p_config->>'includeDeleted')::boolean, false) = false THEN
    v_label_active := public.dashboard_active_pred(v_label_tbl, v_label_tbl);
  END IF;

  v_sql := format(
    'SELECT COALESCE(jsonb_agg(jsonb_build_object(''id'', %I::text, ''label'', %I::text) ORDER BY %I::text), ''[]''::jsonb) '
    || 'FROM public.%I WHERE %I::text IN (SELECT jsonb_array_elements_text(%L::jsonb))%s',
    v_label_pk, v_label_col, v_label_col, v_label_tbl, v_label_pk, v_ids::text,
    CASE WHEN v_label_active <> '' THEN ' AND ' || v_label_active ELSE '' END);
  EXECUTE v_sql INTO v_options;

  RETURN jsonb_build_object('values', v_ids, 'options', COALESCE(v_options, '[]'::jsonb));
END;
$$;

NOTIFY pgrst, 'reload schema';
