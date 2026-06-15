/*
  # Publish All Customizations — draft/published lifecycle

  Introduces a Dynamics-style global publication system. Admin Studio keeps
  editing the live metadata tables (the "draft"); the Sales app reads ONLY a
  versioned, validated JSON snapshot captured at publish time.

  New objects
  -----------
  Tables:
    - customization_publication      global version registry (one row per publish)
    - published_metadata_snapshot    the published definition Sales consumes
    - customization_change_log       dirty-tracking (pending = published_version IS NULL)

  Functions:
    - public.trg_record_customization_change()  generic change-log trigger
    - public.build_customization_snapshot()     export all registered tables -> jsonb
    - public.validate_customizations()          referential validation -> jsonb[]
    - public.publish_all_customizations(bigint) ATOMIC publish (privilege + concurrency + validation)
    - public.rollback_customization_to(bigint)  re-publish a prior snapshot as a new version
    - security.can_publish_customizations()     permission helper

  Permission: a `publish_customizations` privilege rides the existing security
  model via a role_privilege row convention (entity_name='__publish_customizations__').

  Security model:
    - Snapshot + version + change-log are READABLE by authenticated (Sales needs them).
    - All WRITES happen only through SECURITY DEFINER RPCs / the change-log trigger.
    - Publish/rollback require security.can_publish_customizations().

  This migration is idempotent and guards every table reference with an
  information_schema existence check, so it is safe even if a registered table
  is renamed or absent.
*/

-- ============================================================================
-- 1. REGISTRY (kept in sync with src/admin/publish/customizationRegistry.ts)
--    A composite type-free VALUES list reused by triggers + snapshot.
--    component, table, pk-column.
-- ============================================================================
-- (declared inline in the DO/loops below to avoid a persistent type)

-- ============================================================================
-- 2. TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customization_publication (
  publication_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customization_version bigint NOT NULL UNIQUE,
  publication_status    text NOT NULL DEFAULT 'published'
                          CHECK (publication_status IN ('pending','validating','published','failed','rolled_back')),
  published_at          timestamptz NOT NULL DEFAULT now(),
  published_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  change_count          int NOT NULL DEFAULT 0,
  component_summary     jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_results    jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_details         jsonb,
  previous_version      bigint,
  base_version          bigint,
  rolled_back_from      bigint,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cust_pub_version ON public.customization_publication(customization_version DESC);

CREATE TABLE IF NOT EXISTS public.published_metadata_snapshot (
  snapshot_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id        uuid NOT NULL REFERENCES public.customization_publication(publication_id) ON DELETE CASCADE,
  customization_version bigint NOT NULL UNIQUE,
  snapshot              jsonb NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_snapshot_version ON public.published_metadata_snapshot(customization_version DESC);

CREATE TABLE IF NOT EXISTS public.customization_change_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_type    text NOT NULL,
  table_name        text NOT NULL,
  row_pk            text,
  op                text NOT NULL CHECK (op IN ('insert','update','delete')),
  changed_by        uuid,
  changed_at        timestamptz NOT NULL DEFAULT now(),
  published_version bigint   -- NULL = pending (not yet published)
);

CREATE INDEX IF NOT EXISTS idx_cust_changelog_pending
  ON public.customization_change_log(component_type)
  WHERE published_version IS NULL;

-- ============================================================================
-- 3. RLS — read-only for authenticated; writes only via SECURITY DEFINER paths
-- ============================================================================
ALTER TABLE public.customization_publication    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.published_metadata_snapshot  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customization_change_log     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read publications" ON public.customization_publication;
CREATE POLICY "read publications" ON public.customization_publication
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "read snapshots" ON public.published_metadata_snapshot;
CREATE POLICY "read snapshots" ON public.published_metadata_snapshot
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "read change log" ON public.customization_change_log;
CREATE POLICY "read change log" ON public.customization_change_log
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 4. PERMISSION — publish_customizations privilege + helper
-- ============================================================================
CREATE OR REPLACE FUNCTION security.can_publish_customizations()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT security.crm_user_has_privilege('__publish_customizations__', 'can_write');
$$;

REVOKE ALL ON FUNCTION security.can_publish_customizations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION security.can_publish_customizations() TO authenticated;

-- Grant the privilege to the System Administrator role (rides role_privilege).
DO $$
DECLARE v_role_id uuid;
BEGIN
  SELECT role_id INTO v_role_id
    FROM public.security_role
   WHERE name = 'System Administrator'
   LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.role_privilege (role_id, entity_name, can_read, can_write, access_level)
    VALUES (v_role_id, '__publish_customizations__', true, true, 'organization')
    ON CONFLICT (role_id, entity_name) DO UPDATE
      SET can_read = true, can_write = true, modified_at = now();
  END IF;
END $$;

-- ============================================================================
-- 5. GENERIC CHANGE-LOG TRIGGER + attach to every registered metadata table
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_record_customization_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_component text := TG_ARGV[0];
  v_pk_col    text := TG_ARGV[1];
  v_row       jsonb;
  v_op        text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD); v_op := 'delete';
  ELSIF TG_OP = 'INSERT' THEN
    v_row := to_jsonb(NEW); v_op := 'insert';
  ELSE
    v_row := to_jsonb(NEW); v_op := 'update';
  END IF;

  INSERT INTO public.customization_change_log(component_type, table_name, row_pk, op, changed_by)
  VALUES (v_component, TG_TABLE_NAME, v_row ->> v_pk_col, v_op, auth.uid());

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('form_definition','forms','form_id'),
    ('form_tab','forms','tab_id'),
    ('form_section','forms','section_id'),
    ('form_control','forms','control_id'),
    ('form_script','forms','script_id'),
    ('form_event_handler','forms','handler_id'),
    ('subgrid_definition','forms','subgrid_id'),
    ('entity_definition','entities','entity_definition_id'),
    ('field_definition','fields','field_definition_id'),
    ('view_definition','views','view_id'),
    ('view_column','views','view_column_id'),
    ('business_rule','rules','business_rule_id'),
    ('process_flow','processflows','process_flow_id'),
    ('process_stage','processflows','process_stage_id'),
    ('process_flow_transition','processflows','transition_id'),
    ('nav_area','navigation','nav_area_id'),
    ('nav_group','navigation','nav_group_id'),
    ('nav_item','navigation','nav_item_id'),
    ('dashboard','dashboards','dashboard_id'),
    ('dashboard_widget','dashboards','widget_id'),
    ('dashboard_role_assignment','dashboards','id'),
    ('option_set','optionsets','option_set_id'),
    ('option_set_value','optionsets','option_set_value_id'),
    ('statecode_definition','status','statecode_id'),
    ('status_reason_definition','status','status_reason_id'),
    ('relationship_definition','relationships','relationship_definition_id'),
    ('lead_qualification_rule','leadqualification','lead_qualification_rule_id'),
    ('lead_qualification_field_mapping','leadqualification','lead_qualification_field_mapping_id'),
    ('workflow_definition','workflows','workflow_id'),
    ('workflow_step','workflows','workflow_step_id'),
    ('digital_rule','digitalrules','digital_rule_id'),
    ('digital_rule_condition','digitalrules','digital_rule_condition_id'),
    ('digital_rule_action','digitalrules','digital_rule_action_id')
  ) AS t(tbl, comp, pk)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = r.tbl
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS zz_customization_change ON public.%I', r.tbl);
      EXECUTE format(
        'CREATE TRIGGER zz_customization_change AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION public.trg_record_customization_change(%L, %L)',
        r.tbl, r.comp, r.pk
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 6. SNAPSHOT BUILDER — export every registered table to one jsonb object,
--    keyed by table_name. Robust against missing tables.
-- ============================================================================
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
    'dashboard_widget','dashboard_role_assignment','option_set','option_set_value',
    'statecode_definition','status_reason_definition','relationship_definition',
    'lead_qualification_rule','lead_qualification_field_mapping','workflow_definition',
    'workflow_step','digital_rule','digital_rule_condition','digital_rule_action'
  ]) AS tbl
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = r.tbl
    ) THEN
      EXECUTE format(
        'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM public.%I x', r.tbl
      ) INTO v_rows;
      v_result := v_result || jsonb_build_object(r.tbl, v_rows);
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.build_customization_snapshot() FROM public, anon, authenticated;

-- ============================================================================
-- 7. VALIDATION — referential checks over the draft tables. Returns jsonb[]
--    of {component_type, component_id, component_label, message, severity}.
-- ============================================================================
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
  -- a) form control references a deleted/inactive field
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='form_control') THEN
    v_issues := v_issues || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'component_type','forms',
        'component_id', fs.form_id,
        'component_label', COALESCE(fd.name, 'Form'),
        'message', 'Form references a field that is deleted or inactive.',
        'severity','error'))
      FROM public.form_control fc
      JOIN public.form_section fs ON fs.section_id = fc.section_id
      LEFT JOIN public.form_definition fd ON fd.form_id = fs.form_id
      LEFT JOIN public.field_definition f ON f.field_definition_id = fc.field_definition_id
      WHERE fc.field_definition_id IS NOT NULL
        AND (f.field_definition_id IS NULL OR f.deleted_at IS NOT NULL OR f.is_active = false)
    ), '[]'::jsonb);
  END IF;

  -- b) view column references a deleted/inactive field
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='view_column') THEN
    v_issues := v_issues || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'component_type','views',
        'component_id', vc.view_id,
        'component_label', COALESCE(vd.name, 'View'),
        'message', 'View column references a field that is deleted or inactive.',
        'severity','error'))
      FROM public.view_column vc
      LEFT JOIN public.view_definition vd ON vd.view_id = vc.view_id
      LEFT JOIN public.field_definition f ON f.field_definition_id = vc.field_definition_id
      WHERE vc.field_definition_id IS NOT NULL
        AND (f.field_definition_id IS NULL OR f.deleted_at IS NOT NULL OR f.is_active = false)
    ), '[]'::jsonb);
  END IF;

  -- c) navigation item references an inactive/missing entity
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='nav_item') THEN
    v_issues := v_issues || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'component_type','navigation',
        'component_id', ni.nav_item_id,
        'component_label', COALESCE(ni.display_label, ni.entity_name, 'Nav item'),
        'message', 'Navigation item references an entity that is inactive or missing.',
        'severity','error'))
      FROM public.nav_item ni
      LEFT JOIN public.entity_definition e
        ON e.logical_name = ni.entity_name AND e.deleted_at IS NULL AND e.is_active = true
      WHERE ni.entity_name IS NOT NULL
        AND ni.is_active = true
        AND e.entity_definition_id IS NULL
    ), '[]'::jsonb);
  END IF;

  RETURN v_issues;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_customizations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_customizations() TO authenticated;

-- ============================================================================
-- 8. PUBLISH — atomic: privilege -> concurrency -> validate -> snapshot -> commit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.publish_all_customizations(p_base_version bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current     bigint;
  v_new         bigint;
  v_issues      jsonb;
  v_errors      jsonb;
  v_summary     jsonb;
  v_count       int;
  v_snapshot    jsonb;
  v_pub_id      uuid;
BEGIN
  IF NOT security.can_publish_customizations() THEN
    RAISE EXCEPTION 'not_authorized: publish_customizations privilege required'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize concurrent publishes.
  PERFORM pg_advisory_xact_lock(hashtext('publish_all_customizations'));

  SELECT COALESCE(MAX(customization_version), 0) INTO v_current
    FROM public.customization_publication;

  -- Optimistic concurrency: caller's view of the world must be current.
  IF p_base_version IS NOT NULL AND p_base_version <> v_current THEN
    RAISE EXCEPTION 'version_conflict: latest is % but caller based on %', v_current, p_base_version
      USING ERRCODE = '40001';
  END IF;

  -- Validate; abort (rollback whole tx) on any blocking error.
  v_issues := public.validate_customizations();
  v_errors := COALESCE((
    SELECT jsonb_agg(e) FROM jsonb_array_elements(v_issues) e
    WHERE e->>'severity' = 'error'
  ), '[]'::jsonb);

  IF jsonb_array_length(v_errors) > 0 THEN
    RAISE EXCEPTION 'validation_failed: %', v_errors::text
      USING ERRCODE = 'P0001';
  END IF;

  -- Pending change summary.
  SELECT COUNT(*)::int,
         COALESCE(jsonb_object_agg(component_type, cnt) FILTER (WHERE component_type IS NOT NULL), '{}'::jsonb)
    INTO v_count, v_summary
    FROM (
      SELECT component_type, COUNT(*) AS cnt
        FROM public.customization_change_log
       WHERE published_version IS NULL
       GROUP BY component_type
    ) s;

  v_new := v_current + 1;
  v_snapshot := public.build_customization_snapshot();

  INSERT INTO public.customization_publication
    (customization_version, publication_status, published_by, change_count,
     component_summary, validation_results, previous_version, base_version)
  VALUES
    (v_new, 'published', auth.uid(), COALESCE(v_count,0),
     COALESCE(v_summary,'{}'::jsonb), v_issues, NULLIF(v_current,0), p_base_version)
  RETURNING publication_id INTO v_pub_id;

  INSERT INTO public.published_metadata_snapshot (publication_id, customization_version, snapshot)
  VALUES (v_pub_id, v_new, v_snapshot);

  UPDATE public.customization_change_log
     SET published_version = v_new
   WHERE published_version IS NULL;

  RETURN jsonb_build_object(
    'version', v_new,
    'previous_version', NULLIF(v_current,0),
    'change_count', COALESCE(v_count,0),
    'component_summary', COALESCE(v_summary,'{}'::jsonb),
    'warnings', COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(v_issues) e WHERE e->>'severity' <> 'error'), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_all_customizations(bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_all_customizations(bigint) TO authenticated;

-- ============================================================================
-- 9. ROLLBACK — re-publish a prior snapshot as a brand-new version (no deletes)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rollback_customization_to(p_version bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current  bigint;
  v_new      bigint;
  v_snapshot jsonb;
  v_summary  jsonb;
  v_pub_id   uuid;
BEGIN
  IF NOT security.can_publish_customizations() THEN
    RAISE EXCEPTION 'not_authorized: publish_customizations privilege required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('publish_all_customizations'));

  SELECT snapshot INTO v_snapshot
    FROM public.published_metadata_snapshot
   WHERE customization_version = p_version;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'unknown_version: % not found', p_version USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(customization_version),0) INTO v_current FROM public.customization_publication;
  SELECT component_summary INTO v_summary
    FROM public.customization_publication WHERE customization_version = p_version;

  v_new := v_current + 1;

  INSERT INTO public.customization_publication
    (customization_version, publication_status, published_by, change_count,
     component_summary, previous_version, rolled_back_from)
  VALUES
    (v_new, 'rolled_back', auth.uid(), 0, COALESCE(v_summary,'{}'::jsonb), v_current, p_version)
  RETURNING publication_id INTO v_pub_id;

  INSERT INTO public.published_metadata_snapshot (publication_id, customization_version, snapshot)
  VALUES (v_pub_id, v_new, v_snapshot);

  RETURN jsonb_build_object('version', v_new, 'rolled_back_from', p_version);
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_customization_to(bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_customization_to(bigint) TO authenticated;

-- ============================================================================
-- 10. SEED initial publication (version 1) so Sales reads a snapshot from day one
-- ============================================================================
DO $$
DECLARE v_pub_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customization_publication) THEN
    INSERT INTO public.customization_publication
      (customization_version, publication_status, change_count, component_summary)
    VALUES (1, 'published', 0, '{}'::jsonb)
    RETURNING publication_id INTO v_pub_id;

    INSERT INTO public.published_metadata_snapshot (publication_id, customization_version, snapshot)
    VALUES (v_pub_id, 1, public.build_customization_snapshot());
  END IF;
END $$;

-- ============================================================================
-- 11. REALTIME — let the Sales app subscribe to new publications
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'customization_publication'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.customization_publication;
    END IF;
  END IF;
END $$;
