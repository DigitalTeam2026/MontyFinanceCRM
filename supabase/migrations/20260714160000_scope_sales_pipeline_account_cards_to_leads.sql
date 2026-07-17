/*
  # Scope the Sales Pipeline "account" cards to lead-linked accounts

  The Accounts KPI, Industries donut and Industries KPI aggregate the WHOLE
  account master table, so they surface industries/accounts that no lead points
  at. This adds a reverse relationship filter — "only accounts a lead references"
  (via lead.account_id) — so all three reflect the pipeline:

    • Accounts (KPI)     → count of accounts that belong to a lead
    • Industries (donut) → those accounts grouped by industry_id (accounts / industry)
    • Industries (KPI)   → distinct industries among those accounts

  Relies on the reverse-hop support added in dashboard_build_related_predicate.
  Guarded on the absence of relatedFilters so a user's own edit is not clobbered.
  Idempotent.
*/

DO $SCOPE$
DECLARE
  v_rf jsonb := $j$[{"path":[{"entity":"lead","fk":"account_id","direction":"reverse"}],"field":"account_id","op":"is_not_empty"}]$j$::jsonb;
BEGIN
  UPDATE public.dashboard_visual
     SET query_config = jsonb_set(query_config, '{relatedFilters}', v_rf, true),
         modified_at = now()
   WHERE dashboard_visual_id IN (
           '5a1e0000-0000-4000-a000-000000000011',  -- Accounts (KPI)
           '5a1e0000-0000-4000-a000-000000000030',  -- Industries (donut)
           '5a1e0000-0000-4000-a000-000000000013'   -- Industries (KPI)
         )
     AND query_config->>'entity' = 'account'
     AND NOT (query_config ? 'relatedFilters');
END $SCOPE$;
