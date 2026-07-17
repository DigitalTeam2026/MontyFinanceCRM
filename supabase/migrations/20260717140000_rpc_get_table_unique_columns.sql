/*
  # RPC to fetch unique-constraint columns for a given table

  1. New Functions
    - `get_table_unique_columns(p_table text)` returns
      `{ "constraints": [ ["code"], ["a","b"], ... ] }` — one array of column
      names per single- or multi-column UNIQUE constraint on the public table.
      Used by the Excel importer to detect duplicate-key violations in the
      preview step, BEFORE the insert runs, instead of failing per-row.

  2. Scope
    - Only NON-primary, NON-partial unique indexes are returned. Partial unique
      indexes (e.g. `... WHERE is_deleted = false`) are excluded so the client
      never false-positives on a predicate it can't evaluate. A plain UNIQUE
      (country.code, currency.code, …) is what the importer needs to check.

  3. Security
    - Mirrors get_table_columns: SECURITY DEFINER impl in the `security` schema
      (hidden from PostgREST), SECURITY INVOKER wrapper in `public`.
    - Requires auth.uid() IS NOT NULL; anon cannot execute.
*/

CREATE OR REPLACE FUNCTION security.get_table_unique_columns(p_table text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('constraints', '[]'::json);
  END IF;
  RETURN (
    SELECT json_build_object(
      'constraints',
      COALESCE(json_agg(cols), '[]'::json)
    )
    FROM (
      SELECT array_agg(a.attname ORDER BY k.ord) AS cols
      FROM pg_index ix
      JOIN pg_class t       ON t.oid = ix.indrelid
      JOIN pg_namespace n   ON n.oid = t.relnamespace
      CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a   ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = 'public'
        AND t.relname = p_table
        AND ix.indisunique = true
        AND ix.indisprimary = false
        AND ix.indpred IS NULL
        AND a.attnum > 0
      GROUP BY ix.indexrelid
    ) sub
  );
END;
$$;

REVOKE ALL ON FUNCTION security.get_table_unique_columns(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_table_unique_columns(p_table text)
RETURNS json
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT security.get_table_unique_columns(p_table);
$$;

-- Grant to PUBLIC so it is callable in the local DB, which has no supabase
-- `authenticated`/`anon` roles (mirrors the live get_table_columns ACL). The
-- SECURITY DEFINER impl still gates on auth.uid(), so unauthenticated callers
-- get nothing back.
GRANT EXECUTE ON FUNCTION public.get_table_unique_columns(text) TO PUBLIC;

-- Cloud parity: where the supabase roles exist, harden to authenticated-only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_table_unique_columns(text) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_table_unique_columns(text) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_table_unique_columns(text) FROM anon';
  END IF;
END $$;
