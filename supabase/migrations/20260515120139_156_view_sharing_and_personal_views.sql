/*
  # View Sharing & Personal View Enhancements

  ## Summary
  Enables end-users to save personal views, share views with specific users or teams,
  and manage view access permissions — all from the main app UI.

  ## New Tables
  - `view_sharing` — Maps a view to a recipient (user or team) with a permission level
    - `view_sharing_id` (uuid, PK)
    - `view_id` (uuid, FK → view_definition)
    - `shared_with_user_id` (uuid, nullable) — target crm_user
    - `shared_with_team_id` (uuid, nullable) — target team
    - `permission_level` (text) — 'read' | 'write'
    - `created_by` (uuid)
    - `created_at` (timestamptz)

  ## Modified Tables
  - `view_definition` — no schema changes; existing `view_type` and `created_by` fields are used

  ## Security
  - RLS enabled on `view_sharing`
  - Owners can insert, update, delete shares for their own views
  - Recipients can read shares that target them
*/

CREATE TABLE IF NOT EXISTS view_sharing (
  view_sharing_id   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  view_id           uuid        NOT NULL REFERENCES view_definition(view_id) ON DELETE CASCADE,
  shared_with_user_id uuid      REFERENCES crm_user(user_id) ON DELETE CASCADE,
  shared_with_team_id uuid      REFERENCES team(team_id) ON DELETE CASCADE,
  permission_level  text        NOT NULL DEFAULT 'read' CHECK (permission_level IN ('read', 'write')),
  created_by        uuid        REFERENCES crm_user(user_id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT view_sharing_target_check CHECK (
    (shared_with_user_id IS NOT NULL) OR (shared_with_team_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_view_sharing_view_id         ON view_sharing(view_id);
CREATE INDEX IF NOT EXISTS idx_view_sharing_user_id         ON view_sharing(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_view_sharing_team_id         ON view_sharing(shared_with_team_id);

ALTER TABLE view_sharing ENABLE ROW LEVEL SECURITY;

-- View owners can see all shares on their views
CREATE POLICY "View owners can read their view shares"
  ON view_sharing FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM view_definition vd
      WHERE vd.view_id = view_sharing.view_id
        AND vd.created_by = auth.uid()
    )
  );

-- Recipients can see shares that target them
CREATE POLICY "Users can read shares targeting them"
  ON view_sharing FOR SELECT
  TO authenticated
  USING (shared_with_user_id = auth.uid());

-- View owners can create shares for their own views
CREATE POLICY "View owners can create shares"
  ON view_sharing FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM view_definition vd
      WHERE vd.view_id = view_sharing.view_id
        AND vd.created_by = auth.uid()
    )
  );

-- View owners can update shares on their own views
CREATE POLICY "View owners can update shares"
  ON view_sharing FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM view_definition vd
      WHERE vd.view_id = view_sharing.view_id
        AND vd.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM view_definition vd
      WHERE vd.view_id = view_sharing.view_id
        AND vd.created_by = auth.uid()
    )
  );

-- View owners can delete shares on their own views
CREATE POLICY "View owners can delete shares"
  ON view_sharing FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM view_definition vd
      WHERE vd.view_id = view_sharing.view_id
        AND vd.created_by = auth.uid()
    )
  );

-- Allow authenticated users to read view_definition for views shared with them
-- (we extend the existing view_definition policies to cover shared views)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'view_definition' AND policyname = 'Users can read views shared with them'
  ) THEN
    CREATE POLICY "Users can read views shared with them"
      ON view_definition FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM view_sharing vs
          WHERE vs.view_id = view_definition.view_id
            AND vs.shared_with_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Allow write access to views where user has 'write' share permission
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'view_definition' AND policyname = 'Shared-write users can update view'
  ) THEN
    CREATE POLICY "Shared-write users can update view"
      ON view_definition FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM view_sharing vs
          WHERE vs.view_id = view_definition.view_id
            AND vs.shared_with_user_id = auth.uid()
            AND vs.permission_level = 'write'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM view_sharing vs
          WHERE vs.view_id = view_definition.view_id
            AND vs.shared_with_user_id = auth.uid()
            AND vs.permission_level = 'write'
        )
      );
  END IF;
END $$;
