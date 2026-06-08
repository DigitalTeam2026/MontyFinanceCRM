/*
  # Purge all stale field references from forms, views, and filters

  ## Summary
  Removes every reference to deleted, inactive, or custom_fields.* mapped fields
  from all forms, view columns, and view filter/sort JSON across all entities.

  ## What gets cleaned
  - Form layout_json controls referencing missing/inactive/deleted/custom_fields.* fields
  - view_column rows referencing missing/inactive/deleted/custom_fields.* fields
  - view filter_json conditions for fields with no active field_definition
  - view sort_json entries for fields with no active field_definition
  - view quick_find_fields (text[]) entries for fields with no active field_definition
*/

-- ── Step 1: Clean form layout_json controls ──────────────────────────────────

UPDATE public.form_definition AS fd_form
SET layout_json = (
  SELECT jsonb_build_object(
    'tabs',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',       tab->'id',
            'label',    tab->'label',
            'sections', (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id',       sec->'id',
                  'label',    sec->'label',
                  'columns',  sec->'columns',
                  'controls', (
                    SELECT COALESCE(jsonb_agg(ctrl), '[]'::jsonb)
                    FROM jsonb_array_elements(sec->'controls') AS ctrl
                    WHERE
                      (ctrl->>'field_definition_id') IS NULL
                      OR
                      EXISTS (
                        SELECT 1
                        FROM public.field_definition fd_check
                        WHERE fd_check.field_definition_id = (ctrl->>'field_definition_id')::uuid
                          AND fd_check.is_active = true
                          AND fd_check.deleted_at IS NULL
                          AND fd_check.physical_column_name NOT LIKE 'custom_fields.%'
                      )
                  )
                )
              )
              FROM jsonb_array_elements(tab->'sections') AS sec
            )
          )
        )
        FROM jsonb_array_elements(fd_form.layout_json->'tabs') AS tab
      ),
      '[]'::jsonb
    )
  )
)
WHERE fd_form.layout_json IS NOT NULL
  AND fd_form.layout_json ? 'tabs';

-- ── Step 2: Delete orphaned view_column rows ─────────────────────────────────

DELETE FROM public.view_column vc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.field_definition fd
  WHERE fd.field_definition_id = vc.field_definition_id
    AND fd.is_active = true
    AND fd.deleted_at IS NULL
    AND fd.physical_column_name NOT LIKE 'custom_fields.%'
);

-- ── Step 3: Clean view filter_json conditions ────────────────────────────────

UPDATE public.view_definition vd
SET filter_json = (
  CASE
    WHEN vd.filter_json IS NULL THEN NULL
    WHEN NOT (vd.filter_json ? 'conditions') THEN vd.filter_json
    ELSE jsonb_set(
      vd.filter_json,
      '{conditions}',
      COALESCE(
        (
          SELECT jsonb_agg(cond)
          FROM jsonb_array_elements(vd.filter_json->'conditions') AS cond
          WHERE EXISTS (
            SELECT 1
            FROM public.field_definition fd
            WHERE fd.entity_definition_id = vd.entity_definition_id
              AND fd.logical_name = cond->>'field'
              AND fd.is_active = true
              AND fd.deleted_at IS NULL
              AND fd.physical_column_name NOT LIKE 'custom_fields.%'
          )
        ),
        '[]'::jsonb
      )
    )
  END
)
WHERE vd.filter_json IS NOT NULL;

-- ── Step 4: Clean view sort_json entries ─────────────────────────────────────

UPDATE public.view_definition vd
SET sort_json = (
  CASE
    WHEN vd.sort_json IS NULL THEN NULL
    WHEN jsonb_typeof(vd.sort_json) != 'array' THEN vd.sort_json
    ELSE COALESCE(
      (
        SELECT jsonb_agg(s)
        FROM jsonb_array_elements(vd.sort_json) AS s
        WHERE EXISTS (
          SELECT 1
          FROM public.field_definition fd
          WHERE fd.entity_definition_id = vd.entity_definition_id
            AND fd.logical_name = s->>'field'
            AND fd.is_active = true
            AND fd.deleted_at IS NULL
            AND fd.physical_column_name NOT LIKE 'custom_fields.%'
        )
      ),
      '[]'::jsonb
    )
  END
)
WHERE vd.sort_json IS NOT NULL;

-- ── Step 5: Clean view quick_find_fields (text[]) ────────────────────────────

UPDATE public.view_definition vd
SET quick_find_fields = (
  SELECT ARRAY(
    SELECT qf
    FROM unnest(vd.quick_find_fields) AS qf
    WHERE EXISTS (
      SELECT 1
      FROM public.field_definition fd
      WHERE fd.entity_definition_id = vd.entity_definition_id
        AND fd.logical_name = qf
        AND fd.is_active = true
        AND fd.deleted_at IS NULL
        AND fd.physical_column_name NOT LIKE 'custom_fields.%'
    )
  )
)
WHERE vd.quick_find_fields IS NOT NULL
  AND array_length(vd.quick_find_fields, 1) > 0;
