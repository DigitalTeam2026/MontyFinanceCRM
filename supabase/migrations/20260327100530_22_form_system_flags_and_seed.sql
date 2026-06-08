
/*
  # Form Definition System Flags and System Form Seed

  ## Summary
  Adds governance columns to form_definition so the UI can distinguish
  platform-delivered (system) forms from admin-created (custom) forms, then
  seeds the three canonical system forms (Main, Quick Create, Quick View) for
  every core CRM entity.

  ## Changes

  ### 1. New columns on form_definition
  - `is_system`    (bool, default false) – true for platform-delivered forms
  - `is_deletable` (bool, default true)  – false prevents deletion via UI

  ### 2. System form seed
  For each entity: lead, contact, account, opportunity, ticket, campaign,
  event, journey, segment, marketing_email, organization, crm_user
  — insert: Main Form (is_default=true), Quick Create Form, Quick View Form

  ### Security
  No RLS changes – form_definition already has RLS from earlier migrations.
*/

-- ─── 1. Add governance columns ───────────────────────────────────────────────

ALTER TABLE form_definition
  ADD COLUMN IF NOT EXISTS is_system    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deletable boolean NOT NULL DEFAULT true;

-- ─── 2. Seed system forms ────────────────────────────────────────────────────

DO $$
DECLARE
  eid uuid;
  logical_names text[] := ARRAY[
    'lead', 'contact', 'account', 'opportunity', 'ticket',
    'campaign', 'event', 'journey', 'segment', 'marketing_email',
    'organization', 'crm_user'
  ];
  entity_display text[] := ARRAY[
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

    dn := entity_display[i];

    -- Main Form (default)
    INSERT INTO form_definition
      (entity_definition_id, name, form_type, description, is_default,
       is_active, is_published, is_system, is_deletable)
    VALUES
      (eid,
       dn || ' Main Form',
       'main',
       'Primary data entry and editing form for ' || dn || ' records.',
       true, true, true, true, false)
    ON CONFLICT DO NOTHING;

    -- Quick Create Form
    INSERT INTO form_definition
      (entity_definition_id, name, form_type, description, is_default,
       is_active, is_published, is_system, is_deletable)
    VALUES
      (eid,
       dn || ' Quick Create',
       'quick_create',
       'Lightweight creation form with essential fields for ' || dn || '.',
       true, true, true, true, false)
    ON CONFLICT DO NOTHING;

    -- Quick View Form
    INSERT INTO form_definition
      (entity_definition_id, name, form_type, description, is_default,
       is_active, is_published, is_system, is_deletable)
    VALUES
      (eid,
       dn || ' Quick View',
       'quick_view',
       'Read-only summary panel for ' || dn || ' records.',
       true, true, true, true, false)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
