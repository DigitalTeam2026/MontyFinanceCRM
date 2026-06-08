/*
  # Recent Items and Pinned Records

  ## Overview
  Adds two tables to power the "Recent + Pinned" sidebar feature in the CRM app.

  ## New Tables

  ### `recent_items`
  Tracks the last N records each user has viewed.
  - `id` (uuid, pk)
  - `user_id` (uuid) – references auth.users
  - `entity` (text) – entity type e.g. 'accounts', 'contacts'
  - `module` (text) – module e.g. 'sales', 'support'
  - `record_id` (text) – the record's primary key
  - `record_label` (text) – display name captured at view time
  - `viewed_at` (timestamptz) – when it was last viewed

  ### `pinned_records`
  Stores records a user has explicitly starred/pinned.
  - `id` (uuid, pk)
  - `user_id` (uuid) – references auth.users
  - `entity` (text)
  - `module` (text)
  - `record_id` (text)
  - `record_label` (text)
  - `pinned_at` (timestamptz)
  - UNIQUE(user_id, entity, record_id) – one pin per record per user

  ## Security
  - RLS enabled on both tables
  - Users can only read/write their own rows
*/

CREATE TABLE IF NOT EXISTS recent_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity     text NOT NULL,
  module     text NOT NULL,
  record_id  text NOT NULL,
  record_label text NOT NULL DEFAULT '',
  viewed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recent_items_user_viewed ON recent_items (user_id, viewed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS recent_items_user_entity_record ON recent_items (user_id, entity, record_id);

ALTER TABLE recent_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own recent items"
  ON recent_items FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recent items"
  ON recent_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recent items"
  ON recent_items FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recent items"
  ON recent_items FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS pinned_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity       text NOT NULL,
  module       text NOT NULL,
  record_id    text NOT NULL,
  record_label text NOT NULL DEFAULT '',
  pinned_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity, record_id)
);

CREATE INDEX IF NOT EXISTS pinned_records_user_pinned ON pinned_records (user_id, pinned_at DESC);

ALTER TABLE pinned_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own pinned records"
  ON pinned_records FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pinned records"
  ON pinned_records FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pinned records"
  ON pinned_records FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own pinned records"
  ON pinned_records FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
