/*
  # Fix — Sales Pipeline "Pipeline Overview" funnel

  Patches the ALREADY-SEEDED funnel visual (the seed migration is idempotent and
  will not re-run on an instance where the dashboard already exists), so live
  deployments pick up two corrections without a manual re-import:

  1. True stage conversion — the connector between two cards now shows the share of
     the SOURCE stage that advanced (Prospects → "Converted to Lead", Leads →
     "Qualified"), not a raw cross-entity count ratio. This is what the funnel
     component reads from each stage's `conversionValue`. (The off-by-one that put
     the wrong number on the wrong arrow is fixed in FunnelStageVisual.tsx.)
  2. Fit to width — `fitStages` stretches the three cards to fill the card width
     instead of packing them left with dead space on the right.

  Targeted jsonb writes only (adds `conversionValue` to the first two stages and
  `fitStages` to the format), so any other user customization is preserved.
  Guarded on the seeded stage ids so a reordered/edited funnel is left untouched.
  Idempotent: re-running just re-sets the same keys.
*/

DO $FIX$
DECLARE
  v_visual uuid := '5a1e0000-0000-4000-a000-000000000002';
  v_data   jsonb;
BEGIN
  SELECT data_config INTO v_data
    FROM public.dashboard_visual
   WHERE dashboard_visual_id = v_visual;

  IF v_data IS NULL THEN
    RAISE NOTICE 'Sales Pipeline funnel fix skipped: visual % not present.', v_visual;
    RETURN;
  END IF;

  -- Only patch while the funnel still has its seeded shape (Prospects, Leads first).
  IF v_data #>> '{stages,0,id}' = 'stage_prospects'
     AND v_data #>> '{stages,1,id}' = 'stage_leads' THEN
    UPDATE public.dashboard_visual
       SET data_config = jsonb_set(
             jsonb_set(data_config, '{stages,0,conversionValue}', '"Converted to Lead"'::jsonb, true),
             '{stages,1,conversionValue}', '"Qualified"'::jsonb, true),
           format_config = format_config || '{"fitStages": true}'::jsonb,
           modified_at = now()
     WHERE dashboard_visual_id = v_visual;
    RAISE NOTICE 'Sales Pipeline funnel: conversion values + fitStages applied.';
  ELSE
    -- Shape changed (user edited/reordered) — only nudge the harmless layout flag.
    UPDATE public.dashboard_visual
       SET format_config = format_config || '{"fitStages": true}'::jsonb,
           modified_at = now()
     WHERE dashboard_visual_id = v_visual;
    RAISE NOTICE 'Sales Pipeline funnel edited by user: applied fitStages only.';
  END IF;

  -- ── KPI count-distinct cards pointed at dead/orphan columns ─────────────────
  -- dashboard_aggregate counts the field as a LITERAL physical column, so these
  -- counted empty leftover columns. Repoint at the columns that hold the data:
  --   Sources    : lead_source (empty) → leadsource (active lookup, 7 distinct)
  --   Industries : industry    (empty) → industry_id (active lookup, 9 distinct)
  -- Guarded on the current (wrong) value so a user re-point is never clobbered.
  UPDATE public.dashboard_visual
     SET data_config = jsonb_set(data_config, '{mainField}', '"leadsource"'::jsonb, true),
         modified_at = now()
   WHERE dashboard_visual_id = '5a1e0000-0000-4000-a000-000000000012'
     AND data_config->>'mainField' = 'lead_source';

  UPDATE public.dashboard_visual
     SET data_config = jsonb_set(data_config, '{mainField}', '"industry_id"'::jsonb, true),
         modified_at = now()
   WHERE dashboard_visual_id = '5a1e0000-0000-4000-a000-000000000013'
     AND data_config->>'mainField' = 'industry';

  -- ── Date slicer → granular Day/Week/Month/Year picker ───────────────────────
  -- Swap the whole-dashboard slicer from preset buttons to the new granular style
  -- (tabs + a specific day/week/month/year picker). Guarded on the old style so a
  -- user who already re-styled the slicer is not overridden.
  UPDATE public.dashboard_visual
     SET data_config = jsonb_set(
           jsonb_set(data_config, '{dateSlicer,style}', '"granular"'::jsonb, true),
           '{dateSlicer,granularity}', '"year"'::jsonb, true),
         modified_at = now()
   WHERE dashboard_visual_id = '5a1e0000-0000-4000-a000-000000000001'
     AND data_config #>> '{dateSlicer,style}' = 'button_presets';
END $FIX$;
