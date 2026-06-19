-- Recycle Bin: dependency preview + cascade permanent-delete.
--
-- Hard-deleting a soft-deleted parent (e.g. account) fails when child rows still
-- reference it via a foreign key (e.g. contact.account_id → account). This adds:
--   1. admin_recycle_bin_dependents() — preview the immediate child rows that
--      reference the target rows, grouped by table+column, with counts. Powers
--      the "this will also delete …" confirmation dialog.
--   2. _cascade_purge() — recursively delete all referencing descendants
--      (depth-first), so a subsequent parent delete succeeds.
--   3. admin_recycle_bin_action() gains a 'purge_cascade' action that runs the
--      cascade then deletes the (soft-deleted) parents.
--
-- All admin-gated. The parent delete still re-asserts the soft-delete predicate
-- so only recycle-bin rows are ever purged. Descendants are deleted regardless of
-- their own soft-delete state (they are being removed with their parent).

-- ---------------------------------------------------------------------------
-- Recursive cascade delete of everything that references p_ids in p_table.
-- Returns the number of descendant rows deleted (not counting the parents).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._cascade_purge(
  p_table text,
  p_ids   text[],
  p_depth int DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r           record;
  v_pk        text;
  v_child_ids text[];
  v_n         integer;
  v_total     integer := 0;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;
  IF p_depth > 25 THEN
    RAISE EXCEPTION 'Cascade aborted: dependency chain too deep at table % (possible FK cycle)', p_table;
  END IF;

  -- Every FK that points AT p_table (single-column FKs).
  FOR r IN
    SELECT con.conname,
           cl.relname  AS child_table,
           att.attname AS child_col
    FROM pg_constraint con
    JOIN pg_class cl      ON cl.oid = con.conrelid
    JOIN pg_class rt      ON rt.oid = con.confrelid
    JOIN pg_namespace ns  ON ns.oid = cl.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND rt.relname = p_table
      AND ns.nspname = 'public'
      AND array_length(con.conkey, 1) = 1
  LOOP
    -- Resolve the child's single-column primary key (needed to recurse).
    SELECT a.attname INTO v_pk
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = format('public.%I', r.child_table)::regclass
      AND i.indisprimary
    LIMIT 1;

    IF v_pk IS NOT NULL THEN
      EXECUTE format(
        'SELECT array_agg(%I::text) FROM public.%I WHERE %I::text = ANY($1)',
        v_pk, r.child_table, r.child_col
      ) INTO v_child_ids USING p_ids;

      IF v_child_ids IS NOT NULL AND array_length(v_child_ids, 1) IS NOT NULL THEN
        -- Delete the grandchildren first (depth-first).
        v_total := v_total + public._cascade_purge(r.child_table, v_child_ids, p_depth + 1);
      END IF;
    END IF;

    -- Delete the direct children referencing these parents.
    EXECUTE format(
      'WITH d AS (DELETE FROM public.%I WHERE %I::text = ANY($1) RETURNING 1) SELECT count(*) FROM d',
      r.child_table, r.child_col
    ) INTO v_n USING p_ids;
    v_total := v_total + COALESCE(v_n, 0);
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public._cascade_purge(text, text[], int) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Preview the immediate dependents of p_ids in p_table (one level), grouped by
-- referencing table + column. Returns jsonb: [{table, column, constraint, count}].
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recycle_bin_dependents(
  p_table text,
  p_ids   text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r       record;
  v_cnt   integer;
  v_out   jsonb := '[]'::jsonb;
BEGIN
  IF NOT COALESCE(security.is_system_admin(), false) THEN
    RAISE EXCEPTION 'Permission denied: system administrator required';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN v_out;
  END IF;

  FOR r IN
    SELECT con.conname,
           cl.relname  AS child_table,
           att.attname AS child_col
    FROM pg_constraint con
    JOIN pg_class cl      ON cl.oid = con.conrelid
    JOIN pg_class rt      ON rt.oid = con.confrelid
    JOIN pg_namespace ns  ON ns.oid = cl.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND rt.relname = p_table
      AND ns.nspname = 'public'
      AND array_length(con.conkey, 1) = 1
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE %I::text = ANY($1)',
      r.child_table, r.child_col
    ) INTO v_cnt USING p_ids;

    IF v_cnt > 0 THEN
      v_out := v_out || jsonb_build_object(
        'table',      r.child_table,
        'column',     r.child_col,
        'constraint', r.conname,
        'count',      v_cnt
      );
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recycle_bin_dependents(text, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_recycle_bin_dependents(text, text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Replace the action RPC to add 'purge_cascade'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recycle_bin_action(
  p_table  text,
  p_pk     text,
  p_ids    text[],
  p_action text  -- 'restore' | 'purge' | 'purge_cascade'
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
  v_desc         integer := 0;
BEGIN
  SELECT security.is_system_admin() INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Permission denied: system administrator required';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF p_action NOT IN ('restore', 'purge', 'purge_cascade') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.entity_definition ed WHERE ed.physical_table_name = p_table
  ) INTO v_valid_table;
  IF NOT v_valid_table THEN
    RAISE EXCEPTION 'Unknown table: %', p_table;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_pk
  ) INTO v_valid_pk;
  IF NOT v_valid_pk THEN
    RAISE EXCEPTION 'Unknown primary-key column: %', p_pk;
  END IF;

  SELECT
    bool_or(column_name = 'deleted_at'),
    bool_or(column_name = 'is_deleted'),
    bool_or(column_name = 'deleted_by'),
    bool_or(column_name = 'modified_at'),
    bool_or(column_name = 'modified_by')
  INTO v_has_deleted, v_has_isdel, v_has_delby, v_has_modat, v_has_modby
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = p_table;

  IF v_has_deleted THEN
    v_pred := 'deleted_at IS NOT NULL';
  ELSIF v_has_isdel THEN
    v_pred := 'is_deleted = true';
  ELSE
    RAISE EXCEPTION 'Table % does not support soft delete', p_table;
  END IF;

  IF p_action = 'purge_cascade' THEN
    v_desc := public._cascade_purge(p_table, p_ids, 0);
    v_sql := format(
      'WITH d AS (DELETE FROM public.%I WHERE %I::text = ANY($1) AND %s RETURNING 1) SELECT count(*) FROM d',
      p_table, p_pk, v_pred
    );
    EXECUTE v_sql INTO v_count USING p_ids;
    RETURN COALESCE(v_desc, 0) + COALESCE(v_count, 0);

  ELSIF p_action = 'purge' THEN
    v_sql := format(
      'WITH d AS (DELETE FROM public.%I WHERE %I::text = ANY($1) AND %s RETURNING 1) SELECT count(*) FROM d',
      p_table, p_pk, v_pred
    );
    EXECUTE v_sql INTO v_count USING p_ids;
    RETURN COALESCE(v_count, 0);

  ELSE
    v_set := '';
    IF v_has_isdel   THEN v_set := v_set || 'is_deleted = false, '; END IF;
    IF v_has_deleted THEN v_set := v_set || 'deleted_at = NULL, '; END IF;
    IF v_has_delby   THEN v_set := v_set || 'deleted_by = NULL, '; END IF;
    IF v_has_modat   THEN v_set := v_set || 'modified_at = now(), '; END IF;
    IF v_has_modby   THEN v_set := v_set || 'modified_by = auth.uid(), '; END IF;
    v_set := left(v_set, length(v_set) - 2);

    v_sql := format(
      'WITH u AS (UPDATE public.%I SET %s WHERE %I::text = ANY($1) AND %s RETURNING 1) SELECT count(*) FROM u',
      p_table, v_set, p_pk, v_pred
    );
    EXECUTE v_sql INTO v_count USING p_ids;
    RETURN COALESCE(v_count, 0);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recycle_bin_action(text, text, text[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_recycle_bin_action(text, text, text[], text) TO authenticated;
