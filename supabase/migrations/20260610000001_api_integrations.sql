/*
  # API Integrations

  Tables for configuring, executing, and logging HTTP API integrations
  triggered by CRM entity events or manually via the Admin Studio.

  Tables:
  - api_integration        : integration config (entity, method, URL, auth, body mapping)
  - api_integration_header : per-integration custom HTTP headers
  - api_integration_log    : execution history (request/response, secrets masked)

  Security:
  - All tables restricted to system admins (security.is_system_admin())
  - auth_secret excluded from standard SELECT columns; only edge function reads it
    via service_role key, which bypasses RLS
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. api_integration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.api_integration (
  api_integration_id   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text        NOT NULL,
  description          text,
  entity_id            uuid        NOT NULL
                                     REFERENCES public.entity_definition(entity_definition_id),
  http_method          text        NOT NULL DEFAULT 'POST'
                                     CHECK (http_method IN ('GET','POST','PUT','PATCH','DELETE')),
  endpoint_url         text        NOT NULL DEFAULT '',
  is_active            boolean     NOT NULL DEFAULT true,
  trigger_event        text        NOT NULL DEFAULT 'manual'
                                     CHECK (trigger_event IN ('created','updated','deleted','manual')),
  -- Authentication
  auth_type            text        NOT NULL DEFAULT 'none'
                                     CHECK (auth_type IN ('none','api_key','bearer','basic','custom_header')),
  auth_secret          text,       -- never returned in standard queries; read only by edge function
  auth_key_name        text,       -- header name for api_key / custom_header
  auth_username        text,       -- username for Basic auth
  -- Body builder config stored as JSONB
  body_config          jsonb       NOT NULL DEFAULT '{"fields":[],"exclude_null_fields":true}'::jsonb,
  -- Audit
  created_at           timestamptz NOT NULL DEFAULT now(),
  modified_at          timestamptz NOT NULL DEFAULT now(),
  created_by           uuid        REFERENCES public.crm_user(user_id),
  is_deleted           boolean     NOT NULL DEFAULT false
);

ALTER TABLE public.api_integration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_integration_admin_all" ON public.api_integration
  TO authenticated
  USING  (security.is_system_admin())
  WITH CHECK (security.is_system_admin());

CREATE INDEX idx_api_integration_entity
  ON public.api_integration (entity_id);
CREATE INDEX idx_api_integration_active
  ON public.api_integration (is_active, is_deleted);

CREATE TRIGGER trg_api_integration_modified_at
  BEFORE UPDATE ON public.api_integration
  FOR EACH ROW EXECUTE FUNCTION public.set_modified_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. api_integration_header
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.api_integration_header (
  api_integration_header_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_integration_id        uuid        NOT NULL
                                          REFERENCES public.api_integration(api_integration_id)
                                          ON DELETE CASCADE,
  header_key                text        NOT NULL,
  header_value              text        NOT NULL DEFAULT '',
  is_secret                 boolean     NOT NULL DEFAULT false,
  sort_order                integer     NOT NULL DEFAULT 0
);

ALTER TABLE public.api_integration_header ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_integration_header_admin_all" ON public.api_integration_header
  TO authenticated
  USING  (security.is_system_admin())
  WITH CHECK (security.is_system_admin());

CREATE INDEX idx_api_integration_header_parent
  ON public.api_integration_header (api_integration_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. api_integration_log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.api_integration_log (
  api_integration_log_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_integration_id     uuid        NOT NULL
                                       REFERENCES public.api_integration(api_integration_id)
                                       ON DELETE CASCADE,
  record_id              text,        -- record PK value (text to support any entity PK)
  triggered_by           uuid        REFERENCES public.crm_user(user_id),
  triggered_at           timestamptz NOT NULL DEFAULT now(),
  trigger_event          text,
  request_url            text,
  request_method         text,
  request_headers_json   jsonb,       -- auth secrets replaced with ●●●●●●●●
  request_body_json      jsonb,
  response_status        integer,
  response_body          text,
  is_success             boolean     NOT NULL DEFAULT false,
  error_message          text,
  duration_ms            integer
);

ALTER TABLE public.api_integration_log ENABLE ROW LEVEL SECURITY;

-- Admins read all logs
CREATE POLICY "api_integration_log_admin_select" ON public.api_integration_log
  FOR SELECT TO authenticated
  USING (security.is_system_admin());

-- Edge function inserts via service_role (bypasses RLS); this policy covers
-- any future authenticated insert path
CREATE POLICY "api_integration_log_admin_insert" ON public.api_integration_log
  FOR INSERT TO authenticated
  WITH CHECK (security.is_system_admin());

CREATE INDEX idx_api_integration_log_parent
  ON public.api_integration_log (api_integration_id);
CREATE INDEX idx_api_integration_log_triggered_at
  ON public.api_integration_log (triggered_at DESC);
CREATE INDEX idx_api_integration_log_record
  ON public.api_integration_log (record_id);
