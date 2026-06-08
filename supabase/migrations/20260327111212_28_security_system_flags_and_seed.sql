/*
  # Security System Flags & Full Seed

  ## Summary
  Adds is_system flags to security_role and business_unit tables, then seeds
  the full set of system-level security data so the platform is immediately usable.

  ## Changes

  ### Modified Tables
  1. `security_role` — add `is_system boolean DEFAULT false`
     System roles (System Administrator, Sales Manager, etc.) cannot be deleted.
  2. `business_unit` — add `is_system boolean DEFAULT false`
     Root / module-level BUs are system-owned and protected.

  ### Seeded Data

  **Business Units (hierarchy)**
  - Organization (root, system)
    ├── Sales (system)
    │   ├── Sales East (system)
    │   └── Sales West (system)
    ├── Marketing (system)
    └── Support (system)

  **Security Roles (system)**
  - System Administrator — full platform access
  - Sales Manager        — manage sales team and pipeline
  - Sales User           — create and manage own leads/opportunities
  - Marketing Manager    — manage campaigns and marketing entities
  - Support Agent        — manage support tickets and cases
  - Read Only            — read-only access across entities

  **Teams (system)**
  - Sales Team    → Sales BU
  - Marketing Team → Marketing BU
  - Support Team  → Support BU

  ## Notes
  - access_level valid values: user | business_unit | parent_bu | organization
  - Uses IF NOT EXISTS / ON CONFLICT guards for idempotency
*/

-- ─────────────────────────────────────────────
-- 1. Add is_system to security_role
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_role' AND column_name = 'is_system'
  ) THEN
    ALTER TABLE security_role ADD COLUMN is_system boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 2. Add is_system to business_unit
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_unit' AND column_name = 'is_system'
  ) THEN
    ALTER TABLE business_unit ADD COLUMN is_system boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 3. Seed Business Unit hierarchy + Roles + Teams
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_org_id       uuid;
  v_root_bu_id   uuid;
  v_sales_bu_id  uuid;
  v_mkt_bu_id    uuid;
  v_sup_bu_id    uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM organization LIMIT 1;
  IF v_org_id IS NULL THEN
    INSERT INTO organization (name) VALUES ('My Organization') RETURNING organization_id INTO v_org_id;
  END IF;

  -- Root BU
  SELECT business_unit_id INTO v_root_bu_id
  FROM business_unit WHERE name = 'Organization' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
  IF v_root_bu_id IS NULL THEN
    INSERT INTO business_unit (organization_id, name, description, is_system, is_active)
    VALUES (v_org_id, 'Organization', 'Root business unit for the entire organization', true, true)
    RETURNING business_unit_id INTO v_root_bu_id;
  ELSE
    UPDATE business_unit SET is_system = true WHERE business_unit_id = v_root_bu_id;
  END IF;

  -- Sales BU
  SELECT business_unit_id INTO v_sales_bu_id
  FROM business_unit WHERE name = 'Sales' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
  IF v_sales_bu_id IS NULL THEN
    INSERT INTO business_unit (organization_id, parent_business_unit_id, name, description, is_system, is_active)
    VALUES (v_org_id, v_root_bu_id, 'Sales', 'Sales department — leads and opportunities', true, true)
    RETURNING business_unit_id INTO v_sales_bu_id;
  ELSE
    UPDATE business_unit SET is_system = true, parent_business_unit_id = v_root_bu_id WHERE business_unit_id = v_sales_bu_id;
  END IF;

  -- Sales East
  IF NOT EXISTS (SELECT 1 FROM business_unit WHERE name = 'Sales East' AND organization_id = v_org_id AND deleted_at IS NULL) THEN
    INSERT INTO business_unit (organization_id, parent_business_unit_id, name, description, is_system, is_active)
    VALUES (v_org_id, v_sales_bu_id, 'Sales East', 'Eastern region sales team', true, true);
  END IF;

  -- Sales West
  IF NOT EXISTS (SELECT 1 FROM business_unit WHERE name = 'Sales West' AND organization_id = v_org_id AND deleted_at IS NULL) THEN
    INSERT INTO business_unit (organization_id, parent_business_unit_id, name, description, is_system, is_active)
    VALUES (v_org_id, v_sales_bu_id, 'Sales West', 'Western region sales team', true, true);
  END IF;

  -- Marketing BU
  SELECT business_unit_id INTO v_mkt_bu_id
  FROM business_unit WHERE name = 'Marketing' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
  IF v_mkt_bu_id IS NULL THEN
    INSERT INTO business_unit (organization_id, parent_business_unit_id, name, description, is_system, is_active)
    VALUES (v_org_id, v_root_bu_id, 'Marketing', 'Marketing department — campaigns and lead generation', true, true)
    RETURNING business_unit_id INTO v_mkt_bu_id;
  ELSE
    UPDATE business_unit SET is_system = true, parent_business_unit_id = v_root_bu_id WHERE business_unit_id = v_mkt_bu_id;
  END IF;

  -- Support BU
  SELECT business_unit_id INTO v_sup_bu_id
  FROM business_unit WHERE name = 'Support' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
  IF v_sup_bu_id IS NULL THEN
    INSERT INTO business_unit (organization_id, parent_business_unit_id, name, description, is_system, is_active)
    VALUES (v_org_id, v_root_bu_id, 'Support', 'Customer support and ticket management', true, true)
    RETURNING business_unit_id INTO v_sup_bu_id;
  ELSE
    UPDATE business_unit SET is_system = true, parent_business_unit_id = v_root_bu_id WHERE business_unit_id = v_sup_bu_id;
  END IF;

  -- ── Security Roles ──────────────────────────
  IF NOT EXISTS (SELECT 1 FROM security_role WHERE name = 'System Administrator' AND deleted_at IS NULL) THEN
    INSERT INTO security_role (name, description, is_system, is_active)
    VALUES ('System Administrator', 'Full access to all entities and administrative functions across the entire organization', true, true);
  ELSE
    UPDATE security_role SET is_system = true WHERE name = 'System Administrator' AND deleted_at IS NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM security_role WHERE name = 'Sales Manager' AND deleted_at IS NULL) THEN
    INSERT INTO security_role (name, description, is_system, is_active)
    VALUES ('Sales Manager', 'Full access to leads, opportunities, accounts, and contacts. Can view team performance and reassign records.', true, true);
  ELSE
    UPDATE security_role SET is_system = true WHERE name = 'Sales Manager' AND deleted_at IS NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM security_role WHERE name = 'Sales User' AND deleted_at IS NULL) THEN
    INSERT INTO security_role (name, description, is_system, is_active)
    VALUES ('Sales User', 'Create and manage own leads, opportunities, and contacts within the assigned business unit.', true, true);
  ELSE
    UPDATE security_role SET is_system = true WHERE name = 'Sales User' AND deleted_at IS NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM security_role WHERE name = 'Marketing Manager' AND deleted_at IS NULL) THEN
    INSERT INTO security_role (name, description, is_system, is_active)
    VALUES ('Marketing Manager', 'Full access to campaigns, events, marketing emails, and segments.', true, true);
  ELSE
    UPDATE security_role SET is_system = true WHERE name = 'Marketing Manager' AND deleted_at IS NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM security_role WHERE name = 'Support Agent' AND deleted_at IS NULL) THEN
    INSERT INTO security_role (name, description, is_system, is_active)
    VALUES ('Support Agent', 'Create and manage support tickets. Read access to accounts and contacts to assist customers.', true, true);
  ELSE
    UPDATE security_role SET is_system = true WHERE name = 'Support Agent' AND deleted_at IS NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM security_role WHERE name = 'Read Only' AND deleted_at IS NULL) THEN
    INSERT INTO security_role (name, description, is_system, is_active)
    VALUES ('Read Only', 'View-only access across all CRM entities. Cannot create, update, or delete any records.', true, true);
  ELSE
    UPDATE security_role SET is_system = true WHERE name = 'Read Only' AND deleted_at IS NULL;
  END IF;

  -- ── Teams ──────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM team WHERE name = 'Sales Team' AND deleted_at IS NULL) THEN
    INSERT INTO team (business_unit_id, name, description, team_type, is_active)
    VALUES (v_sales_bu_id, 'Sales Team', 'Core sales team covering all sales activities and pipeline management', 'standard', true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM team WHERE name = 'Marketing Team' AND deleted_at IS NULL) THEN
    INSERT INTO team (business_unit_id, name, description, team_type, is_active)
    VALUES (v_mkt_bu_id, 'Marketing Team', 'Marketing team managing campaigns, events, and lead generation', 'standard', true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM team WHERE name = 'Support Team' AND deleted_at IS NULL) THEN
    INSERT INTO team (business_unit_id, name, description, team_type, is_active)
    VALUES (v_sup_bu_id, 'Support Team', 'Customer support team handling tickets and service requests', 'standard', true);
  END IF;

END $$;

-- ─────────────────────────────────────────────
-- 4. Seed privileges for System Administrator
--    (all permissions, organization scope)
-- ─────────────────────────────────────────────
DO $$
DECLARE v_role_id uuid;
BEGIN
  SELECT role_id INTO v_role_id FROM security_role WHERE name = 'System Administrator' AND deleted_at IS NULL LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    DELETE FROM role_privilege WHERE role_id = v_role_id;
    INSERT INTO role_privilege (role_id, entity_name, can_create, can_read, can_write, can_delete, can_assign, can_share, access_level)
    SELECT v_role_id, e.logical_name, true, true, true, true, true, true, 'organization'
    FROM entity_definition e WHERE e.is_active = true AND e.deleted_at IS NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 5. Seed privileges for Read Only
-- ─────────────────────────────────────────────
DO $$
DECLARE v_role_id uuid;
BEGIN
  SELECT role_id INTO v_role_id FROM security_role WHERE name = 'Read Only' AND deleted_at IS NULL LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    DELETE FROM role_privilege WHERE role_id = v_role_id;
    INSERT INTO role_privilege (role_id, entity_name, can_create, can_read, can_write, can_delete, can_assign, can_share, access_level)
    SELECT v_role_id, e.logical_name, false, true, false, false, false, false, 'organization'
    FROM entity_definition e WHERE e.is_active = true AND e.deleted_at IS NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 6. Seed privileges for Sales Manager
-- ─────────────────────────────────────────────
DO $$
DECLARE v_role_id uuid;
BEGIN
  SELECT role_id INTO v_role_id FROM security_role WHERE name = 'Sales Manager' AND deleted_at IS NULL LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    DELETE FROM role_privilege WHERE role_id = v_role_id;
    INSERT INTO role_privilege (role_id, entity_name, can_create, can_read, can_write, can_delete, can_assign, can_share, access_level)
    VALUES
      (v_role_id, 'lead',        true,  true, true,  true,  true,  true,  'parent_bu'),
      (v_role_id, 'opportunity', true,  true, true,  true,  true,  true,  'parent_bu'),
      (v_role_id, 'account',     true,  true, true,  false, true,  true,  'parent_bu'),
      (v_role_id, 'contact',     true,  true, true,  false, true,  true,  'parent_bu'),
      (v_role_id, 'campaign',    false, true, false, false, false, false, 'organization'),
      (v_role_id, 'ticket',      false, true, false, false, false, false, 'organization');
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 7. Seed privileges for Sales User
-- ─────────────────────────────────────────────
DO $$
DECLARE v_role_id uuid;
BEGIN
  SELECT role_id INTO v_role_id FROM security_role WHERE name = 'Sales User' AND deleted_at IS NULL LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    DELETE FROM role_privilege WHERE role_id = v_role_id;
    INSERT INTO role_privilege (role_id, entity_name, can_create, can_read, can_write, can_delete, can_assign, can_share, access_level)
    VALUES
      (v_role_id, 'lead',        true,  true, true,  false, false, true,  'user'),
      (v_role_id, 'opportunity', true,  true, true,  false, false, true,  'user'),
      (v_role_id, 'account',     true,  true, true,  false, false, false, 'business_unit'),
      (v_role_id, 'contact',     true,  true, true,  false, false, false, 'business_unit'),
      (v_role_id, 'campaign',    false, true, false, false, false, false, 'organization'),
      (v_role_id, 'ticket',      false, true, false, false, false, false, 'organization');
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 8. Seed privileges for Marketing Manager
-- ─────────────────────────────────────────────
DO $$
DECLARE v_role_id uuid;
BEGIN
  SELECT role_id INTO v_role_id FROM security_role WHERE name = 'Marketing Manager' AND deleted_at IS NULL LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    DELETE FROM role_privilege WHERE role_id = v_role_id;
    INSERT INTO role_privilege (role_id, entity_name, can_create, can_read, can_write, can_delete, can_assign, can_share, access_level)
    VALUES
      (v_role_id, 'campaign',        true,  true, true,  true,  true,  true,  'organization'),
      (v_role_id, 'event',           true,  true, true,  true,  false, false, 'organization'),
      (v_role_id, 'marketing_email', true,  true, true,  true,  false, false, 'organization'),
      (v_role_id, 'segment',         true,  true, true,  true,  false, false, 'organization'),
      (v_role_id, 'lead',            false, true, false, false, false, false, 'organization'),
      (v_role_id, 'contact',         false, true, false, false, false, false, 'organization');
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 9. Seed privileges for Support Agent
-- ─────────────────────────────────────────────
DO $$
DECLARE v_role_id uuid;
BEGIN
  SELECT role_id INTO v_role_id FROM security_role WHERE name = 'Support Agent' AND deleted_at IS NULL LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    DELETE FROM role_privilege WHERE role_id = v_role_id;
    INSERT INTO role_privilege (role_id, entity_name, can_create, can_read, can_write, can_delete, can_assign, can_share, access_level)
    VALUES
      (v_role_id, 'ticket',  true,  true, true,  false, true,  false, 'business_unit'),
      (v_role_id, 'account', false, true, false, false, false, false, 'organization'),
      (v_role_id, 'contact', false, true, true,  false, false, false, 'organization'),
      (v_role_id, 'lead',    false, true, false, false, false, false, 'organization');
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 10. Assign System Administrator role to admin user
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_user_id uuid;
  v_role_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM crm_user WHERE email = 'admin@montyfinance.com' AND deleted_at IS NULL LIMIT 1;
  SELECT role_id INTO v_role_id FROM security_role WHERE name = 'System Administrator' AND deleted_at IS NULL LIMIT 1;
  IF v_user_id IS NOT NULL AND v_role_id IS NOT NULL THEN
    INSERT INTO user_security_role (user_id, role_id)
    VALUES (v_user_id, v_role_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
