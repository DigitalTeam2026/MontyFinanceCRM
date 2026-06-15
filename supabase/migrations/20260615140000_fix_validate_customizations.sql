/*
  # Fix validate_customizations() column reference

  The original function referenced `fc.form_id`, but `form_control` has no
  `form_id` — the form is reached via `form_section` (fs.form_id). That made
  every call (validate + publish, which calls validate) fail with 42703.
  This corrects the reference. Idempotent CREATE OR REPLACE.
*/

CREATE OR REPLACE FUNCTION public.validate_customizations()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
$fn$;

REVOKE ALL ON FUNCTION public.validate_customizations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_customizations() TO authenticated;

-- Ask PostgREST to reload its schema cache so the REST RPC endpoints resolve.
NOTIFY pgrst, 'reload schema';
