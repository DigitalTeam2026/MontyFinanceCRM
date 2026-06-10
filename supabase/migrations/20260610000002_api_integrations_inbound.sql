/*
  # API Integrations — Incoming direction & generated endpoints

  Extends the api_integration feature to support:
  - Bidirectional integrations (outgoing webhook / incoming API)
  - A backend-generated, unique, secure endpoint key per integration
  - Incoming property → CRM field mapping config (inbound_config)
  - Create / Update / Upsert operations for incoming calls
  - last_request_at tracking for the endpoint panel

  The incoming endpoint is served by the public `api-integration-inbound`
  edge function, which resolves an integration by endpoint_key using the
  service role (bypassing RLS) and validates the caller's configured auth.
*/

-- gen_random_bytes() for cryptographically secure endpoint keys
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New columns on api_integration
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.api_integration
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outgoing'
    CHECK (direction IN ('outgoing','incoming')),
  ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'create'
    CHECK (operation IN ('create','update','upsert')),
  ADD COLUMN IF NOT EXISTS endpoint_key text,
  ADD COLUMN IF NOT EXISTS inbound_config jsonb NOT NULL
    DEFAULT '{"fields":[],"match_field":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_request_at timestamptz;

-- Backfill a unique key for every existing row, then enforce NOT NULL + UNIQUE.
-- gen_random_bytes() is schema-qualified (extensions.) so the default can never
-- fail on a role whose search_path omits the extensions schema.
UPDATE public.api_integration
  SET endpoint_key = encode(extensions.gen_random_bytes(24), 'hex')
  WHERE endpoint_key IS NULL;

ALTER TABLE public.api_integration
  ALTER COLUMN endpoint_key SET DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  ALTER COLUMN endpoint_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_integration_endpoint_key
  ON public.api_integration (endpoint_key);

-- Fast lookup for the inbound function: active, non-deleted, incoming.
CREATE INDEX IF NOT EXISTS idx_api_integration_inbound
  ON public.api_integration (direction, is_active, is_deleted);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Direction column on the log table (for filtering incoming vs outgoing)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.api_integration_log
  ADD COLUMN IF NOT EXISTS direction text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Regenerate endpoint key (admin only). Rotating the key immediately
--    invalidates the previous endpoint URL.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.regenerate_api_integration_endpoint_key(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
DECLARE
  v_key text;
BEGIN
  IF NOT security.is_system_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  v_key := encode(extensions.gen_random_bytes(24), 'hex');

  UPDATE public.api_integration
    SET endpoint_key = v_key
    WHERE api_integration_id = p_id
      AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integration not found';
  END IF;

  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_api_integration_endpoint_key(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_api_integration_endpoint_key(uuid) TO authenticated;
