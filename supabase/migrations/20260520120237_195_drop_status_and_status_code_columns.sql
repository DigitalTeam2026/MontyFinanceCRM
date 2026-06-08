/*
  # Drop legacy status and status_code text columns from all entity tables

  1. Changes
    - Drops the `status` (text) column from 17 entity tables
    - Drops the `status_code` (text) column from 10 entity tables
    - These columns are replaced by the numeric `state_code` and `status_reason` columns
      backed by `statecode_definition` and `status_reason_definition` tables
    - Fixes the callable `provision_entity_statecodes(uuid)` function to create
      `statusreason` field definition (mapped to `status_reason`) instead of the
      old `statuscode` mapped to `status_code`

  2. Tables affected
    - `status` dropped from: account, contact, lead, opportunity, ticket,
      campaign, event, journey, segment, marketing_email,
      business_unit, security_role, team, organization, currency, country, industry
    - `status_code` dropped from: account, contact, lead, opportunity, ticket,
      campaign, event, journey, segment, marketing_email

  3. Important notes
    - All application code has been updated to use `state_code` (integer) and
      `status_reason` (integer) exclusively
    - The `statecode_definition` and `status_reason_definition` tables provide
      the display labels for these numeric values
    - No RLS policies, triggers, or indexes reference these columns
*/

-- ── Drop status column from all entity tables ────────────────────────────────
ALTER TABLE account          DROP COLUMN IF EXISTS status;
ALTER TABLE contact          DROP COLUMN IF EXISTS status;
ALTER TABLE lead             DROP COLUMN IF EXISTS status;
ALTER TABLE opportunity      DROP COLUMN IF EXISTS status;
ALTER TABLE ticket           DROP COLUMN IF EXISTS status;
ALTER TABLE campaign         DROP COLUMN IF EXISTS status;
ALTER TABLE event            DROP COLUMN IF EXISTS status;
ALTER TABLE journey          DROP COLUMN IF EXISTS status;
ALTER TABLE segment          DROP COLUMN IF EXISTS status;
ALTER TABLE marketing_email  DROP COLUMN IF EXISTS status;
ALTER TABLE business_unit    DROP COLUMN IF EXISTS status;
ALTER TABLE security_role    DROP COLUMN IF EXISTS status;
ALTER TABLE team             DROP COLUMN IF EXISTS status;
ALTER TABLE organization     DROP COLUMN IF EXISTS status;
ALTER TABLE currency         DROP COLUMN IF EXISTS status;
ALTER TABLE country          DROP COLUMN IF EXISTS status;
ALTER TABLE industry         DROP COLUMN IF EXISTS status;

-- ── Drop status_code column from entity tables that have it ──────────────────
ALTER TABLE account          DROP COLUMN IF EXISTS status_code;
ALTER TABLE contact          DROP COLUMN IF EXISTS status_code;
ALTER TABLE lead             DROP COLUMN IF EXISTS status_code;
ALTER TABLE opportunity      DROP COLUMN IF EXISTS status_code;
ALTER TABLE ticket           DROP COLUMN IF EXISTS status_code;
ALTER TABLE campaign         DROP COLUMN IF EXISTS status_code;
ALTER TABLE event            DROP COLUMN IF EXISTS status_code;
ALTER TABLE journey          DROP COLUMN IF EXISTS status_code;
ALTER TABLE segment          DROP COLUMN IF EXISTS status_code;
ALTER TABLE marketing_email  DROP COLUMN IF EXISTS status_code;

-- ── Fix the callable provision_entity_statecodes function ────────────────────
-- The second overload (called from bootstrapEntityService) was creating a
-- 'statuscode' field mapped to physical 'status_code'. Update it to create
-- 'statusreason' mapped to 'status_reason' instead.
CREATE OR REPLACE FUNCTION provision_entity_statecodes(p_entity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
v_choice_type_id  uuid;
v_active_sc_id    uuid;
v_inactive_sc_id  uuid;
v_entity_exists   boolean;
BEGIN
SELECT EXISTS (
SELECT 1 FROM entity_definition WHERE entity_definition_id = p_entity_id
) INTO v_entity_exists;
IF NOT v_entity_exists THEN RETURN; END IF;

SELECT field_type_id INTO v_choice_type_id
FROM field_type WHERE name = 'choice' LIMIT 1;

-- statecode_definition: Active(1) and Inactive(2)
INSERT INTO statecode_definition
(entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
VALUES
(p_entity_id, 1, 'Active',   true,  10, true),
(p_entity_id, 2, 'Inactive', false, 20, true)
ON CONFLICT DO NOTHING;

SELECT statecode_id INTO v_active_sc_id
FROM statecode_definition
WHERE entity_definition_id = p_entity_id AND state_value = 1;

SELECT statecode_id INTO v_inactive_sc_id
FROM statecode_definition
WHERE entity_definition_id = p_entity_id AND state_value = 2;

-- status_reason_definition defaults
INSERT INTO status_reason_definition
(statecode_id, entity_definition_id, reason_value, display_label,
color, sort_order, is_default, is_active, is_system, description)
VALUES
(v_active_sc_id,   p_entity_id, 1, 'Active',      '#10B981', 10, true,  true, true, ''),
(v_active_sc_id,   p_entity_id, 3, 'In Progress', '#3B82F6', 20, false, true, false, ''),
(v_active_sc_id,   p_entity_id, 4, 'Pending',     '#F59E0B', 30, false, true, false, ''),
(v_inactive_sc_id, p_entity_id, 2, 'Inactive',    '#6B7280', 10, true,  true, true, ''),
(v_inactive_sc_id, p_entity_id, 5, 'Cancelled',   '#EF4444', 20, false, true, false, ''),
(v_inactive_sc_id, p_entity_id, 6, 'Rejected',    '#DC2626', 30, false, true, false, '')
ON CONFLICT DO NOTHING;

-- Field 1: statecode — "Status"
INSERT INTO field_definition
(entity_definition_id, field_type_id, logical_name, display_name,
physical_column_name, is_system, is_required, is_searchable,
is_sortable, is_filterable, is_custom, is_active, sort_order, config_json)
VALUES
(p_entity_id, v_choice_type_id, 'statecode', 'Status',
'state_code', true, false, true, true, true, false, true, 9000,
'{"choices":[],"is_statecode_field":true}'::jsonb)
ON CONFLICT (entity_definition_id, logical_name)
WHERE deleted_at IS NULL
DO UPDATE SET
display_name = 'Status',
config_json  = '{"choices":[],"is_statecode_field":true}'::jsonb;

-- Field 2: statusreason — "Status Reason"
INSERT INTO field_definition
(entity_definition_id, field_type_id, logical_name, display_name,
physical_column_name, is_system, is_required, is_searchable,
is_sortable, is_filterable, is_custom, is_active, sort_order, config_json)
VALUES
(p_entity_id, v_choice_type_id, 'statusreason', 'Status Reason',
'status_reason', true, false, false, true, true, false, true, 9001,
'{"choices":[],"is_statusreason_field":true}'::jsonb)
ON CONFLICT (entity_definition_id, logical_name)
WHERE deleted_at IS NULL
DO UPDATE SET
display_name = 'Status Reason',
config_json  = '{"choices":[],"is_statusreason_field":true}'::jsonb;

-- Standard system views
INSERT INTO view_definition
(entity_definition_id, name, view_type, is_default, is_system, is_deletable,
filter_json, sort_json, is_active)
VALUES
(p_entity_id, 'Active Records', 'public', false, true, false,
'{"operator":"AND","conditions":[{"field_logical_name":"statecode","field_type_name":"choice","field_display_name":"Status","operator":"eq","value":"1"}]}'::jsonb,
'[]'::jsonb, true),
(p_entity_id, 'Inactive Records', 'public', false, true, false,
'{"operator":"AND","conditions":[{"field_logical_name":"statecode","field_type_name":"choice","field_display_name":"Status","operator":"eq","value":"2"}]}'::jsonb,
'[]'::jsonb, true),
(p_entity_id, 'All Records', 'public', true, true, false,
NULL, '[]'::jsonb, true)
ON CONFLICT DO NOTHING;

END
$$;

-- Also fix any existing 'statuscode' field definitions that point to 'status_code'
-- and should instead be 'statusreason' pointing to 'status_reason'
UPDATE field_definition
SET logical_name = 'statusreason',
    display_name = 'Status Reason',
    physical_column_name = 'status_reason',
    config_json = '{"choices":[],"is_statusreason_field":true}'::jsonb
WHERE logical_name = 'statuscode'
  AND physical_column_name = 'status_code'
  AND is_active = true
  AND deleted_at IS NULL;
