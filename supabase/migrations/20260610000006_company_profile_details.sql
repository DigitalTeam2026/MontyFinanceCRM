/*
  # Company Profile — business details

  ## Summary
  Extends the singleton `company_profile` table (previously branding-only) with
  full company details: logo image, industry, country, website, phone, email,
  company size, primary contact, owner, and status.

  `industry_id` and `country_id` reference the existing `industry` and `country`
  lookup tables so the dropdowns reuse the same option lists as CRM records.

  ## Storage
  Provisions a PUBLIC `company-assets` bucket for the logo image. Public read is
  required because the logo is rendered on the unauthenticated login screen
  (which runs as the `anon` role). Writes are limited to authenticated users.
*/

-- ── Detail columns (idempotent; defaults backfill the existing singleton row) ──
ALTER TABLE company_profile
  ADD COLUMN IF NOT EXISTS logo_url        text,
  ADD COLUMN IF NOT EXISTS industry_id     uuid REFERENCES industry(industry_id),
  ADD COLUMN IF NOT EXISTS country_id      uuid REFERENCES country(country_id),
  ADD COLUMN IF NOT EXISTS website         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone           text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email           text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_size    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS primary_contact text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS owner           text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'Active';

-- ── Logo storage bucket (public read for the login screen) ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read company assets" ON storage.objects;
CREATE POLICY "Public read company assets"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "Authenticated insert company assets" ON storage.objects;
CREATE POLICY "Authenticated insert company assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "Authenticated update company assets" ON storage.objects;
CREATE POLICY "Authenticated update company assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'company-assets')
  WITH CHECK (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "Authenticated delete company assets" ON storage.objects;
CREATE POLICY "Authenticated delete company assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'company-assets');
