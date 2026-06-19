/*
  # Dashboard global semantic filters

  One slicer selection → many entity-specific translations. A semantic filter
  (e.g. business_date, country) is defined once per dashboard and mapped to each
  entity's field — directly, or through a relationship PATH of lookup fields.
  Each visual keeps its own base entity and its own secure query; the slicer only
  distributes the selected value, which each visual translates into its own
  physical field (direct) or a nested EXISTS over the relationship path.

  Three definition tables (RLS via security.dashboard_can, dashboard_id
  denormalised for fast RLS, like dashboard_visual) + query-engine helpers that
  resolve relationship paths SERVER-SIDE from field_definition metadata. No raw
  SQL or physical names ever cross from the client for paths — only validated
  metadata ids (lookup field ids + target field id). Everything is quote_ident /
  quote_literal'd and runs SECURITY INVOKER, so the CRM's per-entity RLS applies
  to every table touched along the path.

  EXISTS (not JOIN) is used for relationship filtering so one-to-many links can
  never duplicate COUNT/SUM/AVG/KPI totals on the base entity.
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 1. dashboard_semantic_filter  (logical filter defined once per dashboard)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dashboard_semantic_filter (
  dashboard_semantic_filter_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id                 uuid        NOT NULL REFERENCES public.dashboard(dashboard_id) ON DELETE CASCADE,
  key                          text        NOT NULL,
  label                        text        NOT NULL DEFAULT '',
  data_type                    text        NOT NULL DEFAULT 'date'
                                 CHECK (data_type IN ('date','choice','lookup','text','number','boolean')),
  scope                        text        NOT NULL DEFAULT 'dashboard'
                                 CHECK (scope IN ('dashboard','page','selected')),
  default_value                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  config                       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  modified_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_dashboard_semantic_filter_key
  ON public.dashboard_semantic_filter (dashboard_id, key);
CREATE INDEX IF NOT EXISTS idx_dashboard_semantic_filter_dashboard
  ON public.dashboard_semantic_filter (dashboard_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. dashboard_filter_mapping  (semantic filter → one entity's field or path)
--    relationship_path = { sourceEntityId, targetFieldId,
--      steps: [ { lookupFieldId, direction:'forward'|'reverse', joinType } ] }
--    Direct mapping: empty steps, use target_field_id on target_entity_id.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dashboard_filter_mapping (
  dashboard_filter_mapping_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id                 uuid        NOT NULL REFERENCES public.dashboard(dashboard_id) ON DELETE CASCADE,
  semantic_filter_id           uuid        NOT NULL REFERENCES public.dashboard_semantic_filter(dashboard_semantic_filter_id) ON DELETE CASCADE,
  target_entity_id             uuid,       -- entity_definition_id (validated at resolve, no hard FK)
  target_field_id              uuid,       -- field_definition_id (direct mapping leaf)
  relationship_path            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  join_mode                    text        NOT NULL DEFAULT 'auto'
                                 CHECK (join_mode IN ('auto','inner','left','exists')),
  null_behavior                text        NOT NULL DEFAULT 'exclude'
                                 CHECK (null_behavior IN ('exclude','include')),
  priority                     int         NOT NULL DEFAULT 0,
  is_active                    boolean     NOT NULL DEFAULT true,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  modified_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_filter_mapping_dashboard
  ON public.dashboard_filter_mapping (dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_filter_mapping_semantic
  ON public.dashboard_filter_mapping (semantic_filter_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. dashboard_visual_filter_binding  (per-visual override of a semantic filter)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dashboard_visual_filter_binding (
  dashboard_visual_filter_binding_id uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id               uuid          NOT NULL REFERENCES public.dashboard(dashboard_id) ON DELETE CASCADE,
  visual_id                  uuid          NOT NULL REFERENCES public.dashboard_visual(dashboard_visual_id) ON DELETE CASCADE,
  semantic_filter_id         uuid          NOT NULL REFERENCES public.dashboard_semantic_filter(dashboard_semantic_filter_id) ON DELETE CASCADE,
  behavior                   text          NOT NULL DEFAULT 'direct'
                               CHECK (behavior IN ('direct','related','dashboard','page','selected','ignore')),
  relationship_path_override jsonb         NOT NULL DEFAULT '{}'::jsonb,
  is_enabled                 boolean       NOT NULL DEFAULT true,
  created_at                 timestamptz   NOT NULL DEFAULT now(),
  modified_at                timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_visual_filter_binding_dashboard
  ON public.dashboard_visual_filter_binding (dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_visual_filter_binding_visual
  ON public.dashboard_visual_filter_binding (visual_id);

-- ── modified_at touch triggers (reuse the designer's trigger function) ────────
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dashboard_semantic_filter','dashboard_filter_mapping','dashboard_visual_filter_binding']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON public.%I '
                || 'FOR EACH ROW EXECUTE FUNCTION public.dashboard_touch_modified()', t, t);
  END LOOP;
END $do$;

-- ── RLS (parent dashboard governs: read=read, write=ins/upd/del) ──────────────
ALTER TABLE public.dashboard_semantic_filter        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_filter_mapping         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_visual_filter_binding  ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dashboard_semantic_filter','dashboard_filter_mapping','dashboard_visual_filter_binding']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %s_sel ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %s_sel ON public.%I FOR SELECT TO authenticated '
                || 'USING (security.dashboard_can(dashboard_id, ''read''))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_ins ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %s_ins ON public.%I FOR INSERT TO authenticated '
                || 'WITH CHECK (security.dashboard_can(dashboard_id, ''write''))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_upd ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %s_upd ON public.%I FOR UPDATE TO authenticated '
                || 'USING (security.dashboard_can(dashboard_id, ''write'')) '
                || 'WITH CHECK (security.dashboard_can(dashboard_id, ''write''))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_del ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %s_del ON public.%I FOR DELETE TO authenticated '
                || 'USING (security.dashboard_can(dashboard_id, ''write''))', t, t);
  END LOOP;
END $do$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_semantic_filter       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_filter_mapping        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_visual_filter_binding TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Query-engine helpers for semantic / relationship-path resolution
-- ════════════════════════════════════════════════════════════════════════════

-- Build a predicate from {op,value,value2} against an ALREADY-QUOTED column
-- expression (e.g. '"createdon"' or 'sf2."country_id"'). Pure string building.
CREATE OR REPLACE FUNCTION public.dashboard_predicate_expr(c text, p_f jsonb)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_op   text := lower(COALESCE(p_f->>'op', 'eq'));
  v_val  text := p_f->>'value';
  v_val2 text := p_f->>'value2';
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

-- Re-point the original predicate builder at the shared expr builder (behaviour
-- unchanged; the column is validated against the table first).
CREATE OR REPLACE FUNCTION public.dashboard_build_predicate(p_table text, p_f jsonb)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE v_col text := public.dashboard_assert_column(p_table, p_f->>'field');
BEGIN
  RETURN public.dashboard_predicate_expr(format('%I', v_col), p_f);
END;
$$;

-- Primary-key column of a base table (validated, used to join relationship steps).
CREATE OR REPLACE FUNCTION public.dashboard_pk_column(p_table text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE v_col text;
BEGIN
  SELECT a.attname INTO v_col
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
   WHERE i.indrelid = format('public.%I', p_table)::regclass
     AND i.indisprimary
   LIMIT 1;
  IF v_col IS NULL THEN
    RAISE EXCEPTION 'dashboard: no primary key on %', p_table USING ERRCODE = '22023';
  END IF;
  RETURN v_col;
END;
$$;

-- Resolve ONE relationship step (a lookup field id + direction) into the outer/
-- inner join sides. forward = the FK lives on the current (outer) table; reverse
-- = walk back from the lookup target into its children. Raises on unknown /
-- inactive / unresolved ids → invalid relationships are rejected, never guessed.
CREATE OR REPLACE FUNCTION public.dashboard_resolve_lookup_step(p_field_id uuid, p_direction text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_fk            text;
  v_owner_entity  uuid;
  v_lookup_entity uuid;
  v_owner_table   text;
  v_target_table  text;
  v_owner_pk      text;
  v_target_pk     text;
BEGIN
  SELECT fd.physical_column_name, fd.entity_definition_id, fd.lookup_entity_id
    INTO v_fk, v_owner_entity, v_lookup_entity
    FROM public.field_definition fd
   WHERE fd.field_definition_id = p_field_id
     AND fd.deleted_at IS NULL
     AND fd.is_active = true
     AND fd.lookup_entity_id IS NOT NULL;
  IF v_fk IS NULL THEN
    RAISE EXCEPTION 'dashboard: invalid lookup field %', p_field_id USING ERRCODE = '22023';
  END IF;

  SELECT physical_table_name INTO v_owner_table  FROM public.entity_definition WHERE entity_definition_id = v_owner_entity  AND deleted_at IS NULL;
  SELECT physical_table_name INTO v_target_table FROM public.entity_definition WHERE entity_definition_id = v_lookup_entity AND deleted_at IS NULL;
  IF v_owner_table IS NULL OR v_target_table IS NULL THEN
    RAISE EXCEPTION 'dashboard: lookup field % has unresolved entity', p_field_id USING ERRCODE = '22023';
  END IF;

  v_owner_pk  := public.dashboard_pk_column(v_owner_table);
  v_target_pk := public.dashboard_pk_column(v_target_table);

  IF lower(COALESCE(p_direction, 'forward')) = 'reverse' THEN
    -- current = lookup target; inner = owner children; join inner.fk = current.pk
    RETURN jsonb_build_object('from_table', v_target_table, 'from_col', v_target_pk,
                              'to_table',   v_owner_table,  'to_col',   v_fk);
  END IF;
  -- forward: current = owner; inner = lookup target; join inner.pk = current.fk
  RETURN jsonb_build_object('from_table', v_owner_table,  'from_col', v_fk,
                            'to_table',   v_target_table, 'to_col',   v_target_pk);
END;
$$;

-- Build ONE predicate for a semantic-filter entry that has a relationship PATH.
-- p_sem = { path:{ steps:[{lookupFieldId,direction}], targetFieldId },
--           filters:[{op,value,value2}], joinMode, nullBehavior }
-- Returns a nested EXISTS chain (no row multiplication) or NULL for direct/empty.
CREATE OR REPLACE FUNCTION public.dashboard_build_semantic_predicate(p_base_table text, p_sem jsonb)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_steps        jsonb := COALESCE(p_sem #> '{path,steps}', '[]'::jsonb);
  v_target_field uuid  := NULLIF(p_sem #>> '{path,targetFieldId}', '')::uuid;
  v_null         text  := lower(COALESCE(p_sem->>'nullBehavior', 'exclude'));
  v_prev_table   text  := p_base_table;
  v_prev_ref     text  := p_base_table;     -- correlation name for the outer side
  v_tables       text[] := '{}';
  v_aliases      text[] := '{}';
  v_joins        text[] := '{}';
  v_first_from   text;
  v_leaf_col     text;
  v_leaf_entity  uuid;
  v_leaf_table   text;
  v_inner        text;
  v_i            int := 0;
  step           jsonb;
  v_step         jsonb;
BEGIN
  IF jsonb_array_length(v_steps) = 0 THEN
    RETURN NULL;   -- direct mapping → handled client-side as a normal filter
  END IF;

  -- forward pass: resolve each step into (to_table, alias, join-condition)
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

  -- leaf field on the final table
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

  -- leaf predicate(s) on the final alias column (AND of all leaf filters)
  SELECT string_agg(public.dashboard_predicate_expr(
           format('%I.%I', v_aliases[array_length(v_aliases, 1)], v_leaf_col), f), ' AND ')
    INTO v_inner
    FROM jsonb_array_elements(COALESCE(p_sem->'filters', '[]'::jsonb)) f;
  IF v_inner IS NULL OR v_inner = '' THEN RETURN NULL; END IF;

  -- assemble nested EXISTS from the innermost step outward
  FOR v_i IN REVERSE array_length(v_tables, 1)..1 LOOP
    v_inner := format('EXISTS (SELECT 1 FROM public.%I %I WHERE %s AND %s)',
                      v_tables[v_i], v_aliases[v_i], v_joins[v_i], v_inner);
  END LOOP;

  IF v_null = 'include' AND v_first_from IS NOT NULL THEN
    v_inner := format('(%s OR %I.%I IS NULL)', v_inner, p_base_table, v_first_from);
  END IF;

  RETURN v_inner;
END;
$$;

-- Build ONE predicate for an interactive cross-filter that reaches the queried
-- entity through a relationship chain expressed as FK-column hops (target-first):
-- p_rf = { path:[{fk, entity}], field, op, value, value2 }. Each hop's fk is a
-- column on the current table pointing at hop.entity's table; the leaf field
-- lives on the final (source) entity. Built as nested EXISTS so a one-to-many
-- hop can never duplicate base rows. Every identifier is validated + quoted.
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
  v_i        int := 0;
  hop        jsonb;
  v_tbl      text;
  v_pk       text;
  v_fk       text;
BEGIN
  IF jsonb_array_length(v_path) = 0 THEN
    -- empty path = field lives on the base entity → caller uses a normal filter
    RETURN NULL;
  END IF;

  FOR hop IN SELECT * FROM jsonb_array_elements(v_path) LOOP
    v_i  := v_i + 1;
    v_tbl := public.dashboard_resolve_table(hop->>'entity');           -- validates base table
    v_fk  := public.dashboard_assert_column(v_prev_tbl, hop->>'fk');    -- fk on the outer table
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
    v_inner := format('EXISTS (SELECT 1 FROM public.%I %I WHERE %s AND %s)',
                      v_tables[v_i], v_aliases[v_i], v_joins[v_i], v_inner);
  END LOOP;
  RETURN v_inner;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_predicate_expr(text, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.dashboard_pk_column(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.dashboard_resolve_lookup_step(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.dashboard_build_semantic_predicate(text, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.dashboard_build_related_predicate(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_predicate_expr(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_pk_column(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_resolve_lookup_step(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_build_semantic_predicate(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_build_related_predicate(text, jsonb) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Extend the aggregate + record RPCs with a semanticFilters[] pass
--    (direct mappings arrive as normal filters; only PATH mappings come here).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.dashboard_aggregate(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_table   text := public.dashboard_resolve_table(p_config->>'entity');
  v_sel     text[] := '{}';
  v_group   text[] := '{}';
  v_preds   text[] := '{}';
  v_sempreds text[] := '{}';
  v_logic   text := CASE WHEN lower(COALESCE(p_config->>'filterLogic','and')) = 'or' THEN ' OR ' ELSE ' AND ' END;
  v_order   text := '';
  v_limit   int  := LEAST(GREATEST(COALESCE((p_config->>'limit')::int, 1000), 1), 50000);
  v_grain   text;
  v_expr    text;
  v_alias   text;
  v_fn      text;
  v_col     text;
  v_sem     text;
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

  -- Semantic (relationship-path) filters → nested EXISTS, always ANDed.
  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'semanticFilters','[]'::jsonb))
  LOOP
    v_sem := public.dashboard_build_semantic_predicate(v_table, f);
    IF v_sem IS NOT NULL AND v_sem <> '' THEN v_sempreds := v_sempreds || v_sem; END IF;
  END LOOP;

  -- Interactive cross-entity filters (FK-column paths) → nested EXISTS, ANDed.
  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'relatedFilters','[]'::jsonb))
  LOOP
    v_sem := public.dashboard_build_related_predicate(v_table, f);
    IF v_sem IS NOT NULL AND v_sem <> '' THEN v_sempreds := v_sempreds || v_sem; END IF;
  END LOOP;

  IF array_length(v_preds, 1) IS NOT NULL THEN
    v_where := array_to_string(v_preds, v_logic);
  END IF;
  IF array_length(v_sempreds, 1) IS NOT NULL THEN
    v_where := CASE WHEN v_where = '' THEN array_to_string(v_sempreds, ' AND ')
                    ELSE format('(%s) AND %s', v_where, array_to_string(v_sempreds, ' AND ')) END;
  END IF;
  IF v_where <> '' THEN v_where := ' WHERE ' || v_where; END IF;

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

CREATE OR REPLACE FUNCTION public.dashboard_record_query(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_table  text := public.dashboard_resolve_table(p_config->>'entity');
  v_cols   text[] := '{}';
  v_preds  text[] := '{}';
  v_sempreds text[] := '{}';
  v_logic  text := CASE WHEN lower(COALESCE(p_config->>'filterLogic','and'))='or' THEN ' OR ' ELSE ' AND ' END;
  v_page   int := GREATEST(COALESCE((p_config->>'page')::int, 0), 0);
  v_size   int := LEAST(GREATEST(COALESCE((p_config->>'pageSize')::int, 50), 1), 1000);
  v_where  text := '';
  v_order  text := '';
  v_sem    text;
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

  IF array_length(v_preds,1) IS NOT NULL THEN
    v_where := array_to_string(v_preds, v_logic);
  END IF;
  IF array_length(v_sempreds,1) IS NOT NULL THEN
    v_where := CASE WHEN v_where = '' THEN array_to_string(v_sempreds, ' AND ')
                    ELSE format('(%s) AND %s', v_where, array_to_string(v_sempreds, ' AND ')) END;
  END IF;
  IF v_where <> '' THEN v_where := ' WHERE ' || v_where; END IF;

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

-- Make the new tables + RPC signatures visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
