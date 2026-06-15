/*
  # Dashboard v2 — Publish All wiring

  Brings the new dashboard tables into the existing global "Publish All"
  customization snapshot system (20260615130000_publish_customizations.sql):
    - Attaches the change-log trigger to the new tables (component_type 'dashboards').
    - Replaces build_customization_snapshot() to include the new tables.
    - Adds a dashboard widget validator to validate_customizations().

  dashboard_execution_log is runtime audit data, NOT customization — excluded.
  Idempotent.
*/

-- 1. Attach change-log trigger to the new dashboard tables.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('dashboard_page','dashboards','page_id'),
    ('dashboard_filter','dashboards','filter_id'),
    ('dashboard_access','dashboards','access_id'),
    ('dashboard_sql_query','dashboards','sql_query_id'),
    ('dashboard_query_parameter','dashboards','parameter_id')
  ) AS t(tbl, comp, pk)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=r.tbl) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS zz_customization_change ON public.%I', r.tbl);
      EXECUTE format(
        'CREATE TRIGGER zz_customization_change AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION public.trg_record_customization_change(%L, %L)',
        r.tbl, r.comp, r.pk
      );
    END IF;
  END LOOP;
END $$;

-- 2. Replace the snapshot builder to also export the new dashboard tables.
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
    'process_flow_transition','nav_area','nav_group','nav_item','dashboard',
    'dashboard_widget','dashboard_role_assignment','dashboard_page','dashboard_filter',
    'dashboard_access','dashboard_sql_query','dashboard_query_parameter',
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

-- 3. Add a dashboard validator: a widget must reference an existing dashboard
--    and (for entity widgets) a known entity, and SQL widgets a saved query.
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
  -- (reuse the same checks as the base function)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='form_control') THEN
    v_issues := v_issues || COALESCE((
      SELECT jsonb_agg(jsonb_build_object('component_type','forms','component_id', fc.form_id,
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

  -- NEW: a SQL widget must reference a saved, validated query.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='dashboard_widget') THEN
    v_issues := v_issues || COALESCE((
      SELECT jsonb_agg(jsonb_build_object('component_type','dashboards','component_id', w.dashboard_id,
        'component_label', COALESCE(w.title,'Widget'),
        'message','SQL widget references a missing or unvalidated query.','severity','warning'))
      FROM public.dashboard_widget w
      LEFT JOIN public.dashboard_sql_query q ON q.sql_query_id = w.sql_query_id
      WHERE w.data_source_type = 'sql'
        AND (w.sql_query_id IS NULL OR q.sql_query_id IS NULL OR q.is_validated = false)
    ), '[]'::jsonb);
  END IF;

  RETURN v_issues;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_customizations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_customizations() TO authenticated;
