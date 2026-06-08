/*
  # Dynamics-Style Timeline Feature

  ## Overview
  Adds a reusable Timeline to any CRM entity, enabling Notes, Appointments,
  Emails, and Attachments to be tracked against any record.

  ## Schema Changes

  ### entity_definition
  - `allow_timeline` (boolean, default false): opt-in flag per entity.
    When true the form designer can place a Timeline component on the form.
  - Seed: set allow_timeline = true for account, contact, lead, opportunity, campaign.

  ### New Tables

  1. `timeline_note`
     User-written free-text notes attached to any record.

  2. `timeline_appointment`
     Meeting / call records with start/end time and optional location.

  3. `timeline_email`
     Logged email interactions (inbound or outbound).

  4. `timeline_attachment`
     File metadata referencing Supabase Storage (or an external URL).

  ## Security
  - RLS enabled on all four tables.
  - SELECT: any authenticated user (the parent-record access gate already restricts
    which records a user navigates to; timeline items inherit that context).
  - INSERT: authenticated users (create their own items).
  - UPDATE/DELETE: the record creator (created_by = auth.uid()) or a system admin.
*/

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. allow_timeline on entity_definition
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE entity_definition
  ADD COLUMN IF NOT EXISTS allow_timeline boolean NOT NULL DEFAULT false;

-- Enable for the primary CRM entities used in every deployment
UPDATE entity_definition
SET    allow_timeline = true
WHERE  logical_name IN ('account','contact','lead','opportunity','campaign');

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. timeline_note
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_note (
  note_id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  regarding_entity_name  text        NOT NULL,
  regarding_record_id    uuid        NOT NULL,
  title                  text        NOT NULL DEFAULT '',
  body                   text        NOT NULL DEFAULT '',
  is_pinned              boolean     NOT NULL DEFAULT false,
  owner_id               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  modified_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  modified_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_note_regarding
  ON timeline_note (regarding_entity_name, regarding_record_id, created_at DESC);

ALTER TABLE timeline_note ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Timeline notes readable by authenticated users"
  ON timeline_note FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Timeline notes creatable by authenticated users"
  ON timeline_note FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Timeline note owners and admins can update"
  ON timeline_note FOR UPDATE TO authenticated
  USING  (created_by = auth.uid() OR security.is_system_admin())
  WITH CHECK (created_by = auth.uid() OR security.is_system_admin());

CREATE POLICY "Timeline note owners and admins can delete"
  ON timeline_note FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR security.is_system_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. timeline_appointment
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_appointment (
  appointment_id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  regarding_entity_name  text        NOT NULL,
  regarding_record_id    uuid        NOT NULL,
  subject                text        NOT NULL DEFAULT '',
  description            text        NOT NULL DEFAULT '',
  start_time             timestamptz,
  end_time               timestamptz,
  location               text,
  status                 text        NOT NULL DEFAULT 'scheduled'
                           CHECK (status IN ('scheduled','completed','cancelled')),
  owner_id               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  modified_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  modified_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_appointment_regarding
  ON timeline_appointment (regarding_entity_name, regarding_record_id, created_at DESC);

ALTER TABLE timeline_appointment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Timeline appointments readable by authenticated users"
  ON timeline_appointment FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Timeline appointments creatable by authenticated users"
  ON timeline_appointment FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Timeline appointment owners and admins can update"
  ON timeline_appointment FOR UPDATE TO authenticated
  USING  (created_by = auth.uid() OR security.is_system_admin())
  WITH CHECK (created_by = auth.uid() OR security.is_system_admin());

CREATE POLICY "Timeline appointment owners and admins can delete"
  ON timeline_appointment FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR security.is_system_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. timeline_email
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_email (
  email_id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  regarding_entity_name  text        NOT NULL,
  regarding_record_id    uuid        NOT NULL,
  subject                text        NOT NULL DEFAULT '',
  body                   text        NOT NULL DEFAULT '',
  from_address           text,
  to_addresses           text,
  direction              text        NOT NULL DEFAULT 'outbound'
                           CHECK (direction IN ('inbound','outbound')),
  status                 text        NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','sent','received')),
  sent_on                timestamptz,
  owner_id               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  modified_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  modified_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_email_regarding
  ON timeline_email (regarding_entity_name, regarding_record_id, created_at DESC);

ALTER TABLE timeline_email ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Timeline emails readable by authenticated users"
  ON timeline_email FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Timeline emails creatable by authenticated users"
  ON timeline_email FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Timeline email owners and admins can update"
  ON timeline_email FOR UPDATE TO authenticated
  USING  (created_by = auth.uid() OR security.is_system_admin())
  WITH CHECK (created_by = auth.uid() OR security.is_system_admin());

CREATE POLICY "Timeline email owners and admins can delete"
  ON timeline_email FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR security.is_system_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. timeline_attachment
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_attachment (
  attachment_id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  regarding_entity_name  text        NOT NULL,
  regarding_record_id    uuid        NOT NULL,
  file_name              text        NOT NULL,
  file_url               text        NOT NULL,
  file_type              text,
  file_size_bytes        bigint,
  storage_path           text,
  uploaded_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_attachment_regarding
  ON timeline_attachment (regarding_entity_name, regarding_record_id, created_at DESC);

ALTER TABLE timeline_attachment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Timeline attachments readable by authenticated users"
  ON timeline_attachment FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Timeline attachments creatable by authenticated users"
  ON timeline_attachment FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Timeline attachment owners and admins can delete"
  ON timeline_attachment FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR security.is_system_admin());
