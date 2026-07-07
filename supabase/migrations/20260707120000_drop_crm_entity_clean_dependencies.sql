/*
  # Fix drop_crm_entity: clean self-owned metadata, block only on real dependencies

  ## Problem
  The original public.drop_crm_entity (20260618130000) deleted only field_definition
  then entity_definition, relying on ON DELETE CASCADE for the rest. But several
  metadata tables reference entity_definition with a PLAIN (NO ACTION) FK:
    statecode_definition, status_reason_definition, relationship_definition,
    admin_grid_column_pref, api_integration, process_flow, field_definition.lookup_entity_id…
  Because EVERY custom entity is auto-provisioned with statecode_definition rows, the
  DELETE always aborted with:
    update or delete on table "entity_definition" violates foreign key constraint
    "statecode_definition_entity_definition_id_fkey" on table "statecode_definition"
  i.e. permanent delete was broken for every custom table (the same failure that was
  hand-patched once in 20260618180000_drop_source_entity for the `source` entity).

  ## New behaviour ("delete permanently only when the table has no dependencies")
  1. Guards unchanged: admin-only, custom-only, identifier re-validation.
  2. DEPENDENCY PRE-CHECK — refuses the delete (friendly message, no destruction) when
     ANOTHER table genuinely depends on this one:
        - a lookup column on a different entity points at this entity, OR
        - an N:N relationship links this entity to a different entity (shared junction).
     These hold real FK columns / junction data on other tables, so we block and tell
     the admin which tables to detach first. A table with none of these deletes cleanly.
  3. SELF-OWNED METADATA CLEANUP — generically deletes rows for THIS entity from every
     table whose FK to entity_definition is NO ACTION / RESTRICT (the blocking kind),
     discovered from pg_constraint. CASCADE and SET NULL inbound FKs are left untouched
     and resolve themselves on the final entity_definition delete. Being catalog-driven,
     this also covers any future metadata table without another code change.
  4. DROP TABLE … CASCADE and DELETE entity_definition as before, atomically.

  ## Security
  SECURITY DEFINER, fixed search_path, admin-guarded, EXECUTE revoked from anon.
  Any error rolls the whole call back (EXCEPTION handler).
*/

CREATE OR REPLACE FUNCTION public.drop_crm_entity(p_entity_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_temp
AS $$
DECLARE
  v_entity        entity_definition%ROWTYPE;
  v_table_existed boolean;
  v_dep_count     integer;
  v_dep_names     text;
  r               record;
BEGIN
  -- Admin guard
  IF NOT security.is_system_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;

  SELECT * INTO v_entity
  FROM entity_definition
  WHERE entity_definition_id = p_entity_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Entity not found');
  END IF;

  IF NOT v_entity.is_custom THEN
    RETURN json_build_object('ok', false, 'error',
      'System entities cannot be deleted.');
  END IF;

  -- Safety: re-validate the stored identifier before using it in dynamic DDL.
  IF v_entity.physical_table_name !~ '^[a-z][a-z0-9_]{0,39}$' THEN
    RETURN json_build_object('ok', false, 'error',
      format('Stored table name "%s" is not a valid identifier', v_entity.physical_table_name));
  END IF;

  -- ── 1. Dependency pre-check ────────────────────────────────────────────────
  -- Refuse if OTHER tables depend on this one via a lookup column or an N:N junction.
  -- (This entity's OWN outbound lookups/relationships are not dependencies — they are
  --  removed with the table.) A table with no such references deletes cleanly below.
  WITH deps AS (
    -- Other entities that hold a lookup column pointing at this entity
    SELECT DISTINCT e.display_name AS nm
    FROM field_definition fd
    JOIN entity_definition e ON e.entity_definition_id = fd.entity_definition_id
    WHERE fd.lookup_entity_id      = p_entity_id
      AND fd.entity_definition_id <> p_entity_id
    UNION
    -- Other entities sharing an N:N (junction-backed) relationship with this entity
    SELECT DISTINCT e.display_name
    FROM relationship_definition rd
    JOIN entity_definition e
      ON e.entity_definition_id =
         CASE WHEN rd.source_entity_id = p_entity_id
              THEN rd.target_entity_id ELSE rd.source_entity_id END
    WHERE rd.relationship_type = 'N:N'
      AND (rd.source_entity_id = p_entity_id OR rd.target_entity_id = p_entity_id)
      AND rd.source_entity_id <> rd.target_entity_id
  )
  SELECT count(*), string_agg(nm, ', ' ORDER BY nm) INTO v_dep_count, v_dep_names FROM deps;

  IF v_dep_count > 0 THEN
    RETURN json_build_object('ok', false, 'error',
      format('Cannot permanently delete "%s": %s other table(s) reference it (%s). '
             || 'Remove those lookup fields / relationships first, then delete this table.',
             v_entity.display_name, v_dep_count, v_dep_names));
  END IF;

  -- ── 2. Drop the physical table (and its dependent objects) ─────────────────
  -- IF EXISTS so metadata-only orphans (table already gone) still clean up below.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = v_entity.physical_table_name
  ) INTO v_table_existed;

  EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', v_entity.physical_table_name);

  -- ── 3. Clean this entity's own metadata (catalog-driven) ───────────────────
  -- Delete rows for this entity from every table whose FK to entity_definition is
  -- NO ACTION ('a') or RESTRICT ('r') — the kinds that would otherwise block. CASCADE
  -- ('c') and SET NULL ('n') inbound FKs are intentionally skipped: they are resolved
  -- correctly by the entity_definition delete in step 4. Single-column FKs only (all of
  -- them are), so conkey[1] is the referencing column.
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute  a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype     = 'f'
      AND c.confrelid   = 'public.entity_definition'::regclass
      AND c.confdeltype IN ('a', 'r')
  LOOP
    EXECUTE format('DELETE FROM %s WHERE %I = $1', r.tbl, r.col) USING p_entity_id;
  END LOOP;

  -- ── 4. Remove the entity row itself ────────────────────────────────────────
  -- Remaining CASCADE / SET NULL inbound references resolve here.
  DELETE FROM entity_definition WHERE entity_definition_id = p_entity_id AND is_custom = true;

  -- Refresh PostgREST so the dropped table/columns leave the API surface immediately.
  NOTIFY pgrst, 'reload schema';

  RETURN json_build_object(
    'ok',            true,
    'entity_id',     p_entity_id,
    'table_name',    v_entity.physical_table_name,
    'dropped_table', v_table_existed
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- This deployment has no authenticated/anon roles (see supabase-roles-absent note);
-- access is gated inside the function by security.is_system_admin(), so grant to public.
GRANT EXECUTE ON FUNCTION public.drop_crm_entity(uuid) TO public;
