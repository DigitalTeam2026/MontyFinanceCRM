/*
  # Column Security Profiles

  ## Summary
  Implements a named-profile column-level security system on top of the existing
  role-based field_permission model. When a field has `is_secured = true`, the
  column security path takes over: access is governed entirely by which Column
  Security Profiles are assigned to the user or their teams.

  ## Changes to Existing Tables
  - `field_definition`
    - `is_secured` (boolean, default false) — enables column security path for this field

  ## New Tables

  ### `column_security_profile`
  Named, reusable security profile (e.g. "Finance Read-Only", "Salary Hidden").
  - `profile_id` (uuid, pk)
  - `name` (text, unique) — display name of the profile
  - `description` (text) — optional explanation
  - `is_active` (boolean, default true)
  - `created_at`, `modified_at`

  ### `column_security_profile_field`
  Per-field access rules within a profile. Only rows for secured fields are evaluated.
  - `profile_field_id` (uuid, pk)
  - `profile_id` (uuid, FK → column_security_profile)
  - `entity_name` (text) — matches entity logical_name slug
  - `field_name` (text) — matches field logical_name
  - `can_read` (boolean) — user can see the field value
  - `can_update` (boolean) — user can edit the field value
  - Unique on (profile_id, entity_name, field_name)

  ### `column_security_profile_assignment`
  Assigns a profile to a user or team.
  - `assignment_id` (uuid, pk)
  - `profile_id` (uuid, FK → column_security_profile)
  - `principal_type` ('user' | 'team')
  - `principal_id` (uuid) — references crm_user.user_id or team.team_id
  - Unique on (profile_id, principal_type, principal_id)

  ## Security
  - RLS enabled on all three new tables
  - Authenticated users can SELECT (needed by the permission loader)
  - Authenticated users can INSERT/UPDATE/DELETE (admin operations via Studio)

  ## Important Notes
  1. If a field has is_secured = false, the existing field_permission (role-based)
     model applies unchanged.
  2. If a field has is_secured = true and the user has NO profile that covers it,
     the field is denied (hidden) by default.
  3. can_read = false implies hidden; can_read = true + can_update = false = readonly;
     can_read = true + can_update = true = editable.
  4. Permissions are additive across profiles: if ANY assigned profile grants
     can_read = true, the user can read; if ANY grants can_update = true, they can update.
*/

-- ─── Add is_secured to field_definition ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_definition' AND column_name = 'is_secured'
  ) THEN
    ALTER TABLE field_definition ADD COLUMN is_secured boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─── column_security_profile ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS column_security_profile (
  profile_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  modified_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_column_security_profile_name UNIQUE (name)
);

ALTER TABLE column_security_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view column security profiles"
  ON column_security_profile FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert column security profiles"
  ON column_security_profile FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update column security profiles"
  ON column_security_profile FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete column security profiles"
  ON column_security_profile FOR DELETE
  TO authenticated
  USING (true);

-- ─── column_security_profile_field ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS column_security_profile_field (
  profile_field_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES column_security_profile(profile_id) ON DELETE CASCADE,
  entity_name      text NOT NULL,
  field_name       text NOT NULL,
  can_read         boolean NOT NULL DEFAULT true,
  can_update       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  modified_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_csp_field UNIQUE (profile_id, entity_name, field_name)
);

CREATE INDEX IF NOT EXISTS idx_csp_field_profile   ON column_security_profile_field(profile_id);
CREATE INDEX IF NOT EXISTS idx_csp_field_entity    ON column_security_profile_field(entity_name);

ALTER TABLE column_security_profile_field ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view column security profile fields"
  ON column_security_profile_field FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert column security profile fields"
  ON column_security_profile_field FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update column security profile fields"
  ON column_security_profile_field FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete column security profile fields"
  ON column_security_profile_field FOR DELETE
  TO authenticated
  USING (true);

-- ─── column_security_profile_assignment ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS column_security_profile_assignment (
  assignment_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES column_security_profile(profile_id) ON DELETE CASCADE,
  principal_type text NOT NULL CHECK (principal_type IN ('user', 'team')),
  principal_id   uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_csp_assignment UNIQUE (profile_id, principal_type, principal_id)
);

CREATE INDEX IF NOT EXISTS idx_csp_assignment_profile      ON column_security_profile_assignment(profile_id);
CREATE INDEX IF NOT EXISTS idx_csp_assignment_principal    ON column_security_profile_assignment(principal_type, principal_id);

ALTER TABLE column_security_profile_assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view column security profile assignments"
  ON column_security_profile_assignment FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert column security profile assignments"
  ON column_security_profile_assignment FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update column security profile assignments"
  ON column_security_profile_assignment FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete column security profile assignments"
  ON column_security_profile_assignment FOR DELETE
  TO authenticated
  USING (true);
