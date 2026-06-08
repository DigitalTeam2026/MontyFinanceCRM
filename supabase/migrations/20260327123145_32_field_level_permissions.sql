/*
  # Field-Level Permissions

  ## Summary
  Adds a table that controls per-field UI permissions scoped to a security role
  and entity. This drives client-side hide/disable logic in the CRM form
  renderer.

  ## New Tables
  - `field_permission`
    - `field_permission_id` (uuid, pk)
    - `role_id` (uuid, FK → security_role)
    - `entity_name` (text) — matches entity slug, e.g. "lead", "opportunity"
    - `field_name` (text) — logical field name, e.g. "estimated_value"
    - `is_hidden` (bool) — hide the field entirely from the form
    - `is_readonly` (bool) — render the field as read-only

  ## Security
  - RLS enabled
  - Authenticated users can SELECT (needed by the CRM renderer)
  - Only authenticated users (admins via Studio) can INSERT/UPDATE/DELETE

  ## Notes
  1. A missing row means no restriction (field behaves normally).
  2. Restrictions are additive across roles: if ANY role says hidden → hidden.
  3. System admins bypass all field-level restrictions in the UI.
*/

CREATE TABLE IF NOT EXISTS field_permission (
  field_permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id             uuid NOT NULL REFERENCES security_role(role_id) ON DELETE CASCADE,
  entity_name         text NOT NULL,
  field_name          text NOT NULL,
  is_hidden           boolean NOT NULL DEFAULT false,
  is_readonly         boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, entity_name, field_name)
);

CREATE INDEX IF NOT EXISTS idx_field_permission_role    ON field_permission(role_id);
CREATE INDEX IF NOT EXISTS idx_field_permission_entity  ON field_permission(entity_name);

ALTER TABLE field_permission ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view field permissions"
  ON field_permission FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert field permissions"
  ON field_permission FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update field permissions"
  ON field_permission FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete field permissions"
  ON field_permission FOR DELETE
  TO authenticated
  USING (true);
