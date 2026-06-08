/*
  # Lead field removal, Country field definitions, Opportunity custom field cleanup

  1. Lead Entity Changes
    - Soft-delete (deactivate) 5 field definitions: BPF Stage, City, Country, Process Flow, Source
    - These fields are no longer needed in the Lead entity

  2. Country Entity Changes
    - Add `iso_code_3` physical column (text) to country table
    - Register 3 field definitions: Name, ISO Code (2-digit), ISO Code (3-digit)
    - Name maps to existing `name` column
    - ISO Code (2-digit) maps to existing `code` column
    - ISO Code (3-digit) maps to new `iso_code_3` column

  3. Opportunity Entity Changes
    - Soft-delete (deactivate) all 63 custom field definitions
    - System fields are preserved

  4. Security
    - No RLS changes required (field_definition RLS already in place)

  5. Important Notes
    - No physical columns are dropped; only metadata is deactivated
    - Country physical column added with IF NOT EXISTS guard
*/

-- ============================================================
-- 1. Soft-delete Lead fields: BPF Stage, City, Country, Process Flow, Source
-- ============================================================
UPDATE field_definition
SET is_active = false,
    deleted_at = now()
WHERE field_definition_id IN (
  '5b1c9804-e355-48e6-ad39-1e1923d70336',  -- BPF Stage
  'd018d50e-5324-4424-ad88-8103a550fec4',  -- City
  '2c2700bd-73d7-4090-92e9-0dc68c631d63',  -- Country
  '7e3cdbe0-2a39-4918-99b2-37cd046893b5',  -- Process Flow
  'b2da10e3-1308-4fa0-9ebc-5be7278075a7'   -- Source
)
AND is_active = true;

-- ============================================================
-- 2. Country entity: add iso_code_3 column + register field definitions
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'country' AND column_name = 'iso_code_3'
  ) THEN
    ALTER TABLE country ADD COLUMN iso_code_3 text DEFAULT '';
  END IF;
END $$;

-- Name field definition
INSERT INTO field_definition (
  entity_definition_id, field_type_id, display_name, logical_name,
  physical_column_name, is_required, is_system, is_custom, is_active,
  max_length, sort_order
)
SELECT
  'abcb18a7-77e3-44e6-8fd0-9cd422dace0e',
  '42369027-c4a5-446c-affd-df4c45b053ec',
  'Name', 'name', 'name',
  true, false, false, true,
  200, 1
WHERE NOT EXISTS (
  SELECT 1 FROM field_definition
  WHERE entity_definition_id = 'abcb18a7-77e3-44e6-8fd0-9cd422dace0e'
    AND logical_name = 'name'
    AND is_active = true
);

-- ISO Code (2-digit) field definition
INSERT INTO field_definition (
  entity_definition_id, field_type_id, display_name, logical_name,
  physical_column_name, is_required, is_system, is_custom, is_active,
  max_length, sort_order
)
SELECT
  'abcb18a7-77e3-44e6-8fd0-9cd422dace0e',
  '42369027-c4a5-446c-affd-df4c45b053ec',
  'ISO Code (2-digit)', 'isocode2', 'code',
  true, false, false, true,
  2, 2
WHERE NOT EXISTS (
  SELECT 1 FROM field_definition
  WHERE entity_definition_id = 'abcb18a7-77e3-44e6-8fd0-9cd422dace0e'
    AND logical_name = 'isocode2'
    AND is_active = true
);

-- ISO Code (3-digit) field definition
INSERT INTO field_definition (
  entity_definition_id, field_type_id, display_name, logical_name,
  physical_column_name, is_required, is_system, is_custom, is_active,
  max_length, sort_order
)
SELECT
  'abcb18a7-77e3-44e6-8fd0-9cd422dace0e',
  '42369027-c4a5-446c-affd-df4c45b053ec',
  'ISO Code (3-digit)', 'isocode3', 'iso_code_3',
  false, false, false, true,
  3, 3
WHERE NOT EXISTS (
  SELECT 1 FROM field_definition
  WHERE entity_definition_id = 'abcb18a7-77e3-44e6-8fd0-9cd422dace0e'
    AND logical_name = 'isocode3'
    AND is_active = true
);

-- ============================================================
-- 3. Soft-delete ALL custom field definitions for Opportunity
-- ============================================================
UPDATE field_definition
SET is_active = false,
    deleted_at = now()
WHERE entity_definition_id = 'e9482035-8715-40fa-a9d3-794c5b963c95'
  AND is_custom = true
  AND is_active = true;
