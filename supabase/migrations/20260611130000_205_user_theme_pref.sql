/*
  # Per-user theme preference

  1. New Tables
    - `user_theme_pref`
      - `user_id` (uuid, primary key, FK to auth.users)
      - `theme_color` (text, the chosen top-bar/theme color)
      - `created_at` (timestamptz)
      - `modified_at` (timestamptz)

  2. Security
    - Enable RLS on `user_theme_pref`
    - Each user can only read/write their own theme row
*/

CREATE TABLE IF NOT EXISTS user_theme_pref (
  user_id uuid PRIMARY KEY,
  theme_color text NOT NULL DEFAULT '#f7f8fa',
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_theme_pref ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own theme"
  ON user_theme_pref
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own theme"
  ON user_theme_pref
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own theme"
  ON user_theme_pref
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
