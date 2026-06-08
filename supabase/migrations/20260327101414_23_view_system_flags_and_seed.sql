/*
  # View Definition System Flags and System View Seed

  ## Summary
  Adds governance columns to view_definition to distinguish platform-delivered
  (system) views from admin-created (custom) views, then seeds the three
  canonical system views (All Records, Active Records, My Records) for every
  core CRM entity.

  ## Changes

  ### 1. New columns on view_definition
  - `is_system`    (bool, default false) – true for platform-delivered views
  - `is_deletable` (bool, default true)  – false prevents deletion via UI

  ### 2. System view seed
  For each entity: lead, contact, account, opportunity, ticket, campaign,
  event, journey, segment, marketing_email, organization, crm_user
  — insert three system views:
    • All {Entity} (is_default = true, no filter)
    • Active {Entity} (filter: status = 'active')
    • My {Entity}     (filter: created_by = current user — placeholder)

  ### Security
  No RLS changes – view_definition already has RLS from earlier migrations.
*/

-- ─── 1. Add governance columns ───────────────────────────────────────────────

ALTER TABLE view_definition
  ADD COLUMN IF NOT EXISTS is_system    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deletable boolean NOT NULL DEFAULT true;

-- ─── 2. Seed system views ────────────────────────────────────────────────────

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
  plural_names text[] := ARRAY[
    'Leads', 'Contacts', 'Accounts', 'Opportunities', 'Tickets',
    'Campaigns', 'Events', 'Journeys', 'Segments', 'Marketing Emails',
    'Organizations', 'Users'
  ];
  i int;
  dn text;
  pn text;
BEGIN
  FOR i IN 1..array_length(logical_names, 1) LOOP
    SELECT entity_definition_id INTO eid
      FROM entity_definition
      WHERE logical_name = logical_names[i]
      LIMIT 1;

    IF eid IS NULL THEN CONTINUE; END IF;

    dn := display_names[i];
    pn := plural_names[i];

    -- All records view (default)
    INSERT INTO view_definition
      (entity_definition_id, name, view_type, description, is_default,
       is_active, is_system, is_deletable, filter_json, sort_json)
    VALUES
      (eid,
       'All ' || pn,
       'public',
       'Shows all ' || lower(pn) || ' records.',
       true, true, true, false,
       NULL,
       '[{"field_logical_name":"created_at","field_display_name":"Created On","direction":"desc","order":0}]'::jsonb)
    ON CONFLICT DO NOTHING;

    -- Active records view
    INSERT INTO view_definition
      (entity_definition_id, name, view_type, description, is_default,
       is_active, is_system, is_deletable, filter_json, sort_json)
    VALUES
      (eid,
       'Active ' || pn,
       'public',
       'Shows only active ' || lower(pn) || '.',
       false, true, true, false,
       '{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","operator":"eq","value":"true"}],"groups":[]}'::jsonb,
       '[{"field_logical_name":"created_at","field_display_name":"Created On","direction":"desc","order":0}]'::jsonb)
    ON CONFLICT DO NOTHING;

    -- My records view
    INSERT INTO view_definition
      (entity_definition_id, name, view_type, description, is_default,
       is_active, is_system, is_deletable, filter_json, sort_json)
    VALUES
      (eid,
       'My ' || pn,
       'public',
       lower(pn) || ' assigned to or created by the current user.',
       false, true, true, false,
       '{"id":"root","operator":"AND","conditions":[{"id":"c1","field_logical_name":"created_by","field_display_name":"Created By","field_type_name":"lookup","operator":"eq","value":"@currentUser"}],"groups":[]}'::jsonb,
       '[{"field_logical_name":"modified_at","field_display_name":"Modified On","direction":"desc","order":0}]'::jsonb)
    ON CONFLICT DO NOTHING;

  END LOOP;
END $$;
