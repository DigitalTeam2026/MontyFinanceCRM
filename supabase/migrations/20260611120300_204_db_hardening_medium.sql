/*
  # 204 — Medium-severity DB hardening

  1. company_profile (M1): INSERT/UPDATE were USING/WITH CHECK (true), letting any
     authenticated user rewrite the app-wide login-screen branding. Gate writes to
     system admins. SELECT stays public (login page reads it pre-auth).

  2. Lookup foreign keys (M2): country/currency/industry/source/subsource and
     parent_account references were NO ACTION, so deleting a referenced lookup row
     was silently blocked by RESTRICT. Switch to ON DELETE SET NULL (these columns
     are all nullable) so lookups can be retired without orphaning the parent row.

  3. CHECK constraints (M5): file_size / number_of_employees / annual_revenue
     accepted negative values. Verified zero violating rows before adding.

  Deferred (require backfill/staging, tracked separately):
    - created_by NOT NULL (M6): lead has existing NULLs from SECURITY DEFINER flows.
    - owner_id validation trigger (M3): needs staging to avoid blocking writes.
*/

-- ── 1. company_profile admin gate ────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert company profile" ON public.company_profile;
DROP POLICY IF EXISTS "Authenticated users can update company profile" ON public.company_profile;

CREATE POLICY "Only system admins can insert company profile"
  ON public.company_profile FOR INSERT TO authenticated
  WITH CHECK (security.is_system_admin());

CREATE POLICY "Only system admins can update company profile"
  ON public.company_profile FOR UPDATE TO authenticated
  USING (security.is_system_admin())
  WITH CHECK (security.is_system_admin());

-- ── 2. Lookup FKs → ON DELETE SET NULL ───────────────────────────────────────
ALTER TABLE account     DROP CONSTRAINT IF EXISTS account_country_id_fkey,
  ADD CONSTRAINT account_country_id_fkey FOREIGN KEY (country_id)
    REFERENCES country(country_id) ON DELETE SET NULL;
ALTER TABLE account     DROP CONSTRAINT IF EXISTS account_currency_id_fkey,
  ADD CONSTRAINT account_currency_id_fkey FOREIGN KEY (currency_id)
    REFERENCES currency(currency_id) ON DELETE SET NULL;
ALTER TABLE account     DROP CONSTRAINT IF EXISTS account_parent_account_id_fkey,
  ADD CONSTRAINT account_parent_account_id_fkey FOREIGN KEY (parent_account_id)
    REFERENCES account(account_id) ON DELETE SET NULL;

ALTER TABLE contact     DROP CONSTRAINT IF EXISTS contact_country_id_fkey,
  ADD CONSTRAINT contact_country_id_fkey FOREIGN KEY (country_id)
    REFERENCES country(country_id) ON DELETE SET NULL;
ALTER TABLE contact     DROP CONSTRAINT IF EXISTS contact_source_id_fkey,
  ADD CONSTRAINT contact_source_id_fkey FOREIGN KEY (source_id)
    REFERENCES contact_source(source_id) ON DELETE SET NULL;
ALTER TABLE contact     DROP CONSTRAINT IF EXISTS contact_subsource_id_fkey,
  ADD CONSTRAINT contact_subsource_id_fkey FOREIGN KEY (subsource_id)
    REFERENCES contact_subsource(subsource_id) ON DELETE SET NULL;

ALTER TABLE lead        DROP CONSTRAINT IF EXISTS lead_country_id_fkey,
  ADD CONSTRAINT lead_country_id_fkey FOREIGN KEY (country_id)
    REFERENCES country(country_id) ON DELETE SET NULL;
ALTER TABLE lead        DROP CONSTRAINT IF EXISTS lead_currency_id_fkey,
  ADD CONSTRAINT lead_currency_id_fkey FOREIGN KEY (currency_id)
    REFERENCES currency(currency_id) ON DELETE SET NULL;
ALTER TABLE lead        DROP CONSTRAINT IF EXISTS lead_subsource_id_fkey,
  ADD CONSTRAINT lead_subsource_id_fkey FOREIGN KEY (subsource_id)
    REFERENCES contact_subsource(subsource_id) ON DELETE SET NULL;

ALTER TABLE opportunity DROP CONSTRAINT IF EXISTS opportunity_currency_id_fkey,
  ADD CONSTRAINT opportunity_currency_id_fkey FOREIGN KEY (currency_id)
    REFERENCES currency(currency_id) ON DELETE SET NULL;
ALTER TABLE opportunity DROP CONSTRAINT IF EXISTS opportunity_source_id_fkey,
  ADD CONSTRAINT opportunity_source_id_fkey FOREIGN KEY (source_id)
    REFERENCES contact_source(source_id) ON DELETE SET NULL;

-- ── 3. CHECK constraints on numeric columns ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_attachment_file_size') THEN
    ALTER TABLE attachment ADD CONSTRAINT chk_attachment_file_size CHECK (file_size IS NULL OR file_size >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_account_employees') THEN
    ALTER TABLE account ADD CONSTRAINT chk_account_employees CHECK (number_of_employees IS NULL OR number_of_employees >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_account_annual_revenue') THEN
    ALTER TABLE account ADD CONSTRAINT chk_account_annual_revenue CHECK (annual_revenue IS NULL OR annual_revenue >= 0);
  END IF;
END $$;
