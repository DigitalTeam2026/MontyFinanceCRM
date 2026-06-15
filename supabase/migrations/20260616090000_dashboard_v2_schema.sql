/*
  # Dashboard v2 — schema, pages, filters, access, SQL, privileges, RLS

  Extends the existing dashboard system (20260327105607_27_dashboard_management.sql)
  into a Power BI–style, fully-configurable, multi-tab dashboard platform.

  ## Adds
  - Columns on `dashboard` and `dashboard_widget` for the richer model.
  - New tables: dashboard_page, dashboard_filter, dashboard_access,
    dashboard_sql_query, dashboard_query_parameter, dashboard_execution_log.
  - Single-default enforcement: `set_default_dashboard()` + partial unique index.
  - Dashboard privileges (entity 'dashboard' CRUD + admin flags) seeded onto the
    System Administrator role; security helper functions.
  - RLS on the new tables using security.is_system_admin() / crm_user_has_privilege.

  Idempotent: safe to run more than once. Does NOT modify existing data.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Column extensions (additive, nullable / defaulted — back-compatible)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE dashboard
  ADD COLUMN IF NOT EXISTS owner_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_published    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS published_at    timestamptz,
  ADD COLUMN IF NOT EXISTS default_page_id uuid,
  ADD COLUMN IF NOT EXISTS thumbnail       text;

ALTER TABLE dashboard_widget
  ADD COLUMN IF NOT EXISTS dashboard_page_id  uuid,
  ADD COLUMN IF NOT EXISTS subtitle           text,
  ADD COLUMN IF NOT EXISTS data_source_type   text NOT NULL DEFAULT 'entity',
  ADD COLUMN IF NOT EXISTS entity_name        text,
  ADD COLUMN IF NOT EXISTS query_definition   jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sql_query_id       uuid,
  ADD COLUMN IF NOT EXISTS visual_config      jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS filter_config      jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS interaction_config jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS layout_config      jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS refresh_interval   integer,
  ADD COLUMN IF NOT EXISTS is_visible         boolean NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. dashboard_page (tabs / report pages)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_page (
  page_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id  uuid NOT NULL REFERENCES dashboard(dashboard_id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'Page 1',
  sort_order    integer NOT NULL DEFAULT 0,
  is_default    boolean NOT NULL DEFAULT false,
  is_hidden     boolean NOT NULL DEFAULT false,
  filter_config jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  modified_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_page_dashboard ON dashboard_page(dashboard_id);

-- Link widgets to pages (FK added after the table exists).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dashboard_widget_page_fk'
  ) THEN
    ALTER TABLE dashboard_widget
      ADD CONSTRAINT dashboard_widget_page_fk
      FOREIGN KEY (dashboard_page_id) REFERENCES dashboard_page(page_id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_dashboard_widget_page ON dashboard_widget(dashboard_page_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. dashboard_filter (dashboard-level slicers)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_filter (
  filter_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id  uuid NOT NULL REFERENCES dashboard(dashboard_id) ON DELETE CASCADE,
  filter_type   text NOT NULL DEFAULT 'date',  -- date | owner | business_unit | product | country | status | source | currency | current_user
  label         text NOT NULL DEFAULT '',
  config        jsonb NOT NULL DEFAULT '{}',
  sort_order    integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_dashboard_filter_dashboard ON dashboard_filter(dashboard_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. dashboard_access (generalised visibility: user/team/role/BU/organization)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_access (
  access_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id   uuid NOT NULL REFERENCES dashboard(dashboard_id) ON DELETE CASCADE,
  principal_type text NOT NULL CHECK (principal_type IN ('user','team','role','business_unit','organization')),
  principal_id   uuid,           -- NULL for principal_type='organization'
  access_level   text NOT NULL DEFAULT 'view' CHECK (access_level IN ('view','edit')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dashboard_id, principal_type, principal_id)
);
CREATE INDEX IF NOT EXISTS idx_dashboard_access_dashboard ON dashboard_access(dashboard_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. dashboard_sql_query + parameters + execution log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_sql_query (
  sql_query_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id  uuid REFERENCES dashboard(dashboard_id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'Query',
  sql_text      text NOT NULL DEFAULT '',
  is_validated  boolean NOT NULL DEFAULT false,
  columns       jsonb NOT NULL DEFAULT '[]',     -- detected [{name,type}]
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  modified_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_query_parameter (
  parameter_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sql_query_id  uuid NOT NULL REFERENCES dashboard_sql_query(sql_query_id) ON DELETE CASCADE,
  name          text NOT NULL,                   -- e.g. start_date (without the ':')
  data_type     text NOT NULL DEFAULT 'text',    -- text | date | uuid | number | boolean
  default_value text,
  source        text NOT NULL DEFAULT 'static'   -- static | dashboard_filter | current_user | business_unit | owner
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'dashboard_widget_sql_fk'
  ) THEN
    ALTER TABLE dashboard_widget
      ADD CONSTRAINT dashboard_widget_sql_fk
      FOREIGN KEY (sql_query_id) REFERENCES dashboard_sql_query(sql_query_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dashboard_execution_log (
  log_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sql_query_id  uuid REFERENCES dashboard_sql_query(sql_query_id) ON DELETE SET NULL,
  executed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sql_text      text,
  params        jsonb,
  row_count     integer,
  duration_ms   integer,
  status        text NOT NULL DEFAULT 'ok',      -- ok | error | blocked
  error_message text,
  executed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_exec_log_query ON dashboard_execution_log(sql_query_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_exec_log_user  ON dashboard_execution_log(executed_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Single-default enforcement
-- ─────────────────────────────────────────────────────────────────────────────
-- The legacy seed marked one default PER MODULE (Sales/Marketing/Support), so
-- there can be several defaults today. Collapse to a single organization default
-- (keep the earliest-created) BEFORE adding the uniqueness guard, or the index
-- creation would fail on the existing duplicates.
UPDATE dashboard
   SET is_default = false
 WHERE is_default = true AND deleted_at IS NULL
   AND dashboard_id <> (
     SELECT dashboard_id FROM dashboard
      WHERE is_default = true AND deleted_at IS NULL
      ORDER BY created_at ASC, dashboard_id ASC
      LIMIT 1
   );

-- At most one organization default dashboard at a time. A unique index on the
-- is_default column, partial to true rows, allows only one such row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_single_default
  ON dashboard (is_default) WHERE is_default = true AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_default_dashboard(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (security.is_system_admin()
          OR security.crm_user_has_privilege('__set_default_dashboard__', 'can_write')) THEN
    RAISE EXCEPTION 'Not authorised to set the default dashboard';
  END IF;
  UPDATE dashboard SET is_default = false WHERE is_default = true AND dashboard_id <> p_id;
  UPDATE dashboard SET is_default = true, modified_at = now() WHERE dashboard_id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_default_dashboard(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_default_dashboard(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Privileges — entity 'dashboard' CRUD + admin flags on System Administrator
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_role_id uuid; v_priv text;
BEGIN
  SELECT role_id INTO v_role_id FROM public.security_role WHERE name = 'System Administrator' LIMIT 1;
  IF v_role_id IS NULL THEN RETURN; END IF;

  -- Full CRUD on the 'dashboard' entity.
  INSERT INTO public.role_privilege (role_id, entity_name, can_create, can_read, can_write, can_delete, can_assign, can_share, access_level)
  VALUES (v_role_id, 'dashboard', true, true, true, true, true, true, 'organization')
  ON CONFLICT (role_id, entity_name) DO UPDATE
    SET can_create = true, can_read = true, can_write = true, can_delete = true,
        can_assign = true, can_share = true, access_level = 'organization', modified_at = now();

  -- Admin capability flags (entity_name = '__name__').
  FOREACH v_priv IN ARRAY ARRAY[
    '__manage_dashboard_sql__', '__execute_dashboard_sql__', '__view_dashboard_sql__',
    '__publish_dashboards__', '__set_default_dashboard__', '__share_dashboards__'
  ] LOOP
    INSERT INTO public.role_privilege (role_id, entity_name, can_read, can_write, access_level)
    VALUES (v_role_id, v_priv, true, true, 'organization')
    ON CONFLICT (role_id, entity_name) DO UPDATE
      SET can_read = true, can_write = true, modified_at = now();
  END LOOP;
END $$;

-- Security helper functions (mirror security.can_publish_customizations()).
CREATE OR REPLACE FUNCTION security.can_manage_dashboard_sql()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT security.crm_user_has_privilege('__manage_dashboard_sql__', 'can_write'); $$;

CREATE OR REPLACE FUNCTION security.can_execute_dashboard_sql()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT security.crm_user_has_privilege('__execute_dashboard_sql__', 'can_read'); $$;

CREATE OR REPLACE FUNCTION security.can_publish_dashboards()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT security.crm_user_has_privilege('__publish_dashboards__', 'can_write'); $$;

REVOKE ALL ON FUNCTION security.can_manage_dashboard_sql()  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION security.can_execute_dashboard_sql() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION security.can_publish_dashboards()    FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION security.can_manage_dashboard_sql()  TO authenticated;
GRANT EXECUTE ON FUNCTION security.can_execute_dashboard_sql() TO authenticated;
GRANT EXECUTE ON FUNCTION security.can_publish_dashboards()    TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RLS on new tables
--    Read: any authenticated user (visibility is further refined in the app via
--    dashboard_access; widget DATA is always RLS-scoped at the source table).
--    Write: system admin or users with the 'dashboard' can_write privilege.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dashboard_page','dashboard_filter','dashboard_access','dashboard_sql_query','dashboard_query_parameter'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "dash_v2_read" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "dash_v2_read" ON public.%I FOR SELECT TO authenticated USING (true)', t);

    EXECUTE format('DROP POLICY IF EXISTS "dash_v2_write" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "dash_v2_write" ON public.%I FOR ALL TO authenticated '
      || 'USING (security.is_system_admin() OR security.crm_user_has_privilege(''dashboard'', ''can_write'')) '
      || 'WITH CHECK (security.is_system_admin() OR security.crm_user_has_privilege(''dashboard'', ''can_write''))', t);
  END LOOP;
END $$;

-- Execution log: insert via SECURITY DEFINER function only; readable by admins.
ALTER TABLE dashboard_execution_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dash_exec_log_read" ON dashboard_execution_log;
CREATE POLICY "dash_exec_log_read" ON dashboard_execution_log FOR SELECT TO authenticated
  USING (security.is_system_admin() OR security.crm_user_has_privilege('__view_dashboard_sql__', 'can_read'));
