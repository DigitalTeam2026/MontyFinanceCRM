/*
  # Document storage: per-record access control, document_path column, Lead default

  Builds on 20260611140000_document_location_storage.sql.

  1. Access control
    - public.crm_document_pk_column(table)  -> resolves a table's PK column (<table>_id, else id)
    - public.can_access_record(entity, record_id) -> SECURITY INVOKER, returns true only when
      the caller can SELECT the parent record (RLS on the parent table is what enforces access).
    - crm_document RLS is tightened so users can only read / add / delete documents for records
      they can actually access (replaces the previous permissive policies).

  2. document_path column
    - Adds document_path (text) to lead (the requested per-entity path column + Lead example).
    - public.sync_parent_document_path() trigger keeps <entity>.document_path in sync with the
      most recent crm_document row, for ANY entity table that has a document_path column.

  3. Lead default
    - Seeds a document_location_config row for the Lead entity so it works out of the box.
      Adjust the root in Admin Studio -> Document Location to match your machine.
*/

-- 1. Access control ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.crm_document_pk_column(p_table text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = p_table
    AND column_name IN (p_table || '_id', 'id')
  ORDER BY CASE WHEN column_name = p_table || '_id' THEN 0 ELSE 1 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_access_record(p_entity text, p_record_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_table text;
  v_pk    text;
  v_found boolean;
BEGIN
  IF p_entity IS NULL OR p_record_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT physical_table_name INTO v_table
  FROM public.entity_definition
  WHERE logical_name = p_entity AND deleted_at IS NULL
  LIMIT 1;
  IF v_table IS NULL THEN
    RETURN false;
  END IF;

  v_pk := public.crm_document_pk_column(v_table);
  IF v_pk IS NULL THEN
    RETURN false;
  END IF;

  -- Runs as the calling user, so RLS on the parent table decides visibility.
  EXECUTE format('SELECT exists(SELECT 1 FROM public.%I WHERE %I::text = $1)', v_table, v_pk)
    INTO v_found
    USING p_record_id;

  RETURN coalesce(v_found, false);
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_document_pk_column(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_record(text, text) TO authenticated;

-- Replace the permissive crm_document policies with access-controlled ones.
DROP POLICY IF EXISTS "Authenticated can read documents"   ON crm_document;
DROP POLICY IF EXISTS "Authenticated can insert documents" ON crm_document;
DROP POLICY IF EXISTS "Authenticated can delete documents" ON crm_document;

CREATE POLICY "Read documents for accessible records"
  ON crm_document
  FOR SELECT
  TO authenticated
  USING (public.can_access_record(entity_logical_name, record_id));

CREATE POLICY "Insert documents for accessible records"
  ON crm_document
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_record(entity_logical_name, record_id));

CREATE POLICY "Delete documents for accessible records"
  ON crm_document
  FOR DELETE
  TO authenticated
  USING (public.can_access_record(entity_logical_name, record_id));

-- 2. document_path column + sync trigger ------------------------------------

ALTER TABLE public.lead ADD COLUMN IF NOT EXISTS document_path text;

CREATE OR REPLACE FUNCTION public.sync_parent_document_path()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity text;
  v_record text;
  v_table  text;
  v_pk     text;
  v_latest text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entity := OLD.entity_logical_name;
    v_record := OLD.record_id;
  ELSE
    v_entity := NEW.entity_logical_name;
    v_record := NEW.record_id;
  END IF;

  SELECT physical_table_name INTO v_table
  FROM public.entity_definition
  WHERE logical_name = v_entity AND deleted_at IS NULL
  LIMIT 1;
  IF v_table IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  -- Only entities that actually have a document_path column get synced.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'document_path'
  ) THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  v_pk := public.crm_document_pk_column(v_table);
  IF v_pk IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  SELECT relative_path INTO v_latest
  FROM public.crm_document
  WHERE entity_logical_name = v_entity AND record_id = v_record
  ORDER BY uploaded_at DESC
  LIMIT 1;

  EXECUTE format('UPDATE public.%I SET document_path = $1 WHERE %I::text = $2', v_table, v_pk)
    USING v_latest, v_record;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_document_path ON crm_document;
CREATE TRIGGER trg_sync_document_path
  AFTER INSERT OR DELETE ON crm_document
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_parent_document_path();

-- 3. Lead default location --------------------------------------------------

INSERT INTO public.document_location_config (entity_logical_name, entity_display_name, root_location, is_active)
VALUES ('lead', 'Lead', 'C:\Users\habib.serhan\Desktop\MontyFinanceStorage\Lead', true)
ON CONFLICT (entity_logical_name) DO NOTHING;
