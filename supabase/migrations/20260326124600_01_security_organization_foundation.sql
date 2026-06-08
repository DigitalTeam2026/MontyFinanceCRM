
/*
  # Migration 1: Security & Organization Foundation

  ## Overview
  Establishes the core organizational structure and security model for the CRM platform.
  This is the foundational layer that all other modules depend on.

  ## New Tables

  ### Organization
  - `organization` — Top-level tenant. Every record belongs to one organization.

  ### Business Units
  - `business_unit` — Hierarchical org units with optional parent reference.

  ### Users
  - `crm_user` — CRM user profile linked to Supabase auth.users via same UUID.
    Note: Named crm_user because system_user is a reserved SQL keyword.

  ### Teams
  - `team` — Named group of users within a business unit.
  - `team_user` — Junction table linking users to teams.

  ### Security Roles
  - `security_role` — Named role optionally scoped to a business unit.
  - `user_security_role` — Assigns roles to users.
  - `team_security_role` — Assigns roles to teams.
  - `role_privilege` — What a role can do (create/read/write/delete/assign/share)
    on each entity with access level scoping.

  ### Record Sharing
  - `record_share` — Grants specific permissions on individual records to users or teams.

  ## Security
  - RLS enabled on all tables
  - crm_user policies tie directly to auth.uid()
  - All tables require authenticated access
*/

-- ─────────────────────────────────────────────
-- ORGANIZATION
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization (
  organization_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  modified_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view organizations"
  ON organization FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert organizations"
  ON organization FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update organizations"
  ON organization FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- BUSINESS UNIT
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_unit (
  business_unit_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES organization(organization_id),
  parent_business_unit_id   uuid REFERENCES business_unit(business_unit_id),
  name                      text NOT NULL,
  description               text,
  is_active                 boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  modified_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_unit_organization ON business_unit(organization_id);
CREATE INDEX IF NOT EXISTS idx_business_unit_parent ON business_unit(parent_business_unit_id);

ALTER TABLE business_unit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view business units"
  ON business_unit FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert business units"
  ON business_unit FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update business units"
  ON business_unit FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- CRM USER
-- Linked to Supabase auth.users via same UUID
-- (system_user is a reserved SQL keyword, using crm_user)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_user (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_unit_id    uuid REFERENCES business_unit(business_unit_id),
  full_name           text NOT NULL DEFAULT '',
  email               text NOT NULL DEFAULT '',
  username            text,
  job_title           text,
  mobile_phone        text,
  is_active           boolean NOT NULL DEFAULT true,
  is_system_admin     boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_user_business_unit ON crm_user(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_crm_user_email ON crm_user(email);

ALTER TABLE crm_user ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON crm_user FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON crm_user FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON crm_user FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all users"
  ON crm_user FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_user cu
      WHERE cu.user_id = auth.uid() AND cu.is_system_admin = true
    )
  );

CREATE POLICY "Admins can update all users"
  ON crm_user FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_user cu
      WHERE cu.user_id = auth.uid() AND cu.is_system_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_user cu
      WHERE cu.user_id = auth.uid() AND cu.is_system_admin = true
    )
  );

-- ─────────────────────────────────────────────
-- TEAM
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team (
  team_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id    uuid NOT NULL REFERENCES business_unit(business_unit_id),
  name                text NOT NULL,
  team_type           text NOT NULL DEFAULT 'standard' CHECK (team_type IN ('standard', 'owner', 'access')),
  description         text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_business_unit ON team(business_unit_id);

ALTER TABLE team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view teams"
  ON team FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert teams"
  ON team FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update teams"
  ON team FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- TEAM USER
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_user (
  team_user_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES team(team_id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES crm_user(user_id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_user_team ON team_user(team_id);
CREATE INDEX IF NOT EXISTS idx_team_user_user ON team_user(user_id);

ALTER TABLE team_user ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view team memberships"
  ON team_user FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert team memberships"
  ON team_user FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete team memberships"
  ON team_user FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- SECURITY ROLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_role (
  role_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id    uuid REFERENCES business_unit(business_unit_id),
  name                text NOT NULL,
  description         text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_role_business_unit ON security_role(business_unit_id);

ALTER TABLE security_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view security roles"
  ON security_role FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert security roles"
  ON security_role FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update security roles"
  ON security_role FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- USER SECURITY ROLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_security_role (
  user_security_role_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES crm_user(user_id) ON DELETE CASCADE,
  role_id                 uuid NOT NULL REFERENCES security_role(role_id) ON DELETE CASCADE,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_security_role_user ON user_security_role(user_id);
CREATE INDEX IF NOT EXISTS idx_user_security_role_role ON user_security_role(role_id);

ALTER TABLE user_security_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view user role assignments"
  ON user_security_role FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert user role assignments"
  ON user_security_role FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete user role assignments"
  ON user_security_role FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- TEAM SECURITY ROLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_security_role (
  team_security_role_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                 uuid NOT NULL REFERENCES team(team_id) ON DELETE CASCADE,
  role_id                 uuid NOT NULL REFERENCES security_role(role_id) ON DELETE CASCADE,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_team_security_role_team ON team_security_role(team_id);
CREATE INDEX IF NOT EXISTS idx_team_security_role_role ON team_security_role(role_id);

ALTER TABLE team_security_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view team role assignments"
  ON team_security_role FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert team role assignments"
  ON team_security_role FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete team role assignments"
  ON team_security_role FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- ROLE PRIVILEGE
-- access_level: 'user' | 'business_unit' | 'parent_bu' | 'organization'
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_privilege (
  privilege_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id         uuid NOT NULL REFERENCES security_role(role_id) ON DELETE CASCADE,
  entity_name     text NOT NULL,
  can_create      boolean NOT NULL DEFAULT false,
  can_read        boolean NOT NULL DEFAULT false,
  can_write       boolean NOT NULL DEFAULT false,
  can_delete      boolean NOT NULL DEFAULT false,
  can_assign      boolean NOT NULL DEFAULT false,
  can_share       boolean NOT NULL DEFAULT false,
  access_level    text NOT NULL DEFAULT 'user' CHECK (access_level IN ('user', 'business_unit', 'parent_bu', 'organization')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  modified_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_id, entity_name)
);

CREATE INDEX IF NOT EXISTS idx_role_privilege_role ON role_privilege(role_id);
CREATE INDEX IF NOT EXISTS idx_role_privilege_entity ON role_privilege(entity_name);

ALTER TABLE role_privilege ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view role privileges"
  ON role_privilege FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert role privileges"
  ON role_privilege FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update role privileges"
  ON role_privilege FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete role privileges"
  ON role_privilege FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- RECORD SHARE
-- Grants per-record permissions to a user or team
-- principal_type: 'user' | 'team'
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS record_share (
  share_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name     text NOT NULL,
  record_id       uuid NOT NULL,
  principal_type  text NOT NULL CHECK (principal_type IN ('user', 'team')),
  principal_id    uuid NOT NULL,
  can_read        boolean NOT NULL DEFAULT false,
  can_write       boolean NOT NULL DEFAULT false,
  can_delete      boolean NOT NULL DEFAULT false,
  can_share       boolean NOT NULL DEFAULT false,
  can_assign      boolean NOT NULL DEFAULT false,
  shared_by       uuid REFERENCES crm_user(user_id),
  shared_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_name, record_id, principal_type, principal_id)
);

CREATE INDEX IF NOT EXISTS idx_record_share_record ON record_share(entity_name, record_id);
CREATE INDEX IF NOT EXISTS idx_record_share_principal ON record_share(principal_type, principal_id);
CREATE INDEX IF NOT EXISTS idx_record_share_shared_by ON record_share(shared_by);

ALTER TABLE record_share ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shares where they are principal or sharer"
  ON record_share FOR SELECT
  TO authenticated
  USING (
    (principal_type = 'user' AND principal_id = auth.uid())
    OR shared_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM crm_user cu
      WHERE cu.user_id = auth.uid() AND cu.is_system_admin = true
    )
  );

CREATE POLICY "Users can insert record shares"
  ON record_share FOR INSERT
  TO authenticated
  WITH CHECK (shared_by = auth.uid());

CREATE POLICY "Users can delete their own record shares"
  ON record_share FOR DELETE
  TO authenticated
  USING (shared_by = auth.uid());
