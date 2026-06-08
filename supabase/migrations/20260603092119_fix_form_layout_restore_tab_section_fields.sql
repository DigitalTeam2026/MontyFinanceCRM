/*
  # Fix form layout_json: restore tab and section fields stripped by previous migration

  ## Problem
  The previous purge migration rebuilt layout_json tabs using only id/label/sections,
  dropping is_visible, name, display_order, is_collapsed, and other fields.
  This caused the frontend to filter out all tabs (is_visible was null/undefined),
  showing "No form layout configured" on every record form.

  ## Fix
  Re-run the same control-level filter but this time preserve ALL original tab and
  section fields using jsonb concatenation (tab || new_sections_object).
*/

UPDATE public.form_definition AS fd_form
SET layout_json = (
  SELECT jsonb_build_object(
    'tabs',
    COALESCE(
      (
        SELECT jsonb_agg(
          -- Preserve all original tab fields, just replace the sections key
          tab || jsonb_build_object(
            'sections', (
              SELECT jsonb_agg(
                -- Preserve all original section fields, just replace the controls key
                sec || jsonb_build_object(
                  'controls', (
                    SELECT COALESCE(jsonb_agg(ctrl), '[]'::jsonb)
                    FROM jsonb_array_elements(sec->'controls') AS ctrl
                    WHERE
                      -- Keep controls with no field_definition_id (subgrids, spacers, labels)
                      (ctrl->>'field_definition_id') IS NULL
                      OR
                      -- Keep controls whose field_definition is active and not custom_fields.*
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
