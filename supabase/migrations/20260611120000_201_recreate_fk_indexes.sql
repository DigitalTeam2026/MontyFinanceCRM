/*
  # 201 — Recreate foreign-key indexes dropped in migration 101

  Migration 101 (security_and_index_cleanup) dropped ~150 indexes flagged
  "unused" by the Supabase advisor. That advisor ran against a near-empty dev
  database and could not see the join / lookup / ON DELETE traffic these indexes
  serve in production. Unindexed foreign keys force sequential scans on joins and
  on every referential-integrity check when a parent row is updated/deleted.

  Rather than hard-code a list (which drifts as tables are added/removed), this
  migration is data-driven: it creates an index for every single-column foreign
  key in the public schema that does not already have an index whose leading
  column is that FK column. Fully idempotent.
*/

DO $$
DECLARE
  r record;
  idx_name text;
BEGIN
  FOR r IN
    SELECT
      c.conrelid::regclass            AS tbl,
      (c.conrelid::regclass)::text    AS tbl_text,
      a.attname                       AS col
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND array_length(c.conkey, 1) = 1            -- single-column FKs only
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND i.indkey[0] = a.attnum               -- FK column is the leading index column
      )
  LOOP
    idx_name := left('idx_' || replace(r.tbl_text, 'public.', '') || '_' || r.col, 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%I)', idx_name, r.tbl, r.col);
    RAISE NOTICE 'Created %', idx_name;
  END LOOP;
END $$;
