/*
  # Add Product Field to Opportunity and Lead Form Layouts

  ## Summary
  Appends a product picker control to the first section ("General" tab) of both
  the default Opportunity and Lead main forms. The control references the
  `productid` field_definition seeded in migration 77.

  ## Changes

  ### form_definition: opportunity (form_id = 1a49940b-900e-4784-bda2-5d0bcc35ba90)
  - Appends a product picker field control to section sec_opp_info

  ### form_definition: lead (form_id = e7781cd5-3a91-4ca2-8e65-d524b3712941)
  - Appends a product picker field control to section sec_lead_info

  ## Notes
  - Control type is 'field', field_type_name is 'choice' (uses product_picker config_json)
  - Column span = 1 (narrow)
  - Safe: uses jsonb_set only if the control is not already present
*/

DO $$
DECLARE
  opp_form_id     uuid := '1a49940b-900e-4784-bda2-5d0bcc35ba90';
  lead_form_id    uuid := 'e7781cd5-3a91-4ca2-8e65-d524b3712941';
  opp_fd_id       uuid := '6507973d-4348-4216-b39e-c19501ecf4ec';
  lead_fd_id      uuid := '1940f489-9997-41ac-818e-cdb637f7b54f';

  opp_control     jsonb;
  lead_control    jsonb;

  opp_tabs_idx    int;
  opp_sec_idx     int;
  lead_tabs_idx   int;
  lead_sec_idx    int;

  opp_layout      jsonb;
  lead_layout     jsonb;
  tab_arr         jsonb;
  sec_arr         jsonb;
  ctrl_arr        jsonb;
BEGIN
  -- Build the product control JSON for opportunity
  opp_control := jsonb_build_object(
    'id',                   'ctrl_opp_product',
    'control_type',         'field',
    'field_definition_id',  opp_fd_id::text,
    'field_logical_name',   'productid',
    'field_display_name',   'Product',
    'field_type_name',      'choice',
    'label_override',       NULL,
    'column_span',          1,
    'is_visible',           true,
    'is_readonly',          false,
    'is_required_override', false,
    'subgrid_config',       NULL
  );

  -- Build the product control JSON for lead
  lead_control := jsonb_build_object(
    'id',                   'ctrl_lead_product',
    'control_type',         'field',
    'field_definition_id',  lead_fd_id::text,
    'field_logical_name',   'productid',
    'field_display_name',   'Product',
    'field_type_name',      'choice',
    'label_override',       NULL,
    'column_span',          1,
    'is_visible',           true,
    'is_readonly',          false,
    'is_required_override', false,
    'subgrid_config',       NULL
  );

  -- ── Opportunity form ────────────────────────────────────────────────────────
  SELECT layout_json INTO opp_layout
  FROM form_definition WHERE form_id = opp_form_id;

  IF opp_layout IS NOT NULL THEN
    -- Find tab index for tab_general
    SELECT i INTO opp_tabs_idx
    FROM jsonb_array_elements(opp_layout->'tabs') WITH ORDINALITY arr(elem, i)
    WHERE elem->>'id' = 'tab_general'
    LIMIT 1;

    opp_tabs_idx := COALESCE(opp_tabs_idx, 1) - 1; -- convert to 0-based

    -- Find section index for sec_opp_info
    SELECT i INTO opp_sec_idx
    FROM jsonb_array_elements(opp_layout->'tabs'->opp_tabs_idx->'sections') WITH ORDINALITY arr(elem, i)
    WHERE elem->>'id' = 'sec_opp_info'
    LIMIT 1;

    opp_sec_idx := COALESCE(opp_sec_idx, 1) - 1;

    -- Check if control already exists
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        opp_layout->'tabs'->opp_tabs_idx->'sections'->opp_sec_idx->'controls'
      ) c WHERE c->>'id' = 'ctrl_opp_product'
    ) THEN
      ctrl_arr := (opp_layout->'tabs'->opp_tabs_idx->'sections'->opp_sec_idx->'controls') || opp_control;

      UPDATE form_definition
      SET layout_json = jsonb_set(
            layout_json,
            ARRAY['tabs', opp_tabs_idx::text, 'sections', opp_sec_idx::text, 'controls'],
            ctrl_arr
          ),
          modified_at = now()
      WHERE form_id = opp_form_id;
    END IF;
  END IF;

  -- ── Lead form ───────────────────────────────────────────────────────────────
  SELECT layout_json INTO lead_layout
  FROM form_definition WHERE form_id = lead_form_id;

  IF lead_layout IS NOT NULL THEN
    -- Find tab index for tab_general
    SELECT i INTO lead_tabs_idx
    FROM jsonb_array_elements(lead_layout->'tabs') WITH ORDINALITY arr(elem, i)
    WHERE elem->>'id' = 'tab_general'
    LIMIT 1;

    lead_tabs_idx := COALESCE(lead_tabs_idx, 1) - 1;

    -- Find section index for sec_lead_info
    SELECT i INTO lead_sec_idx
    FROM jsonb_array_elements(lead_layout->'tabs'->lead_tabs_idx->'sections') WITH ORDINALITY arr(elem, i)
    WHERE elem->>'id' = 'sec_lead_info'
    LIMIT 1;

    lead_sec_idx := COALESCE(lead_sec_idx, 1) - 1;

    -- Check if control already exists
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        lead_layout->'tabs'->lead_tabs_idx->'sections'->lead_sec_idx->'controls'
      ) c WHERE c->>'id' = 'ctrl_lead_product'
    ) THEN
      ctrl_arr := (lead_layout->'tabs'->lead_tabs_idx->'sections'->lead_sec_idx->'controls') || lead_control;

      UPDATE form_definition
      SET layout_json = jsonb_set(
            layout_json,
            ARRAY['tabs', lead_tabs_idx::text, 'sections', lead_sec_idx::text, 'controls'],
            ctrl_arr
          ),
          modified_at = now()
      WHERE form_id = lead_form_id;
    END IF;
  END IF;
END $$;
