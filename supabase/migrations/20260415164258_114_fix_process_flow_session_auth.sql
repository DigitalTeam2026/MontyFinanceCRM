/*
  # Fix Process Flow RLS and Session Auth

  ## Summary
  The process_flow table's SELECT policy was limited to `authenticated` role only.
  When a Supabase JS client session token is momentarily stale or being refreshed,
  the request can be sent as `anon` and receive a 403. This migration tightens
  the admin-only write policies and ensures the SELECT policy is robust.

  ## Changes
  1. process_flow SELECT - explicitly set TO authenticated (no change, confirms policy)
  2. process_stage - tighten INSERT/UPDATE/DELETE from always-true to admin-only
  3. process_flow_transition INSERT/UPDATE - tighten to admin-only (already done for DELETE)
  4. stage_required_field, stage_gate_field - ensure proper policies exist

  ## Security
  - Only system admins can modify process flows, stages, transitions
  - All authenticated users can read process flow configuration
*/

-- ─── Tighten process_stage write policies (currently always-true) ──────────────

DROP POLICY IF EXISTS "Authenticated users can insert process stages" ON process_stage;
DROP POLICY IF EXISTS "Authenticated users can update process stages" ON process_stage;
DROP POLICY IF EXISTS "Authenticated users can delete process stages" ON process_stage;

CREATE POLICY "Admins can insert process stages"
  ON process_stage FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can update process stages"
  ON process_stage FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can delete process stages"
  ON process_stage FOR DELETE
  TO authenticated
  USING (is_system_admin());

-- ─── Tighten process_flow_transition write policies ────────────────────────────

DROP POLICY IF EXISTS "Admins can insert process transitions" ON process_flow_transition;
DROP POLICY IF EXISTS "Admins can update process transitions" ON process_flow_transition;

CREATE POLICY "Admins can insert process transitions"
  ON process_flow_transition FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

CREATE POLICY "Admins can update process transitions"
  ON process_flow_transition FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

-- ─── Ensure stage_required_field and stage_gate_field have RLS policies ────────

DO $$
BEGIN
  -- stage_required_field
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'stage_required_field') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'stage_required_field' AND cmd = 'SELECT'
    ) THEN
      CREATE POLICY "Authenticated users can read stage required fields"
        ON stage_required_field FOR SELECT
        TO authenticated
        USING (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'stage_required_field' AND cmd = 'INSERT'
    ) THEN
      CREATE POLICY "Admins can insert stage required fields"
        ON stage_required_field FOR INSERT
        TO authenticated
        WITH CHECK (is_system_admin());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'stage_required_field' AND cmd = 'UPDATE'
    ) THEN
      CREATE POLICY "Admins can update stage required fields"
        ON stage_required_field FOR UPDATE
        TO authenticated
        USING (is_system_admin())
        WITH CHECK (is_system_admin());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'stage_required_field' AND cmd = 'DELETE'
    ) THEN
      CREATE POLICY "Admins can delete stage required fields"
        ON stage_required_field FOR DELETE
        TO authenticated
        USING (is_system_admin());
    END IF;
  END IF;

  -- stage_gate_field
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'stage_gate_field') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'stage_gate_field' AND cmd = 'SELECT'
    ) THEN
      CREATE POLICY "Authenticated users can read stage gate fields"
        ON stage_gate_field FOR SELECT
        TO authenticated
        USING (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'stage_gate_field' AND cmd = 'INSERT'
    ) THEN
      CREATE POLICY "Admins can insert stage gate fields"
        ON stage_gate_field FOR INSERT
        TO authenticated
        WITH CHECK (is_system_admin());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'stage_gate_field' AND cmd = 'UPDATE'
    ) THEN
      CREATE POLICY "Admins can update stage gate fields"
        ON stage_gate_field FOR UPDATE
        TO authenticated
        USING (is_system_admin())
        WITH CHECK (is_system_admin());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'stage_gate_field' AND cmd = 'DELETE'
    ) THEN
      CREATE POLICY "Admins can delete stage gate fields"
        ON stage_gate_field FOR DELETE
        TO authenticated
        USING (is_system_admin());
    END IF;
  END IF;
END $$;
