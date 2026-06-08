/*
  # Fix lead product and contact field definitions

  1. Changes
    - Remove the old inactive `productid` field definition (duplicated, never used)
    - Update the active `product` field definition on lead:
      - Change physical_column_name from 'custom_fields.product' to 'product_id'
      - Set is_custom = false (it maps to a real column)
      - Add config_json with control = 'product_picker'
      - Rename logical_name to 'productid' to match convention
    - Add `contact_id` column to lead table (nullable FK to contact)
    - Update the active `contact` field definition on lead:
      - Change physical_column_name from 'custom_fields.contact' to 'contact_id'
      - Set is_custom = false
    - Update form layouts that reference the old logical names

  2. Why
    - Product and contact values were being saved to custom_fields JSONB
      instead of the real physical columns, causing data to appear empty
      when reopening records
*/

-- 1. Delete the old inactive productid field to clear the unique constraint
DELETE FROM field_definition
WHERE field_definition_id = '1940f489-9997-41ac-818e-cdb637f7b54f';

-- 2. Fix the active product field: point to the real product_id column
UPDATE field_definition
SET physical_column_name = 'product_id',
    logical_name = 'productid',
    is_custom = false,
    config_json = jsonb_build_object('control', 'product_picker'),
    modified_at = now()
WHERE field_definition_id = '2a11b4f1-7d29-4c02-abaf-f1630eab7595';

-- 3. Add contact_id column to lead table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'contact_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE lead ADD COLUMN contact_id uuid REFERENCES contact(contact_id);
    CREATE INDEX IF NOT EXISTS idx_lead_contact_id ON lead(contact_id);
  END IF;
END $$;

-- 4. Fix the active contact field: point to the real contact_id column
UPDATE field_definition
SET physical_column_name = 'contact_id',
    is_custom = false,
    modified_at = now()
WHERE field_definition_id = '27bff63b-1a3a-466a-abc8-a67bb13ce5a3';

-- 5. Update form layouts to reference the new logical_name for product
-- Handle both JSON formatting styles
UPDATE form_definition
SET layout_json = REPLACE(layout_json::text, '"field_logical_name": "product"', '"field_logical_name": "productid"')::jsonb,
    modified_at = now()
WHERE entity_definition_id = '2892cad3-04be-47c2-8de0-cc16509e1fcf'
  AND layout_json::text LIKE '%"field_logical_name": "product"%';

UPDATE form_definition
SET layout_json = REPLACE(layout_json::text, '"field_logical_name":"product"', '"field_logical_name":"productid"')::jsonb,
    modified_at = now()
WHERE entity_definition_id = '2892cad3-04be-47c2-8de0-cc16509e1fcf'
  AND layout_json::text LIKE '%"field_logical_name":"product"%';
