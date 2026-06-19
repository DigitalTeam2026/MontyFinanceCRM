/*
  # Dashboard semantic slicer — distinct USED values (spec §6 / §7)

  A lookup/choice slicer (e.g. Industry) must render only the values ACTUALLY
  referenced by accessible records across the dashboard's related entities — never
  the whole master table. This RPC takes the slicer's per-entity "sources" (each a
  dashboard entity + how it reaches the target field: a direct column, or a
  relationship PATH of lookup-field ids) plus the OTHER active filters already
  translated for that entity, and returns the de-duplicated set of target ids in
  use.

  Per source it:
    • filters the base entity by the other active filters (reusing the validated
      predicate builders + the soft-delete guard) inside a single-table derived
      table — so unqualified columns can never become ambiguous once we join,
    • walks the relationship path forward with dashboard_resolve_lookup_step
      (every id validated; raises on anything unknown/inactive),
    • selects DISTINCT the leaf column.
  Everything runs SECURITY INVOKER, so the CRM's per-entity RLS governs every
  table touched — a user only ever sees ids reachable through records they can
  read. Labels for the returned ids are fetched separately by the slicer through
  the existing record-query RPC (so Industry RLS drops any value they can't read).

  Self-contained: depends only on helpers shipped in
  20260617150000_dashboard_semantic_filters.sql + the base query RPC migration.
*/

-- Build the base WHERE clause for one source from its filters / semanticFilters /
-- relatedFilters (+ soft-delete guard). Returns '' when nothing applies. Mirrors
-- the assembly in dashboard_aggregate so behaviour is identical.
CREATE OR REPLACE FUNCTION public.dashboard_source_where(p_table text, p_source jsonb)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_preds   text[] := '{}';
  v_sem     text[] := '{}';
  v_logic   text := CASE WHEN lower(COALESCE(p_source->>'filterLogic','and')) = 'or' THEN ' OR ' ELSE ' AND ' END;
  v_where   text := '';
  v_one     text;
  f jsonb;
BEGIN
  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_source->'filters','[]'::jsonb)) LOOP
    v_preds := v_preds || public.dashboard_build_predicate(p_table, f);
  END LOOP;

  IF COALESCE((p_source->>'includeDeleted')::boolean, false) = false
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name=p_table AND column_name='is_deleted') THEN
    v_preds := array_prepend('is_deleted = false', v_preds);
  END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_source->'semanticFilters','[]'::jsonb)) LOOP
    v_one := public.dashboard_build_semantic_predicate(p_table, f);
    IF v_one IS NOT NULL AND v_one <> '' THEN v_sem := v_sem || v_one; END IF;
  END LOOP;
  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_source->'relatedFilters','[]'::jsonb)) LOOP
    v_one := public.dashboard_build_related_predicate(p_table, f);
    IF v_one IS NOT NULL AND v_one <> '' THEN v_sem := v_sem || v_one; END IF;
  END LOOP;

  IF array_length(v_preds, 1) IS NOT NULL THEN
    v_where := array_to_string(v_preds, v_logic);
  END IF;
  IF array_length(v_sem, 1) IS NOT NULL THEN
    v_where := CASE WHEN v_where = '' THEN array_to_string(v_sem, ' AND ')
                    ELSE format('(%s) AND %s', v_where, array_to_string(v_sem, ' AND ')) END;
  END IF;
  RETURN v_where;
END;
$$;

-- Distinct leaf values for ONE source. Direct mapping (p_source.field) or a
-- relationship PATH (p_source.path = { steps:[{lookupFieldId,direction}],
-- targetFieldId }). Returns text ids (caller unions + dedupes).
CREATE OR REPLACE FUNCTION public.dashboard_source_distinct(p_source jsonb)
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_base      text := public.dashboard_resolve_table(p_source->>'entity');
  v_where     text := public.dashboard_source_where(v_base, p_source);
  v_base_sub  text;                       -- (SELECT * FROM base WHERE …) b0
  v_steps     jsonb := COALESCE(p_source #> '{path,steps}', '[]'::jsonb);
  v_target    uuid  := NULLIF(p_source #>> '{path,targetFieldId}', '')::uuid;
  v_prev_tbl  text  := v_base;
  v_prev_ref  text  := 'b0';
  v_joins     text  := '';
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
    -- DIRECT: the target column lives on the base entity.
    v_leaf_col := public.dashboard_assert_column(v_base, p_source->>'field');
    v_sql := format('SELECT DISTINCT b0.%I::text FROM %s WHERE b0.%I IS NOT NULL',
                    v_leaf_col, v_base_sub, v_leaf_col);
    RETURN QUERY EXECUTE v_sql;
    RETURN;
  END IF;

  -- PATH: walk forward, building an inner-join chain from the base subquery.
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
    v_prev_ref := 'p' || v_i;
    v_prev_tbl := v_step->>'to_table';
  END LOOP;
  v_leaf_ref := v_prev_ref;

  -- Leaf field must live on the final path entity.
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

  v_sql := format('SELECT DISTINCT %I.%I::text FROM %s%s WHERE %I.%I IS NOT NULL',
                  v_leaf_ref, v_leaf_col, v_base_sub, v_joins, v_leaf_ref, v_leaf_col);
  RETURN QUERY EXECUTE v_sql;
END;
$$;

-- Union the distinct used values across every source, de-duplicate, cap, and
-- (optionally) resolve display labels by re-querying the target entity. Because
-- the label query is SECURITY INVOKER, the target's own RLS drops any value the
-- user may not read — so the returned options are doubly access-checked (spec §10).
-- p_config = { sources:[ <source>, … ], limit?:int,
--              labelEntity?:text, labelField?:text, includeDeleted?:bool }
CREATE OR REPLACE FUNCTION public.dashboard_distinct_values(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit       int := LEAST(GREATEST(COALESCE((p_config->>'limit')::int, 2000), 1), 10000);
  v_vals        text[] := '{}';
  v_ids         jsonb;        -- de-duplicated id set
  v_options     jsonb;        -- [{id,label}] when a label entity is supplied
  v_label_ent   text := NULLIF(p_config->>'labelEntity', '');
  v_label_tbl   text;
  v_label_col   text;
  v_label_pk    text;
  v_sql         text;
  src jsonb;
BEGIN
  FOR src IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'sources','[]'::jsonb)) LOOP
    BEGIN
      v_vals := array_cat(v_vals, ARRAY(SELECT public.dashboard_source_distinct(src)));
    EXCEPTION WHEN OTHERS THEN
      -- A single unreadable / malformed source contributes no values; never fatal.
      CONTINUE;
    END;
  END LOOP;

  -- De-duplicated id set (sorted, capped).
  SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) INTO v_ids
    FROM (SELECT DISTINCT v FROM unnest(v_vals) v WHERE v IS NOT NULL ORDER BY v LIMIT v_limit) t(v);

  IF v_label_ent IS NULL OR jsonb_array_length(v_ids) = 0 THEN
    RETURN jsonb_build_object('values', v_ids, 'options', '[]'::jsonb);
  END IF;

  -- Resolve labels against the target entity (RLS re-applies → unreadable ids drop).
  v_label_tbl := public.dashboard_resolve_table(v_label_ent);
  v_label_pk  := public.dashboard_pk_column(v_label_tbl);
  v_label_col := public.dashboard_assert_column(v_label_tbl, COALESCE(p_config->>'labelField', v_label_pk));

  v_sql := format(
    'SELECT COALESCE(jsonb_agg(jsonb_build_object(''id'', %I::text, ''label'', %I::text) ORDER BY %I::text), ''[]''::jsonb) '
    || 'FROM public.%I WHERE %I::text IN (SELECT jsonb_array_elements_text(%L::jsonb))%s',
    v_label_pk, v_label_col, v_label_col, v_label_tbl, v_label_pk, v_ids::text,
    CASE WHEN COALESCE((p_config->>'includeDeleted')::boolean, false) = false
          AND EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name=v_label_tbl AND column_name='is_deleted')
         THEN ' AND is_deleted = false' ELSE '' END);
  EXECUTE v_sql INTO v_options;

  RETURN jsonb_build_object('values', v_ids, 'options', COALESCE(v_options, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_source_where(text, jsonb)   FROM public, anon;
REVOKE ALL ON FUNCTION public.dashboard_source_distinct(jsonb)      FROM public, anon;
REVOKE ALL ON FUNCTION public.dashboard_distinct_values(jsonb)      FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_source_where(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_source_distinct(jsonb)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_distinct_values(jsonb)    TO authenticated;

NOTIFY pgrst, 'reload schema';
