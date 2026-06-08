
/*
  # Migration 5: Marketing Module

  ## Overview
  Creates all Marketing entities including campaigns, events, emails, segments,
  journeys, and campaign membership tracking.

  ## New Tables

  ### Core Marketing Entities
  - `campaign` — Marketing campaign with date range and budget
  - `event` — Physical or virtual event optionally linked to a campaign
  - `marketing_email` — Email communications optionally linked to a campaign
  - `segment` — Dynamic or static audience definition using criteria_json
  - `journey` — Automated customer journey optionally linked to segment and campaign
  - `journey_step` — Individual steps in a journey (email send, wait, condition, etc.)
  - `campaign_member` — Tracks which leads/contacts/accounts are part of a campaign
    Uses member_type polymorphism ('lead' | 'contact' | 'account') with member_id UUID

  ## Design Notes
  - All core entities follow the standard ownership pattern
  - segment.criteria_json stores the audience filter rules (evaluated at runtime or snapshot)
  - journey_step.config_json stores step-specific configuration
  - campaign_member.response_status tracks engagement (e.g. 'sent', 'opened', 'clicked', 'responded')
  - marketing_email.body is text (can store HTML); template support to be added in Phase 2

  ## Security
  - RLS on all tables
  - Ownership-based access consistent with other modules
  - campaign_member access tied to campaign ownership
*/

-- ─────────────────────────────────────────────
-- CAMPAIGN
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign (
  campaign_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL DEFAULT '',
  campaign_type       text NOT NULL DEFAULT 'email' CHECK (campaign_type IN (
                        'email', 'event', 'social', 'content', 'paid', 'other'
                      )),
  description         text,
  start_date          date,
  end_date            date,
  budget              numeric(18, 2),
  currency_id         uuid REFERENCES currency(currency_id),
  actual_cost         numeric(18, 2),
  expected_response   integer,
  expected_revenue    numeric(18, 2),
  owner_type          text NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'team')),
  owner_id            uuid NOT NULL,
  business_unit_id    uuid REFERENCES business_unit(business_unit_id),
  status_code         text NOT NULL DEFAULT 'planning' CHECK (status_code IN (
                        'planning', 'active', 'paused', 'completed', 'cancelled'
                      )),
  status_reason       text,
  custom_fields       jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES crm_user(user_id),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  modified_by         uuid REFERENCES crm_user(user_id),
  is_deleted          boolean NOT NULL DEFAULT false,
  version_no          integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_campaign_owner ON campaign(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_campaign_business_unit ON campaign(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_campaign_status ON campaign(status_code);
CREATE INDEX IF NOT EXISTS idx_campaign_is_deleted ON campaign(is_deleted);

ALTER TABLE campaign ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view campaigns they have access to"
  ON campaign FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND crm_user_has_access('campaign', campaign_id, owner_type, owner_id)
  );

CREATE POLICY "Authenticated users can insert campaigns"
  ON campaign FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update campaigns they own or are shared with write"
  ON campaign FOR UPDATE
  TO authenticated
  USING (crm_user_has_access('campaign', campaign_id, owner_type, owner_id))
  WITH CHECK (modified_by = auth.uid());

-- ─────────────────────────────────────────────
-- EVENT
-- Physical or virtual event, optionally part of a campaign
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event (
  event_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid REFERENCES campaign(campaign_id),
  name                text NOT NULL DEFAULT '',
  event_type          text NOT NULL DEFAULT 'in_person' CHECK (event_type IN (
                        'in_person', 'virtual', 'hybrid', 'webinar', 'other'
                      )),
  description         text,
  start_date          timestamptz,
  end_date            timestamptz,
  location            text,
  venue_name          text,
  meeting_url         text,
  max_capacity        integer,
  owner_type          text NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'team')),
  owner_id            uuid NOT NULL,
  business_unit_id    uuid REFERENCES business_unit(business_unit_id),
  status_code         text NOT NULL DEFAULT 'planned' CHECK (status_code IN (
                        'planned', 'active', 'completed', 'cancelled'
                      )),
  status_reason       text,
  custom_fields       jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES crm_user(user_id),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  modified_by         uuid REFERENCES crm_user(user_id),
  is_deleted          boolean NOT NULL DEFAULT false,
  version_no          integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_event_campaign ON event(campaign_id);
CREATE INDEX IF NOT EXISTS idx_event_owner ON event(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_event_business_unit ON event(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_event_is_deleted ON event(is_deleted);

ALTER TABLE event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events they have access to"
  ON event FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND crm_user_has_access('event', event_id, owner_type, owner_id)
  );

CREATE POLICY "Authenticated users can insert events"
  ON event FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update events they own or are shared with write"
  ON event FOR UPDATE
  TO authenticated
  USING (crm_user_has_access('event', event_id, owner_type, owner_id))
  WITH CHECK (modified_by = auth.uid());

-- ─────────────────────────────────────────────
-- MARKETING EMAIL
-- Email communications linked to a campaign
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_email (
  email_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid REFERENCES campaign(campaign_id),
  subject             text NOT NULL DEFAULT '',
  preview_text        text,
  body                text,
  from_name           text,
  from_email          text,
  reply_to_email      text,
  scheduled_at        timestamptz,
  sent_at             timestamptz,
  total_sent          integer NOT NULL DEFAULT 0,
  total_delivered     integer NOT NULL DEFAULT 0,
  total_opened        integer NOT NULL DEFAULT 0,
  total_clicked       integer NOT NULL DEFAULT 0,
  total_bounced       integer NOT NULL DEFAULT 0,
  total_unsubscribed  integer NOT NULL DEFAULT 0,
  owner_type          text NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'team')),
  owner_id            uuid NOT NULL,
  business_unit_id    uuid REFERENCES business_unit(business_unit_id),
  status_code         text NOT NULL DEFAULT 'draft' CHECK (status_code IN (
                        'draft', 'scheduled', 'sending', 'sent', 'cancelled'
                      )),
  status_reason       text,
  custom_fields       jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES crm_user(user_id),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  modified_by         uuid REFERENCES crm_user(user_id),
  is_deleted          boolean NOT NULL DEFAULT false,
  version_no          integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_marketing_email_campaign ON marketing_email(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_email_owner ON marketing_email(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_marketing_email_business_unit ON marketing_email(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_marketing_email_is_deleted ON marketing_email(is_deleted);

ALTER TABLE marketing_email ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view marketing emails they have access to"
  ON marketing_email FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND crm_user_has_access('marketing_email', email_id, owner_type, owner_id)
  );

CREATE POLICY "Authenticated users can insert marketing emails"
  ON marketing_email FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update marketing emails they own"
  ON marketing_email FOR UPDATE
  TO authenticated
  USING (crm_user_has_access('marketing_email', email_id, owner_type, owner_id))
  WITH CHECK (modified_by = auth.uid());

-- ─────────────────────────────────────────────
-- SEGMENT
-- Dynamic or static audience definition
-- criteria_json stores filter rules evaluated at runtime
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS segment (
  segment_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL DEFAULT '',
  description         text,
  segment_type        text NOT NULL DEFAULT 'dynamic' CHECK (segment_type IN ('dynamic', 'static')),
  target_entity       text NOT NULL DEFAULT 'contact' CHECK (target_entity IN ('contact', 'lead', 'account')),
  criteria_json       jsonb,
  member_count        integer NOT NULL DEFAULT 0,
  last_evaluated_at   timestamptz,
  owner_type          text NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'team')),
  owner_id            uuid NOT NULL,
  business_unit_id    uuid REFERENCES business_unit(business_unit_id),
  status_code         text NOT NULL DEFAULT 'active' CHECK (status_code IN ('active', 'inactive')),
  status_reason       text,
  custom_fields       jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES crm_user(user_id),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  modified_by         uuid REFERENCES crm_user(user_id),
  is_deleted          boolean NOT NULL DEFAULT false,
  version_no          integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_segment_owner ON segment(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_segment_business_unit ON segment(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_segment_is_deleted ON segment(is_deleted);

ALTER TABLE segment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view segments they have access to"
  ON segment FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND crm_user_has_access('segment', segment_id, owner_type, owner_id)
  );

CREATE POLICY "Authenticated users can insert segments"
  ON segment FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update segments they own"
  ON segment FOR UPDATE
  TO authenticated
  USING (crm_user_has_access('segment', segment_id, owner_type, owner_id))
  WITH CHECK (modified_by = auth.uid());

-- ─────────────────────────────────────────────
-- JOURNEY
-- Automated customer journey
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journey (
  journey_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL DEFAULT '',
  description         text,
  segment_id          uuid REFERENCES segment(segment_id),
  campaign_id         uuid REFERENCES campaign(campaign_id),
  entry_trigger       text NOT NULL DEFAULT 'manual' CHECK (entry_trigger IN (
                        'manual', 'segment_join', 'form_submit', 'event_register',
                        'email_open', 'email_click', 'scheduled'
                      )),
  goal_description    text,
  owner_type          text NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'team')),
  owner_id            uuid NOT NULL,
  business_unit_id    uuid REFERENCES business_unit(business_unit_id),
  status_code         text NOT NULL DEFAULT 'draft' CHECK (status_code IN (
                        'draft', 'active', 'paused', 'completed', 'archived'
                      )),
  status_reason       text,
  custom_fields       jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES crm_user(user_id),
  modified_at         timestamptz NOT NULL DEFAULT now(),
  modified_by         uuid REFERENCES crm_user(user_id),
  is_deleted          boolean NOT NULL DEFAULT false,
  version_no          integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_journey_segment ON journey(segment_id);
CREATE INDEX IF NOT EXISTS idx_journey_campaign ON journey(campaign_id);
CREATE INDEX IF NOT EXISTS idx_journey_owner ON journey(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_journey_business_unit ON journey(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_journey_is_deleted ON journey(is_deleted);

ALTER TABLE journey ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view journeys they have access to"
  ON journey FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND crm_user_has_access('journey', journey_id, owner_type, owner_id)
  );

CREATE POLICY "Authenticated users can insert journeys"
  ON journey FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update journeys they own"
  ON journey FOR UPDATE
  TO authenticated
  USING (crm_user_has_access('journey', journey_id, owner_type, owner_id))
  WITH CHECK (modified_by = auth.uid());

-- ─────────────────────────────────────────────
-- JOURNEY STEP
-- Individual steps within a journey
-- step_type: 'email' | 'wait' | 'condition' | 'assign' | 'webhook' | 'notification' | 'goal'
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journey_step (
  journey_step_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id          uuid NOT NULL REFERENCES journey(journey_id) ON DELETE CASCADE,
  step_type           text NOT NULL CHECK (step_type IN (
                        'email', 'wait', 'condition', 'assign',
                        'webhook', 'notification', 'goal', 'exit'
                      )),
  name                text NOT NULL DEFAULT '',
  step_order          integer NOT NULL DEFAULT 0,
  config_json         jsonb NOT NULL DEFAULT '{}',
  next_step_id        uuid REFERENCES journey_step(journey_step_id),
  next_step_false_id  uuid REFERENCES journey_step(journey_step_id)
);

CREATE INDEX IF NOT EXISTS idx_journey_step_journey ON journey_step(journey_id);

ALTER TABLE journey_step ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view journey steps for journeys they have access to"
  ON journey_step FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM journey j
      WHERE j.journey_id = journey_step.journey_id
        AND crm_user_has_access('journey', j.journey_id, j.owner_type, j.owner_id)
    )
  );

CREATE POLICY "Authenticated users can insert journey steps"
  ON journey_step FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update journey steps"
  ON journey_step FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete journey steps"
  ON journey_step FOR DELETE
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- CAMPAIGN MEMBER
-- Tracks which leads/contacts/accounts are part of a campaign
-- member_type: 'lead' | 'contact' | 'account'
-- response_status: 'sent' | 'opened' | 'clicked' | 'responded' | 'unsubscribed' | 'bounced'
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_member (
  campaign_member_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid NOT NULL REFERENCES campaign(campaign_id) ON DELETE CASCADE,
  member_type         text NOT NULL CHECK (member_type IN ('lead', 'contact', 'account')),
  member_id           uuid NOT NULL,
  response_status     text NOT NULL DEFAULT 'none' CHECK (response_status IN (
                        'none', 'sent', 'opened', 'clicked', 'responded',
                        'unsubscribed', 'bounced', 'registered', 'attended'
                      )),
  added_at            timestamptz NOT NULL DEFAULT now(),
  responded_at        timestamptz,
  UNIQUE(campaign_id, member_type, member_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_member_campaign ON campaign_member(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_member_member ON campaign_member(member_type, member_id);

ALTER TABLE campaign_member ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view campaign members for campaigns they have access to"
  ON campaign_member FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign c
      WHERE c.campaign_id = campaign_member.campaign_id
        AND crm_user_has_access('campaign', c.campaign_id, c.owner_type, c.owner_id)
    )
  );

CREATE POLICY "Users can insert campaign members for campaigns they own"
  ON campaign_member FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign c
      WHERE c.campaign_id = campaign_member.campaign_id
        AND crm_user_has_access('campaign', c.campaign_id, c.owner_type, c.owner_id)
    )
  );

CREATE POLICY "Users can update campaign members for campaigns they own"
  ON campaign_member FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign c
      WHERE c.campaign_id = campaign_member.campaign_id
        AND crm_user_has_access('campaign', c.campaign_id, c.owner_type, c.owner_id)
    )
  )
  WITH CHECK (true);

CREATE POLICY "Users can delete campaign members for campaigns they own"
  ON campaign_member FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign c
      WHERE c.campaign_id = campaign_member.campaign_id
        AND crm_user_has_access('campaign', c.campaign_id, c.owner_type, c.owner_id)
    )
  );
