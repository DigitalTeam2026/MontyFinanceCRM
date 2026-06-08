/*
  # Workflow System Flags and System Workflow Seed

  ## Summary
  Adds governance columns to workflow_definition to distinguish platform-delivered
  (system) workflows from admin-created (custom) workflows, then seeds a set of
  fundamental system workflows for the core CRM entities.

  ## Changes

  ### 1. New columns on workflow_definition
  - `is_system`    (bool, default false) – true for platform-shipped workflows
  - `is_deletable` (bool, default true)  – false prevents UI deletion

  ### 2. System workflow seed

  Sales entity system workflows:
  - Lead: "Lead Qualification Pipeline" (on_status_change) — when a Lead status
    changes to Qualified, create an Opportunity and assign it to the record owner.
  - Opportunity: "Opportunity Won — Close Process" (on_status_change) — when an
    Opportunity moves to Won, update close date and send a win notification.
  - Opportunity: "High Value Opportunity Alert" (on_update) — when estimated_value
    changes, send an in-app notification to the assigned owner.

  Support entity system workflows:
  - Ticket: "Ticket Lifecycle Manager" (on_status_change) — on Close, set
    resolved_at; on Reopen, clear it.
  - Ticket: "High Priority Escalation" (on_create) — when a Ticket is created
    with priority = high, assign to escalation team and notify manager.

  Marketing entity system workflows:
  - Campaign: "Campaign Activation" (on_status_change) — when Campaign status →
    Active, send notification to the marketing team.

  ### 3. Security
  No RLS changes — workflow_definition already has RLS from earlier migrations.
*/

-- ─── 1. Add governance columns ───────────────────────────────────────────────

ALTER TABLE workflow_definition
  ADD COLUMN IF NOT EXISTS is_system    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deletable boolean NOT NULL DEFAULT true;

-- ─── 2. Seed system workflows ────────────────────────────────────────────────

DO $$
DECLARE
  eid uuid;
BEGIN

  -- ── Lead: Lead Qualification Pipeline ────────────────────────────────────
  SELECT entity_definition_id INTO eid
    FROM entity_definition WHERE logical_name = 'lead' LIMIT 1;
  IF eid IS NOT NULL THEN
    INSERT INTO workflow_definition
      (entity_definition_id, name, description, trigger_type, trigger_conditions,
       run_as, is_active, is_system, is_deletable)
    VALUES (
      eid,
      'Lead Qualification Pipeline',
      'When a Lead is marked Qualified, automatically creates a linked Opportunity and assigns it to the record owner. Seeded by the platform — cannot be deleted.',
      'on_status_change',
      '{"status_from":"","status_to":"qualified","watch_fields":[]}'::jsonb,
      'system', true, true, false
    ) ON CONFLICT DO NOTHING;

    INSERT INTO workflow_definition
      (entity_definition_id, name, description, trigger_type, trigger_conditions,
       run_as, is_active, is_system, is_deletable)
    VALUES (
      eid,
      'New Lead Assignment',
      'When a new Lead is created, assigns it to the default sales team and sends an in-app notification. Seeded by the platform — cannot be deleted.',
      'on_create',
      '{"watch_fields":[]}'::jsonb,
      'system', true, true, false
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- ── Opportunity: Won Close Process ───────────────────────────────────────
  SELECT entity_definition_id INTO eid
    FROM entity_definition WHERE logical_name = 'opportunity' LIMIT 1;
  IF eid IS NOT NULL THEN
    INSERT INTO workflow_definition
      (entity_definition_id, name, description, trigger_type, trigger_conditions,
       run_as, is_active, is_system, is_deletable)
    VALUES (
      eid,
      'Opportunity Won — Close Process',
      'When an Opportunity moves to Won, sets the actual close date, updates stage, and sends a win notification to the owner and their manager. Seeded by the platform — cannot be deleted.',
      'on_status_change',
      '{"status_from":"","status_to":"won","watch_fields":[]}'::jsonb,
      'system', true, true, false
    ) ON CONFLICT DO NOTHING;

    INSERT INTO workflow_definition
      (entity_definition_id, name, description, trigger_type, trigger_conditions,
       run_as, is_active, is_system, is_deletable)
    VALUES (
      eid,
      'High Value Opportunity Alert',
      'When the estimated value field is updated, checks if the value exceeds the high-value threshold and notifies the assigned owner. Seeded by the platform — cannot be deleted.',
      'on_update',
      '{"watch_fields":["estimated_value"]}'::jsonb,
      'system', true, true, false
    ) ON CONFLICT DO NOTHING;

    INSERT INTO workflow_definition
      (entity_definition_id, name, description, trigger_type, trigger_conditions,
       run_as, is_active, is_system, is_deletable)
    VALUES (
      eid,
      'Opportunity Lost — Follow-Up Task',
      'When an Opportunity is marked Lost, automatically creates a follow-up task to capture loss reason and schedule re-engagement. Seeded by the platform — cannot be deleted.',
      'on_status_change',
      '{"status_from":"","status_to":"lost","watch_fields":[]}'::jsonb,
      'system', false, true, false
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- ── Ticket: Lifecycle & Escalation ───────────────────────────────────────
  SELECT entity_definition_id INTO eid
    FROM entity_definition WHERE logical_name = 'ticket' LIMIT 1;
  IF eid IS NOT NULL THEN
    INSERT INTO workflow_definition
      (entity_definition_id, name, description, trigger_type, trigger_conditions,
       run_as, is_active, is_system, is_deletable)
    VALUES (
      eid,
      'Ticket Lifecycle Manager',
      'On Ticket Close, sets the resolved_at timestamp. On Reopen, clears resolved_at and resets priority. Seeded by the platform — cannot be deleted.',
      'on_status_change',
      '{"status_from":"","status_to":"closed","watch_fields":[]}'::jsonb,
      'system', true, true, false
    ) ON CONFLICT DO NOTHING;

    INSERT INTO workflow_definition
      (entity_definition_id, name, description, trigger_type, trigger_conditions,
       run_as, is_active, is_system, is_deletable)
    VALUES (
      eid,
      'High Priority Ticket Escalation',
      'When a new Ticket is created with priority = High or Critical, immediately assigns it to the escalation team and sends an alert notification to the support manager. Seeded by the platform — cannot be deleted.',
      'on_create',
      '{"watch_fields":[]}'::jsonb,
      'system', true, true, false
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- ── Campaign: Activation ─────────────────────────────────────────────────
  SELECT entity_definition_id INTO eid
    FROM entity_definition WHERE logical_name = 'campaign' LIMIT 1;
  IF eid IS NOT NULL THEN
    INSERT INTO workflow_definition
      (entity_definition_id, name, description, trigger_type, trigger_conditions,
       run_as, is_active, is_system, is_deletable)
    VALUES (
      eid,
      'Campaign Activation Notification',
      'When a Campaign status changes to Active, sends an in-app notification to the marketing team. Seeded by the platform — cannot be deleted.',
      'on_status_change',
      '{"status_from":"","status_to":"active","watch_fields":[]}'::jsonb,
      'system', true, true, false
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- ── Account: Key Account Monitor ─────────────────────────────────────────
  SELECT entity_definition_id INTO eid
    FROM entity_definition WHERE logical_name = 'account' LIMIT 1;
  IF eid IS NOT NULL THEN
    INSERT INTO workflow_definition
      (entity_definition_id, name, description, trigger_type, trigger_conditions,
       run_as, is_active, is_system, is_deletable)
    VALUES (
      eid,
      'Account Status Change Alert',
      'When an Account status changes, notifies the account owner and creates a follow-up task. Seeded by the platform — cannot be deleted.',
      'on_status_change',
      '{"status_from":"","status_to":"","watch_fields":[]}'::jsonb,
      'system', false, true, false
    ) ON CONFLICT DO NOTHING;
  END IF;

END $$;
