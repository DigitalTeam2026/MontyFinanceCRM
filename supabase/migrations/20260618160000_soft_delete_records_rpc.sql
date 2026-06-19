-- Robust soft-delete RPC used by the execute-delete-rules edge function.
--
-- ## Problem
-- The edge function hardcoded (a) which tables use `deleted_at` vs `is_deleted`
-- and (b) that every PK is `<table>_id`. Both assumptions drifted from reality:
--   * the recycle-bin migration (20260618120000) standardised soft-delete on a
--     `deleted_at` column, so tables that never had `is_deleted` (timeline_*,
--     test_entity, …) 500'd on `update({is_deleted:true})`;
--   * several physical tables don't follow the `<table>_id` PK convention
--     (crm_prospect → prospect_id, timeline_note → note_id, …), so the delete
--     filtered on a non-existent column.
--
-- ## Solution
-- One SECURITY DEFINER function that, per call, detects the real PK (or accepts
-- an explicit match column for related/cascade deletes) and whichever soft-delete
-- + audit columns the table actually has, then soft-deletes only currently-live
-- rows. Falls back to a hard delete when the table has no soft-delete column.
-- Mirrors admin_recycle_bin_action: validates the table against entity_definition
-- and quotes every identifier with %I (no injection).
--
-- Locked to service_role only: the execute-delete-rules function already enforces
-- can_delete / bulk_delete privileges before calling, and this RPC bypasses RLS,
-- so it must never be reachable by ordinary authenticated users.

CREATE OR REPLACE FUNCTION public.soft_delete_records(
  p_table     text,
  p_ids       text[],
  p_actor     uuid    DEFAULT NULL,
  p_match_col text    DEFAULT NULL  -- NULL → auto-detect the single-column PK
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valid_table boolean;
  v_match_col   text;
  v_pk_cols     text[];
  v_valid_col   boolean;
  v_has_deleted boolean;
  v_has_isdel   boolean;
  v_has_delby   boolean;
  v_has_modat   boolean;
  v_has_modby   boolean;
  v_set         text;
  v_live_pred   text;
  v_sql         text;
  v_count       integer;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- 1. The table must be a real entity-backed physical table.
  SELECT EXISTS (
    SELECT 1 FROM public.entity_definition ed
    WHERE ed.physical_table_name = p_table
  ) INTO v_valid_table;
  IF NOT v_valid_table THEN
    RAISE EXCEPTION 'Unknown table: %', p_table;
  END IF;

  -- 2. Resolve the match column: explicit (related delete) or the table's PK.
  IF p_match_col IS NOT NULL THEN
    v_match_col := p_match_col;
  ELSE
    SELECT array_agg(kcu.column_name)
    INTO v_pk_cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema   = tc.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema    = 'public'
      AND tc.table_name      = p_table;

    IF v_pk_cols IS NULL OR array_length(v_pk_cols, 1) <> 1 THEN
      RAISE EXCEPTION 'Table % has no single-column primary key', p_table;
    END IF;
    v_match_col := v_pk_cols[1];
  END IF;

  -- 3. The match column must exist on that table.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = v_match_col
  ) INTO v_valid_col;
  IF NOT v_valid_col THEN
    RAISE EXCEPTION 'Unknown column %.%', p_table, v_match_col;
  END IF;

  -- 4. Detect soft-delete + audit columns.
  SELECT
    bool_or(column_name = 'deleted_at'),
    bool_or(column_name = 'is_deleted'),
    bool_or(column_name = 'deleted_by'),
    bool_or(column_name = 'modified_at'),
    bool_or(column_name = 'modified_by')
  INTO v_has_deleted, v_has_isdel, v_has_delby, v_has_modat, v_has_modby
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = p_table;

  -- 5. No soft-delete column at all → hard delete.
  IF NOT v_has_deleted AND NOT v_has_isdel THEN
    v_sql := format(
      'WITH d AS (DELETE FROM public.%I WHERE %I::text = ANY($1) RETURNING 1) SELECT count(*) FROM d',
      p_table, v_match_col
    );
    EXECUTE v_sql INTO v_count USING p_ids;
    RETURN COALESCE(v_count, 0);
  END IF;

  -- 6. Build the SET list from whichever markers exist.
  v_set := '';
  IF v_has_deleted THEN v_set := v_set || 'deleted_at = now(), '; END IF;
  IF v_has_isdel   THEN v_set := v_set || 'is_deleted = true, '; END IF;
  IF v_has_delby   THEN v_set := v_set || 'deleted_by = $2, '; END IF;
  IF v_has_modat   THEN v_set := v_set || 'modified_at = now(), '; END IF;
  IF v_has_modby   THEN v_set := v_set || 'modified_by = $2, '; END IF;
  v_set := left(v_set, length(v_set) - 2);  -- strip trailing ', '

  -- Only touch currently-live rows (prefer deleted_at as the source of truth).
  IF v_has_deleted THEN
    v_live_pred := 'deleted_at IS NULL';
  ELSE
    v_live_pred := 'is_deleted = false';
  END IF;

  v_sql := format(
    'WITH u AS (UPDATE public.%I SET %s WHERE %I::text = ANY($1) AND %s RETURNING 1) SELECT count(*) FROM u',
    p_table, v_set, v_match_col, v_live_pred
  );
  EXECUTE v_sql INTO v_count USING p_ids, p_actor;
  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_records(text, text[], uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_records(text, text[], uuid, text) TO service_role;
