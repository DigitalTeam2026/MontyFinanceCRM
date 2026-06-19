/*
  # Dashboard is_default flag

  Adds the org-wide "default dashboard" flag used by the Sales surface to pick
  which published dashboard to show by default. A partial unique index enforces
  at most one default at a time (setDefaultDashboard clears others first).
*/
ALTER TABLE public.dashboard
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_single_default
  ON public.dashboard (is_default) WHERE is_default = true;

NOTIFY pgrst, 'reload schema';
