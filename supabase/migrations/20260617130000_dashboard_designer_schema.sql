/*
  # Dashboard Designer — schema

  Native, Power BI-style dashboard builder. Three layers:
    1. Definition  — these typed tables (+ JSONB only for flexible designer config)
    2. Query engine — see 20260617130100_dashboard_aggregate_rpc.sql
    3. Renderer    — frontend visual registry

  Object-level access is governed by ownership + dashboard_permission rows +
  security.is_system_admin(). RUNTIME DATA is governed by each CRM entity's own
  RLS, enforced by the SECURITY INVOKER aggregate RPC (separate migration) — a
  dashboard can never surface records the user can't already see on the entity.

  Prerequisite: the dashboard teardown (20260617120000) must be applied first so
  the old dashboard/dashboard_page/dashboard_filter tables are gone before these
  same-named tables are recreated under the new design.

  Conventions follow 20260604080319_timeline_feature.sql:
  gen_random_uuid() PKs, audit columns, idx_* indexes, IF NOT EXISTS guards,
  RLS policies that call security.is_system_admin().
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Access helper — central authority for "can this user <action> this dashboard"
--    SECURITY DEFINER so it can read dashboard_permission regardless of that
--    table's own RLS (prevents recursive policy evaluation).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION security.dashboard_can(p_dashboard_id uuid, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, security, pg_temp
AS $$
DECLARE
  v_owner   uuid;
  v_user_bu uuid;
BEGIN
  IF p_dashboard_id IS NULL THEN RETURN false; END IF;

  -- System admins can do anything.
  IF EXISTS (SELECT 1 FROM public.crm_user cu
             WHERE cu.user_id = auth.uid() AND cu.is_system_admin = true) THEN
    RETURN true;
  END IF;

  SELECT owner_id INTO v_owner FROM public.dashboard
   WHERE dashboard_id = p_dashboard_id AND deleted_at IS NULL;
  IF v_owner IS NULL THEN RETURN false; END IF;          -- missing / deleted
  IF v_owner = auth.uid() THEN RETURN true; END IF;       -- owners have full control

  SELECT cu.business_unit_id INTO v_user_bu
    FROM public.crm_user cu WHERE cu.user_id = auth.uid();

  RETURN EXISTS (
    SELECT 1 FROM public.dashboard_permission dp
    WHERE dp.dashboard_id = p_dashboard_id
      AND CASE p_action
        WHEN 'read'    THEN dp.can_read
        WHEN 'write'   THEN dp.can_write
        WHEN 'delete'  THEN dp.can_delete
        WHEN 'publish' THEN dp.can_publish
        WHEN 'share'   THEN dp.can_share
        WHEN 'export'  THEN dp.can_export
        ELSE false
      END = true
      AND (
            (dp.principal_type = 'user' AND dp.principal_id = auth.uid())
         OR (dp.principal_type = 'team' AND EXISTS (
              SELECT 1 FROM public.team_user tu
              WHERE tu.team_id = dp.principal_id AND tu.user_id = auth.uid()))
         OR (dp.principal_type = 'role' AND EXISTS (
              SELECT 1 FROM public.user_security_role usr
              WHERE usr.role_id = dp.principal_id AND usr.user_id = auth.uid()))
         OR (dp.principal_type = 'business_unit' AND dp.principal_id = v_user_bu)
      )
  );
END;
$$;
REVOKE ALL ON FUNCTION security.dashboard_can(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION security.dashboard_can(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. dashboard  (root)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dashboard (
  dashboard_id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text        NOT NULL,
  description            text        NOT NULL DEFAULT '',
  dashboard_type         text        NOT NULL DEFAULT 'system'
                           CHECK (dashboard_type IN ('system','personal','team','role','business_unit')),
  primary_entity_id      uuid        REFERENCES public.entity_definition(entity_definition_id) ON DELETE SET NULL,
  default_date_field_id  uuid        REFERENCES public.field_definition(field_definition_id) ON DELETE SET NULL,
  default_date_range     text        NOT NULL DEFAULT 'this_month',
  theme_id               uuid,       -- FK added after dashboard_theme exists
  refresh_interval       text        NOT NULL DEFAULT 'manual'
                           CHECK (refresh_interval IN ('manual','1m','5m','15m','30m','1h','disabled')),
  owner_id               uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  business_unit_id       uuid        REFERENCES public.business_unit(business_unit_id) ON DELETE SET NULL,
  status                 text        NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','published')),
  published_version_id   uuid,       -- FK added after dashboard_version exists
  created_by             uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  modified_by            uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  modified_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);
CREATE INDEX IF NOT EXISTS idx_dashboard_owner    ON public.dashboard (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dashboard_status   ON public.dashboard (status)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dashboard_bu       ON public.dashboard (business_unit_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. dashboard_theme
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dashboard_theme (
  theme_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  theme_config  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_system     boolean     NOT NULL DEFAULT false,
  created_by    uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  modified_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard
  DROP CONSTRAINT IF EXISTS dashboard_theme_id_fkey,
  ADD  CONSTRAINT dashboard_theme_id_fkey
       FOREIGN KEY (theme_id) REFERENCES public.dashboard_theme(theme_id) ON DELETE SET NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. dashboard_page
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dashboard_page (
  dashboard_page_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id       uuid        NOT NULL REFERENCES public.dashboard(dashboard_id) ON DELETE CASCADE,
  name               text        NOT NULL DEFAULT 'Page',
  display_name       text        NOT NULL DEFAULT 'Page',
  page_order         int         NOT NULL DEFAULT 0,
  icon               text,
  is_default         boolean     NOT NULL DEFAULT false,
  is_hidden          boolean     NOT NULL DEFAULT false,
  background_config  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  canvas_config      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  modified_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_page_dashboard ON public.dashboard_page (dashboard_id, page_order);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_page_order ON public.dashboard_page (dashboard_id, page_order);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. dashboard_visual  (dashboard_id denormalized for fast RLS + queries)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dashboard_visual (
  dashboard_visual_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_page_id    uuid        NOT NULL REFERENCES public.dashboard_page(dashboard_page_id) ON DELETE CASCADE,
  dashboard_id         uuid        NOT NULL REFERENCES public.dashboard(dashboard_id) ON DELETE CASCADE,
  visual_type          text        NOT NULL,
  title                text        NOT NULL DEFAULT '',
  x                    int         NOT NULL DEFAULT 0,
  y                    int         NOT NULL DEFAULT 0,
  width                int         NOT NULL DEFAULT 6,
  height               int         NOT NULL DEFAULT 4,
  min_width            int         NOT NULL DEFAULT 2,
  min_height           int         NOT NULL DEFAULT 2,
  z_index              int         NOT NULL DEFAULT 0,
  is_visible           boolean     NOT NULL DEFAULT true,
  is_locked            boolean     NOT NULL DEFAULT false,
  query_config         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  data_config          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  format_config        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  interaction_config   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  filter_config        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  modified_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_visual_page      ON public.dashboard_visual (dashboard_page_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_visual_dashboard ON public.dashboard_visual (dashboard_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. dashboard_filter
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dashboard_filter (
  dashboard_filter_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id         uuid        NOT NULL REFERENCES public.dashboard(dashboard_id) ON DELETE CASCADE,
  dashboard_page_id    uuid        REFERENCES public.dashboard_page(dashboard_page_id) ON DELETE CASCADE,
  dashboard_visual_id  uuid        REFERENCES public.dashboard_visual(dashboard_visual_id) ON DELETE CASCADE,
  filter_level         text        NOT NULL DEFAULT 'global'
                         CHECK (filter_level IN ('global','page','visual','drillthrough')),
  entity_id            uuid        REFERENCES public.entity_definition(entity_definition_id) ON DELETE SET NULL,
  field_id             uuid        REFERENCES public.field_definition(field_definition_id) ON DELETE SET NULL,
  operator             text        NOT NULL DEFAULT 'eq',
  value_config         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  filter_group         int         NOT NULL DEFAULT 0,
  logical_operator     text        NOT NULL DEFAULT 'and' CHECK (logical_operator IN ('and','or')),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_filter_dashboard ON public.dashboard_filter (dashboard_id, filter_level);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. dashboard_measure
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dashboard_measure (
  dashboard_measure_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id         uuid        NOT NULL REFERENCES public.dashboard(dashboard_id) ON DELETE CASCADE,
  name                 text        NOT NULL,
  display_name         text        NOT NULL DEFAULT '',
  data_type            text        NOT NULL DEFAULT 'number'
                         CHECK (data_type IN ('number','percentage','currency')),
  expression_config    jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- safe AST, never raw JS
  format_config        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  modified_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_measure_dashboard ON public.dashboard_measure (dashboard_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_measure_name ON public.dashboard_measure (dashboard_id, name);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. dashboard_permission
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dashboard_permission (
  dashboard_permission_id uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id   uuid     NOT NULL REFERENCES public.dashboard(dashboard_id) ON DELETE CASCADE,
  principal_type text     NOT NULL CHECK (principal_type IN ('user','team','role','business_unit')),
  principal_id   uuid     NOT NULL,
  can_read       boolean  NOT NULL DEFAULT true,
  can_write      boolean  NOT NULL DEFAULT false,
  can_delete     boolean  NOT NULL DEFAULT false,
  can_publish    boolean  NOT NULL DEFAULT false,
  can_share      boolean  NOT NULL DEFAULT false,
  can_export     boolean  NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_permission_dashboard ON public.dashboard_permission (dashboard_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_permission_principal
  ON public.dashboard_permission (dashboard_id, principal_type, principal_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. dashboard_version  (immutable published snapshots)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dashboard_version (
  dashboard_version_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id         uuid        NOT NULL REFERENCES public.dashboard(dashboard_id) ON DELETE CASCADE,
  version_number       int         NOT NULL,
  definition_json      jsonb       NOT NULL,
  status               text        NOT NULL DEFAULT 'published'
                         CHECK (status IN ('draft','published','archived')),
  published_on         timestamptz,
  published_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_dashboard_version_dashboard ON public.dashboard_version (dashboard_id, version_number DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_version_number ON public.dashboard_version (dashboard_id, version_number);

ALTER TABLE public.dashboard
  DROP CONSTRAINT IF EXISTS dashboard_published_version_fkey,
  ADD  CONSTRAINT dashboard_published_version_fkey
       FOREIGN KEY (published_version_id) REFERENCES public.dashboard_version(dashboard_version_id) ON DELETE SET NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. dashboard_user_state  (per-user runtime preferences)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dashboard_user_state (
  dashboard_user_state_id uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id       uuid          NOT NULL REFERENCES public.dashboard(dashboard_id) ON DELETE CASCADE,
  user_id            uuid          NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_filters      jsonb         NOT NULL DEFAULT '{}'::jsonb,
  selected_page_id   uuid,
  layout_preferences jsonb         NOT NULL DEFAULT '{}'::jsonb,
  last_opened_on     timestamptz   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_user_state ON public.dashboard_user_state (dashboard_id, user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 10. modified_at touch trigger (shared)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.dashboard_touch_modified()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.modified_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dashboard','dashboard_page','dashboard_visual','dashboard_measure','dashboard_theme']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON public.%I '
                || 'FOR EACH ROW EXECUTE FUNCTION public.dashboard_touch_modified()', t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 11. Row Level Security
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.dashboard            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_page       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_visual     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_filter     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_measure    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_version    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_user_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_theme      ENABLE ROW LEVEL SECURITY;

-- ── dashboard (root) ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS dash_sel ON public.dashboard;
CREATE POLICY dash_sel ON public.dashboard FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND security.dashboard_can(dashboard_id, 'read'));

DROP POLICY IF EXISTS dash_ins ON public.dashboard;
CREATE POLICY dash_ins ON public.dashboard FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (owner_id = auth.uid() OR security.is_system_admin()));

DROP POLICY IF EXISTS dash_upd ON public.dashboard;
CREATE POLICY dash_upd ON public.dashboard FOR UPDATE TO authenticated
  USING (security.dashboard_can(dashboard_id, 'write'))
  WITH CHECK (security.dashboard_can(dashboard_id, 'write') AND modified_by = auth.uid());

DROP POLICY IF EXISTS dash_del ON public.dashboard;
CREATE POLICY dash_del ON public.dashboard FOR DELETE TO authenticated
  USING (security.dashboard_can(dashboard_id, 'delete'));

-- ── child tables gated by parent dashboard access (read=read, write/ins/upd/del=write) ─
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dashboard_page','dashboard_visual','dashboard_filter','dashboard_measure']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %s_sel ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %s_sel ON public.%I FOR SELECT TO authenticated '
                || 'USING (security.dashboard_can(dashboard_id, ''read''))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_ins ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %s_ins ON public.%I FOR INSERT TO authenticated '
                || 'WITH CHECK (security.dashboard_can(dashboard_id, ''write''))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_upd ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %s_upd ON public.%I FOR UPDATE TO authenticated '
                || 'USING (security.dashboard_can(dashboard_id, ''write'')) '
                || 'WITH CHECK (security.dashboard_can(dashboard_id, ''write''))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %s_del ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %s_del ON public.%I FOR DELETE TO authenticated '
                || 'USING (security.dashboard_can(dashboard_id, ''write''))', t, t);
  END LOOP;
END $do$;

-- ── dashboard_version (read with dashboard read; create with publish) ─────────
DROP POLICY IF EXISTS dashver_sel ON public.dashboard_version;
CREATE POLICY dashver_sel ON public.dashboard_version FOR SELECT TO authenticated
  USING (security.dashboard_can(dashboard_id, 'read'));
DROP POLICY IF EXISTS dashver_ins ON public.dashboard_version;
CREATE POLICY dashver_ins ON public.dashboard_version FOR INSERT TO authenticated
  WITH CHECK (security.dashboard_can(dashboard_id, 'publish') OR security.dashboard_can(dashboard_id, 'write'));
DROP POLICY IF EXISTS dashver_del ON public.dashboard_version;
CREATE POLICY dashver_del ON public.dashboard_version FOR DELETE TO authenticated
  USING (security.dashboard_can(dashboard_id, 'write'));

-- ── dashboard_permission (read with dashboard read; manage with share) ────────
DROP POLICY IF EXISTS dashperm_sel ON public.dashboard_permission;
CREATE POLICY dashperm_sel ON public.dashboard_permission FOR SELECT TO authenticated
  USING (security.dashboard_can(dashboard_id, 'read')
         OR (principal_type = 'user' AND principal_id = auth.uid()));
DROP POLICY IF EXISTS dashperm_ins ON public.dashboard_permission;
CREATE POLICY dashperm_ins ON public.dashboard_permission FOR INSERT TO authenticated
  WITH CHECK (security.dashboard_can(dashboard_id, 'share'));
DROP POLICY IF EXISTS dashperm_upd ON public.dashboard_permission;
CREATE POLICY dashperm_upd ON public.dashboard_permission FOR UPDATE TO authenticated
  USING (security.dashboard_can(dashboard_id, 'share'))
  WITH CHECK (security.dashboard_can(dashboard_id, 'share'));
DROP POLICY IF EXISTS dashperm_del ON public.dashboard_permission;
CREATE POLICY dashperm_del ON public.dashboard_permission FOR DELETE TO authenticated
  USING (security.dashboard_can(dashboard_id, 'share'));

-- ── dashboard_user_state (strictly per-user) ─────────────────────────────────
DROP POLICY IF EXISTS dashstate_all ON public.dashboard_user_state;
CREATE POLICY dashstate_all ON public.dashboard_user_state FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── dashboard_theme (everyone reads; admin or author manages non-system) ──────
DROP POLICY IF EXISTS dashtheme_sel ON public.dashboard_theme;
CREATE POLICY dashtheme_sel ON public.dashboard_theme FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS dashtheme_ins ON public.dashboard_theme;
CREATE POLICY dashtheme_ins ON public.dashboard_theme FOR INSERT TO authenticated
  WITH CHECK (security.is_system_admin() OR (created_by = auth.uid() AND is_system = false));
DROP POLICY IF EXISTS dashtheme_upd ON public.dashboard_theme;
CREATE POLICY dashtheme_upd ON public.dashboard_theme FOR UPDATE TO authenticated
  USING (security.is_system_admin() OR (created_by = auth.uid() AND is_system = false))
  WITH CHECK (security.is_system_admin() OR (created_by = auth.uid() AND is_system = false));
DROP POLICY IF EXISTS dashtheme_del ON public.dashboard_theme;
CREATE POLICY dashtheme_del ON public.dashboard_theme FOR DELETE TO authenticated
  USING (security.is_system_admin() OR (created_by = auth.uid() AND is_system = false));

-- ════════════════════════════════════════════════════════════════════════════
-- 12. Seed system themes — CRM Dark + CRM Light
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.dashboard_theme (name, is_system, theme_config)
SELECT 'CRM Dark', true, jsonb_build_object(
  'pageBackground','#0b1220','surfaceBackground','#111a2e','cardBackground','#16213e',
  'primaryText','#e7ecf5','secondaryText','#8b97b0','borderColor','#243049',
  'gridLineColor','#243049','primaryAccent','#4f8cff','secondaryAccent','#7c5cff',
  'success','#22c55e','warning','#f59e0b','error','#ef4444',
  'chartPalette', jsonb_build_array('#4f8cff','#7c5cff','#22c55e','#f59e0b','#ef4444','#14b8a6','#ec4899','#eab308'),
  'fontFamily','Inter, system-ui, sans-serif','borderRadius',12,'shadow','0 1px 3px rgba(0,0,0,0.4)')
WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_theme WHERE name = 'CRM Dark');

INSERT INTO public.dashboard_theme (name, is_system, theme_config)
SELECT 'CRM Light', true, jsonb_build_object(
  'pageBackground','#f1f5f9','surfaceBackground','#ffffff','cardBackground','#ffffff',
  'primaryText','#0f172a','secondaryText','#64748b','borderColor','#e2e8f0',
  'gridLineColor','#e2e8f0','primaryAccent','#2563eb','secondaryAccent','#7c3aed',
  'success','#16a34a','warning','#d97706','error','#dc2626',
  'chartPalette', jsonb_build_array('#2563eb','#7c3aed','#16a34a','#d97706','#dc2626','#0d9488','#db2777','#ca8a04'),
  'fontFamily','Inter, system-ui, sans-serif','borderRadius',12,'shadow','0 1px 3px rgba(0,0,0,0.08)')
WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_theme WHERE name = 'CRM Light');
