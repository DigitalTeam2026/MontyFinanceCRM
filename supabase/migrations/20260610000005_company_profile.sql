/*
  # Company Profile (branding)

  ## Summary
  A single-row table that holds the organization's branding shown across the app
  and, importantly, on the unauthenticated login screen (company name, tagline,
  and the letter used in the logo badge).

  ## Table
  - `company_profile` — singleton row (id is always 1). Editable from
    Admin Studio → Organization → Company Profile.

  ## Security
  - SELECT is granted to BOTH `anon` and `authenticated` so the login page can
    read the branding before a user signs in. Branding is non-sensitive.
  - INSERT/UPDATE are limited to `authenticated` users (Admin Studio).
*/

CREATE TABLE IF NOT EXISTS company_profile (
  id            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name  text NOT NULL DEFAULT 'Monty CRM',
  tagline       text NOT NULL DEFAULT 'Sales Hub',
  logo_letter   text NOT NULL DEFAULT 'M',
  modified_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed the singleton row with the current hardcoded defaults.
INSERT INTO company_profile (id, company_name, tagline, logo_letter)
VALUES (1, 'Monty CRM', 'Sales Hub', 'M')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE company_profile ENABLE ROW LEVEL SECURITY;

-- Login screen runs as the anon role and must be able to read branding.
DROP POLICY IF EXISTS "Anyone can view company profile" ON company_profile;
CREATE POLICY "Anyone can view company profile"
  ON company_profile FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert company profile" ON company_profile;
CREATE POLICY "Authenticated users can insert company profile"
  ON company_profile FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update company profile" ON company_profile;
CREATE POLICY "Authenticated users can update company profile"
  ON company_profile FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON company_profile TO anon, authenticated;
GRANT INSERT, UPDATE ON company_profile TO authenticated;
