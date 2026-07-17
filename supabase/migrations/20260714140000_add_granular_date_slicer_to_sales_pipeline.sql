/*
  # Add the granular Day/Week/Month/Year date filter to "Sales Pipeline"

  The dashboard's original top date slicer was removed on this instance (the
  funnel was pulled up to the top). This restores a date filter — using the new
  'granular' slicer style (Day / Week / Month / Year tabs + a picker for the
  specific day/week/month/year) — as a whole-dashboard filter.

  Runs ONLY when the dashboard currently has no timeline slicer, so:
    • fresh deploys (the seed already inserts a slicer) skip this cleanly;
    • this instance gets the slicer back once.
  Idempotent via that guard. Existing visuals shift down 2 rows to make room.
*/

DO $ADD$
DECLARE
  v_dash  uuid := '5a1e0000-0000-4000-a000-000000000000';
  v_page  uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dashboard WHERE dashboard_id = v_dash) THEN
    RETURN;
  END IF;
  -- Already has a date slicer? Leave the layout alone.
  IF EXISTS (SELECT 1 FROM public.dashboard_visual
              WHERE dashboard_id = v_dash AND visual_type = 'timeline') THEN
    RETURN;
  END IF;

  SELECT dashboard_page_id INTO v_page
    FROM public.dashboard_page WHERE dashboard_id = v_dash ORDER BY page_order LIMIT 1;
  IF v_page IS NULL THEN RETURN; END IF;

  -- Make room at the top (slicer is 2 rows tall; top visual currently sits at y=1,
  -- so shift by 1 → the top visual lands at y=2, directly under the slicer).
  UPDATE public.dashboard_visual
     SET y = y + 1, modified_at = now()
   WHERE dashboard_page_id = v_page;

  INSERT INTO public.dashboard_visual (
    dashboard_visual_id, dashboard_page_id, dashboard_id, visual_type, title,
    x, y, width, height, min_width, min_height, z_index, is_visible, is_locked,
    query_config, data_config, format_config, interaction_config, filter_config
  ) VALUES (
    '5a1e0000-0000-4000-a000-000000000001', v_page, v_dash, 'timeline', 'Date range',
    0, 0, 24, 2, 6, 2, 0, true, false,
    $j${"entity":"lead"}$j$::jsonb,
    $j${"dateSlicer":{"dateField":"created_at","filterMode":"between","defaultRange":"this_year","granularity":"year","applyTo":"dashboard","filterScope":"dashboard","style":"granular","orientation":"horizontal","showClearButton":true,"autoApply":true,"activePresetColor":"#eef1fe","activePresetTextColor":"#4f6df5","selectedRangeColor":"#4f6df5"}}$j$::jsonb,
    $j${"showHeader":false,"background":"#ffffff","borderColor":"#e9eaf0","borderRadius":16,"fontFamily":"'IBM Plex Sans', sans-serif"}$j$::jsonb,
    '{}'::jsonb, '{}'::jsonb
  );

  RAISE NOTICE 'Sales Pipeline: granular date slicer added.';
END $ADD$;
