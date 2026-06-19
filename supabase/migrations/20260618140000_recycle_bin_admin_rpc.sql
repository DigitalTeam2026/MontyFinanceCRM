-- Recycle Bin privileged actions (restore / permanent-delete) via a single
-- SECURITY DEFINER RPC.
--
-- ## Problem
-- The per-entity default-deny RLS (migration 20260615130000) gates DELETE on
-- `can_delete` privilege + record access scope, and gates the restore UPDATE
-- (is_deleted = false) on `can_delete` too. When a caller fails that check the
-- statement affects **0 rows with no error** — so the Admin Studio Recycle Bin
-- "Delete permanently" / "Restore" silently do nothing.
--
-- ## Solution
-- One admin-only RPC that runs as the table owner (bypassing per-record RLS),
-- after verifying the caller is a system admin. It only ever touches rows that
-- are actually soft-deleted (re-asserts the deleted predicate), so it can never
-- purge or mutate live data, and it returns the affected row count so the UI can
-- distinguish "nothing matched" from "blocked".
--
-- Dynamic across every entity-backed table — the physical table + PK column are
-- validated against entity_definition and quoted with %I (no injection), and the
-- soft-delete columns are detected from information_schema per call.

CREATE OR REPLACE FUNCTION public.admin_recycle_bin_action(
  p_table  text,
  p_pk     text,
  p_ids    text[],
  p_action text  -- 'restore' | 'purge'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin     boolean;
  v_valid_table  boolean;
  v_valid_pk     boolean;
  v_has_deleted  boolean;
  v_has_isdel    boolean;
  v_has_delby    boolean;
  v_has_modat    boolean;
  v_has_modby    boolean;
  v_pred         text;
  v_set          text;
  v_sql          text;
  v_count        integer;
BEGIN
  -- 1. Admin only.
  SELECT security.is_system_admin() INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Permission denied: system administrator required';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF p_action NOT IN ('restore', 'purge') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  -- 2. The table must be a real entity-backed physical table.
  SELECT EXISTS (
    SELECT 1 FROM public.entity_definition ed
    WHERE ed.physical_table_name = p_table
  ) INTO v_valid_table;
  IF NOT v_valid_table THEN
    RAISE EXCEPTION 'Unknown table: %', p_table;
  END IF;

  -- 3. The PK column must exist on that table.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_pk
  ) INTO v_valid_pk;
  IF NOT v_valid_pk THEN
    RAISE EXCEPTION 'Unknown primary-key column: %', p_pk;
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

  -- 5. "This row is soft-deleted" predicate (so live rows are never touched).
  IF v_has_deleted THEN
    v_pred := 'deleted_at IS NOT NULL';
  ELSIF v_has_isdel THEN
    v_pred := 'is_deleted = true';
  ELSE
    RAISE EXCEPTION 'Table % does not support soft delete', p_table;
  END IF;

  IF p_action = 'purge' THEN
    v_sql := format(
      'WITH d AS (DELETE FROM public.%I WHERE %I::text = ANY($1) AND %s RETURNING 1) SELECT count(*) FROM d',
      p_table, p_pk, v_pred
    );
    EXECUTE v_sql INTO v_count USING p_ids;
  ELSE
    -- restore: clear whichever markers exist
    v_set := '';
    IF v_has_isdel  THEN v_set := v_set || 'is_deleted = false, '; END IF;
    IF v_has_deleted THEN v_set := v_set || 'deleted_at = NULL, '; END IF;
    IF v_has_delby  THEN v_set := v_set || 'deleted_by = NULL, '; END IF;
    IF v_has_modat  THEN v_set := v_set || 'modified_at = now(), '; END IF;
    IF v_has_modby  THEN v_set := v_set || 'modified_by = auth.uid(), '; END IF;
    v_set := left(v_set, length(v_set) - 2);  -- strip trailing ', '

    v_sql := format(
      'WITH u AS (UPDATE public.%I SET %s WHERE %I::text = ANY($1) AND %s RETURNING 1) SELECT count(*) FROM u',
      p_table, v_set, p_pk, v_pred
    );
    EXECUTE v_sql INTO v_count USING p_ids;
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recycle_bin_action(text, text, text[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_recycle_bin_action(text, text, text[], text) TO authenticated;
