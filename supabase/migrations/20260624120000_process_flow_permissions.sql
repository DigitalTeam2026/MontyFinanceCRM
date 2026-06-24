/*
  # Business Process Flow Permissions (per security role)

  ## Summary
  Lets admins control WHICH business process flows each security role may use.
  Generic: works for any flow (existing or created later). At runtime, when a user
  creates / opens a record, the system applies a process flow (and its linked form)
  only if the user's role(s) are allowed to use that flow — complementing the
  per-form permissions in `form_permission`.

  ## New Table
  - `process_flow_permission`
    - `process_flow_permission_id` (uuid, pk)
    - `role_id`          (uuid, FK → security_role)  — owning role
    - `process_flow_id`  (uuid, FK → process_flow)   — the granted flow
    - `is_allowed`       (bool)                        — true = role may use this flow

  ## Security model (DENY by default)
  1. A missing row = the flow is NOT available to the role (whitelist-allow).
  2. Grants are additive across a user's roles: ANY role granting a flow ⇒ allowed.
  3. System admins bypass all flow restrictions (handled in the app layer).

  ## Rollout backfill
  Every existing (non-deleted role × non-deleted flow) pair is granted on creation
  so current behaviour is preserved; deny-by-default governs only flows created
  after this migration.

  ## Notes
  - RLS mirrors the other permission tables (form_permission / action_permission):
    authenticated users may read (CRM renderer) and write (Admin Studio).
  - `UNIQUE (role_id, process_flow_id)` lets the app delete-then-insert cleanly.
*/

CREATE TABLE IF NOT EXISTS process_flow_permission (
  process_flow_permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id          uuid NOT NULL REFERENCES security_role(role_id) ON DELETE CASCADE,
  process_flow_id  uuid NOT NULL REFERENCES process_flow(process_flow_id) ON DELETE CASCADE,
  is_allowed       boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  modified_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, process_flow_id)
);

CREATE INDEX IF NOT EXISTS idx_process_flow_permission_role ON process_flow_permission(role_id);
CREATE INDEX IF NOT EXISTS idx_process_flow_permission_flow ON process_flow_permission(process_flow_id);

ALTER TABLE process_flow_permission ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view process flow permissions"
  ON process_flow_permission FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert process flow permissions"
  ON process_flow_permission FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update process flow permissions"
  ON process_flow_permission FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete process flow permissions"
  ON process_flow_permission FOR DELETE
  TO authenticated
  USING (true);

-- Rollout backfill: grant every existing flow to every existing role so current
-- users keep their access. Deny-by-default applies only to flows created later.
INSERT INTO process_flow_permission (role_id, process_flow_id, is_allowed)
SELECT r.role_id, pf.process_flow_id, true
FROM security_role r
CROSS JOIN process_flow pf
WHERE r.deleted_at IS NULL
  AND pf.deleted_at IS NULL
ON CONFLICT (role_id, process_flow_id) DO NOTHING;
