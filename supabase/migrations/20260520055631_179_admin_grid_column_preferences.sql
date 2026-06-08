/*
  # Admin grid column preferences

  1. New Tables
    - `admin_grid_column_pref`
      - `pref_id` (uuid, primary key)
      - `entity_definition_id` (uuid, FK to entity_definition)
      - `user_id` (uuid, FK to auth.users)
      - `visible_field_ids` (jsonb, array of field_definition_id strings)
      - `column_order` (jsonb, ordered array of field_definition_id strings)
      - `column_widths` (jsonb, map of field_definition_id to width in px)
      - `created_at` (timestamptz)
      - `modified_at` (timestamptz)

  2. Security
    - Enable RLS on `admin_grid_column_pref`
    - Users can only read/write their own preferences
    - Unique constraint on (entity_definition_id, user_id)
*/

CREATE TABLE IF NOT EXISTS admin_grid_column_pref (
  pref_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_definition_id uuid NOT NULL REFERENCES entity_definition(entity_definition_id),
  user_id uuid NOT NULL,
  visible_field_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  column_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  column_widths jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_definition_id, user_id)
);

ALTER TABLE admin_grid_column_pref ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own grid preferences"
  ON admin_grid_column_pref
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own grid preferences"
  ON admin_grid_column_pref
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own grid preferences"
  ON admin_grid_column_pref
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own grid preferences"
  ON admin_grid_column_pref
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_admin_grid_column_pref_entity_user
  ON admin_grid_column_pref (entity_definition_id, user_id);
