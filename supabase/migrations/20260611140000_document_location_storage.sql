/*
  # Document Location storage configuration

  Lets an admin choose a root storage folder per entity. Uploaded files are written
  by the local file server (tools/file-server) to <root>/<record_id>/<filename> and
  registered in crm_document.

  1. New Tables
    - document_location_config (one row per entity)
      - entity_logical_name (text, PK)   -- e.g. 'lead'
      - entity_display_name (text)
      - root_location (text)             -- e.g. C:\Users\habib.serhan\Desktop\MontyFinanceStorage\Lead
      - is_active (boolean)
      - created_at / modified_at (timestamptz)
    - crm_document (registry of uploaded files)
      - document_id (uuid, PK)
      - entity_logical_name (text)
      - record_id (text)                 -- parent record id (text to support any PK type)
      - file_name (text)
      - relative_path (text)             -- <record_id>/<file_name>
      - absolute_path (text)             -- full server path (informational)
      - content_type (text)
      - byte_size (bigint)
      - uploaded_by (uuid)
      - uploaded_at (timestamptz)

  2. Security
    - RLS enabled on both tables
    - document_location_config: any authenticated user may READ (the file server needs
      the root to resolve paths); only system admins may INSERT / UPDATE / DELETE
    - crm_document: authenticated users may read and manage document rows
*/

CREATE TABLE IF NOT EXISTS document_location_config (
  entity_logical_name  text PRIMARY KEY,
  entity_display_name  text NOT NULL DEFAULT '',
  root_location        text NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  modified_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_location_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read doc location config"
  ON document_location_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System admins can insert doc location config"
  ON document_location_config
  FOR INSERT
  TO authenticated
  WITH CHECK (security.is_system_admin());

CREATE POLICY "System admins can update doc location config"
  ON document_location_config
  FOR UPDATE
  TO authenticated
  USING (security.is_system_admin())
  WITH CHECK (security.is_system_admin());

CREATE POLICY "System admins can delete doc location config"
  ON document_location_config
  FOR DELETE
  TO authenticated
  USING (security.is_system_admin());


CREATE TABLE IF NOT EXISTS crm_document (
  document_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_logical_name  text NOT NULL,
  record_id            text NOT NULL,
  file_name            text NOT NULL,
  relative_path        text NOT NULL,
  absolute_path        text,
  content_type         text,
  byte_size            bigint,
  uploaded_by          uuid DEFAULT auth.uid(),
  uploaded_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_document_entity_record
  ON crm_document (entity_logical_name, record_id);

ALTER TABLE crm_document ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read documents"
  ON crm_document
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert documents"
  ON crm_document
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete documents"
  ON crm_document
  FOR DELETE
  TO authenticated
  USING (true);
