/*
  # Cleanup duplicate views and fix country table schema

  1. View Cleanup
    - Remove duplicate views from `industry` entity (keep "Active Industries", "All Industries", "Inactive Industries"; delete "Active Records", "All Records", "Inactive Records")
    - Rename `product` entity views from "Active Records" / "All Records" / "Inactive Records" to "Active Products" / "All Products" / "Inactive Products"
    - Rename `product_family` entity views similarly to use "Product Families" display name

  2. Country Table
    - Add missing `owner_id`, `created_at`, `modified_at`, `deleted_at` columns to `country` table
    - These are expected by the generic list and lookup infrastructure

  3. Notes
    - No data is deleted from business tables
    - View soft-deletes only affect metadata
*/

-- ============================================================
-- 1. Soft-delete duplicate industry views (the "Records" variants)
-- ============================================================
UPDATE view_definition
SET deleted_at = now()
WHERE view_id IN (
  '018de697-5e51-415d-b525-48d2df3fa41e',  -- Active Records (industry)
  '070e2628-4b35-49a5-9cb9-25fd906d4602',  -- All Records (industry)
  '39a6ab9e-af69-4e68-a9e4-aebce165b301'   -- Inactive Records (industry)
)
AND deleted_at IS NULL;

-- Fix default flag: ensure "Active Industries" is the default for industry
UPDATE view_definition
SET is_default = true
WHERE view_id = '277315da-0f0e-4601-98ef-36a226c3f07f'
AND deleted_at IS NULL;

-- ============================================================
-- 2. Rename product views to use entity display names
-- ============================================================
UPDATE view_definition SET name = 'Active Products' WHERE view_id = 'b801c491-acdb-4951-88c8-d2a4af1a1b1c';
UPDATE view_definition SET name = 'All Products' WHERE view_id = '2fea99dc-e2e6-4dab-99c1-679750241661';
UPDATE view_definition SET name = 'Inactive Products' WHERE view_id = 'bc297048-8274-45f2-8e17-69950595ff8f';

-- ============================================================
-- 3. Rename product_family views
-- ============================================================
UPDATE view_definition SET name = 'Active Product Families' WHERE view_id = 'ebc0a4e6-d89d-41fa-849e-757d76cbe017';
UPDATE view_definition SET name = 'All Product Families' WHERE view_id = '2853bb5b-311a-4327-8447-97c8b4c1ddda';
UPDATE view_definition SET name = 'Inactive Product Families' WHERE view_id = 'cda04cfb-bde1-4509-af43-0decf474f521';

-- ============================================================
-- 4. Fix country table: add missing standard columns
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'country' AND column_name = 'owner_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE country ADD COLUMN owner_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'country' AND column_name = 'created_at' AND table_schema = 'public'
  ) THEN
    ALTER TABLE country ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'country' AND column_name = 'modified_at' AND table_schema = 'public'
  ) THEN
    ALTER TABLE country ADD COLUMN modified_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'country' AND column_name = 'deleted_at' AND table_schema = 'public'
  ) THEN
    ALTER TABLE country ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;
