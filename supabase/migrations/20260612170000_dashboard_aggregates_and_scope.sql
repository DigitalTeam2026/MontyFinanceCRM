/*
  # Dashboard Aggregates & Data Scope (Phase 1)

  ## Summary
  Server-side aggregate + scope primitives for the configurable dashboard engine.
  Replaces client-side "fetch all rows then count in JS" with grouped aggregate
  RPCs that run in the database and respect Row-Level Security.

  ## Scope model (decided: "My team" = business-unit subtree)
  - my   → records the caller owns (owner_type='user' AND owner_id = auth.uid())
  - team → records owned by any user in the caller's business-unit subtree
           (recursive over business_unit.parent_business_unit_id)
  - all  → no extra predicate; the existing RLS ceiling (read_access_level via
           crm_user_has_access) still caps what is visible.

  ## Security
  - dashboard_aggregate / dashboard_funnel are SECURITY INVOKER: they run as the
    calling user so the existing entity RLS policies apply to every row read.
    Scope only ever NARROWS within the RLS ceiling — it can never widen it.
  - dashboard_team_user_ids / dashboard_scope_options are SECURITY DEFINER so they
    can read crm_user / business_unit / role_privilege to compute capabilities;
    they only ever return data about the caller's own subtree / roles.
  - All dynamic identifiers (group-by / date / value / filter columns) are
    validated against information_schema.columns before use, so the dynamic SQL
    cannot be used for injection. Literal values are passed through quote_literal.

  ## Objects
  1. dashboard_entity_table(text)   — logical entity → physical table allowlist
  2. dashboard_safe_col(text,text)  — validate + quote a column identifier
  3. dashboard_team_user_ids()      — user ids in caller's BU subtree
  4. dashboard_scope_options()      — {my,team,all} capabilities for the caller
  5. dashboard_aggregate(...)       — grouped count/sum with date + scope + filters
  6. dashboard_funnel(...)          — ordered stage counts in one round trip
*/

-- ─── 1. Entity → physical table allowlist ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_entity_table(p_entity text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(p_entity)
    WHEN 'prospect'     THEN 'crm_prospect'
    WHEN 'crm_prospect' THEN 'crm_prospect'
    WHEN 'lead'         THEN 'lead'
    WHEN 'opportunity'  THEN 'opportunity'
    WHEN 'account'      THEN 'account'
    ELSE NULL
  END;
$$;

-- ─── 2. Validate + quote a column identifier ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_safe_col(p_table text, p_col text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = 'public'
AS $$
BEGIN
  IF p_col IS NULL OR p_col = '' THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_col
  ) THEN
    RAISE EXCEPTION 'dashboard: invalid column % for table %', p_col, p_table;
  END IF;
  RETURN quote_ident(p_col);
END;
$$;

-- ─── 3. Users in the caller's business-unit subtree ──────────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_team_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH RECURSIVE me AS (
    SELECT business_unit_id FROM crm_user WHERE crm_user.user_id = auth.uid()
  ),
  bu_tree AS (
    SELECT business_unit_id FROM business_unit
    WHERE business_unit_id = (SELECT business_unit_id FROM me)
    UNION ALL
    SELECT bu.business_unit_id FROM business_unit bu
    JOIN bu_tree t ON bu.parent_business_unit_id = t.business_unit_id
  )
  SELECT cu.user_id FROM crm_user cu
  WHERE cu.business_unit_id IN (SELECT business_unit_id FROM bu_tree);
$$;

-- ─── 4. Scope capabilities for the current user ──────────────────────────────
-- Returns e.g. {"my": true, "team": true, "all": false}. The UI uses this to
-- decide which scope buttons to show; enforcement is always server-side below.
CREATE OR REPLACE FUNCTION public.dashboard_scope_options()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_admin   boolean;
  v_team_count integer;
  v_can_all    boolean;
BEGIN
  SELECT COALESCE(cu.is_system_admin, false) INTO v_is_admin
  FROM crm_user cu WHERE cu.user_id = auth.uid();
  v_is_admin := COALESCE(v_is_admin, false);

  -- "team" is offered only when the caller's subtree contains someone besides them
  SELECT count(*) INTO v_team_count FROM dashboard_team_user_ids();

  -- "all" is offered to admins or any role granting organization-wide read on a
  -- sales entity (the dashboard's relevant entities).
  SELECT v_is_admin OR EXISTS (
    SELECT 1
    FROM user_security_role usr
    JOIN role_privilege rp ON rp.role_id = usr.role_id
    WHERE usr.user_id = auth.uid()
      AND rp.can_read = true
      AND rp.read_access_level = 'organization'
      AND rp.entity_name IN ('prospect', 'crm_prospect', 'lead', 'opportunity', 'account')
  ) INTO v_can_all;

  RETURN jsonb_build_object(
    'my',   true,
    'team', (v_team_count > 1) OR v_is_admin,
    'all',  v_can_all
  );
END;
$$;

-- ─── 5. Grouped aggregate (count / sum) with date + scope + filters ──────────
-- Returns one row per group_by value (group_key NULL when p_group_by is NULL,
-- i.e. a scalar KPI). value is COUNT(*) or SUM(value_field).
CREATE OR REPLACE FUNCTION public.dashboard_aggregate(
  p_entity      text,
  p_group_by    text         DEFAULT NULL,
  p_measure     text         DEFAULT 'count',   -- 'count' | 'sum'
  p_value_field text         DEFAULT NULL,
  p_date_field  text         DEFAULT NULL,
  p_from        timestamptz  DEFAULT NULL,
  p_to          timestamptz  DEFAULT NULL,
  p_scope       text         DEFAULT 'my',      -- 'my' | 'team' | 'all'
  p_filters     jsonb        DEFAULT '{}'::jsonb
)
RETURNS TABLE(group_key text, value numeric)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
DECLARE
  v_table        text := public.dashboard_entity_table(p_entity);
  v_group        text;
  v_date         text;
  v_val          text;
  v_measure_expr text;
  v_group_select text;
  v_where        text := ' WHERE true ';
  v_fkey         text;
  v_fval         jsonb;
  v_col          text;
  v_sql          text;
BEGIN
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'dashboard: unknown entity %', p_entity;
  END IF;

  -- soft-delete guard (all four entity tables carry is_deleted)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name=v_table AND column_name='is_deleted'
  ) THEN
    v_where := v_where || ' AND is_deleted = false ';
  END IF;

  v_group := public.dashboard_safe_col(v_table, p_group_by);
  v_date  := public.dashboard_safe_col(v_table, p_date_field);
  v_val   := public.dashboard_safe_col(v_table, p_value_field);

  -- measure
  IF lower(p_measure) = 'sum' THEN
    IF v_val IS NULL THEN
      RAISE EXCEPTION 'dashboard: sum measure requires a value field';
    END IF;
    v_measure_expr := 'COALESCE(SUM(' || v_val || '),0)::numeric';
  ELSE
    v_measure_expr := 'COUNT(*)::numeric';
  END IF;

  v_group_select := COALESCE(v_group || '::text', 'NULL::text');

  -- date range (half-open [from, to))
  IF v_date IS NOT NULL AND p_from IS NOT NULL THEN
    v_where := v_where || ' AND ' || v_date || ' >= ' || quote_literal(p_from);
  END IF;
  IF v_date IS NOT NULL AND p_to IS NOT NULL THEN
    v_where := v_where || ' AND ' || v_date || ' < ' || quote_literal(p_to);
  END IF;

  -- scope (RLS already caps the ceiling; this only narrows within it)
  IF lower(p_scope) = 'my' THEN
    v_where := v_where || ' AND owner_type = ''user'' AND owner_id = '
                       || quote_literal(auth.uid()) || '::uuid';
  ELSIF lower(p_scope) = 'team' THEN
    v_where := v_where || ' AND owner_type = ''user'' AND owner_id IN '
                       || '(SELECT user_id FROM public.dashboard_team_user_ids())';
  END IF;  -- 'all' adds nothing

  -- optional equality filters {column: value}
  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) = 'object' THEN
    FOR v_fkey, v_fval IN SELECT * FROM jsonb_each(p_filters) LOOP
      v_col := public.dashboard_safe_col(v_table, v_fkey);
      IF v_col IS NULL THEN CONTINUE; END IF;
      IF jsonb_typeof(v_fval) = 'null' THEN
        v_where := v_where || ' AND ' || v_col || ' IS NULL ';
      ELSE
        v_where := v_where || ' AND ' || v_col || '::text = '
                           || quote_literal(v_fval #>> '{}');
      END IF;
    END LOOP;
  END IF;

  v_sql := 'SELECT ' || v_group_select || ' AS group_key, '
                     || v_measure_expr || ' AS value FROM '
                     || quote_ident(v_table) || v_where;
  IF v_group IS NOT NULL THEN
    v_sql := v_sql || ' GROUP BY ' || v_group;
  END IF;

  RETURN QUERY EXECUTE v_sql;
END;
$$;

-- ─── 6. Funnel: ordered stage counts in one round trip ───────────────────────
-- p_stages: [{ "key": "...", "label": "...", "entity": "...",
--              "date_field": "...", "filters": { ... } }, ...]
-- Each stage is a scoped, date-filtered COUNT(*) on its entity.
CREATE OR REPLACE FUNCTION public.dashboard_funnel(
  p_stages jsonb,
  p_from   timestamptz DEFAULT NULL,
  p_to     timestamptz DEFAULT NULL,
  p_scope  text        DEFAULT 'my'
)
RETURNS TABLE(stage_key text, label text, value numeric)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
DECLARE
  v_stage jsonb;
  v_val   numeric;
BEGIN
  FOR v_stage IN SELECT * FROM jsonb_array_elements(p_stages) LOOP
    SELECT a.value INTO v_val
    FROM public.dashboard_aggregate(
      v_stage->>'entity',
      NULL,
      'count',
      NULL,
      v_stage->>'date_field',
      p_from,
      p_to,
      p_scope,
      COALESCE(v_stage->'filters', '{}'::jsonb)
    ) a;

    stage_key := v_stage->>'key';
    label     := v_stage->>'label';
    value     := COALESCE(v_val, 0);
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ─── 7. Permissions ──────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.dashboard_entity_table(text)               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_safe_col(text, text)             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_team_user_ids()                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_scope_options()                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_aggregate(text, text, text, text, text, timestamptz, timestamptz, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_funnel(jsonb, timestamptz, timestamptz, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.dashboard_team_user_ids()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_scope_options()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_aggregate(text, text, text, text, text, timestamptz, timestamptz, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_funnel(jsonb, timestamptz, timestamptz, text) TO authenticated;
