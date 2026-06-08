/*
  # Notifications System

  ## Summary
  Adds a complete in-app notifications system supporting:
  - Assignment notifications (record assigned to you)
  - Mention notifications (@user in notes/activities)
  - Workflow alert notifications (triggered by workflow steps)
  - Real-time delivery via Supabase Realtime
  - Per-user read/dismiss state

  ## New Tables

  ### user_notification
  Stores individual notifications delivered to a specific user.
  - `notification_id` (uuid, PK)
  - `recipient_id` (uuid) — the crm_user.user_id who receives it
  - `sender_id` (uuid, nullable) — who triggered it (null for system/workflow)
  - `type` (text) — 'assignment' | 'mention' | 'workflow_alert'
  - `title` (text) — short headline
  - `body` (text, nullable) — longer description
  - `entity_name` (text, nullable) — entity context ('account', 'contact', etc.)
  - `record_id` (uuid, nullable) — navigate to this record on click
  - `is_read` (boolean, default false)
  - `is_dismissed` (boolean, default false)
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Users can only see/update their own notifications
  - INSERT is open to authenticated users (server-side notification creation)
  - Realtime enabled for instant delivery

  ## Notes
  - Soft-dismiss pattern: dismissed notifications are hidden but kept for history
  - No hard delete to maintain notification audit trail
*/

CREATE TABLE IF NOT EXISTS user_notification (
  notification_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type              text NOT NULL CHECK (type IN ('assignment', 'mention', 'workflow_alert')),
  title             text NOT NULL,
  body              text,
  entity_name       text,
  record_id         uuid,
  is_read           boolean NOT NULL DEFAULT false,
  is_dismissed      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notification_recipient
  ON user_notification(recipient_id, is_dismissed, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notification_unread
  ON user_notification(recipient_id, is_read) WHERE is_dismissed = false;

ALTER TABLE user_notification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON user_notification FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Authenticated users can create notifications"
  ON user_notification FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
  ON user_notification FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE user_notification;
