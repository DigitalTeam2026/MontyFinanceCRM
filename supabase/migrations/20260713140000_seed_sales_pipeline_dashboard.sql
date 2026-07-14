/*
  # Seed — "Sales Pipeline" dashboard (native Dashboard Designer)

  Creates the bespoke Sales Pipeline dashboard directly in the live designer
  tables (dashboard / dashboard_page / dashboard_visual) so it appears in
  Admin Studio → Analytics → Dashboards on deploy — no manual Import needed.

  Mirrors dashboards/sales-pipeline.dashboard.json 1:1 (same visuals, same
  query/format config). Fully editable + movable in the designer afterwards.

  Idempotent: keyed on a fixed dashboard_id, so re-running the deploy is a no-op.
  Seeds as status='draft' (exactly like the Import path). Publish + "Set as
  default" from the UI when ready.

  Owner: dashboard.owner_id is NOT NULL and auth.uid() is null during migration,
  so we resolve a concrete owner (a system admin, else the earliest user). If the
  instance has no users yet the seed skips cleanly and can run on a later deploy.
*/

DO $SEED$
DECLARE
  v_dash  uuid := '5a1e0000-0000-4000-a000-000000000000';
  v_page  uuid := '5a1e0000-0000-4000-a000-0000000000f1';
  v_owner uuid;
BEGIN
  -- Already seeded? Nothing to do.
  IF EXISTS (SELECT 1 FROM public.dashboard WHERE dashboard_id = v_dash) THEN
    RETURN;
  END IF;

  -- Resolve an owner: prefer a system admin, fall back to the earliest user.
  SELECT cu.user_id INTO v_owner
    FROM public.crm_user cu
   WHERE cu.is_system_admin = true
   ORDER BY cu.created_at
   LIMIT 1;
  IF v_owner IS NULL THEN
    SELECT id INTO v_owner FROM auth.users ORDER BY created_at LIMIT 1;
  END IF;
  IF v_owner IS NULL THEN
    RAISE NOTICE 'Sales Pipeline seed skipped: no user available to own the dashboard.';
    RETURN;
  END IF;

  -- ── Root ────────────────────────────────────────────────────────────────────
  INSERT INTO public.dashboard (
    dashboard_id, name, description, dashboard_type,
    default_date_range, refresh_interval, owner_id, status, created_by, modified_by
  ) VALUES (
    v_dash,
    'Sales Pipeline',
    'Prospects -> Leads -> Opportunities pipeline with live status composition, KPIs, breakdowns, ownership and weekly trend.',
    'system',
    'this_year', 'manual', v_owner, 'draft', v_owner, v_owner
  );

  -- ── Page ────────────────────────────────────────────────────────────────────
  INSERT INTO public.dashboard_page (
    dashboard_page_id, dashboard_id, name, display_name, page_order,
    is_default, is_hidden, background_config, canvas_config
  ) VALUES (
    v_page, v_dash, 'Overview', 'Overview', 0,
    true, false,
    $j${"color":"#f6f7fb"}$j$::jsonb,
    $j${"columns":24,"rowHeight":26,"gap":16,"width":1440,"heightMode":"auto","dashboardLayoutDirection":"left-to-right"}$j$::jsonb
  );

  -- ── Visuals ─────────────────────────────────────────────────────────────────
  INSERT INTO public.dashboard_visual (
    dashboard_visual_id, dashboard_page_id, dashboard_id, visual_type, title,
    x, y, width, height, min_width, min_height, z_index, is_visible, is_locked,
    query_config, data_config, format_config, interaction_config, filter_config
  ) VALUES

  -- Date-range slicer (global)
  ('5a1e0000-0000-4000-a000-000000000001', v_page, v_dash, 'timeline', 'Date range',
   0, 0, 24, 4, 6, 3, 0, true, false,
   $j${"entity":"lead"}$j$::jsonb,
   $j${"dateSlicer":{"dateField":"created_at","filterMode":"between","defaultRange":"this_year","granularity":"week","applyTo":"dashboard","filterScope":"dashboard","style":"button_presets","orientation":"horizontal","showClearButton":true,"showTodayButton":true,"showPresetRanges":true,"autoApply":true,"activePresetColor":"#eef1fe","activePresetTextColor":"#4f6df5","selectedRangeColor":"#4f6df5"}}$j$::jsonb,
   $j${"showHeader":false,"background":"#ffffff","borderColor":"#e9eaf0","borderRadius":16,"fontFamily":"'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  -- Hero funnel: Prospects -> Leads -> Opportunities with status composition
  ('5a1e0000-0000-4000-a000-000000000002', v_page, v_dash, 'funnel_stage', 'Pipeline Overview',
   0, 4, 24, 9, 12, 6, 0, true, false,
   '{}'::jsonb,
   $j${"stages":[{"id":"stage_prospects","label":"Prospects","entity":"crm_prospect","measure":"count","color":"#4f6df5","icon":"Users","totalLabel":"Prospects","displayMode":"breakdown","breakdownField":"status_reason","breakdownValues":["Active","In Progress","Converted to Lead","Inactive"],"showPercentages":true,"showProgressBars":true,"colorByValue":{"1":"#4f6df5","3":"#e08a2b","2":"#9aa0b4","7":"#8b5cf6"}},{"id":"stage_leads","label":"Leads","entity":"lead","measure":"count","color":"#8b5cf6","icon":"UserPlus","totalLabel":"Leads","displayMode":"breakdown","breakdownField":"status_reason","breakdownValues":["New","Qualified","Lost"],"showPercentages":true,"showProgressBars":true,"colorByValue":{"1":"#4f6df5","4":"#17a673","5":"#e35d5d"}},{"id":"stage_opps","label":"Opportunities","entity":"opportunity","measure":"count","color":"#12b3a6","icon":"Target","totalLabel":"Opportunities","displayMode":"breakdown","breakdownField":"status_reason","breakdownValues":["In Progress","Won","Canceled"],"showPercentages":true,"showProgressBars":true,"colorByValue":{"1":"#e08a2b","3":"#17a673","4":"#e35d5d"}}]}$j$::jsonb,
   $j${"showHeader":true,"funnelLayout":"horizontal","showArrows":true,"showConversion":true,"conversionDecimals":0,"showStageSubtitle":false,"scrollStages":true,"stageGap":8,"numberFormat":"number","arrowColor":"#4f6df5","background":"#ffffff","borderColor":"#e9eaf0","borderRadius":18,"titleColor":"#171a29","valueColor":"#171a29","breakdownTrackColor":"#eef0f6","fontFamily":"'Space Grotesk', 'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  -- KPI strip
  ('5a1e0000-0000-4000-a000-000000000010', v_page, v_dash, 'kpi', 'Products',
   0, 13, 5, 5, 3, 4, 0, true, false,
   $j${"entity":"product"}$j$::jsonb,
   $j${"kpiMode":"simple","mainAgg":"count","kpiLayout":"compact"}$j$::jsonb,
   $j${"showHeader":true,"numberFormat":"number","accentColor":"#4f6df5","background":"#ffffff","borderColor":"#e9eaf0","borderRadius":14,"titleColor":"#8a8fa3","valueColor":"#171a29","fontFamily":"'Space Grotesk', 'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  ('5a1e0000-0000-4000-a000-000000000011', v_page, v_dash, 'kpi', 'Accounts',
   5, 13, 5, 5, 3, 4, 0, true, false,
   $j${"entity":"account"}$j$::jsonb,
   $j${"kpiMode":"simple","mainAgg":"count","kpiLayout":"compact"}$j$::jsonb,
   $j${"showHeader":true,"numberFormat":"number","accentColor":"#8b5cf6","background":"#ffffff","borderColor":"#e9eaf0","borderRadius":14,"titleColor":"#8a8fa3","valueColor":"#171a29","fontFamily":"'Space Grotesk', 'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  ('5a1e0000-0000-4000-a000-000000000012', v_page, v_dash, 'kpi', 'Sources',
   10, 13, 5, 5, 3, 4, 0, true, false,
   $j${"entity":"lead"}$j$::jsonb,
   $j${"kpiMode":"simple","mainAgg":"count_distinct","mainField":"lead_source","kpiLayout":"compact"}$j$::jsonb,
   $j${"showHeader":true,"numberFormat":"number","accentColor":"#12b3a6","background":"#ffffff","borderColor":"#e9eaf0","borderRadius":14,"titleColor":"#8a8fa3","valueColor":"#171a29","fontFamily":"'Space Grotesk', 'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  ('5a1e0000-0000-4000-a000-000000000013', v_page, v_dash, 'kpi', 'Industries',
   15, 13, 5, 5, 3, 4, 0, true, false,
   $j${"entity":"account"}$j$::jsonb,
   $j${"kpiMode":"simple","mainAgg":"count_distinct","mainField":"industry","kpiLayout":"compact"}$j$::jsonb,
   $j${"showHeader":true,"numberFormat":"number","accentColor":"#e08a2b","background":"#ffffff","borderColor":"#e9eaf0","borderRadius":14,"titleColor":"#8a8fa3","valueColor":"#171a29","fontFamily":"'Space Grotesk', 'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  ('5a1e0000-0000-4000-a000-000000000014', v_page, v_dash, 'kpi', 'Campaigns',
   20, 13, 4, 5, 3, 4, 0, true, false,
   $j${"entity":"campaign"}$j$::jsonb,
   $j${"kpiMode":"simple","mainAgg":"count","kpiLayout":"compact"}$j$::jsonb,
   $j${"showHeader":true,"numberFormat":"number","accentColor":"#17a673","background":"#ffffff","borderColor":"#e9eaf0","borderRadius":14,"titleColor":"#8a8fa3","valueColor":"#171a29","fontFamily":"'Space Grotesk', 'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  -- Weekly trend + Lead sources donut
  ('5a1e0000-0000-4000-a000-000000000020', v_page, v_dash, 'area', 'Leads created / week',
   0, 18, 8, 7, 4, 5, 0, true, false,
   $j${"entity":"lead","groupBy":[{"field":"created_at","dateGrain":"week","alias":"created_at"}],"aggregations":[{"field":"*","fn":"count","alias":"count"}],"orderBy":[{"key":"created_at","dir":"asc"}]}$j$::jsonb,
   $j${"category":"created_at","values":[{"field":"*","fn":"count","alias":"count"}]}$j$::jsonb,
   $j${"showHeader":true,"showLegend":false,"seriesColors":["#8b5cf6"],"background":"#ffffff","borderColor":"#e9eaf0","borderRadius":16,"titleColor":"#171a29","gridLineColor":"#f0f1f6","fontFamily":"'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  ('5a1e0000-0000-4000-a000-000000000021', v_page, v_dash, 'area', 'Opportunities created / week',
   8, 18, 8, 7, 4, 5, 0, true, false,
   $j${"entity":"opportunity","groupBy":[{"field":"created_at","dateGrain":"week","alias":"created_at"}],"aggregations":[{"field":"*","fn":"count","alias":"count"}],"orderBy":[{"key":"created_at","dir":"asc"}]}$j$::jsonb,
   $j${"category":"created_at","values":[{"field":"*","fn":"count","alias":"count"}]}$j$::jsonb,
   $j${"showHeader":true,"showLegend":false,"seriesColors":["#12b3a6"],"background":"#ffffff","borderColor":"#e9eaf0","borderRadius":16,"titleColor":"#171a29","gridLineColor":"#f0f1f6","fontFamily":"'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  ('5a1e0000-0000-4000-a000-000000000022', v_page, v_dash, 'donut', 'Lead sources',
   16, 18, 8, 7, 4, 5, 0, true, false,
   $j${"entity":"lead"}$j$::jsonb,
   $j${"category":"lead_source","values":[{"field":"*","fn":"count","alias":"count"}]}$j$::jsonb,
   $j${"showHeader":true,"legendPosition":"right","seriesColors":["#4f6df5","#8b5cf6","#12b3a6","#e08a2b","#17a673","#e35d5d","#9aa0b4"],"background":"#ffffff","borderColor":"#e9eaf0","borderRadius":16,"titleColor":"#171a29","fontFamily":"'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  -- Industries donut + Top products / Top accounts bars
  ('5a1e0000-0000-4000-a000-000000000030', v_page, v_dash, 'donut', 'Industries',
   0, 25, 8, 9, 4, 5, 0, true, false,
   $j${"entity":"account"}$j$::jsonb,
   $j${"category":"industry","values":[{"field":"*","fn":"count","alias":"count"}]}$j$::jsonb,
   $j${"showHeader":true,"legendPosition":"right","seriesColors":["#4f6df5","#8b5cf6","#12b3a6","#e08a2b","#17a673","#e35d5d","#9aa0b4"],"background":"#ffffff","borderColor":"#e9eaf0","borderRadius":16,"titleColor":"#171a29","fontFamily":"'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  ('5a1e0000-0000-4000-a000-000000000031', v_page, v_dash, 'bar', 'Top products',
   8, 25, 8, 9, 4, 5, 0, true, false,
   $j${"entity":"opportunity","limit":8}$j$::jsonb,
   $j${"category":"product_id","values":[{"field":"*","fn":"count","alias":"count"}]}$j$::jsonb,
   $j${"showHeader":true,"showLegend":false,"orientation":"horizontal","seriesColors":["#4f6df5"],"background":"#ffffff","borderColor":"#e9eaf0","borderRadius":16,"titleColor":"#171a29","fontFamily":"'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  ('5a1e0000-0000-4000-a000-000000000032', v_page, v_dash, 'bar', 'Top accounts',
   16, 25, 8, 9, 4, 5, 0, true, false,
   $j${"entity":"opportunity","limit":8}$j$::jsonb,
   $j${"category":"account_id","values":[{"field":"*","fn":"count","alias":"count"}]}$j$::jsonb,
   $j${"showHeader":true,"showLegend":false,"orientation":"horizontal","seriesColors":["#12b3a6"],"background":"#ffffff","borderColor":"#e9eaf0","borderRadius":16,"titleColor":"#171a29","fontFamily":"'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  -- Ownership + campaigns breakdown cards
  ('5a1e0000-0000-4000-a000-000000000040', v_page, v_dash, 'kpi', 'Leads by owner',
   0, 34, 8, 9, 4, 5, 0, true, false,
   $j${"entity":"lead"}$j$::jsonb,
   $j${"kpiMode":"breakdown","mainAgg":"count","breakdownField":"owner_id","breakdownLimit":8,"breakdownSort":"value_desc","showPercentages":true,"kpiLayout":"detailed"}$j$::jsonb,
   $j${"showHeader":true,"numberFormat":"number","accentColor":"#8b5cf6","breakdownTrackColor":"#eef0f6","background":"#ffffff","borderColor":"#e9eaf0","borderRadius":16,"titleColor":"#171a29","valueColor":"#171a29","fontFamily":"'Space Grotesk', 'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  ('5a1e0000-0000-4000-a000-000000000041', v_page, v_dash, 'kpi', 'Opportunities by owner',
   8, 34, 8, 9, 4, 5, 0, true, false,
   $j${"entity":"opportunity"}$j$::jsonb,
   $j${"kpiMode":"breakdown","mainAgg":"count","breakdownField":"owner_id","breakdownLimit":8,"breakdownSort":"value_desc","showPercentages":true,"kpiLayout":"detailed"}$j$::jsonb,
   $j${"showHeader":true,"numberFormat":"number","accentColor":"#12b3a6","breakdownTrackColor":"#eef0f6","background":"#ffffff","borderColor":"#e9eaf0","borderRadius":16,"titleColor":"#171a29","valueColor":"#171a29","fontFamily":"'Space Grotesk', 'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb),

  ('5a1e0000-0000-4000-a000-000000000042', v_page, v_dash, 'kpi', 'Campaigns',
   16, 34, 8, 9, 4, 5, 0, true, false,
   $j${"entity":"lead"}$j$::jsonb,
   $j${"kpiMode":"breakdown","mainAgg":"count","breakdownField":"campaign_id","breakdownLimit":8,"breakdownSort":"value_desc","showPercentages":true,"kpiLayout":"detailed","totalLabel":"Active this period"}$j$::jsonb,
   $j${"showHeader":true,"numberFormat":"number","accentColor":"#4f6df5","breakdownTrackColor":"#eef0f6","background":"#ffffff","borderColor":"#e9eaf0","borderRadius":16,"titleColor":"#171a29","valueColor":"#171a29","fontFamily":"'Space Grotesk', 'IBM Plex Sans', sans-serif"}$j$::jsonb,
   '{}'::jsonb, '{}'::jsonb);

  RAISE NOTICE 'Sales Pipeline dashboard seeded (owner %).', v_owner;
END $SEED$;
