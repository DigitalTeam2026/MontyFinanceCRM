/*
  # Clean up duplicate Product and Product Family views

  1. Changes
    - Soft-delete entity-specific views (Active Products, Inactive Products, All Products,
      Active Product Families, Inactive Product Families, All Product Families)
    - Keep only the 3 standard views per entity: Active Records, Inactive Records, All Records
    - Transfer is_default flag to the kept Active Records view for each entity

  2. Notes
    - No data loss -- views are soft-deleted via deleted_at timestamp
    - Aligns Product / Product Family with the standard 3-view pattern used by other entities
*/

-- ============================================================
-- 1. Product: make Active Records the default
-- ============================================================
UPDATE view_definition
SET is_default = true, modified_at = now()
WHERE view_id = 'b801c491-acdb-4951-88c8-d2a4af1a1b1c';

-- Remove default from All Records on product (was also default)
UPDATE view_definition
SET is_default = false, modified_at = now()
WHERE view_id = '2fea99dc-e2e6-4dab-99c1-679750241661';

-- ============================================================
-- 2. Product Family: make Active Records the default
-- ============================================================
UPDATE view_definition
SET is_default = true, modified_at = now()
WHERE view_id = 'ebc0a4e6-d89d-41fa-849e-757d76cbe017';

-- Remove default from All Records on product_family (was also default)
UPDATE view_definition
SET is_default = false, modified_at = now()
WHERE view_id = '2853bb5b-311a-4327-8447-97c8b4c1ddda';

-- ============================================================
-- 3. Soft-delete the 6 entity-specific views
-- ============================================================
UPDATE view_definition
SET deleted_at = now(), is_active = false, is_default = false, modified_at = now()
WHERE view_id IN (
  '68fd42b4-a752-4834-b25d-e43564e1d431',  -- Active Products
  '6431f63d-d4c9-40d7-9860-04d725b3111d',  -- All Products
  '848df674-b5b7-4bde-9070-693115165877',  -- Inactive Products
  '48ea0572-5cbb-4285-bc88-4b811e146534',  -- Active Product Families
  'b497d0f2-17ea-41ae-86be-3e543944a2f2',  -- All Product Families
  '7c702506-c13e-47cc-b3c0-f3d714e2b190'   -- Inactive Product Families
)
AND deleted_at IS NULL;
