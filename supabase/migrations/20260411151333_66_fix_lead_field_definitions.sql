/*
  # Fix Lead Field Definitions

  ## Summary
  Several lead field definitions have incorrect physical column mappings or are inactive,
  causing data to not save correctly on the lead form.

  ## Changes

  ### 1. Add missing columns to lead table
  - `city` (text) — for the `address1_city` field (was mapped to 'city' but column didn't exist)

  ### 2. Fix `leadsourcecode` field
  - The Source field was mapped to `status_code` (incorrect) and marked inactive
  - Add `lead_source` (text) column to store the source value as a text code
  - Create a `lead_source` option set with common lead source values
  - Fix physical_column_name to `lead_source`
  - Set correct config_json referencing the option set
  - Activate the field

  ### 3. Fix `address1_city` field
  - Was mapped to `city` which didn't exist — now the column is added

  ### 4. Fix `statuscode` field
  - Ensure it has config_json referencing `lead_status` option set

  ### 5. Remove Stakeholders (opportunity_contacts) subgrid from Lead form
  - The lead main form mistakenly has a "Related" tab with Stakeholders (an Opportunity concept)
  - Remove that tab from the lead form layout
*/

-- 1. Add missing city column to lead table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'city'
  ) THEN
    ALTER TABLE lead ADD COLUMN city text;
  END IF;
END $$;

-- 2. Add lead_source column to lead table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'lead_source'
  ) THEN
    ALTER TABLE lead ADD COLUMN lead_source text;
  END IF;
END $$;

-- 3. Create lead_source option set
INSERT INTO option_set (name, display_name, description, is_global)
SELECT 'lead_source', 'Lead Source', 'Source of a lead', false
WHERE NOT EXISTS (
  SELECT 1 FROM option_set WHERE name = 'lead_source'
);

-- 4. Seed lead source values
DO $$
DECLARE
  v_os_id uuid;
BEGIN
  SELECT option_set_id INTO v_os_id FROM option_set WHERE name = 'lead_source';

  IF NOT EXISTS (SELECT 1 FROM option_set_value WHERE option_set_id = v_os_id) THEN
    INSERT INTO option_set_value (option_set_id, value, display_label, sort_order, is_default, is_active)
    VALUES
      (v_os_id, 'web',            'Web',              1,  true,  true),
      (v_os_id, 'referral',       'Referral',         2,  false, true),
      (v_os_id, 'social_media',   'Social Media',     3,  false, true),
      (v_os_id, 'email_campaign', 'Email Campaign',   4,  false, true),
      (v_os_id, 'cold_call',      'Cold Call',        5,  false, true),
      (v_os_id, 'trade_show',     'Trade Show',       6,  false, true),
      (v_os_id, 'partner',        'Partner',          7,  false, true),
      (v_os_id, 'other',          'Other',            8,  false, true);
  END IF;
END $$;

-- 5. Fix leadsourcecode field: activate it, correct physical column, set config_json
DO $$
DECLARE
  v_os_id uuid;
  v_ft_choice_id uuid;
BEGIN
  SELECT option_set_id INTO v_os_id FROM option_set WHERE name = 'lead_source';
  SELECT field_type_id INTO v_ft_choice_id FROM field_type WHERE name = 'choice';

  UPDATE field_definition fd
  SET
    is_active = true,
    physical_column_name = 'lead_source',
    field_type_id = v_ft_choice_id,
    display_name = 'Source',
    config_json = jsonb_build_object('option_set_name', 'lead_source', 'option_set_id', v_os_id)
  FROM entity_definition ed
  WHERE ed.entity_definition_id = fd.entity_definition_id
    AND ed.logical_name = 'lead'
    AND fd.logical_name = 'leadsourcecode';
END $$;

-- 6. Fix statuscode field: set config_json referencing lead_status option set
DO $$
DECLARE
  v_os_id uuid;
BEGIN
  SELECT option_set_id INTO v_os_id FROM option_set WHERE name = 'lead_status';

  UPDATE field_definition fd
  SET
    config_json = jsonb_build_object('option_set_name', 'lead_status', 'option_set_id', v_os_id)
  FROM entity_definition ed
  WHERE ed.entity_definition_id = fd.entity_definition_id
    AND ed.logical_name = 'lead'
    AND fd.logical_name = 'statuscode'
    AND (fd.config_json IS NULL OR fd.config_json = '{}'::jsonb);
END $$;

-- 7. Remove the erroneous "Related/Stakeholders" tab from the Lead Main Form
-- and ensure the description section is present
UPDATE form_definition fd
SET layout_json = (
  SELECT jsonb_set(
    fd.layout_json,
    '{tabs}',
    (
      SELECT jsonb_agg(tab ORDER BY (tab->>'display_order')::int)
      FROM jsonb_array_elements(fd.layout_json->'tabs') AS tab
      WHERE tab->>'id' != 'tab_opp_related'
    )
  )
  FROM entity_definition ed
  WHERE ed.entity_definition_id = fd.entity_definition_id
    AND ed.logical_name = 'lead'
)
FROM entity_definition ed2
WHERE ed2.entity_definition_id = fd.entity_definition_id
  AND ed2.logical_name = 'lead'
  AND fd.name = 'Lead Main Form';
