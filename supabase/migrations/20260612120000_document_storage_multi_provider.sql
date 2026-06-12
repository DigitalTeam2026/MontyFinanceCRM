/*
  # Multi-provider document storage (Local / NAS / S3 / SharePoint)

  Builds on 20260611140000_document_location_storage.sql and
  20260611150000_document_storage_access_control.sql.

  1. storage_type per entity
    - document_location_config.storage_type: 'local' | 'nas' | 's3' | 'sharepoint'
      (default 'local'). root_location holds the folder path (local/nas),
      bucket+prefix (s3), or site/library URL (sharepoint).
    - crm_document.storage_type stamps where each file actually lives, so reads
      keep working even if an entity's storage type changes later.

  2. Credentials in Supabase Vault (never in a client-readable table)
    - S3 keys / SharePoint client secret are stored encrypted in vault, one secret
      per entity named 'docstore:<entity>' holding a JSON payload.
    - set_storage_secret / has_storage_secret / delete_storage_secret are
      SECURITY DEFINER and gated to system admins -> callable from the admin UI,
      but the plaintext secret is NEVER returned to the browser.
    - get_storage_secret returns the decrypted JSON but EXECUTE is granted ONLY to
      service_role, so only the trusted file server (using its service-role key)
      can read credentials. Regular users / anon cannot.
*/

-- 1. storage_type columns -----------------------------------------------------

ALTER TABLE public.document_location_config
  ADD COLUMN IF NOT EXISTS storage_type text NOT NULL DEFAULT 'local';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'document_location_config_storage_type_chk'
  ) THEN
    ALTER TABLE public.document_location_config
      ADD CONSTRAINT document_location_config_storage_type_chk
      CHECK (storage_type IN ('local', 'nas', 's3', 'sharepoint'));
  END IF;
END $$;

ALTER TABLE public.crm_document
  ADD COLUMN IF NOT EXISTS storage_type text NOT NULL DEFAULT 'local';

-- 2. Vault + credential RPCs --------------------------------------------------

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Admin-only: create or replace the credential payload for an entity.
CREATE OR REPLACE FUNCTION public.set_storage_secret(p_entity text, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_name text := 'docstore:' || p_entity;
  v_id   uuid;
BEGIN
  IF NOT security.is_system_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_payload::text, v_name, 'Document storage credentials for ' || p_entity);
  ELSE
    PERFORM vault.update_secret(v_id, p_payload::text, v_name, 'Document storage credentials for ' || p_entity);
  END IF;
END;
$$;

-- Admin-only: does an entity have stored credentials? (boolean, never the value)
CREATE OR REPLACE FUNCTION public.has_storage_secret(p_entity text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
BEGIN
  IF NOT security.is_system_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'docstore:' || p_entity);
END;
$$;

-- Admin-only: remove an entity's credentials.
CREATE OR REPLACE FUNCTION public.delete_storage_secret(p_entity text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
BEGIN
  IF NOT security.is_system_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM vault.secrets WHERE name = 'docstore:' || p_entity;
END;
$$;

-- service_role ONLY: decrypt and return an entity's credential payload.
CREATE OR REPLACE FUNCTION public.get_storage_secret(p_entity text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'docstore:' || p_entity;
  IF v_secret IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v_secret::jsonb;
END;
$$;

-- Lock down execution: admins manage secrets; only the file server reads them.
REVOKE ALL ON FUNCTION public.get_storage_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_secret(text) TO service_role;

REVOKE ALL ON FUNCTION public.set_storage_secret(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_storage_secret(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_storage_secret(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_storage_secret(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_storage_secret(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_storage_secret(text) TO authenticated;
