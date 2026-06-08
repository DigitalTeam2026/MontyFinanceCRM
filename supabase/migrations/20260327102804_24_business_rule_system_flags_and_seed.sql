/*
  # Business Rule System Flags and System Rule Seed

  ## Summary
  Adds governance columns to business_rule to distinguish platform-delivered
  (system) rules from admin-created (custom) rules, then seeds a small set of
  fundamental system rules for every core CRM entity.

  ## Changes

  ### 1. New columns on business_rule
  - `is_system`    (bool, default false) – true for rules shipped with the platform
  - `is_deletable` (bool, default true)  – false prevents deletion via the UI

  ### 2. System rule seed
  For each entity: lead, contact, account, opportunity, ticket, campaign,
  event, journey, segment, marketing_email, organization, crm_user
  — insert two system rules:
    a. "Enforce Required Fields" – always-on rule that locks the save action
       when key required fields are empty (server-side / entity scope)
    b. "Lock Record When Inactive" – hides edit actions and locks all fields
       when the is_active flag is false (form scope, onChange + onLoad)

  ### 3. Security
  No RLS changes – business_rule already has RLS from earlier migrations.
*/

-- ─── 1. Add governance columns ───────────────────────────────────────────────

ALTER TABLE business_rule
  ADD COLUMN IF NOT EXISTS is_system    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deletable boolean NOT NULL DEFAULT true;

-- ─── 2. Seed system rules ────────────────────────────────────────────────────

DO $$
DECLARE
  eid uuid;
  logical_names text[] := ARRAY[
    'lead', 'contact', 'account', 'opportunity', 'ticket',
    'campaign', 'event', 'journey', 'segment', 'marketing_email',
    'organization', 'crm_user'
  ];
  display_names text[] := ARRAY[
    'Lead', 'Contact', 'Account', 'Opportunity', 'Ticket',
    'Campaign', 'Event', 'Journey', 'Segment', 'Marketing Email',
    'Organization', 'User'
  ];
  i int;
  dn text;
BEGIN
  FOR i IN 1..array_length(logical_names, 1) LOOP
    SELECT entity_definition_id INTO eid
      FROM entity_definition
      WHERE logical_name = logical_names[i]
      LIMIT 1;

    IF eid IS NULL THEN CONTINUE; END IF;

    dn := display_names[i];

    -- Rule 1: Enforce Required Fields (entity scope, always-on)
    INSERT INTO business_rule
      (entity_definition_id, name, description, scope, run_order,
       is_active, is_system, is_deletable,
       trigger_json, action_json)
    VALUES
      (eid,
       'Enforce Required Fields',
       'Prevents saving when required fields (name, status) are empty. Cannot be deleted.',
       'all',
       0,
       true, true, false,
       '{"trigger_on":"always","watch_fields":[],"condition_group":{"id":"root","operator":"AND","conditions":[],"groups":[]}}'::jsonb,
       '{"if_actions":[{"id":"a1","action_type":"require_field","target_field":"name","target_field_display_name":"Name"},{"id":"a2","action_type":"require_field","target_field":"status","target_field_display_name":"Status"}],"else_actions":[]}'::jsonb)
    ON CONFLICT DO NOTHING;

    -- Rule 2: Lock Record When Inactive (form scope, onLoad + onChange)
    INSERT INTO business_rule
      (entity_definition_id, name, description, scope, run_order,
       is_active, is_system, is_deletable,
       trigger_json, action_json)
    VALUES
      (eid,
       'Lock Record When Inactive',
       'Locks all editable fields on the form when the record is marked as inactive.',
       'main_form',
       10,
       true, true, false,
       '{"trigger_on":"onChange","watch_fields":["is_active"],"condition_group":{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","operator":"eq","value":"false"}],"groups":[]}}'::jsonb,
       '{"if_actions":[{"id":"a1","action_type":"lock_field","target_field":"*","target_field_display_name":"All Fields"}],"else_actions":[{"id":"a2","action_type":"unlock_field","target_field":"*","target_field_display_name":"All Fields"}]}'::jsonb)
    ON CONFLICT DO NOTHING;

  END LOOP;
END $$;
