/*
  # Migration 15: Navigation / Sitemap Designer + Option Set Extensions

  ## Overview
  Introduces the navigation/sitemap configuration system and extends option_set
  with soft-delete support for the Option Sets Manager UI.

  ## New Tables

  ### nav_area
  Top-level navigation areas (e.g. Sales, Marketing, Support, Custom).
  - id, name, display_label, icon_name, sort_order, is_active, deleted_at

  ### nav_group
  Named groups/sub-sections within a nav area (e.g. "Customers", "Activity").
  - id, nav_area_id (FK), name, display_label, sort_order, is_active

  ### nav_item
  Individual navigable entities/pages within a group.
  - id, nav_group_id (FK), entity_name (logical name), display_label, icon_name, sort_order, is_active
  - role_visibility: jsonb array of role_ids; null/empty = visible to all

  ## Modified Tables

  ### option_set
  - Add `deleted_at` for soft deletes

  ## Security
  - RLS enabled on all new tables with authenticated read/write policies
*/

-- ─── option_set soft delete ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'option_set' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE option_set ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

-- ─── nav_area ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nav_area (
  nav_area_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  display_label text NOT NULL,
  icon_name     text NOT NULL DEFAULT 'Layout',
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  modified_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nav_area ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view nav areas"
  ON nav_area FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert nav areas"
  ON nav_area FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update nav areas"
  ON nav_area FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ─── nav_group ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nav_group (
  nav_group_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nav_area_id   uuid NOT NULL REFERENCES nav_area(nav_area_id) ON DELETE CASCADE,
  name          text NOT NULL,
  display_label text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  modified_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(nav_area_id, name)
);

CREATE INDEX IF NOT EXISTS idx_nav_group_area ON nav_group(nav_area_id);

ALTER TABLE nav_group ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view nav groups"
  ON nav_group FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert nav groups"
  ON nav_group FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update nav groups"
  ON nav_group FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete nav groups"
  ON nav_group FOR DELETE TO authenticated USING (true);

-- ─── nav_item ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nav_item (
  nav_item_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nav_group_id      uuid NOT NULL REFERENCES nav_group(nav_group_id) ON DELETE CASCADE,
  entity_name       text,
  display_label     text NOT NULL,
  icon_name         text NOT NULL DEFAULT 'FileText',
  sort_order        integer NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  role_visibility   jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  modified_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nav_item_group ON nav_item(nav_group_id);

ALTER TABLE nav_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view nav items"
  ON nav_item FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert nav items"
  ON nav_item FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update nav items"
  ON nav_item FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete nav items"
  ON nav_item FOR DELETE TO authenticated USING (true);

-- ─── Seed default navigation areas ─────────────────────────────────────────
INSERT INTO nav_area (name, display_label, icon_name, sort_order)
VALUES
  ('sales',     'Sales',     'TrendingUp',  1),
  ('marketing', 'Marketing', 'Megaphone',   2),
  ('support',   'Support',   'Headphones',  3)
ON CONFLICT (name) DO NOTHING;
