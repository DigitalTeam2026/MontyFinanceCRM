/*
  # PostgREST schema reload + metadata health report

  ## Why
  The platform creates physical tables and columns from Admin Studio via SECURITY
  DEFINER RPCs (`create_crm_entity`, `add_custom_field_column`). Those DDL statements
  run through PostgreSQL directly, but the Supabase Data API (PostgREST) keeps an
  in-memory schema cache. Until that cache is reloaded, a newly created table is
  invisible to `supabase.from(table)` (error PGRST205) and a newly added column is
  rejected on write (PGRST204). This was the root cause of two bugs:
    1. New columns saved/bulk-edited in the UI without writing to the DB (no error).
    2. New entity pages erroring on open ("Unable to load records").

  This migration adds the missing synchronization primitive and a health report so
  metadata/DB drift is visible and repairable from Admin Studio.

  ## Objects
    - public.reload_postgrest_schema()  → NOTIFY pgrst, 'reload schema'. Idempotent,
      harmless, callable by any authenticated user so the runtime can self-heal after
      DDL or on a stale-cache error. Returns {ok:true}.
    - public.metadata_health_report()   → admin-only JSON drift report:
        missing_tables, missing_columns, entities_missing_main_form,
        entities_missing_active_view, entities_missing_admin_privilege.

  A one-time NOTIFY at the end makes any already-created-but-invisible tables/columns
  visible to the API immediately after this migration is applied.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. reload_postgrest_schema — tell the Data API to re-introspect after DDL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reload_postgrest_schema()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_temp
AS $$
BEGIN
  -- NOTIFY on the channel PostgREST listens on. This is harmless and idempotent;
  -- it is intentionally NOT admin-gated so a normal user hitting a stale-cache
  -- error (right after an admin added a table/column) can trigger the reload that
  -- unblocks their own request. Worst case is a redundant, cheap re-introspection.
  NOTIFY pgrst, 'reload schema';
  RETURN json_build_object('ok', true, 'reloaded', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL    ON FUNCTION public.reload_postgrest_schema() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reload_postgrest_schema() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. metadata_health_report — drift between CRM metadata and the physical schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.metadata_health_report()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, security, pg_temp
AS $$
DECLARE
  v_missing_tables          json;
  v_missing_columns         json;
  v_missing_main_form       json;
  v_missing_active_view     json;
  v_missing_admin_priv      json;
  v_admin_role_id           uuid;
BEGIN
  IF NOT security.is_system_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;

  -- (a) Entities whose physical table is missing from the database.
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_missing_tables
  FROM (
    SELECT ed.entity_definition_id, ed.logical_name, ed.display_name,
           ed.physical_table_name, ed.is_custom
    FROM entity_definition ed
    WHERE ed.deleted_at IS NULL
      AND ed.physical_table_name IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables it
        WHERE it.table_schema = 'public'
          AND it.table_name = ed.physical_table_name
      )
    ORDER BY ed.display_name
  ) t;

  -- (b) Active fields whose physical column is missing from the table.
  --     Excludes JSONB-backed legacy fields (physical_column_name starting with
  --     'custom_fields') and calculated/virtual fields.
  SELECT COALESCE(json_agg(c), '[]'::json) INTO v_missing_columns
  FROM (
    SELECT ed.logical_name AS entity_logical_name,
           ed.display_name AS entity_display_name,
           ed.physical_table_name,
           fd.field_definition_id,
           fd.logical_name AS field_logical_name,
           fd.display_name AS field_display_name,
           fd.physical_column_name
    FROM field_definition fd
    JOIN entity_definition ed ON ed.entity_definition_id = fd.entity_definition_id
    WHERE fd.deleted_at IS NULL
      AND fd.is_active = true
      AND fd.physical_column_name IS NOT NULL
      AND fd.physical_column_name NOT LIKE 'custom_fields%'
      AND ed.deleted_at IS NULL
      AND ed.physical_table_name IS NOT NULL
      -- only check columns for tables that actually exist (missing tables are reported in (a))
      AND EXISTS (
        SELECT 1 FROM information_schema.tables it
        WHERE it.table_schema = 'public' AND it.table_name = ed.physical_table_name
      )
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns ic
        WHERE ic.table_schema = 'public'
          AND ic.table_name = ed.physical_table_name
          AND ic.column_name = fd.physical_column_name
      )
    ORDER BY ed.display_name, fd.display_name
  ) c;

  -- (c) Active entities with no default Main form.
  SELECT COALESCE(json_agg(f), '[]'::json) INTO v_missing_main_form
  FROM (
    SELECT ed.entity_definition_id, ed.logical_name, ed.display_name
    FROM entity_definition ed
    WHERE ed.deleted_at IS NULL
      AND ed.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM form_definition fo
        WHERE fo.entity_definition_id = ed.entity_definition_id
          AND fo.form_type = 'main'
          AND fo.deleted_at IS NULL
      )
    ORDER BY ed.display_name
  ) f;

  -- (d) Active entities with no active view.
  SELECT COALESCE(json_agg(v), '[]'::json) INTO v_missing_active_view
  FROM (
    SELECT ed.entity_definition_id, ed.logical_name, ed.display_name
    FROM entity_definition ed
    WHERE ed.deleted_at IS NULL
      AND ed.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM view_definition vd
        WHERE vd.entity_definition_id = ed.entity_definition_id
          AND vd.is_active = true
          AND vd.deleted_at IS NULL
      )
    ORDER BY ed.display_name
  ) v;

  -- (e) Active entities with no System Administrator privilege row (best-effort —
  --     skipped quietly if the role/table shape differs).
  BEGIN
    SELECT security_role_id INTO v_admin_role_id
    FROM security_role
    WHERE is_system_admin = true OR lower(name) = 'system administrator'
    ORDER BY is_system_admin DESC NULLS LAST
    LIMIT 1;

    SELECT COALESCE(json_agg(p), '[]'::json) INTO v_missing_admin_priv
    FROM (
      SELECT ed.entity_definition_id, ed.logical_name, ed.display_name
      FROM entity_definition ed
      WHERE ed.deleted_at IS NULL
        AND ed.is_active = true
        AND v_admin_role_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM role_privilege rp
          WHERE rp.entity_definition_id = ed.entity_definition_id
            AND rp.security_role_id = v_admin_role_id
        )
      ORDER BY ed.display_name
    ) p;
  EXCEPTION WHEN OTHERS THEN
    v_missing_admin_priv := '[]'::json;
  END;

  RETURN json_build_object(
    'ok', true,
    'generated_at', now(),
    'missing_tables', v_missing_tables,
    'missing_columns', v_missing_columns,
    'entities_missing_main_form', v_missing_main_form,
    'entities_missing_active_view', v_missing_active_view,
    'entities_missing_admin_privilege', v_missing_admin_priv
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.metadata_health_report() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.metadata_health_report() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. One-time reload so any already-created tables/columns become API-visible now.
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
