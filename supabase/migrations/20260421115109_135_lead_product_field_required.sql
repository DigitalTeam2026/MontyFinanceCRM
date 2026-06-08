/*
  # Make Product field mandatory on Lead

  ## Changes
  1. Sets is_required = true on the product field definition for the Lead entity
  2. Sets is_required_override = true on the product control in the Lead main form layout
*/

-- 1. Field definition
UPDATE field_definition
SET
  is_required = true,
  modified_at = now()
WHERE logical_name = 'productid'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'lead'
  );

-- 2. Form layout control — update is_required_override in the JSON
UPDATE form_definition
SET
  layout_json = jsonb_set(
    layout_json,
    '{tabs}',
    (
      SELECT jsonb_agg(
        CASE WHEN tab->>'tab_id' = 'tab_general'
        THEN jsonb_set(
          tab,
          '{sections}',
          (
            SELECT jsonb_agg(
              CASE WHEN section->>'section_id' = 'sec_lead_info'
              THEN jsonb_set(
                section,
                '{controls}',
                (
                  SELECT jsonb_agg(
                    CASE WHEN control->>'control_id' = 'ctrl_lead_product'
                    THEN jsonb_set(control, '{is_required_override}', 'true'::jsonb)
                    ELSE control
                    END
                  )
                  FROM jsonb_array_elements(section->'controls') AS control
                )
              )
              ELSE section
              END
            )
            FROM jsonb_array_elements(tab->'sections') AS section
          )
        )
        ELSE tab
        END
      )
      FROM jsonb_array_elements(layout_json->'tabs') AS tab
    )
  ),
  modified_at = now()
WHERE form_id = 'e7781cd5-3a91-4ca2-8e65-d524b3712941';
