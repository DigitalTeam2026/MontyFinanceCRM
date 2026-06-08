/*
  # Seed Created By / Modified By field definitions for remaining entities

  1. Changes
    - Adds system field definitions for `createdby` and `modifiedby` to 9 entities
      that were missing them: Currency, Event, Journey, Marketing Email,
      Organization, Security Role, Segment, Sources, Test Entity
    - These are lookup fields pointing to the User (crm_user) entity
    - Marked as system, non-deletable, read-only (is_schema_editable = false)

  2. Field Properties
    - logical_name: createdby / modifiedby
    - physical_column_name: created_by / modified_by
    - field_type: lookup (to crm_user)
    - sort_order: 950 / 960 (consistent with existing pattern)
    - is_system: true, is_custom: false, is_deletable: false
    - is_required: false, is_searchable: true, is_filterable: true

  3. Important Notes
    - Uses ON CONFLICT to skip if already present
    - Matches the exact pattern used by Account, Contact, Lead, Opportunity, etc.
*/

INSERT INTO field_definition (
  entity_definition_id, field_type_id, lookup_entity_id,
  logical_name, display_name, physical_column_name,
  description, is_required, is_searchable, is_sortable, is_filterable,
  is_custom, is_system, is_deletable, is_schema_editable, is_active,
  sort_order
)
SELECT
  ed.entity_definition_id,
  '1923fc3b-b2d4-49b0-988f-31773bed353e',   -- lookup field type
  'a02e5785-a461-447c-b61b-1051dafcfe74',   -- crm_user entity
  v.logical_name,
  v.display_name,
  v.physical_column_name,
  v.description,
  false,   -- is_required
  true,    -- is_searchable
  true,    -- is_sortable
  true,    -- is_filterable
  false,   -- is_custom
  true,    -- is_system
  false,   -- is_deletable
  false,   -- is_schema_editable
  true,    -- is_active
  v.sort_order
FROM entity_definition ed
CROSS JOIN (
  VALUES
    ('createdby',  'Created By',  'created_by',  'User who created the record',    950),
    ('modifiedby', 'Modified By', 'modified_by', 'User who last modified the record', 960)
) AS v(logical_name, display_name, physical_column_name, description, sort_order)
WHERE ed.entity_definition_id IN (
  '9ddb2a99-5f32-4c97-a022-bc3eb63c449d',  -- Currency
  '2b27a5c2-5e67-42b1-84cb-1680c2334dfe',  -- Event
  '5c01ea6d-3b01-48a5-aa68-04d789b74da6',  -- Journey
  '75b7dbe2-fd00-4c02-b8fe-833e70618481',  -- Marketing Email
  '3e40dacd-0be0-4ab3-87a7-88d1f1b42c20',  -- Organization
  'e3319109-c732-4191-809e-96cbdac1c5a6',  -- Security Role
  '613b7c5c-642a-440f-8ba7-3578b024507a',  -- Segment
  '1766c119-5149-4cfa-b583-490bd2a9f573',  -- Sources
  'a6a25f98-b5a5-42ca-9fd5-6eb64974c165'   -- Test Entity
)
AND NOT EXISTS (
  SELECT 1 FROM field_definition fd2
  WHERE fd2.entity_definition_id = ed.entity_definition_id
    AND fd2.logical_name = v.logical_name
    AND fd2.deleted_at IS NULL
);
