-- Recycle Bin cascade: make permanent-delete cycle-safe.
--
-- ## Problem
-- The recursive _cascade_purge() (migration 20260618150000) descends the FK graph
-- depth-first, deleting children before parents. That works for a tree, but the
-- CRM lead lifecycle has mutual FK cycles:
--   lead.originating_prospect_id   -> crm_prospect     AND crm_prospect.converted_lead_id -> lead
--   lead.qualified_opportunity_id  -> opportunity      AND opportunity.originating_lead_id  -> lead
-- Descending lead -> prospect -> lead -> prospect … re-visits `lead` forever and
-- trips the depth-25 guard, so "Delete all" in the Lead Recycle Bin aborts with
-- "dependency chain too deep (possible FK cycle)". Even without the runaway, the
-- pair can't be ordered: prospect can't be deleted while lead references it, and
-- lead can't be deleted while prospect references it. Result: the admin is forced
-- to go table-by-table to delete the related records by hand.
--
-- ## Fix
-- Replace the depth-first recursion with a closure (fixpoint) delete that is
-- inherently cycle-safe:
--   1. Seed a temp set with the root rows.
--   2. Repeatedly pull in every row that references a row already in the set,
--      until nothing new is added. A row already in the set is never re-added, so
--      cycles terminate instead of recursing. This closure is COMPLETE: every row
--      that references a doomed row is itself in the set, so no live row outside
--      the set can reference into it.
--   3. Break every FK edge that points from one doomed row to another by NULLing
--      the (nullable) referencing column. After this, no row in the set references
--      any other row in the set — cycles included.
--   4. Delete every row in the set, in any order (all internal edges are gone).
--
-- FK columns that participate in a cycle but are NOT NULL cannot be nulled; such a
-- cycle is genuinely undeletable without deferrable constraints and will still
-- raise — but all CRM lifecycle cycle columns are nullable. Child rows on tables
-- without a single-column primary key can't be tracked in the closure, so they are
-- deleted directly during expansion (matching the previous behaviour).
--
-- Descendants are removed regardless of their own soft-delete state (they go with
-- their parent). The ROOT rows are still guarded by the soft-delete predicate so
-- the recycle bin can never purge live top-level records.

-- ---------------------------------------------------------------------------
-- Cycle-safe closure delete of p_ids in p_table plus everything referencing them.
-- Returns the TOTAL number of rows removed (roots + all descendants).
-- The p_depth argument is retained for signature compatibility and is unused.
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
  r        record;
  v_pk     text;
  v_rc     bigint;
  v_added  bigint;
  v_total  bigint := 0;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Working set of rows to delete: (physical table, primary-key value as text).
  CREATE TEMP TABLE IF NOT EXISTS _cascade_del (tbl text, id text) ON COMMIT DROP;
  TRUNCATE _cascade_del;
  CREATE UNIQUE INDEX IF NOT EXISTS _cascade_del_uq ON _cascade_del (tbl, id);

  INSERT INTO _cascade_del (tbl, id)
  SELECT p_table, x FROM unnest(p_ids) AS x
  ON CONFLICT DO NOTHING;

  -- 1. Grow the closure until it stops changing.
  LOOP
    v_added := 0;
    FOR r IN
      SELECT cl.relname  AS child_table,
             att.attname AS child_col,
             rt.relname  AS parent_table
      FROM pg_constraint con
      JOIN pg_class cl      ON cl.oid = con.conrelid
      JOIN pg_class rt      ON rt.oid = con.confrelid
      JOIN pg_namespace ns  ON ns.oid = cl.relnamespace
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
      WHERE con.contype = 'f'
        AND ns.nspname = 'public'
        AND array_length(con.conkey, 1) = 1
        AND rt.relname IN (SELECT DISTINCT tbl FROM _cascade_del)
    LOOP
      -- The child's single-column primary key, needed to track it in the set.
      SELECT a.attname INTO v_pk
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = format('public.%I', r.child_table)::regclass
        AND i.indisprimary
      LIMIT 1;

      IF v_pk IS NULL THEN
        -- No single-column PK: can't track it, so delete referencing rows now.
        EXECUTE format(
          'WITH d AS (DELETE FROM public.%I c WHERE EXISTS (
              SELECT 1 FROM _cascade_del p WHERE p.tbl = %L AND p.id = c.%I::text
            ) RETURNING 1) SELECT count(*) FROM d',
          r.child_table, r.parent_table, r.child_col
        ) INTO v_rc;
        v_total := v_total + COALESCE(v_rc, 0);
        CONTINUE;
      END IF;

      EXECUTE format(
        'INSERT INTO _cascade_del (tbl, id)
           SELECT %L, c.%I::text
           FROM public.%I c
           WHERE EXISTS (
             SELECT 1 FROM _cascade_del p WHERE p.tbl = %L AND p.id = c.%I::text
           )
         ON CONFLICT DO NOTHING',
        r.child_table, v_pk, r.child_table, r.parent_table, r.child_col
      );
      GET DIAGNOSTICS v_rc = ROW_COUNT;
      v_added := v_added + v_rc;
    END LOOP;
    EXIT WHEN v_added = 0;
  END LOOP;

  -- 2. Break every intra-set FK edge by NULLing the (nullable) referencing column,
  --    so no doomed row references another doomed row (cycles included).
  FOR r IN
    SELECT cl.relname  AS child_table,
           att.attname AS child_col,
           rt.relname  AS parent_table
    FROM pg_constraint con
    JOIN pg_class cl      ON cl.oid = con.conrelid
    JOIN pg_class rt      ON rt.oid = con.confrelid
    JOIN pg_namespace ns  ON ns.oid = cl.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND ns.nspname = 'public'
      AND array_length(con.conkey, 1) = 1
      AND att.attnotnull = false
      AND cl.relname IN (SELECT DISTINCT tbl FROM _cascade_del)
      AND rt.relname IN (SELECT DISTINCT tbl FROM _cascade_del)
  LOOP
    EXECUTE format(
      'UPDATE public.%I c SET %I = NULL
         WHERE c.%I IS NOT NULL
           AND EXISTS (SELECT 1 FROM _cascade_del p WHERE p.tbl = %L AND p.id = c.%I::text)',
      r.child_table, r.child_col, r.child_col, r.parent_table, r.child_col
    );
  END LOOP;

  -- 3. Delete every row in the closure. All internal edges are gone, so order
  --    does not matter and no FK check can fail.
  FOR r IN SELECT DISTINCT tbl FROM _cascade_del LOOP
    SELECT a.attname INTO v_pk
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = format('public.%I', r.tbl)::regclass
      AND i.indisprimary
    LIMIT 1;
    IF v_pk IS NULL THEN CONTINUE; END IF;

    EXECUTE format(
      'WITH d AS (DELETE FROM public.%I t
         WHERE t.%I::text IN (SELECT id FROM _cascade_del WHERE tbl = %L)
         RETURNING 1) SELECT count(*) FROM d',
      r.tbl, v_pk, r.tbl
    ) INTO v_rc;
    v_total := v_total + COALESCE(v_rc, 0);
  END LOOP;

  TRUNCATE _cascade_del;
  RETURN v_total;
END;
$$;

-- Roles anon/authenticated do not exist in this deployment; lock the internal
-- helper down to non-public callers only (it runs as its definer from the action
-- RPC regardless).
REVOKE ALL ON FUNCTION public._cascade_purge(text, text[], int) FROM public;

-- ---------------------------------------------------------------------------
-- purge_cascade now defers the whole delete (roots + closure) to _cascade_purge,
-- after filtering the roots to those that are actually soft-deleted so the recycle
-- bin can never purge a live top-level record.
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
  v_root_ids     text[];
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
    -- Only cascade from roots that are actually in the recycle bin (soft-deleted).
    EXECUTE format(
      'SELECT array_agg(%I::text) FROM public.%I WHERE %I::text = ANY($1) AND %s',
      p_pk, p_table, p_pk, v_pred
    ) INTO v_root_ids USING p_ids;

    IF v_root_ids IS NULL OR array_length(v_root_ids, 1) IS NULL THEN
      RETURN 0;
    END IF;
    RETURN public._cascade_purge(p_table, v_root_ids, 0);

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

-- CREATE OR REPLACE preserves the existing EXECUTE privileges on this function
-- (granted by migration 20260618150000), so no re-GRANT is needed — and the
-- anon/authenticated roles it referenced do not exist in this deployment.
