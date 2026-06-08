/*
  # Dashboard Management

  ## Summary
  Creates the full dashboard system with widgets, system seeding, and role assignments.

  ## New Tables
  1. `dashboard` — top-level dashboard definition
     - dashboard_id (uuid, pk)
     - name, description
     - module (sales, marketing, support, all)
     - is_system — seeded dashboards cannot be deleted
     - is_deletable — governance flag
     - is_default — shown first for the assigned module
     - is_active — visibility toggle
     - layout_json — grid/layout metadata
     - created_by, created_at, modified_at, deleted_at

  2. `dashboard_widget` — individual widgets on a dashboard
     - widget_id (uuid, pk)
     - dashboard_id (fk → dashboard)
     - widget_type (kpi, chart, table, activity)
     - title
     - config_json — entity, aggregation, chart_type, group_by, filters, etc.
     - position_x, position_y, width, height
     - sort_order

  3. `dashboard_role_assignment` — which roles can see which dashboards
     - id, dashboard_id, role_id (from security_role)

  ## Security
  - RLS enabled on all three tables
  - Authenticated users can read all dashboards
  - Only authenticated users can insert/update/delete custom (non-system) dashboards

  ## Seeded System Dashboards
  - Sales: "Sales Overview" (default), "Pipeline Dashboard", "Lead Conversion"
  - Marketing: "Campaign Performance"
  - Support: "Support Performance", "Ticket SLA Dashboard"
*/

-- ─────────────────────────────────────────────
-- 1. dashboard table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard (
  dashboard_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  description    text,
  module         text NOT NULL DEFAULT 'all',
  is_system      boolean NOT NULL DEFAULT false,
  is_deletable   boolean NOT NULL DEFAULT true,
  is_default     boolean NOT NULL DEFAULT false,
  is_active      boolean NOT NULL DEFAULT true,
  layout_json    jsonb NOT NULL DEFAULT '{}',
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  modified_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

ALTER TABLE dashboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dashboards"
  ON dashboard FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated users can insert custom dashboards"
  ON dashboard FOR INSERT
  TO authenticated
  WITH CHECK (is_system = false);

CREATE POLICY "Authenticated users can update dashboards"
  ON dashboard FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete custom dashboards"
  ON dashboard FOR DELETE
  TO authenticated
  USING (is_deletable = true AND is_system = false);

-- ─────────────────────────────────────────────
-- 2. dashboard_widget table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_widget (
  widget_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id  uuid NOT NULL REFERENCES dashboard(dashboard_id) ON DELETE CASCADE,
  widget_type   text NOT NULL DEFAULT 'kpi',
  title         text NOT NULL DEFAULT '',
  config_json   jsonb NOT NULL DEFAULT '{}',
  position_x    integer NOT NULL DEFAULT 0,
  position_y    integer NOT NULL DEFAULT 0,
  width         integer NOT NULL DEFAULT 3,
  height        integer NOT NULL DEFAULT 2,
  sort_order    integer NOT NULL DEFAULT 0
);

ALTER TABLE dashboard_widget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read widgets"
  ON dashboard_widget FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert widgets"
  ON dashboard_widget FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update widgets"
  ON dashboard_widget FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete widgets"
  ON dashboard_widget FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- 3. dashboard_role_assignment table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_role_assignment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id  uuid NOT NULL REFERENCES dashboard(dashboard_id) ON DELETE CASCADE,
  role_id       uuid NOT NULL,
  UNIQUE(dashboard_id, role_id)
);

ALTER TABLE dashboard_role_assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read role assignments"
  ON dashboard_role_assignment FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage role assignments"
  ON dashboard_role_assignment FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete role assignments"
  ON dashboard_role_assignment FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- 4. Seed system dashboards
-- ─────────────────────────────────────────────

-- Sales Overview (default)
WITH ins AS (
  INSERT INTO dashboard (name, description, module, is_system, is_deletable, is_default, is_active, layout_json)
  VALUES (
    'Sales Overview',
    'High-level sales metrics: total leads, open opportunities, revenue, and conversion rates.',
    'sales', true, false, true, true,
    '{"columns": 12, "row_height": 80}'
  )
  ON CONFLICT DO NOTHING
  RETURNING dashboard_id
)
INSERT INTO dashboard_widget (dashboard_id, widget_type, title, config_json, position_x, position_y, width, height, sort_order)
SELECT
  ins.dashboard_id,
  w.widget_type, w.title, w.config_json::jsonb, w.position_x, w.position_y, w.width, w.height, w.sort_order
FROM ins,
(VALUES
  ('kpi',   'Total Leads',         '{"entity":"lead","aggregation":"count","icon":"users","color":"blue"}',   0, 0, 3, 2, 1),
  ('kpi',   'Open Opportunities',  '{"entity":"opportunity","aggregation":"count","filter":{"stage":"open"},"icon":"target","color":"emerald"}', 3, 0, 3, 2, 2),
  ('kpi',   'Total Revenue',       '{"entity":"opportunity","aggregation":"sum","field":"amount","filter":{"stage":"won"},"icon":"dollar-sign","color":"amber"}', 6, 0, 3, 2, 3),
  ('kpi',   'Conversion Rate',     '{"entity":"lead","aggregation":"conversion_rate","icon":"trending-up","color":"rose"}', 9, 0, 3, 2, 4),
  ('chart', 'Leads by Source',     '{"entity":"lead","chart_type":"bar","group_by":"lead_source","title":"Leads by Source"}', 0, 2, 6, 4, 5),
  ('chart', 'Revenue by Month',    '{"entity":"opportunity","chart_type":"line","group_by":"close_date_month","field":"amount","title":"Revenue Trend"}', 6, 2, 6, 4, 6),
  ('table', 'Top Opportunities',   '{"entity":"opportunity","columns":["name","account","amount","stage"],"limit":5,"sort_by":"amount","sort_dir":"desc"}', 0, 6, 12, 4, 7)
) AS w(widget_type, title, config_json, position_x, position_y, width, height, sort_order);

-- Pipeline Dashboard
WITH ins AS (
  INSERT INTO dashboard (name, description, module, is_system, is_deletable, is_default, is_active, layout_json)
  VALUES (
    'Pipeline Dashboard',
    'Visualise the full sales pipeline from lead to closed deal across all stages.',
    'sales', true, false, false, true,
    '{"columns": 12, "row_height": 80}'
  )
  ON CONFLICT DO NOTHING
  RETURNING dashboard_id
)
INSERT INTO dashboard_widget (dashboard_id, widget_type, title, config_json, position_x, position_y, width, height, sort_order)
SELECT ins.dashboard_id, w.widget_type, w.title, w.config_json::jsonb, w.position_x, w.position_y, w.width, w.height, w.sort_order
FROM ins,
(VALUES
  ('kpi',   'Pipeline Value',      '{"entity":"opportunity","aggregation":"sum","field":"amount","icon":"layers","color":"blue"}', 0, 0, 4, 2, 1),
  ('kpi',   'Avg Deal Size',       '{"entity":"opportunity","aggregation":"avg","field":"amount","icon":"bar-chart-2","color":"emerald"}', 4, 0, 4, 2, 2),
  ('kpi',   'Win Rate',            '{"entity":"opportunity","aggregation":"win_rate","icon":"award","color":"amber"}', 8, 0, 4, 2, 3),
  ('chart', 'Deals by Stage',      '{"entity":"opportunity","chart_type":"bar","group_by":"stage","title":"Deals by Stage"}', 0, 2, 7, 5, 4),
  ('chart', 'Pipeline by Owner',   '{"entity":"opportunity","chart_type":"pie","group_by":"owner","title":"Pipeline by Owner"}', 7, 2, 5, 5, 5),
  ('table', 'Open Deals',          '{"entity":"opportunity","columns":["name","account","amount","stage","close_date"],"limit":8,"filter":{"stage":"open"},"sort_by":"close_date"}', 0, 7, 12, 4, 6)
) AS w(widget_type, title, config_json, position_x, position_y, width, height, sort_order);

-- Lead Conversion Dashboard
WITH ins AS (
  INSERT INTO dashboard (name, description, module, is_system, is_deletable, is_default, is_active, layout_json)
  VALUES (
    'Lead Conversion Dashboard',
    'Track lead funnel efficiency — new leads, qualified leads, and conversion to opportunities.',
    'sales', true, false, false, true,
    '{"columns": 12, "row_height": 80}'
  )
  ON CONFLICT DO NOTHING
  RETURNING dashboard_id
)
INSERT INTO dashboard_widget (dashboard_id, widget_type, title, config_json, position_x, position_y, width, height, sort_order)
SELECT ins.dashboard_id, w.widget_type, w.title, w.config_json::jsonb, w.position_x, w.position_y, w.width, w.height, w.sort_order
FROM ins,
(VALUES
  ('kpi',   'New Leads (30d)',     '{"entity":"lead","aggregation":"count","filter":{"days":30},"icon":"user-plus","color":"blue"}', 0, 0, 3, 2, 1),
  ('kpi',   'Qualified Leads',     '{"entity":"lead","aggregation":"count","filter":{"status":"qualified"},"icon":"check-circle","color":"emerald"}', 3, 0, 3, 2, 2),
  ('kpi',   'Converted Leads',     '{"entity":"lead","aggregation":"count","filter":{"status":"converted"},"icon":"trending-up","color":"amber"}', 6, 0, 3, 2, 3),
  ('kpi',   'Avg Time to Convert', '{"entity":"lead","aggregation":"avg_conversion_days","icon":"clock","color":"rose"}', 9, 0, 3, 2, 4),
  ('chart', 'Lead Funnel',         '{"entity":"lead","chart_type":"bar","group_by":"status","title":"Lead Funnel by Status"}', 0, 2, 8, 5, 5),
  ('chart', 'Leads by Industry',   '{"entity":"lead","chart_type":"pie","group_by":"industry","title":"Leads by Industry"}', 8, 2, 4, 5, 6)
) AS w(widget_type, title, config_json, position_x, position_y, width, height, sort_order);

-- Campaign Performance Dashboard
WITH ins AS (
  INSERT INTO dashboard (name, description, module, is_system, is_deletable, is_default, is_active, layout_json)
  VALUES (
    'Campaign Performance',
    'Analyse marketing campaign reach, engagement, and ROI across all active campaigns.',
    'marketing', true, false, true, true,
    '{"columns": 12, "row_height": 80}'
  )
  ON CONFLICT DO NOTHING
  RETURNING dashboard_id
)
INSERT INTO dashboard_widget (dashboard_id, widget_type, title, config_json, position_x, position_y, width, height, sort_order)
SELECT ins.dashboard_id, w.widget_type, w.title, w.config_json::jsonb, w.position_x, w.position_y, w.width, w.height, w.sort_order
FROM ins,
(VALUES
  ('kpi',   'Active Campaigns',    '{"entity":"campaign","aggregation":"count","filter":{"status":"active"},"icon":"megaphone","color":"blue"}', 0, 0, 3, 2, 1),
  ('kpi',   'Total Reach',         '{"entity":"campaign","aggregation":"sum","field":"actual_responses","icon":"radio","color":"emerald"}', 3, 0, 3, 2, 2),
  ('kpi',   'Total Budget',        '{"entity":"campaign","aggregation":"sum","field":"budget_amount","icon":"dollar-sign","color":"amber"}', 6, 0, 3, 2, 3),
  ('kpi',   'Campaigns This Month','{"entity":"campaign","aggregation":"count","filter":{"days":30},"icon":"calendar","color":"rose"}', 9, 0, 3, 2, 4),
  ('chart', 'Campaigns by Type',   '{"entity":"campaign","chart_type":"pie","group_by":"type","title":"Campaigns by Type"}', 0, 2, 5, 5, 5),
  ('chart', 'Budget vs Spend',     '{"entity":"campaign","chart_type":"bar","group_by":"name","fields":["budget_amount","actual_cost"],"title":"Budget vs Actual Spend"}', 5, 2, 7, 5, 6),
  ('table', 'Campaign List',       '{"entity":"campaign","columns":["name","type","status","budget_amount","actual_responses"],"limit":6,"sort_by":"created_at","sort_dir":"desc"}', 0, 7, 12, 4, 7)
) AS w(widget_type, title, config_json, position_x, position_y, width, height, sort_order);

-- Support Performance Dashboard
WITH ins AS (
  INSERT INTO dashboard (name, description, module, is_system, is_deletable, is_default, is_active, layout_json)
  VALUES (
    'Support Performance',
    'Monitor ticket volume, resolution rates, SLA compliance, and agent productivity.',
    'support', true, false, true, true,
    '{"columns": 12, "row_height": 80}'
  )
  ON CONFLICT DO NOTHING
  RETURNING dashboard_id
)
INSERT INTO dashboard_widget (dashboard_id, widget_type, title, config_json, position_x, position_y, width, height, sort_order)
SELECT ins.dashboard_id, w.widget_type, w.title, w.config_json::jsonb, w.position_x, w.position_y, w.width, w.height, w.sort_order
FROM ins,
(VALUES
  ('kpi',   'Open Tickets',        '{"entity":"ticket","aggregation":"count","filter":{"status":"open"},"icon":"inbox","color":"blue"}', 0, 0, 3, 2, 1),
  ('kpi',   'Resolved Today',      '{"entity":"ticket","aggregation":"count","filter":{"status":"resolved","days":1},"icon":"check-circle","color":"emerald"}', 3, 0, 3, 2, 2),
  ('kpi',   'Avg Resolution Time', '{"entity":"ticket","aggregation":"avg_resolution_hours","icon":"clock","color":"amber"}', 6, 0, 3, 2, 3),
  ('kpi',   'SLA Breaches',        '{"entity":"ticket","aggregation":"count","filter":{"sla_breached":true},"icon":"alert-triangle","color":"rose"}', 9, 0, 3, 2, 4),
  ('chart', 'Tickets by Priority', '{"entity":"ticket","chart_type":"bar","group_by":"priority","title":"Tickets by Priority"}', 0, 2, 6, 5, 5),
  ('chart', 'Tickets by Status',   '{"entity":"ticket","chart_type":"pie","group_by":"status","title":"Tickets by Status"}', 6, 2, 6, 5, 6),
  ('table', 'Recent Tickets',      '{"entity":"ticket","columns":["title","priority","status","created_at","assigned_to"],"limit":6,"sort_by":"created_at","sort_dir":"desc"}', 0, 7, 12, 4, 7)
) AS w(widget_type, title, config_json, position_x, position_y, width, height, sort_order);

-- Ticket SLA Dashboard
WITH ins AS (
  INSERT INTO dashboard (name, description, module, is_system, is_deletable, is_default, is_active, layout_json)
  VALUES (
    'Ticket SLA Dashboard',
    'Focused view of SLA compliance, breach rates, and time-to-resolution across ticket priorities.',
    'support', true, false, false, true,
    '{"columns": 12, "row_height": 80}'
  )
  ON CONFLICT DO NOTHING
  RETURNING dashboard_id
)
INSERT INTO dashboard_widget (dashboard_id, widget_type, title, config_json, position_x, position_y, width, height, sort_order)
SELECT ins.dashboard_id, w.widget_type, w.title, w.config_json::jsonb, w.position_x, w.position_y, w.width, w.height, w.sort_order
FROM ins,
(VALUES
  ('kpi',   'SLA Compliance %',    '{"entity":"ticket","aggregation":"sla_compliance_rate","icon":"shield-check","color":"emerald"}', 0, 0, 4, 2, 1),
  ('kpi',   'High Priority Open',  '{"entity":"ticket","aggregation":"count","filter":{"priority":"high","status":"open"},"icon":"alert-triangle","color":"rose"}', 4, 0, 4, 2, 2),
  ('kpi',   'Avg First Response',  '{"entity":"ticket","aggregation":"avg_first_response_hours","icon":"zap","color":"amber"}', 8, 0, 4, 2, 3),
  ('chart', 'SLA by Priority',     '{"entity":"ticket","chart_type":"bar","group_by":"priority","metric":"sla_compliance_rate","title":"SLA Compliance by Priority"}', 0, 2, 7, 5, 4),
  ('chart', 'Resolution Trend',    '{"entity":"ticket","chart_type":"line","group_by":"created_date","metric":"avg_resolution_hours","title":"Avg Resolution Time (30d)"}', 7, 2, 5, 5, 5),
  ('table', 'SLA Breaches',        '{"entity":"ticket","columns":["title","priority","created_at","assigned_to","sla_deadline"],"limit":6,"filter":{"sla_breached":true},"sort_by":"sla_deadline"}', 0, 7, 12, 4, 6)
) AS w(widget_type, title, config_json, position_x, position_y, width, height, sort_order);
