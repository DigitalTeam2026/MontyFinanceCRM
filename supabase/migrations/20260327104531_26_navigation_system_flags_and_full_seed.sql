/*
  # Navigation System Flags and Full System Navigation Seed

  ## Summary
  Adds is_system / is_deletable governance to all three navigation tables, then
  seeds a complete, hierarchical navigation tree (Areas → Groups → Items) for
  the three core CRM modules so the Navigation Designer opens with real content
  instead of an empty shell.

  ## Changes

  ### 1. New columns
  - nav_area:  is_system (bool, default false), is_deletable (bool, default true)
  - nav_group: is_system (bool, default false), is_deletable (bool, default true)
  - nav_item:  is_system (bool, default false), is_deletable (bool, default true)

  ### 2. Mark existing areas as system
  The three seeded areas (Sales, Marketing, Support) are marked is_system = true,
  is_deletable = false.

  ### 3. Seed Groups and Items

  Sales
    ├── Pipeline
    │   ├── Leads
    │   └── Opportunities
    └── Customers
        ├── Accounts
        └── Contacts

  Marketing
    ├── Campaigns
    │   ├── Campaigns
    │   └── Events
    └── Audience
        └── Segments

  Support
    └── Tickets
        └── Tickets

  ### 4. Security
  No RLS changes — nav tables already have policies from earlier migrations.
*/

-- ─── 1. Add governance columns ───────────────────────────────────────────────

ALTER TABLE nav_area
  ADD COLUMN IF NOT EXISTS is_system    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deletable boolean NOT NULL DEFAULT true;

ALTER TABLE nav_group
  ADD COLUMN IF NOT EXISTS is_system    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deletable boolean NOT NULL DEFAULT true;

ALTER TABLE nav_item
  ADD COLUMN IF NOT EXISTS is_system    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deletable boolean NOT NULL DEFAULT true;

-- ─── 2. Mark existing 3 seeded areas as system ───────────────────────────────

UPDATE nav_area
   SET is_system = true, is_deletable = false
 WHERE name IN ('sales', 'marketing', 'support')
   AND deleted_at IS NULL;

-- ─── 3. Seed groups and items ────────────────────────────────────────────────

DO $$
DECLARE
  area_sales      uuid;
  area_marketing  uuid;
  area_support    uuid;

  grp_pipeline    uuid;
  grp_customers   uuid;
  grp_campaigns   uuid;
  grp_audience    uuid;
  grp_tickets     uuid;
BEGIN

  -- resolve area IDs
  SELECT nav_area_id INTO area_sales      FROM nav_area WHERE name = 'sales'      AND deleted_at IS NULL LIMIT 1;
  SELECT nav_area_id INTO area_marketing  FROM nav_area WHERE name = 'marketing'  AND deleted_at IS NULL LIMIT 1;
  SELECT nav_area_id INTO area_support    FROM nav_area WHERE name = 'support'    AND deleted_at IS NULL LIMIT 1;

  -- ── Sales groups ────────────────────────────────────────────────────────
  IF area_sales IS NOT NULL THEN

    INSERT INTO nav_group (nav_area_id, name, display_label, sort_order, is_system, is_deletable)
    VALUES (area_sales, 'pipeline', 'Pipeline', 0, true, false)
    ON CONFLICT DO NOTHING
    RETURNING nav_group_id INTO grp_pipeline;

    IF grp_pipeline IS NULL THEN
      SELECT nav_group_id INTO grp_pipeline FROM nav_group WHERE nav_area_id = area_sales AND name = 'pipeline' LIMIT 1;
    END IF;

    INSERT INTO nav_group (nav_area_id, name, display_label, sort_order, is_system, is_deletable)
    VALUES (area_sales, 'customers', 'Customers', 1, true, false)
    ON CONFLICT DO NOTHING
    RETURNING nav_group_id INTO grp_customers;

    IF grp_customers IS NULL THEN
      SELECT nav_group_id INTO grp_customers FROM nav_group WHERE nav_area_id = area_sales AND name = 'customers' LIMIT 1;
    END IF;

    -- Pipeline items
    IF grp_pipeline IS NOT NULL THEN
      INSERT INTO nav_item (nav_group_id, entity_name, display_label, icon_name, sort_order, is_active, is_system, is_deletable)
      VALUES
        (grp_pipeline, 'lead',        'Leads',         'TrendingUp', 0, true, true, false),
        (grp_pipeline, 'opportunity', 'Opportunities', 'BarChart2',  1, true, true, false)
      ON CONFLICT DO NOTHING;
    END IF;

    -- Customers items
    IF grp_customers IS NOT NULL THEN
      INSERT INTO nav_item (nav_group_id, entity_name, display_label, icon_name, sort_order, is_active, is_system, is_deletable)
      VALUES
        (grp_customers, 'account', 'Accounts', 'Briefcase', 0, true, true, false),
        (grp_customers, 'contact', 'Contacts', 'Users',     1, true, true, false)
      ON CONFLICT DO NOTHING;
    END IF;

  END IF;

  -- ── Marketing groups ─────────────────────────────────────────────────────
  IF area_marketing IS NOT NULL THEN

    INSERT INTO nav_group (nav_area_id, name, display_label, sort_order, is_system, is_deletable)
    VALUES (area_marketing, 'campaigns', 'Campaigns', 0, true, false)
    ON CONFLICT DO NOTHING
    RETURNING nav_group_id INTO grp_campaigns;

    IF grp_campaigns IS NULL THEN
      SELECT nav_group_id INTO grp_campaigns FROM nav_group WHERE nav_area_id = area_marketing AND name = 'campaigns' LIMIT 1;
    END IF;

    INSERT INTO nav_group (nav_area_id, name, display_label, sort_order, is_system, is_deletable)
    VALUES (area_marketing, 'audience', 'Audience', 1, true, false)
    ON CONFLICT DO NOTHING
    RETURNING nav_group_id INTO grp_audience;

    IF grp_audience IS NULL THEN
      SELECT nav_group_id INTO grp_audience FROM nav_group WHERE nav_area_id = area_marketing AND name = 'audience' LIMIT 1;
    END IF;

    IF grp_campaigns IS NOT NULL THEN
      INSERT INTO nav_item (nav_group_id, entity_name, display_label, icon_name, sort_order, is_active, is_system, is_deletable)
      VALUES
        (grp_campaigns, 'campaign', 'Campaigns', 'Megaphone', 0, true, true, false),
        (grp_campaigns, 'event',    'Events',    'Star',      1, true, true, false)
      ON CONFLICT DO NOTHING;
    END IF;

    IF grp_audience IS NOT NULL THEN
      INSERT INTO nav_item (nav_group_id, entity_name, display_label, icon_name, sort_order, is_active, is_system, is_deletable)
      VALUES
        (grp_audience, 'segment', 'Segments', 'Layers', 0, true, true, false)
      ON CONFLICT DO NOTHING;
    END IF;

  END IF;

  -- ── Support groups ───────────────────────────────────────────────────────
  IF area_support IS NOT NULL THEN

    INSERT INTO nav_group (nav_area_id, name, display_label, sort_order, is_system, is_deletable)
    VALUES (area_support, 'tickets', 'Tickets', 0, true, false)
    ON CONFLICT DO NOTHING
    RETURNING nav_group_id INTO grp_tickets;

    IF grp_tickets IS NULL THEN
      SELECT nav_group_id INTO grp_tickets FROM nav_group WHERE nav_area_id = area_support AND name = 'tickets' LIMIT 1;
    END IF;

    IF grp_tickets IS NOT NULL THEN
      INSERT INTO nav_item (nav_group_id, entity_name, display_label, icon_name, sort_order, is_active, is_system, is_deletable)
      VALUES
        (grp_tickets, 'ticket', 'Tickets', 'Headphones', 0, true, true, false)
      ON CONFLICT DO NOTHING;
    END IF;

  END IF;

END $$;
