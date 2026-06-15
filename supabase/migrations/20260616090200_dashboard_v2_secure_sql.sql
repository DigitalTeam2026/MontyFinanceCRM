/*
  # Dashboard v2 — secure read-only SQL execution

  Lets privileged admins back a widget with a custom SELECT, executed safely
  SERVER-SIDE (never arbitrary SQL from the browser). Safety model:

   - A dedicated `reporting` schema of read-only views with `security_invoker=on`,
     so the CALLER's RLS applies through them (record-level security respected).
   - `security.execute_dashboard_sql()` is SECURITY INVOKER, sets a short
     statement_timeout, forces search_path to `reporting`, validates SELECT/CTE-only,
     blocks DDL/DML/multi-statement/comments and references to sensitive schemas,
     binds named params, caps returned rows, and logs every execution.
   - Gated by the `__execute_dashboard_sql__` privilege.

  Prefer querying `reporting.*` views over operational tables.
  Idempotent.
*/

CREATE SCHEMA IF NOT EXISTS reporting;
GRANT USAGE ON SCHEMA reporting TO authenticated;

-- ── Read-only reporting views (RLS of the caller applies via security_invoker) ──
-- These are SELECT * passthroughs so they never drift from the underlying column
-- names (the operational tables vary, and crm_prospect is not in any migration).
-- security_invoker=on means the CALLER's RLS still scopes every row, so a SQL
-- widget can only ever read records the current user is already permitted to see.
-- Each view is created defensively — only if its base table exists.
DO $$
DECLARE
  r record;
  v_filter text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('opportunity_summary', 'opportunity', ''),
    ('lead_summary',        'lead',        ''),
    ('account_summary',     'account',     ''),
    ('contact_summary',     'contact',     ''),
    ('prospect_summary',    'crm_prospect',''),
    ('product_summary',     'product',     'deleted_at')   -- soft-delete column, filtered if present
  ) AS t(vname, tbl, soft_col)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=r.tbl) THEN
      v_filter := '';
      IF r.soft_col <> '' AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=r.tbl AND column_name=r.soft_col
      ) THEN
        v_filter := format(' WHERE %I IS NULL', r.soft_col);
      END IF;
      EXECUTE format(
        'CREATE OR REPLACE VIEW reporting.%I WITH (security_invoker = on) AS SELECT * FROM public.%I%s',
        r.vname, r.tbl, v_filter
      );
    END IF;
  END LOOP;
END $$;

GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting GRANT SELECT ON TABLES TO authenticated;

-- ── Logging helper (SECURITY DEFINER so it can always write the audit row) ──
CREATE OR REPLACE FUNCTION security.log_dashboard_execution(
  p_sql text, p_params jsonb, p_row_count int, p_duration_ms int, p_status text, p_error text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.dashboard_execution_log(executed_by, sql_text, params, row_count, duration_ms, status, error_message)
  VALUES (auth.uid(), p_sql, p_params, p_row_count, p_duration_ms, p_status, p_error);
$$;
REVOKE ALL ON FUNCTION security.log_dashboard_execution(text, jsonb, int, int, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION security.log_dashboard_execution(text, jsonb, int, int, text, text) TO authenticated;

-- ── The executor ──
CREATE OR REPLACE FUNCTION security.execute_dashboard_sql(p_sql text, p_params jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER          -- RLS via reporting.* security_invoker views applies
SET search_path = reporting, pg_temp
AS $$
DECLARE
  v_sql     text := btrim(coalesce(p_sql, ''));
  v_lower   text;
  v_key     text;
  v_val     text;
  v_wrapped text;
  v_rows    jsonb := '[]'::jsonb;
  v_cols    jsonb := '[]'::jsonb;
  v_count   int := 0;
  v_start   timestamptz := clock_timestamp();
  v_ms      int;
  v_cap     int := 5000;
BEGIN
  -- Authorisation.
  IF NOT (security.is_system_admin() OR security.can_execute_dashboard_sql()) THEN
    PERFORM security.log_dashboard_execution(v_sql, p_params, NULL, 0, 'blocked', 'not authorised');
    RAISE EXCEPTION 'Not authorised to execute dashboard SQL';
  END IF;

  v_lower := lower(v_sql);

  -- Read-only / single-statement / no-comment validation (defence in depth;
  -- the Edge Function validates first).
  IF v_lower !~ '^(with|select)\s' THEN
    PERFORM security.log_dashboard_execution(v_sql, p_params, NULL, 0, 'blocked', 'must start with SELECT or WITH');
    RAISE EXCEPTION 'Only SELECT / WITH queries are allowed';
  END IF;
  IF v_lower ~ '\m(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|vacuum|merge|call|do|comment|reindex|cluster)\M' THEN
    PERFORM security.log_dashboard_execution(v_sql, p_params, NULL, 0, 'blocked', 'forbidden keyword');
    RAISE EXCEPTION 'Query contains a forbidden keyword';
  END IF;
  IF position(';' in rtrim(v_sql, ';')) > 0 THEN
    PERFORM security.log_dashboard_execution(v_sql, p_params, NULL, 0, 'blocked', 'multiple statements');
    RAISE EXCEPTION 'Multiple statements are not allowed';
  END IF;
  IF v_sql ~ '(--|/\*|\*/)' THEN
    PERFORM security.log_dashboard_execution(v_sql, p_params, NULL, 0, 'blocked', 'comments not allowed');
    RAISE EXCEPTION 'Comments are not allowed';
  END IF;
  -- Block access to sensitive schemas (defence in depth; search_path is reporting).
  IF v_lower ~ '\m(auth|security|pg_catalog|information_schema|public|storage|vault|extensions)\s*\.' THEN
    PERFORM security.log_dashboard_execution(v_sql, p_params, NULL, 0, 'blocked', 'schema not allowed');
    RAISE EXCEPTION 'Only reporting.* objects may be queried';
  END IF;

  -- Bind named parameters (:name) as safely-quoted literals.
  IF p_params IS NOT NULL THEN
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(p_params) LOOP
      v_sql := regexp_replace(v_sql, ':' || v_key || '\y', quote_nullable(v_val), 'g');
    END LOOP;
  END IF;

  -- Short timeout + row cap.
  SET LOCAL statement_timeout = '8s';
  v_wrapped := format(
    'SELECT coalesce(jsonb_agg(r), ''[]''::jsonb) FROM (SELECT * FROM (%s) _q LIMIT %s) r',
    v_sql, v_cap
  );
  EXECUTE v_wrapped INTO v_rows;

  v_count := jsonb_array_length(coalesce(v_rows, '[]'::jsonb));
  IF v_count > 0 THEN
    SELECT jsonb_agg(jsonb_build_object('name', k)) INTO v_cols
    FROM jsonb_object_keys(v_rows->0) AS k;
  END IF;

  v_ms := (extract(epoch FROM clock_timestamp() - v_start) * 1000)::int;
  PERFORM security.log_dashboard_execution(v_sql, p_params, v_count, v_ms, 'ok', NULL);

  RETURN jsonb_build_object('columns', coalesce(v_cols, '[]'::jsonb), 'rows', v_rows,
                            'rowCount', v_count, 'durationMs', v_ms, 'status', 'ok');
EXCEPTION WHEN OTHERS THEN
  v_ms := (extract(epoch FROM clock_timestamp() - v_start) * 1000)::int;
  PERFORM security.log_dashboard_execution(v_sql, p_params, NULL, v_ms, 'error', SQLERRM);
  RETURN jsonb_build_object('status', 'error', 'error', SQLERRM, 'durationMs', v_ms);
END;
$$;
REVOKE ALL ON FUNCTION security.execute_dashboard_sql(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION security.execute_dashboard_sql(text, jsonb) TO authenticated;

-- Public wrapper so PostgREST (.rpc) and the Edge Function can reach it. SECURITY
-- INVOKER preserves the caller's identity so RLS still applies inside.
CREATE OR REPLACE FUNCTION public.execute_dashboard_sql(p_sql text, p_params jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$ SELECT security.execute_dashboard_sql(p_sql, p_params); $$;
REVOKE ALL ON FUNCTION public.execute_dashboard_sql(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.execute_dashboard_sql(text, jsonb) TO authenticated;
