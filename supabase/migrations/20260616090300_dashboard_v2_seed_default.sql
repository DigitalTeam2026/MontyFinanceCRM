/*
  # Dashboard v2 — seed the Default Organization Dashboard

  Migrates the current Admin Dashboard view into a database-driven, editable,
  SYSTEM + DEFAULT dashboard. Mirrors DEFAULT_LAYOUT from the (now-retired)
  src/admin/admindashboard/widgets.tsx: 9 KPIs, conversion funnel, prospect/lead/
  account/contact/product charts, opportunity breakdown + trend.

  Preset widgets carry data_source_type='preset' (rendered by the curated
  renderers); generic charts carry data_source_type='entity' with a
  query_definition the runtime engine reads. Nothing is hardcoded in React.

  Idempotent: only seeds when a dashboard with this name does not already exist.
*/
DO $$
DECLARE
  v_dash uuid;
  v_page uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM dashboard WHERE name = 'Default Organization Dashboard') THEN
    RETURN;
  END IF;

  -- Ensure single-default: clear any existing default first.
  UPDATE dashboard SET is_default = false WHERE is_default = true;

  INSERT INTO dashboard (name, description, module, is_system, is_deletable, is_default, is_active, is_published, published_at, layout_json)
  VALUES ('Default Organization Dashboard',
          'Organization-wide sales analytics across prospects, leads, opportunities, accounts, contacts, and products.',
          'sales', true, false, true, true, true, now(), '{"columns": 12, "row_height": 80}')
  RETURNING dashboard_id INTO v_dash;

  INSERT INTO dashboard_page (dashboard_id, name, sort_order, is_default)
  VALUES (v_dash, 'Overview', 0, true)
  RETURNING page_id INTO v_page;

  UPDATE dashboard SET default_page_id = v_page WHERE dashboard_id = v_dash;

  INSERT INTO dashboard_widget
    (dashboard_id, dashboard_page_id, widget_type, title, data_source_type, entity_name,
     query_definition, visual_config, width, height, sort_order)
  SELECT v_dash, v_page, w.wtype, w.title, w.dstype, w.entity,
         w.qdef::jsonb, w.vcfg::jsonb, w.width, w.height, w.ord
  FROM (VALUES
    -- KPI bundle (preset)
    ('kpi','Total Prospects',              'preset', NULL, '{"preset":"kpi.prospects"}',  '{"icon":"user-plus"}', 3, 2, 1),
    ('kpi','Prospect → Lead Conversion',   'preset', NULL, '{"preset":"kpi.conversion"}', '{"icon":"repeat"}',    3, 2, 2),
    ('kpi','Total Leads',                  'preset', NULL, '{"preset":"kpi.leads"}',      '{"icon":"users"}',     3, 2, 3),
    ('kpi','Open Opportunities',           'preset', NULL, '{"preset":"kpi.openOpps"}',   '{"icon":"target"}',    3, 2, 4),
    ('kpi','Win Rate',                     'preset', NULL, '{"preset":"kpi.winRate"}',    '{"icon":"award"}',     3, 2, 5),
    ('kpi','Total Accounts',               'preset', NULL, '{"preset":"kpi.accounts"}',   '{"icon":"building"}',  3, 2, 6),
    ('kpi','Pipeline Value',               'preset', NULL, '{"preset":"kpi.pipeline"}',   '{"icon":"dollar"}',    3, 2, 7),
    ('kpi','Total Contacts',               'preset', NULL, '{"preset":"kpi.contacts"}',   '{"icon":"contact"}',   3, 2, 8),
    ('kpi','Products / Services',          'preset', NULL, '{"preset":"kpi.products"}',   '{"icon":"package"}',   3, 2, 9),
    -- Funnel (preset)
    ('chart','Conversion Funnel',          'preset', NULL, '{"preset":"funnel"}',         '{}', 8, 4, 10),
    -- Prospects (generic entity charts)
    ('chart','Prospects by Status',        'entity','prospect', '{"entity":"prospect","dimension":"state_code"}', '{"chartType":"donut","title":"Prospects by Status"}', 4, 4, 11),
    ('chart','Prospects by Source',        'entity','prospect', '{"entity":"prospect","dimension":"source"}',     '{"chartType":"bars","title":"Prospects by Source"}',  4, 4, 12),
    -- Leads
    ('chart','Leads by Status',            'entity','leads', '{"entity":"leads","dimension":"state_code"}',  '{"chartType":"donut","title":"Leads by Status"}', 4, 4, 13),
    ('chart','Leads by Source',            'entity','leads', '{"entity":"leads","dimension":"lead_source"}', '{"chartType":"bars","title":"Leads by Source"}',  4, 4, 14),
    ('chart','Leads by Product',           'entity','leads', '{"entity":"leads","dimension":"product_id"}',  '{"chartType":"bars","title":"Leads by Product"}', 4, 4, 15),
    -- Opportunities (preset)
    ('chart','Won / Lost / Open',          'preset', NULL, '{"preset":"oppBreakdown"}', '{}', 8, 4, 16),
    ('chart','Won Trend (6 months)',       'preset', NULL, '{"preset":"oppTrend"}',     '{}', 4, 4, 17),
    -- Accounts
    ('chart','Accounts by Industry',       'entity','accounts', '{"entity":"accounts","dimension":"industry"}',   '{"chartType":"bars","title":"Accounts by Industry"}', 4, 4, 18),
    ('chart','Accounts by Country',        'entity','accounts', '{"entity":"accounts","dimension":"country_id"}', '{"chartType":"bars","title":"Accounts by Country"}',  4, 4, 19),
    ('chart','Accounts Health & Growth',   'preset', NULL, '{"preset":"accountsHealth"}', '{}', 4, 4, 20),
    -- Contacts
    ('chart','Contacts by Status',         'entity','contacts', '{"entity":"contacts","dimension":"status_code"}', '{"chartType":"donut","title":"Contacts by Status"}', 4, 4, 21),
    ('chart','Contacts by Country',        'entity','contacts', '{"entity":"contacts","dimension":"country_id"}',  '{"chartType":"bars","title":"Contacts by Country"}',  4, 4, 22),
    -- Products
    ('chart','Products by Type',           'entity','product', '{"entity":"product","dimension":"product_type"}', '{"chartType":"donut","title":"Products by Type"}', 4, 4, 23),
    ('chart','Products by Family',         'entity','product', '{"entity":"product","dimension":"family_id"}',    '{"chartType":"bars","title":"Products by Family"}', 4, 4, 24)
  ) AS w(wtype, title, dstype, entity, qdef, vcfg, width, height, ord);
END $$;
