/*
  # Form-Level Permissions (per entity, per security role)

  ## Summary
  Lets admins control WHICH forms each security role may use for each entity.
  This is generic: it works for any entity (existing or created later) and any
  form (existing or built later in Form Builder). Nothing is hardcoded — rows
  reference the entity by its logical name and the form by its form_id.

  At runtime, when a user creates / opens a record, the system shows only the
  forms allowed for their role(s). With more than one allowed form, a small
  chooser card asks which form to use.

  ## New Table
  - `form_permission`
    - `form_permission_id` (uuid, pk)
    - `role_id`     (uuid, FK → security_role)  — owning role
    - `entity_name` (text)                       — entity logical name, e.g. "lead"
    - `form_id`     (uuid, FK → form_definition) — the granted form
    - `is_allowed`  (bool)                        — true = role may use this form

  ## Security model (DENY by default)
  1. A missing row = the form is NOT available to the role (whitelist-allow).
  2. Grants are additive across a user's roles: ANY role granting a form ⇒ allowed.
  3. System admins bypass all form restrictions (handled in the app layer).

  ## Rollout backfill
  To preserve current behaviour for existing installations, every existing
  (non-deleted role × non-deleted MAIN form) pair is granted on creation. The
  deny-by-default posture therefore only governs forms/entities created AFTER
  this migration, which an admin grants explicitly.

  ## Notes
  - RLS mirrors the other permission tables (action_permission / section_permission):
    authenticated users may read (CRM renderer) and write (Admin Studio).
  - `UNIQUE (role_id, form_id)` prevents duplicate grants and lets the app upsert
    / delete-then-insert cleanly.
*/

CREATE TABLE IF NOT EXISTS form_permission (
  form_permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id            uuid NOT NULL REFERENCES security_role(role_id) ON DELETE CASCADE,
  entity_name        text NOT NULL,
  form_id            uuid NOT NULL REFERENCES form_definition(form_id) ON DELETE CASCADE,
  is_allowed         boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  modified_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, form_id)
);

CREATE INDEX IF NOT EXISTS idx_form_permission_role   ON form_permission(role_id);
CREATE INDEX IF NOT EXISTS idx_form_permission_entity ON form_permission(entity_name);
CREATE INDEX IF NOT EXISTS idx_form_permission_form   ON form_permission(form_id);

ALTER TABLE form_permission ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view form permissions"
  ON form_permission FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert form permissions"
  ON form_permission FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update form permissions"
  ON form_permission FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete form permissions"
  ON form_permission FOR DELETE
  TO authenticated
  USING (true);

-- Rollout backfill: grant every existing MAIN form to every existing role so
-- current users keep their access. Deny-by-default applies only to forms created
-- after this point.
INSERT INTO form_permission (role_id, entity_name, form_id, is_allowed)
SELECT r.role_id, ed.logical_name, fd.form_id, true
FROM security_role r
CROSS JOIN form_definition fd
JOIN entity_definition ed ON ed.entity_definition_id = fd.entity_definition_id
WHERE r.deleted_at IS NULL
  AND fd.deleted_at IS NULL
  AND fd.form_type = 'main'
ON CONFLICT (role_id, form_id) DO NOTHING;
