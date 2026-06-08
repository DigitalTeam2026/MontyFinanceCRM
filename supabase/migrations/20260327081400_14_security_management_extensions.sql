/*
  # Migration 14: Security Management Extensions

  ## Overview
  Extends existing security/organization tables with soft-delete support and
  adds missing RLS policies for full CRUD via the Admin Studio UI.

  ## Changes

  ### business_unit
  - Add `deleted_at` for soft deletes

  ### security_role
  - Add `deleted_at` for soft deletes

  ### team
  - Add `deleted_at` for soft deletes

  ### crm_user
  - `deleted_at` already soft-deletes via is_active=false pattern; add column for consistency

  ## Security
  - All existing RLS policies remain intact
  - Add INSERT/UPDATE/DELETE policies where missing

  ## Notes
  - All ALTER statements are guarded with IF NOT EXISTS
  - No data is dropped or modified
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_unit' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE business_unit ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_role' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE security_role ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE team ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crm_user' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE crm_user ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'business_unit' AND policyname = 'Authenticated users can insert business units'
  ) THEN
    CREATE POLICY "Authenticated users can insert business units"
      ON business_unit FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'business_unit' AND policyname = 'Authenticated users can update business units'
  ) THEN
    CREATE POLICY "Authenticated users can update business units"
      ON business_unit FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'security_role' AND policyname = 'Authenticated users can insert security roles'
  ) THEN
    CREATE POLICY "Authenticated users can insert security roles"
      ON security_role FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'security_role' AND policyname = 'Authenticated users can update security roles'
  ) THEN
    CREATE POLICY "Authenticated users can update security roles"
      ON security_role FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'team' AND policyname = 'Authenticated users can insert teams'
  ) THEN
    CREATE POLICY "Authenticated users can insert teams"
      ON team FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'team' AND policyname = 'Authenticated users can update teams'
  ) THEN
    CREATE POLICY "Authenticated users can update teams"
      ON team FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'team_user' AND policyname = 'Authenticated users can insert team members'
  ) THEN
    CREATE POLICY "Authenticated users can insert team members"
      ON team_user FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'team_user' AND policyname = 'Authenticated users can delete team members'
  ) THEN
    CREATE POLICY "Authenticated users can delete team members"
      ON team_user FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_security_role' AND policyname = 'Authenticated users can insert user roles'
  ) THEN
    CREATE POLICY "Authenticated users can insert user roles"
      ON user_security_role FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_security_role' AND policyname = 'Authenticated users can delete user roles'
  ) THEN
    CREATE POLICY "Authenticated users can delete user roles"
      ON user_security_role FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'team_security_role' AND policyname = 'Authenticated users can insert team roles'
  ) THEN
    CREATE POLICY "Authenticated users can insert team roles"
      ON team_security_role FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'team_security_role' AND policyname = 'Authenticated users can delete team roles'
  ) THEN
    CREATE POLICY "Authenticated users can delete team roles"
      ON team_security_role FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'role_privilege' AND policyname = 'Authenticated users can insert privileges'
  ) THEN
    CREATE POLICY "Authenticated users can insert privileges"
      ON role_privilege FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'role_privilege' AND policyname = 'Authenticated users can update privileges'
  ) THEN
    CREATE POLICY "Authenticated users can update privileges"
      ON role_privilege FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'role_privilege' AND policyname = 'Authenticated users can delete privileges'
  ) THEN
    CREATE POLICY "Authenticated users can delete privileges"
      ON role_privilege FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crm_user' AND policyname = 'Authenticated users can insert crm users'
  ) THEN
    CREATE POLICY "Authenticated users can insert crm users"
      ON crm_user FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crm_user' AND policyname = 'Authenticated users can update crm users'
  ) THEN
    CREATE POLICY "Authenticated users can update crm users"
      ON crm_user FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
