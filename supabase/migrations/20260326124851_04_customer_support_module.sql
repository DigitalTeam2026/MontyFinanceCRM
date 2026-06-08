
/*
  # Migration 4: Customer Support Module

  ## Overview
  Creates all Customer Support entities including the ticket lifecycle,
  priority levels, status workflow, and ticket comments.

  ## New Tables

  ### Reference Tables
  - `ticket_priority` — Priority levels (Low, Medium, High, Critical) with sort order
  - `ticket_status` — Status workflow states (New, In Progress, Waiting, Resolved, Closed)
    with is_closed flag to distinguish active vs closed states

  ### Core Support Entities
  - `ticket` — The central support case/ticket entity
    Linked to account and contact, assigned to a team, owned by a user or team.
    Includes ticket_number for human-readable reference.
  - `ticket_comment` — Threaded comments on a ticket.
    Supports internal notes (is_internal) and public customer-facing replies.

  ## Standard Columns
  ticket follows the same ownership pattern as all business entities:
    owner_type, owner_id, business_unit_id, status_code (text, in addition to status_id FK),
    custom_fields JSONB, created_at/by, modified_at/by, is_deleted, version_no

  ## Notes
  - ticket_number is auto-generated using a sequence for human-readable IDs (e.g. TKT-00001)
  - ticket_status.is_closed allows queries to quickly filter active vs resolved tickets
  - ticket_comment.is_internal supports private internal notes not visible to customers

  ## Security
  - RLS on all tables
  - Ticket access follows same ownership model as sales entities
  - Comments inherit access from their parent ticket
*/

-- ─────────────────────────────────────────────
-- TICKET NUMBER SEQUENCE
-- Generates human-readable ticket numbers
-- ─────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1000;

-- ─────────────────────────────────────────────
-- TICKET PRIORITY
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_priority (
  priority_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  sort_order    integer NOT NULL DEFAULT 0,
  color         text,
  is_active     boolean NOT NULL DEFAULT true
);

ALTER TABLE ticket_priority ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ticket priorities"
  ON ticket_priority FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert ticket priorities"
  ON ticket_priority FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update ticket priorities"
  ON ticket_priority FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- TICKET STATUS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_status (
  status_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  sort_order    integer NOT NULL DEFAULT 0,
  color         text,
  is_closed     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true
);

ALTER TABLE ticket_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ticket statuses"
  ON ticket_status FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert ticket statuses"
  ON ticket_status FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update ticket statuses"
  ON ticket_status FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- TICKET
-- Central support case entity
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket (
  ticket_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number       text NOT NULL UNIQUE DEFAULT ('TKT-' || LPAD(nextval('ticket_number_seq')::text, 5, '0')),
  title               text NOT NULL DEFAULT '',
  description         text,
  account_id          uuid REFERENCES account(account_id),
  contact_id          uuid REFERENCES contact(contact_id),
  opportunity_id      uuid REFERENCES opportunity(opportunity_id),
  priority_id         uuid REFERENCES ticket_priority(priority_id),
  status_id           uuid REFERENCES ticket_status(status_id),
  assigned_user_id    uuid REFERENCES crm_user(user_id),
  assigned_team_id    uuid REFERENCES team(team_id),
  resolution          text,
  resolved_at         timestamptz,
  first_response_at   timestamptz,
  due_date            timestamptz,
  owner_type          text NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'team')),
  owner_id            uuid NOT NULL,
  business_unit_id    uuid REFERENCES business_unit(business_unit_id),
  status_code         text NOT NULL DEFAULT 'active',
  status_reason       text,
  custom_fields       jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES crm_user(user_id),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  modified_by         uuid REFERENCES crm_user(user_id),
  is_deleted          boolean NOT NULL DEFAULT false,
  version_no          integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_ticket_account ON ticket(account_id);
CREATE INDEX IF NOT EXISTS idx_ticket_contact ON ticket(contact_id);
CREATE INDEX IF NOT EXISTS idx_ticket_priority ON ticket(priority_id);
CREATE INDEX IF NOT EXISTS idx_ticket_status ON ticket(status_id);
CREATE INDEX IF NOT EXISTS idx_ticket_owner ON ticket(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_ticket_business_unit ON ticket(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assigned_user ON ticket(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assigned_team ON ticket(assigned_team_id);
CREATE INDEX IF NOT EXISTS idx_ticket_is_deleted ON ticket(is_deleted);
CREATE INDEX IF NOT EXISTS idx_ticket_number ON ticket(ticket_number);

ALTER TABLE ticket ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tickets they have access to"
  ON ticket FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND crm_user_has_access('ticket', ticket_id, owner_type, owner_id)
  );

CREATE POLICY "Authenticated users can insert tickets"
  ON ticket FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update tickets they own or are shared with write"
  ON ticket FOR UPDATE
  TO authenticated
  USING (crm_user_has_access('ticket', ticket_id, owner_type, owner_id))
  WITH CHECK (modified_by = auth.uid());

-- ─────────────────────────────────────────────
-- TICKET COMMENT
-- Threaded comments and internal notes on a ticket
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_comment (
  ticket_comment_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           uuid NOT NULL REFERENCES ticket(ticket_id) ON DELETE CASCADE,
  comment_text        text NOT NULL DEFAULT '',
  is_internal         boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES crm_user(user_id),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  modified_by         uuid REFERENCES crm_user(user_id),
  is_deleted          boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_ticket_comment_ticket ON ticket_comment(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comment_created_by ON ticket_comment(created_by);
CREATE INDEX IF NOT EXISTS idx_ticket_comment_is_deleted ON ticket_comment(is_deleted);

ALTER TABLE ticket_comment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments on tickets they have access to"
  ON ticket_comment FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM ticket t
      WHERE t.ticket_id = ticket_comment.ticket_id
        AND crm_user_has_access('ticket', t.ticket_id, t.owner_type, t.owner_id)
    )
  );

CREATE POLICY "Users can insert comments on tickets they have access to"
  ON ticket_comment FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM ticket t
      WHERE t.ticket_id = ticket_comment.ticket_id
        AND crm_user_has_access('ticket', t.ticket_id, t.owner_type, t.owner_id)
    )
  );

CREATE POLICY "Users can update their own comments"
  ON ticket_comment FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (modified_by = auth.uid());
