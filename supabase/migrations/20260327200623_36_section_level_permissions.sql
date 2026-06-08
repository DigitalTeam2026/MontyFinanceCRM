/*
  # Section-Level Permissions

  ## Summary
  Adds a table that controls per-section UI permissions scoped to a security role
  and form section. This drives client-side hide logic in the CRM form renderer —
  entire sections can be hidden from users whose role has a restriction set.

  ## New Tables
  - `section_permission`
    - `section_permission_id` (uuid, pk)
    - `role_id` (uuid, FK → security_role)
    - `entity_name` (text) — matches entity logical name, e.g. "lead"
    - `section_id` (text) — matches the DesignerSection.id in the form layout JSON
    - `section_label` (text) — human-readable label stored for display convenience
    - `is_hidden` (bool) — hide the entire section from the form

  ## Security
  - RLS enabled
  - Authenticated users can SELECT (needed by the CRM renderer)
  - Only authenticated users (admins via Studio) can INSERT/UPDATE/DELETE

  ## Notes
  1. A missing row means no restriction (section behaves normally).
  2. Restrictions are additive across roles: if ANY role says hidden → hidden.
  3. System admins bypass all section-level restrictions in the UI.
  4. Section IDs come from the form designer layout JSON; they are stable UUIDs.
*/

CREATE TABLE IF NOT EXISTS section_permission (
  section_permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id               uuid NOT NULL REFERENCES security_role(role_id) ON DELETE CASCADE,
  entity_name           text NOT NULL,
  section_id            text NOT NULL,
  section_label         text NOT NULL DEFAULT '',
  is_hidden             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  modified_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, entity_name, section_id)
);

CREATE INDEX IF NOT EXISTS idx_section_permission_role   ON section_permission(role_id);
CREATE INDEX IF NOT EXISTS idx_section_permission_entity ON section_permission(entity_name);

ALTER TABLE section_permission ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view section permissions"
  ON section_permission FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert section permissions"
  ON section_permission FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update section permissions"
  ON section_permission FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete section permissions"
  ON section_permission FOR DELETE
  TO authenticated
  USING (true);
