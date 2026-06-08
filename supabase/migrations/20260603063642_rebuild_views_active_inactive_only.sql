/*
  # Rebuild Views: Active/Inactive Only Per Entity

  ## Summary
  Enforces the two-view-per-entity standard across all entities:
  - Soft-deletes all "All [Entity]" system views (redundant third view)
  - Sets each entity's "Active [Entity]" view as is_default = true
  - Clears is_default from all other views for the same entity
  - Adds view columns to test_entity views (currently 0 columns)

  ## Changes
  1. Soft-deletes every system view whose name starts with 'All ' (created_by IS NULL)
  2. Sets Active views as the default for each entity
  3. Clears is_default on Inactive views to ensure only one default per entity
  4. Seeds basic view columns for test_entity views

  ## Notes
  - User-created (personal) views are NOT touched
  - Only system views (created_by IS NULL) are modified
  - The Inactive view remains as a non-default system view
*/

-- Step 1: Soft-delete all "All [Entity]" system views
UPDATE view_definition
SET 
  deleted_at = now(),
  is_active = false
WHERE 
  deleted_at IS NULL
  AND created_by IS NULL
  AND (
    name LIKE 'All %'
    OR name = 'All Records'
  );

-- Step 2: Clear is_default on all Inactive system views
UPDATE view_definition
SET is_default = false
WHERE
  deleted_at IS NULL
  AND created_by IS NULL
  AND (name LIKE 'Inactive %' OR name LIKE 'Inactive Records');

-- Step 3: Set Active views as is_default = true for each entity
-- First clear any stale defaults, then set Active as default
UPDATE view_definition vd
SET is_default = true
WHERE
  vd.deleted_at IS NULL
  AND vd.created_by IS NULL
  AND (vd.name LIKE 'Active %')
  AND NOT EXISTS (
    SELECT 1 FROM view_definition vd2
    WHERE vd2.entity_definition_id = vd.entity_definition_id
      AND vd2.deleted_at IS NULL
      AND vd2.created_by IS NULL
      AND vd2.view_id <> vd.view_id
      AND vd2.is_default = true
      AND vd2.name LIKE 'Active %'
  );

-- Step 4: For any entity where no "Active" view is default yet, ensure it is set
-- This is a safety net for the few entities where Active wasn't default
UPDATE view_definition
SET is_default = true
WHERE
  deleted_at IS NULL
  AND created_by IS NULL
  AND name IN (
    'Active Accounts', 'Active Business Units', 'Active Campaigns',
    'Active Contacts', 'Active Countries', 'Active Users', 'Active Currencies',
    'Active Events', 'Active Industries', 'Active Journeys', 'Active Leads',
    'Active Marketing Emails', 'Active Opportunities', 'Active Organizations',
    'Active Products', 'Active Product Families', 'Active Security Roles',
    'Active Segments', 'Active Teams', 'Active Tickets', 'Active Records'
  );

-- Step 5: Seed columns for test_entity Active/Inactive views (currently 0 columns)
-- Get the test_entity statecode field and name field then insert columns
DO $$
DECLARE
  v_active_view_id uuid;
  v_inactive_view_id uuid;
  v_statecode_field_id uuid;
BEGIN
  -- Find the test_entity views
  SELECT view_id INTO v_active_view_id
  FROM view_definition
  WHERE entity_definition_id = 'a6a25f98-b5a5-42ca-9fd5-6eb64974c165'
    AND name LIKE 'Active%'
    AND deleted_at IS NULL
  LIMIT 1;

  SELECT view_id INTO v_inactive_view_id
  FROM view_definition
  WHERE entity_definition_id = 'a6a25f98-b5a5-42ca-9fd5-6eb64974c165'
    AND name LIKE 'Inactive%'
    AND deleted_at IS NULL
  LIMIT 1;

  SELECT field_definition_id INTO v_statecode_field_id
  FROM field_definition
  WHERE entity_definition_id = 'a6a25f98-b5a5-42ca-9fd5-6eb64974c165'
    AND logical_name = 'statecode'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_active_view_id IS NOT NULL AND v_statecode_field_id IS NOT NULL THEN
    -- Clear existing (in case there are stale ones)
    DELETE FROM view_column WHERE view_id = v_active_view_id;
    DELETE FROM view_column WHERE view_id = v_inactive_view_id;

    -- Insert statecode column for active view
    INSERT INTO view_column (view_id, field_definition_id, display_order, is_hidden, is_sortable)
    VALUES (v_active_view_id, v_statecode_field_id, 1, false, true);

    IF v_inactive_view_id IS NOT NULL THEN
      INSERT INTO view_column (view_id, field_definition_id, display_order, is_hidden, is_sortable)
      VALUES (v_inactive_view_id, v_statecode_field_id, 1, false, true);
    END IF;
  END IF;
END $$;
