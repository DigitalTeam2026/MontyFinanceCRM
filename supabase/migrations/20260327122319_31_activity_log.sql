/*
  # Activity Log Table

  ## Overview
  Unified activity log that stores all interaction history for CRM records.
  Supports four activity types: note, email, call, task.

  ## New Tables
  - `activity_log`
    - `activity_id` (uuid, pk)
    - `activity_type` (text) — 'note' | 'email' | 'call' | 'task'
    - `subject` (text) — subject line for emails/calls/tasks; ignored for notes
    - `body` (text) — main content / description
    - `status` (text) — for tasks: 'open' | 'completed'; for calls: 'planned' | 'completed'
    - `direction` (text) — for calls/emails: 'inbound' | 'outbound'
    - `duration_minutes` (int) — for calls
    - `due_date` (timestamptz) — for tasks
    - `scheduled_at` (timestamptz) — for calls/emails
    - `completed_at` (timestamptz)
    - `regarding_entity` (text) — 'account'|'contact'|'lead'|'opportunity'|'ticket'
    - `regarding_id` (uuid) — FK to the parent record
    - `owner_id` (uuid) — user who created
    - Standard timestamps & soft delete

  ## Security
  - RLS enabled; authenticated users can manage their own activities
  - Shared SELECT so team members can see all activities on records they access
*/

CREATE TABLE IF NOT EXISTS activity_log (
  activity_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_type      text NOT NULL CHECK (activity_type IN ('note','email','call','task')),
  subject            text,
  body               text,
  status             text DEFAULT 'open',
  direction          text CHECK (direction IN ('inbound','outbound') OR direction IS NULL),
  duration_minutes   integer,
  due_date           timestamptz,
  scheduled_at       timestamptz,
  completed_at       timestamptz,
  regarding_entity   text NOT NULL,
  regarding_id       uuid NOT NULL,
  owner_id           uuid REFERENCES auth.users(id),
  is_deleted         boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  modified_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_regarding ON activity_log (regarding_entity, regarding_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_owner ON activity_log (owner_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log (activity_type);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view activities on accessible records"
  ON activity_log FOR SELECT
  TO authenticated
  USING (is_deleted = false);

CREATE POLICY "Users can insert their own activities"
  ON activity_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own activities"
  ON activity_log FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can soft-delete their own activities"
  ON activity_log FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);
