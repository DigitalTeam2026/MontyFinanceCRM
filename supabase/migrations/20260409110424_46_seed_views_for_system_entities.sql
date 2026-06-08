/*
  # Seed Views for System Entities: Business Unit, Currency, Security Role, Team

  ## Summary
  Creates standard public views for four system entities that previously had no views.

  ## Entities & Views
  Each entity gets three views:
    1. "All X"      — default view, no filter, sort by name asc
    2. "Active X"   — filters where is_active = true
    3. "Inactive X" — filters where is_active = false

  ## Notes
  - All views are system views (is_system = true, is_deletable = false)
  - "All X" is the default view (is_default = true) for each entity
  - quick_find_fields is a text[] column, uses '{}' for empty array
  - No new tables; no RLS changes needed
*/

-- ============================================================
-- BUSINESS UNIT  (entity_definition_id: 33d6f250-7376-4f10-acab-49cbba9a9e9a)
-- ============================================================

INSERT INTO view_definition (
  entity_definition_id, name, view_type, description,
  is_default, is_active, is_system, is_deletable,
  filter_json, sort_json, quick_find_fields
) VALUES
(
  '33d6f250-7376-4f10-acab-49cbba9a9e9a',
  'All Business Units', 'public', 'All business unit records',
  true, true, true, false,
  null,
  '[{"order":0,"direction":"asc","field_logical_name":"name","field_display_name":"Name"}]',
  '{}'
),
(
  '33d6f250-7376-4f10-acab-49cbba9a9e9a',
  'Active Business Units', 'public', 'Active business unit records',
  false, true, true, false,
  '{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","operator":"eq","value":"true"}],"groups":[]}',
  '[{"order":0,"direction":"asc","field_logical_name":"name","field_display_name":"Name"}]',
  '{}'
),
(
  '33d6f250-7376-4f10-acab-49cbba9a9e9a',
  'Inactive Business Units', 'public', 'Inactive business unit records',
  false, true, true, false,
  '{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","operator":"eq","value":"false"}],"groups":[]}',
  '[{"order":0,"direction":"asc","field_logical_name":"name","field_display_name":"Name"}]',
  '{}'
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- CURRENCY  (entity_definition_id: 9ddb2a99-5f32-4c97-a022-bc3eb63c449d)
-- ============================================================

INSERT INTO view_definition (
  entity_definition_id, name, view_type, description,
  is_default, is_active, is_system, is_deletable,
  filter_json, sort_json, quick_find_fields
) VALUES
(
  '9ddb2a99-5f32-4c97-a022-bc3eb63c449d',
  'All Currencies', 'public', 'All currency records',
  true, true, true, false,
  null,
  '[{"order":0,"direction":"asc","field_logical_name":"name","field_display_name":"Name"}]',
  '{}'
),
(
  '9ddb2a99-5f32-4c97-a022-bc3eb63c449d',
  'Active Currencies', 'public', 'Active currency records',
  false, true, true, false,
  '{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","operator":"eq","value":"true"}],"groups":[]}',
  '[{"order":0,"direction":"asc","field_logical_name":"name","field_display_name":"Name"}]',
  '{}'
),
(
  '9ddb2a99-5f32-4c97-a022-bc3eb63c449d',
  'Inactive Currencies', 'public', 'Inactive currency records',
  false, true, true, false,
  '{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","operator":"eq","value":"false"}],"groups":[]}',
  '[{"order":0,"direction":"asc","field_logical_name":"name","field_display_name":"Name"}]',
  '{}'
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- SECURITY ROLE  (entity_definition_id: e3319109-c732-4191-809e-96cbdac1c5a6)
-- ============================================================

INSERT INTO view_definition (
  entity_definition_id, name, view_type, description,
  is_default, is_active, is_system, is_deletable,
  filter_json, sort_json, quick_find_fields
) VALUES
(
  'e3319109-c732-4191-809e-96cbdac1c5a6',
  'All Security Roles', 'public', 'All security role records',
  true, true, true, false,
  null,
  '[{"order":0,"direction":"asc","field_logical_name":"name","field_display_name":"Name"}]',
  '{}'
),
(
  'e3319109-c732-4191-809e-96cbdac1c5a6',
  'Active Security Roles', 'public', 'Active security role records',
  false, true, true, false,
  '{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","operator":"eq","value":"true"}],"groups":[]}',
  '[{"order":0,"direction":"asc","field_logical_name":"name","field_display_name":"Name"}]',
  '{}'
),
(
  'e3319109-c732-4191-809e-96cbdac1c5a6',
  'Inactive Security Roles', 'public', 'Inactive security role records',
  false, true, true, false,
  '{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","operator":"eq","value":"false"}],"groups":[]}',
  '[{"order":0,"direction":"asc","field_logical_name":"name","field_display_name":"Name"}]',
  '{}'
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- TEAM  (entity_definition_id: b057f86e-9e38-4a5b-b543-273cd9899175)
-- ============================================================

INSERT INTO view_definition (
  entity_definition_id, name, view_type, description,
  is_default, is_active, is_system, is_deletable,
  filter_json, sort_json, quick_find_fields
) VALUES
(
  'b057f86e-9e38-4a5b-b543-273cd9899175',
  'All Teams', 'public', 'All team records',
  true, true, true, false,
  null,
  '[{"order":0,"direction":"asc","field_logical_name":"name","field_display_name":"Name"}]',
  '{}'
),
(
  'b057f86e-9e38-4a5b-b543-273cd9899175',
  'Active Teams', 'public', 'Active team records',
  false, true, true, false,
  '{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","operator":"eq","value":"true"}],"groups":[]}',
  '[{"order":0,"direction":"asc","field_logical_name":"name","field_display_name":"Name"}]',
  '{}'
),
(
  'b057f86e-9e38-4a5b-b543-273cd9899175',
  'Inactive Teams', 'public', 'Inactive team records',
  false, true, true, false,
  '{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","operator":"eq","value":"false"}],"groups":[]}',
  '[{"order":0,"direction":"asc","field_logical_name":"name","field_display_name":"Name"}]',
  '{}'
)
ON CONFLICT DO NOTHING;
