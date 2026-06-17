/*
  # Dashboard teardown — remove EVERYTHING dashboard from the database

  Drops the entire dashboard feature (tables, RPCs, secure-SQL plumbing, the
  reporting schema, privileges) and removes dashboard references from the global
  Publish All snapshot/validation functions.

  Reverses:
    - 20260327105607_27_dashboard_management.sql        (dashboard, dashboard_widget, dashboard_role_assignment)
    - 20260612170000_dashboard_aggregates_and_scope.sql (dashboard_aggregate/funnel/scope/etc.)
    - 20260616090000_dashboard_v2_schema.sql            (pages/filters/access/sql/params/log + helpers)
    - 20260616090100_dashboard_v2_publish_wiring.sql     (snapshot/validate wiring)
    - 20260616090200_dashboard_v2_secure_sql.sql         (reporting schema + execute_dashboard_sql)
    - 20260616090300_dashboard_v2_seed_default.sql       (seeded default dashboard rows)

  Idempotent: safe to run more than once. Pure DROP … IF EXISTS + guarded re-create.
*/

-- ─── 1. Re-create the Publish All snapshot builder WITHOUT dashboard tables ───
CREATE OR REPLACE FUNCTION public.build_customization_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_rows   jsonb;
  r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'form_definition','form_tab','form_section','form_control','form_script',
    'form_event_handler','subgrid_definition','entity_definition','field_definition',
    'view_definition','view_column','business_rule','process_flow','process_stage',
    'process_flow_transition','nav_area','nav_group','nav_item',
    'option_set','option_set_value','statecode_definition','status_reason_definition',
    'relationship_definition','lead_qualification_rule','lead_qualification_field_mapping',
    'workflow_definition','workflow_step','digital_rule','digital_rule_condition','digital_rule_action'
  ]) AS tbl
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=r.tbl) THEN
      EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM public.%I x', r.tbl)
        INTO v_rows;
      v_result := v_result || jsonb_build_object(r.tbl, v_rows);
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.build_customization_snapshot() FROM public, anon, authenticated;

-- ─── 2. Re-create the validator WITHOUT the dashboard SQL-widget check ────────
CREATE OR REPLACE FUNCTION public.validate_customizations()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_issues jsonb := '[]'::jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='form_control') THEN
    v_issues := v_issues || COALESCE((
      SELECT jsonb_agg(jsonb_build_object('component_type','forms','component_id', fs.form_id,
        'component_label', COALESCE(fd.name,'Form'),
        'message','Form references a field that is deleted or inactive.','severity','error'))
      FROM public.form_control fc
      JOIN public.form_section fs ON fs.section_id = fc.section_id
      LEFT JOIN public.form_definition fd ON fd.form_id = fs.form_id
      LEFT JOIN public.field_definition f ON f.field_definition_id = fc.field_definition_id
      WHERE fc.field_definition_id IS NOT NULL
        AND (f.field_definition_id IS NULL OR f.deleted_at IS NOT NULL OR f.is_active = false)
    ), '[]'::jsonb);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='view_column') THEN
    v_issues := v_issues || COALESCE((
      SELECT jsonb_agg(jsonb_build_object('component_type','views','component_id', vc.view_id,
        'component_label', COALESCE(vd.name,'View'),
        'message','View column references a field that is deleted or inactive.','severity','error'))
      FROM public.view_column vc
      LEFT JOIN public.view_definition vd ON vd.view_id = vc.view_id
      LEFT JOIN public.field_definition f ON f.field_definition_id = vc.field_definition_id
      WHERE vc.field_definition_id IS NOT NULL
        AND (f.field_definition_id IS NULL OR f.deleted_at IS NOT NULL OR f.is_active = false)
    ), '[]'::jsonb);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='nav_item') THEN
    v_issues := v_issues || COALESCE((
      SELECT jsonb_agg(jsonb_build_object('component_type','navigation','component_id', ni.nav_item_id,
        'component_label', COALESCE(ni.display_label, ni.entity_name,'Nav item'),
        'message','Navigation item references an entity that is inactive or missing.','severity','error'))
      FROM public.nav_item ni
      LEFT JOIN public.entity_definition e
        ON e.logical_name = ni.entity_name AND e.deleted_at IS NULL AND e.is_active = true
      WHERE ni.entity_name IS NOT NULL AND ni.is_active = true AND e.entity_definition_id IS NULL
    ), '[]'::jsonb);
  END IF;

  RETURN v_issues;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_customizations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_customizations() TO authenticated;

-- ─── 3. Drop every dashboard function (any signature, public + security) ──────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','security')
      AND (
        p.proname LIKE 'dashboard\_%'
        OR p.proname IN (
          'execute_dashboard_sql','log_dashboard_execution','set_default_dashboard',
          'can_manage_dashboard_sql','can_execute_dashboard_sql','can_publish_dashboards'
        )
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- ─── 4. Drop the secure-SQL reporting schema (views + schema) ─────────────────
DROP SCHEMA IF EXISTS reporting CASCADE;

-- ─── 5. Drop all dashboard tables (CASCADE removes indexes/policies/triggers) ─
DROP TABLE IF EXISTS public.dashboard_execution_log   CASCADE;
DROP TABLE IF EXISTS public.dashboard_query_parameter CASCADE;
DROP TABLE IF EXISTS public.dashboard_sql_query       CASCADE;
DROP TABLE IF EXISTS public.dashboard_access          CASCADE;
DROP TABLE IF EXISTS public.dashboard_filter          CASCADE;
DROP TABLE IF EXISTS public.dashboard_page            CASCADE;
DROP TABLE IF EXISTS public.dashboard_role_assignment CASCADE;
DROP TABLE IF EXISTS public.dashboard_widget          CASCADE;
DROP TABLE IF EXISTS public.dashboard                 CASCADE;

-- ─── 6. Remove dashboard privileges + special capability flags ────────────────
-- The SA-protection trigger blocks deleting System Administrator privilege rows;
-- disable it only for this targeted cleanup of dashboard-specific privileges.
ALTER TABLE public.role_privilege DISABLE TRIGGER trg_protect_sa_privileges;
DELETE FROM public.role_privilege
WHERE entity_name IN (
  'dashboard',
  '__manage_dashboard_sql__','__execute_dashboard_sql__','__view_dashboard_sql__',
  '__publish_dashboards__','__set_default_dashboard__','__share_dashboards__'
);
ALTER TABLE public.role_privilege ENABLE TRIGGER trg_protect_sa_privileges;

-- ─── 7. Tidy: drop dashboard rows from the customization change log ────────────
DELETE FROM public.customization_change_log WHERE component_type = 'dashboards';
