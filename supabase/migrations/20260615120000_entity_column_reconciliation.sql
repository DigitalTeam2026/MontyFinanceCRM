/*
  # Entity Column Reconciliation

  ## Problem
  Admin Studio → Entities → Columns reads ONLY from `field_definition`. Physical
  columns that exist on an entity's table but have no `field_definition` record are
  invisible (e.g. `crm_prospect.converted_lead_id/converted_at/converted_by` added by
  migration 20260612160000 without metadata). The grid therefore shows fewer columns
  than the real table has.

  CRM metadata stays the source of truth. This migration adds a generic, idempotent
  reconciliation layer so the metadata can be completed from the live schema for ANY
  entity (never hardcoded for Prospect).

  ## Functions (all SECURITY DEFINER, admin-guarded, generic for every entity)

  1. `get_entity_db_columns(p_entity_id)` — read-only introspection. Returns every
     physical column of the entity's `physical_table_name`, annotated with whether an
     active `field_definition` already maps it. Used by the UI for diff + logging.

  2. `reconcile_entity_columns(p_entity_id)` — detects physical columns with no
     metadata and inserts a `field_definition` for each. Idempotent and non-destructive:
       * never duplicates (skips any column already mapped by physical_column_name OR
         logical_name, in ANY deleted state; UNIQUE(entity, logical_name) is a backstop)
       * preserves existing labels, field config, relationships, option sets, form refs
       * infers field type from the real PostgreSQL data type
       * detects foreign keys → `lookup` and resolves `lookup_entity_id`
       * skips engine-internal columns (custom_fields, search/tsvector)
     Returns a JSON summary (entity id, logical name, physical table, db/metadata
     counts, and the list of newly created columns).

  3. `drop_field_column(p_table, p_column)` — admin-guarded `ALTER TABLE DROP COLUMN`
     used by the create-field flow to roll back a freshly created physical column when
     its metadata insert fails.

  Public SECURITY INVOKER wrappers expose all three to `authenticated`.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_entity_db_columns — read-only introspection for diff + logging
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.get_entity_db_columns(p_entity_id uuid)
RETURNS TABLE (
  column_name      text,
  data_type        text,
  udt_name         text,
  is_nullable      text,
  ordinal_position int,
  has_metadata     boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, security
AS $$
  SELECT
    c.column_name::text,
    c.data_type::text,
    c.udt_name::text,
    c.is_nullable::text,
    c.ordinal_position::int,
    EXISTS (
      SELECT 1 FROM field_definition f
      WHERE f.entity_definition_id = p_entity_id
        AND f.physical_column_name = c.column_name
        AND f.deleted_at IS NULL
    ) AS has_metadata
  FROM information_schema.columns c
  JOIN entity_definition e ON e.entity_definition_id = p_entity_id
  WHERE c.table_schema = 'public'
    AND c.table_name   = e.physical_table_name
  ORDER BY c.ordinal_position;
$$;

REVOKE ALL ON FUNCTION security.get_entity_db_columns(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security.get_entity_db_columns(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_entity_db_columns(p_entity_id uuid)
RETURNS TABLE (
  column_name text, data_type text, udt_name text,
  is_nullable text, ordinal_position int, has_metadata boolean
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM security.get_entity_db_columns(p_entity_id);
$$;

REVOKE ALL ON FUNCTION public.get_entity_db_columns(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_entity_db_columns(uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. reconcile_entity_columns — fill metadata gaps from the live schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.reconcile_entity_columns(p_entity_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_catalog
AS $$
DECLARE
  v_logical      text;
  v_table        text;
  v_default_ft   uuid;
  v_db_count     int  := 0;
  v_meta_count   int  := 0;
  v_next_sort    int  := 0;
  v_created      jsonb := '[]'::jsonb;
  c              record;
  v_ft_id        uuid;
  v_ft_name      text;
  v_is_lookup    boolean;
  v_lookup_ent   uuid;
  v_ref_table    text;
  v_display      text;
BEGIN
  -- Admin-only: schema/metadata mutation
  IF NOT security.is_system_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;

  -- Resolve the entity's PHYSICAL table (never assume from display name)
  SELECT logical_name, physical_table_name
    INTO v_logical, v_table
  FROM entity_definition
  WHERE entity_definition_id = p_entity_id;

  IF v_table IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Entity not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = v_table
  ) THEN
    RETURN json_build_object(
      'ok', false, 'error', 'Physical table not found: ' || v_table,
      'logical_name', v_logical, 'physical_table_name', v_table
    );
  END IF;

  SELECT field_type_id INTO v_default_ft FROM field_type WHERE name = 'text' LIMIT 1;

  SELECT count(*) INTO v_db_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = v_table;

  SELECT COALESCE(MAX(sort_order), 0) INTO v_next_sort
  FROM field_definition WHERE entity_definition_id = p_entity_id;

  FOR c IN
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = v_table
    ORDER BY ordinal_position
  LOOP
    -- Skip engine-internal / non-business columns
    IF c.column_name IN ('custom_fields', 'search_vector', 'fts', 'tsv') THEN CONTINUE; END IF;
    IF c.udt_name = 'tsvector' THEN CONTINUE; END IF;

    -- Already mapped (any deleted state) → preserve, never duplicate
    IF EXISTS (
      SELECT 1 FROM field_definition
      WHERE entity_definition_id = p_entity_id
        AND (physical_column_name = c.column_name OR logical_name = c.column_name)
    ) THEN
      CONTINUE;
    END IF;

    -- Foreign-key detection → lookup (only if the referenced table is a known entity)
    v_is_lookup  := false;
    v_lookup_ent := NULL;
    v_ref_table  := NULL;

    SELECT ccu.table_name INTO v_ref_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema    = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.table_schema    = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema    = 'public'
      AND tc.table_name      = v_table
      AND kcu.column_name    = c.column_name
    LIMIT 1;

    IF v_ref_table IS NOT NULL THEN
      SELECT entity_definition_id INTO v_lookup_ent
      FROM entity_definition WHERE physical_table_name = v_ref_table LIMIT 1;
      v_is_lookup := (v_lookup_ent IS NOT NULL);
    END IF;

    -- Map PostgreSQL data type → CRM field type
    v_ft_name := CASE
      WHEN v_is_lookup                                              THEN 'lookup'
      WHEN c.data_type IN ('text', 'character varying', 'character',
                           'citext', 'name')                        THEN 'text'
      WHEN c.data_type IN ('integer', 'bigint', 'smallint')         THEN 'whole_number'
      WHEN c.data_type IN ('numeric', 'double precision', 'real')   THEN 'decimal'
      WHEN c.data_type = 'boolean'                                  THEN 'boolean'
      WHEN c.data_type = 'date'                                     THEN 'date'
      WHEN c.data_type LIKE 'timestamp%'                            THEN 'datetime'
      ELSE 'text'  -- uuid (non-FK), ARRAY, jsonb, enums, etc.
    END;

    SELECT field_type_id INTO v_ft_id FROM field_type WHERE name = v_ft_name LIMIT 1;
    IF v_ft_id IS NULL THEN v_ft_id := v_default_ft; END IF;

    v_display   := initcap(replace(c.column_name, '_', ' '));
    v_next_sort := v_next_sort + 1;

    -- Reconciled columns exist in the schema independent of the UI: mark them
    -- system-owned and not schema-editable so they can't be accidentally dropped,
    -- but fully visible and configurable (label, searchable, etc.) in Admin Studio.
    INSERT INTO field_definition (
      entity_definition_id, field_type_id, lookup_entity_id,
      logical_name, display_name, physical_column_name,
      is_required, is_custom, is_system, is_active,
      is_deletable, is_schema_editable, sort_order
    ) VALUES (
      p_entity_id, v_ft_id, v_lookup_ent,
      c.column_name, v_display, c.column_name,
      (c.is_nullable = 'NO' AND c.column_default IS NULL),
      false, true, true,
      false, false, v_next_sort
    )
    ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

    IF FOUND THEN
      v_created := v_created || jsonb_build_object(
        'column',       c.column_name,
        'display_name', v_display,
        'field_type',   v_ft_name,
        'is_lookup',    v_is_lookup
      );
    END IF;
  END LOOP;

  SELECT count(*) INTO v_meta_count
  FROM field_definition
  WHERE entity_definition_id = p_entity_id AND deleted_at IS NULL;

  RETURN json_build_object(
    'ok',                  true,
    'entity_id',           p_entity_id,
    'logical_name',        v_logical,
    'physical_table_name', v_table,
    'db_column_count',     v_db_count,
    'metadata_count',      v_meta_count,
    'created_count',       jsonb_array_length(v_created),
    'created',             v_created
  );
END;
$$;

REVOKE ALL ON FUNCTION security.reconcile_entity_columns(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security.reconcile_entity_columns(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_entity_columns(p_entity_id uuid)
RETURNS json
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT security.reconcile_entity_columns(p_entity_id);
$$;

REVOKE ALL ON FUNCTION public.reconcile_entity_columns(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_entity_columns(uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. drop_field_column — rollback helper for the create-field flow
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.drop_field_column(p_table text, p_column text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_catalog
AS $$
BEGIN
  IF NOT security.is_system_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;
  IF p_table  !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN json_build_object('ok', false, 'error', 'Invalid table name');
  END IF;
  IF p_column !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN json_build_object('ok', false, 'error', 'Invalid column name');
  END IF;
  EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS %I', p_table, p_column);
  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION security.drop_field_column(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security.drop_field_column(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.drop_field_column(p_table text, p_column text)
RETURNS json
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT security.drop_field_column(p_table, p_column);
$$;

REVOKE ALL ON FUNCTION public.drop_field_column(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.drop_field_column(text, text) TO authenticated;
