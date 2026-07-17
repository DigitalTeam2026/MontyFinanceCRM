/*
  # Make the "Sales Pipeline" dashboard follow the active app theme

  The dashboard was seeded (20260713140000) with concrete light-mode colours
  baked into every visual's format_config / data_config — white card backgrounds,
  dark title/value text, fixed series palettes, per-status breakdown colours, etc.

  At runtime every visual prefers a *saved* colour over the live theme fallback
  (see colorConfig.pick / DashboardViewer), so those baked snapshots froze the
  dashboard against theme switching: swapping to a dark theme left white cards
  with dark, unreadable text.

  This migration removes the baked colours so each visual falls back to the live
  ThemeConfig (useAppThemeConfig) — exactly like forms and list views. It runs
  AFTER the seed and every dashboard fix migration, so it corrects the already-
  deployed instance AND leaves fresh installs clean (the seed inserts, then this
  strips). Non-colour styling (borderRadius, fontFamily, layout, number format)
  is intentionally preserved. Scoped to the Sales Pipeline dashboard only.

  Idempotent: removing an absent jsonb key is a no-op, so re-running is safe.
*/

DO $THEME$
DECLARE
  v_dash uuid := '5a1e0000-0000-4000-a000-000000000000';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dashboard WHERE dashboard_id = v_dash) THEN
    RAISE NOTICE 'Sales Pipeline theme-colour strip skipped: dashboard not present.';
    RETURN;
  END IF;

  -- 1) Top-level format_config chrome + series colours → theme fallback.
  UPDATE public.dashboard_visual
     SET format_config = format_config - ARRAY[
           'background', 'borderColor', 'titleColor', 'valueColor',
           'accentColor', 'gridLineColor', 'seriesColors',
           'breakdownTrackColor', 'arrowColor', 'colorByValue'
         ]
   WHERE dashboard_id = v_dash;

  -- 2) Date slicer's baked accent colours (nested in data_config.dateSlicer).
  UPDATE public.dashboard_visual
     SET data_config = jsonb_set(
           data_config, '{dateSlicer}',
           (data_config -> 'dateSlicer')
             - 'activePresetColor' - 'activePresetTextColor' - 'selectedRangeColor'
         )
   WHERE dashboard_id = v_dash
     AND data_config ? 'dateSlicer'
     AND jsonb_typeof(data_config -> 'dateSlicer') = 'object';

  -- 3) Funnel per-stage accent + per-status breakdown colours
  --    (data_config.stages[].color / .colorByValue) → theme chart palette.
  UPDATE public.dashboard_visual
     SET data_config = jsonb_set(
           data_config, '{stages}',
           (SELECT jsonb_agg(elem - 'color' - 'colorByValue')
              FROM jsonb_array_elements(data_config -> 'stages') AS elem)
         )
   WHERE dashboard_id = v_dash
     AND data_config ? 'stages'
     AND jsonb_typeof(data_config -> 'stages') = 'array';

  RAISE NOTICE 'Sales Pipeline dashboard colours now follow the active theme.';
END $THEME$;
