/*
  # Country Option Set and Field Definition Re-activation

  ## Changes
  1. Creates a `country_codes` option set seeded from the existing `country` reference table
  2. Re-activates the `countrycode` field_definition for account, contact, and lead entities
  3. Updates field type to `choice` and maps physical column to `country_code`
  4. Sets config_json to reference the option set for rendering

  ## Security
  - No new tables — uses existing option_set and option_set_value tables (already RLS-enabled)

  ## Notes
  - Stores ISO code (LB, US, FR) in DB; display name is derived from the option set
  - The field is shown in forms as a searchable dropdown
*/

-- 1. Create the country_codes option set (idempotent)
INSERT INTO option_set (name, display_name, description, is_global)
SELECT 'country_codes', 'Country', 'ISO country codes', true
WHERE NOT EXISTS (
  SELECT 1 FROM option_set WHERE name = 'country_codes'
);

-- 2. Seed option_set_value from the existing country reference table
DO $$
DECLARE
  v_os_id uuid;
BEGIN
  SELECT option_set_id INTO v_os_id FROM option_set WHERE name = 'country_codes';

  -- Only insert if no values exist yet
  IF NOT EXISTS (SELECT 1 FROM option_set_value WHERE option_set_id = v_os_id) THEN
    INSERT INTO option_set_value (option_set_id, value, display_label, sort_order, is_default, is_active)
    SELECT
      v_os_id,
      c.code,
      c.name,
      ROW_NUMBER() OVER (ORDER BY c.name),
      false,
      true
    FROM country c
    WHERE c.is_active = true
    ORDER BY c.name;
  END IF;
END $$;

-- 3. Re-activate countrycode field_definition for account, contact, lead
--    Update physical_column_name to country_code and type to choice
DO $$
DECLARE
  v_os_id uuid;
  v_ft_choice_id uuid;
BEGIN
  SELECT option_set_id INTO v_os_id FROM option_set WHERE name = 'country_codes';
  SELECT field_type_id INTO v_ft_choice_id FROM field_type WHERE name = 'choice';

  -- Account
  UPDATE field_definition fd
  SET
    is_active = true,
    physical_column_name = 'country_code',
    field_type_id = v_ft_choice_id,
    display_name = 'Country',
    config_json = jsonb_build_object('option_set_name', 'country_codes', 'option_set_id', v_os_id)
  FROM entity_definition ed
  WHERE ed.entity_definition_id = fd.entity_definition_id
    AND ed.logical_name = 'account'
    AND fd.logical_name = 'countrycode';

  -- Contact
  UPDATE field_definition fd
  SET
    is_active = true,
    physical_column_name = 'country_code',
    field_type_id = v_ft_choice_id,
    display_name = 'Country',
    config_json = jsonb_build_object('option_set_name', 'country_codes', 'option_set_id', v_os_id)
  FROM entity_definition ed
  WHERE ed.entity_definition_id = fd.entity_definition_id
    AND ed.logical_name = 'contact'
    AND fd.logical_name = 'countrycode';

  -- Lead
  UPDATE field_definition fd
  SET
    is_active = true,
    physical_column_name = 'country_code',
    field_type_id = v_ft_choice_id,
    display_name = 'Country',
    config_json = jsonb_build_object('option_set_name', 'country_codes', 'option_set_id', v_os_id)
  FROM entity_definition ed
  WHERE ed.entity_definition_id = fd.entity_definition_id
    AND ed.logical_name = 'lead'
    AND fd.logical_name = 'countrycode';
END $$;
