/*
  # Field Change Log

  ## Purpose
  Tracks per-field changes on CRM records so users can see a full audit trail of
  what changed, when, and who changed it.

  ## New Tables
  - `field_change_log`
    - `log_id` (uuid, primary key)
    - `entity_name` (text) – e.g. 'account', 'contact', 'lead'
    - `record_id` (uuid) – the record that was changed
    - `changed_by` (uuid, FK auth.users) – user who saved
    - `changed_at` (timestamptz) – when the change was saved
    - `field_name` (text) – logical field name
    - `old_value` (text) – serialized previous value (NULL = no previous value)
    - `new_value` (text) – serialized new value (NULL = field was cleared)

  ## Security
  - RLS enabled; authenticated users may read and insert logs.
  - No UPDATE or DELETE policies (audit trail is immutable from the client).
*/

CREATE TABLE IF NOT EXISTS field_change_log (
  log_id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name  text        NOT NULL,
  record_id    uuid        NOT NULL,
  changed_by   uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  changed_at   timestamptz NOT NULL DEFAULT now(),
  field_name   text        NOT NULL,
  old_value    text,
  new_value    text
);

CREATE INDEX IF NOT EXISTS field_change_log_record_idx
  ON field_change_log (entity_name, record_id, changed_at DESC);

ALTER TABLE field_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read field change logs"
  ON field_change_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert field change logs"
  ON field_change_log FOR INSERT
  TO authenticated
  WITH CHECK (changed_by = auth.uid());
