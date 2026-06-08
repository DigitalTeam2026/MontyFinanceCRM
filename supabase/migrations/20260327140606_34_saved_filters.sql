/*
  # Saved Filters

  Allows CRM users to persist named filter sets per entity for later reuse.

  ## New Tables
  - `saved_filter`
    - `id` (uuid, pk)
    - `user_id` (uuid, FK → crm_user.user_id — same UUID as auth.uid())
    - `entity` (text) — e.g. 'accounts', 'contacts'
    - `name` (text) — display name chosen by user
    - `conditions` (jsonb) — array of filter condition objects
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  - RLS enabled; crm_user.user_id equals auth.uid(), so policies check directly.
*/

CREATE TABLE IF NOT EXISTS saved_filter (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES crm_user(user_id) ON DELETE CASCADE,
  entity      text NOT NULL,
  name        text NOT NULL DEFAULT '',
  conditions  jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE saved_filter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own saved filters"
  ON saved_filter FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own saved filters"
  ON saved_filter FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own saved filters"
  ON saved_filter FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own saved filters"
  ON saved_filter FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS saved_filter_user_entity_idx ON saved_filter(user_id, entity);
