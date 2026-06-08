/*
  # Seed Business Rules for System Entities: Business Unit, Currency, Security Role, Team

  ## Summary
  Creates standard business rules for four system entities that previously had none.

  ## Rules Per Entity
  1. "Enforce Required Fields" (scope: all, run_order: 0)
     - Always triggers, requires the mandatory fields on each entity
  2. "Lock Record When Inactive" (scope: main_form, run_order: 10)
     - Triggers onChange of is_active; locks all fields when is_active = false, unlocks otherwise

  ## Entity-specific required fields
  - Business Unit: name
  - Currency: name, code
  - Security Role: name
  - Team: name

  ## Notes
  - All rules are system rules (is_system = true, is_deletable = false)
  - No new tables; no RLS changes
*/

-- ============================================================
-- BUSINESS UNIT
-- ============================================================

INSERT INTO business_rule (
  entity_definition_id, name, description, scope, run_order,
  is_active, is_system, is_deletable,
  trigger_json, action_json
)
SELECT
  ed.entity_definition_id,
  'Enforce Required Fields',
  'Requires name to be filled before saving',
  'all', 0, true, true, false,
  '{"trigger_on":"always","watch_fields":[],"condition_group":{"id":"root","groups":[],"operator":"AND","conditions":[]}}',
  '{"if_actions":[{"id":"a1","action_type":"require_field","target_field":"name","target_field_display_name":"Name"}],"else_actions":[]}'
FROM entity_definition ed
WHERE ed.logical_name = 'business_unit'
ON CONFLICT DO NOTHING;

INSERT INTO business_rule (
  entity_definition_id, name, description, scope, run_order,
  is_active, is_system, is_deletable,
  trigger_json, action_json
)
SELECT
  ed.entity_definition_id,
  'Lock Record When Inactive',
  'Locks all fields when the record is set to inactive',
  'main_form', 10, true, true, false,
  '{"trigger_on":"onChange","watch_fields":["is_active"],"condition_group":{"id":"root","groups":[],"operator":"AND","conditions":[{"id":"c1","value":"false","operator":"eq","field_type_name":"boolean","field_display_name":"Is Active","field_logical_name":"is_active"}]}}',
  '{"if_actions":[{"id":"a1","action_type":"lock_field","target_field":"*","target_field_display_name":"All Fields"}],"else_actions":[{"id":"a2","action_type":"unlock_field","target_field":"*","target_field_display_name":"All Fields"}]}'
FROM entity_definition ed
WHERE ed.logical_name = 'business_unit'
ON CONFLICT DO NOTHING;


-- ============================================================
-- CURRENCY
-- ============================================================

INSERT INTO business_rule (
  entity_definition_id, name, description, scope, run_order,
  is_active, is_system, is_deletable,
  trigger_json, action_json
)
SELECT
  ed.entity_definition_id,
  'Enforce Required Fields',
  'Requires name and code to be filled before saving',
  'all', 0, true, true, false,
  '{"trigger_on":"always","watch_fields":[],"condition_group":{"id":"root","groups":[],"operator":"AND","conditions":[]}}',
  '{"if_actions":[{"id":"a1","action_type":"require_field","target_field":"name","target_field_display_name":"Name"},{"id":"a2","action_type":"require_field","target_field":"code","target_field_display_name":"Code"}],"else_actions":[]}'
FROM entity_definition ed
WHERE ed.logical_name = 'currency'
ON CONFLICT DO NOTHING;

INSERT INTO business_rule (
  entity_definition_id, name, description, scope, run_order,
  is_active, is_system, is_deletable,
  trigger_json, action_json
)
SELECT
  ed.entity_definition_id,
  'Lock Record When Inactive',
  'Locks all fields when the record is set to inactive',
  'main_form', 10, true, true, false,
  '{"trigger_on":"onChange","watch_fields":["is_active"],"condition_group":{"id":"root","groups":[],"operator":"AND","conditions":[{"id":"c1","value":"false","operator":"eq","field_type_name":"boolean","field_display_name":"Is Active","field_logical_name":"is_active"}]}}',
  '{"if_actions":[{"id":"a1","action_type":"lock_field","target_field":"*","target_field_display_name":"All Fields"}],"else_actions":[{"id":"a2","action_type":"unlock_field","target_field":"*","target_field_display_name":"All Fields"}]}'
FROM entity_definition ed
WHERE ed.logical_name = 'currency'
ON CONFLICT DO NOTHING;


-- ============================================================
-- SECURITY ROLE
-- ============================================================

INSERT INTO business_rule (
  entity_definition_id, name, description, scope, run_order,
  is_active, is_system, is_deletable,
  trigger_json, action_json
)
SELECT
  ed.entity_definition_id,
  'Enforce Required Fields',
  'Requires name to be filled before saving',
  'all', 0, true, true, false,
  '{"trigger_on":"always","watch_fields":[],"condition_group":{"id":"root","groups":[],"operator":"AND","conditions":[]}}',
  '{"if_actions":[{"id":"a1","action_type":"require_field","target_field":"name","target_field_display_name":"Name"}],"else_actions":[]}'
FROM entity_definition ed
WHERE ed.logical_name = 'security_role'
ON CONFLICT DO NOTHING;

INSERT INTO business_rule (
  entity_definition_id, name, description, scope, run_order,
  is_active, is_system, is_deletable,
  trigger_json, action_json
)
SELECT
  ed.entity_definition_id,
  'Lock Record When Inactive',
  'Locks all fields when the record is set to inactive',
  'main_form', 10, true, true, false,
  '{"trigger_on":"onChange","watch_fields":["is_active"],"condition_group":{"id":"root","groups":[],"operator":"AND","conditions":[{"id":"c1","value":"false","operator":"eq","field_type_name":"boolean","field_display_name":"Is Active","field_logical_name":"is_active"}]}}',
  '{"if_actions":[{"id":"a1","action_type":"lock_field","target_field":"*","target_field_display_name":"All Fields"}],"else_actions":[{"id":"a2","action_type":"unlock_field","target_field":"*","target_field_display_name":"All Fields"}]}'
FROM entity_definition ed
WHERE ed.logical_name = 'security_role'
ON CONFLICT DO NOTHING;


-- ============================================================
-- TEAM
-- ============================================================

INSERT INTO business_rule (
  entity_definition_id, name, description, scope, run_order,
  is_active, is_system, is_deletable,
  trigger_json, action_json
)
SELECT
  ed.entity_definition_id,
  'Enforce Required Fields',
  'Requires name to be filled before saving',
  'all', 0, true, true, false,
  '{"trigger_on":"always","watch_fields":[],"condition_group":{"id":"root","groups":[],"operator":"AND","conditions":[]}}',
  '{"if_actions":[{"id":"a1","action_type":"require_field","target_field":"name","target_field_display_name":"Name"}],"else_actions":[]}'
FROM entity_definition ed
WHERE ed.logical_name = 'team'
ON CONFLICT DO NOTHING;

INSERT INTO business_rule (
  entity_definition_id, name, description, scope, run_order,
  is_active, is_system, is_deletable,
  trigger_json, action_json
)
SELECT
  ed.entity_definition_id,
  'Lock Record When Inactive',
  'Locks all fields when the record is set to inactive',
  'main_form', 10, true, true, false,
  '{"trigger_on":"onChange","watch_fields":["is_active"],"condition_group":{"id":"root","groups":[],"operator":"AND","conditions":[{"id":"c1","value":"false","operator":"eq","field_type_name":"boolean","field_display_name":"Is Active","field_logical_name":"is_active"}]}}',
  '{"if_actions":[{"id":"a1","action_type":"lock_field","target_field":"*","target_field_display_name":"All Fields"}],"else_actions":[{"id":"a2","action_type":"unlock_field","target_field":"*","target_field_display_name":"All Fields"}]}'
FROM entity_definition ed
WHERE ed.logical_name = 'team'
ON CONFLICT DO NOTHING;
