/*
  # Action-Level Permissions

  ## Summary
  Adds a table that controls named UI action permissions scoped to a security role.
  This is finer-grained than entity-level CRUD — it lets admins restrict specific
  business actions (e.g. "Close Opportunity", "Delete", "Qualify Lead") per role
  without removing general write access.

  ## New Tables
  - `action_permission`
    - `action_permission_id` (uuid, pk)
    - `role_id` (uuid, FK → security_role)
    - `entity_name` (text) — matches entity logical name, e.g. "opportunity"
    - `action_key` (text) — stable identifier for the action, e.g. "close_won"
    - `action_label` (text) — human-readable label for the UI
    - `is_denied` (bool) — true = the role cannot perform this action

  ## Predefined Action Keys (enforced in frontend)
    Per entity:
    - "delete"              — delete a record (all entities)
    - "assign"             — reassign ownership (all entities)
    - "export"             — export records to CSV (all entities)
    - "bulk_delete"        — bulk delete (all entities)
    - "bulk_assign"        — bulk assign (all entities)
    - "close_won"          — close opportunity as Won (opportunity)
    - "close_lost"         — close opportunity as Lost (opportunity)
    - "qualify"            — qualify a lead (lead)
    - "resolve"            — resolve a ticket (ticket)

  ## Security
  - RLS enabled
  - Authenticated users can SELECT (needed by CRM renderer)
  - Authenticated users can INSERT/UPDATE/DELETE (for admin studio)

  ## Notes
  1. A missing row = action is allowed (whitelist-deny model).
  2. Restrictions are additive: ANY role denying = denied (unless sysadmin).
  3. System admins bypass all action restrictions.
  4. `UNIQUE (role_id, entity_name, action_key)` prevents duplicate rules.
*/

CREATE TABLE IF NOT EXISTS action_permission (
  action_permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id              uuid NOT NULL REFERENCES security_role(role_id) ON DELETE CASCADE,
  entity_name          text NOT NULL,
  action_key           text NOT NULL,
  action_label         text NOT NULL DEFAULT '',
  is_denied            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  modified_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, entity_name, action_key)
);

CREATE INDEX IF NOT EXISTS idx_action_permission_role   ON action_permission(role_id);
CREATE INDEX IF NOT EXISTS idx_action_permission_entity ON action_permission(entity_name);

ALTER TABLE action_permission ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view action permissions"
  ON action_permission FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert action permissions"
  ON action_permission FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update action permissions"
  ON action_permission FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete action permissions"
  ON action_permission FOR DELETE
  TO authenticated
  USING (true);
