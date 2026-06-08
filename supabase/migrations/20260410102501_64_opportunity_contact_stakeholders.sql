/*
  # Opportunity Contact Stakeholders (Many-to-Many)

  ## Overview
  Introduces a junction table `opportunity_contact` that lets a single opportunity
  have multiple contacts each playing a distinct business role. This mirrors real-world
  fintech / commercial sales where deals typically involve several stakeholders:
  business owner, finance contact, compliance contact, operations contact, technical
  contact, etc.

  The existing `primary_contact_id` on the `opportunity` table is preserved for
  backwards compatibility (quick lookup of the primary point-of-contact), but the
  authoritative stakeholder list now lives in this table.

  ## New Tables
  - `opportunity_contact`
    - `opportunity_contact_id` (uuid, pk) – surrogate key
    - `opportunity_id` (uuid, fk → opportunity) – the deal
    - `contact_id` (uuid, fk → contact) – the stakeholder
    - `role` (text) – predefined role label:
        'primary' | 'business_owner' | 'finance' | 'compliance' |
        'operations' | 'technical' | 'legal' | 'other'
    - `is_primary` (boolean) – marks the single primary contact for this deal
    - `notes` (text) – optional free-text notes about this stakeholder's involvement
    - `added_at` (timestamptz)
    - `added_by` (uuid, fk → crm_user)

  ## Constraints
  - UNIQUE(opportunity_id, contact_id) – a contact can only appear once per deal
  - Partial unique index ensures at most one is_primary = true row per opportunity

  ## Security
  - RLS enabled; authenticated users may read/write rows that belong to opportunities
    they can already see (ownership-based, mirrors the opportunity RLS pattern)
*/

-- ── Table ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opportunity_contact (
  opportunity_contact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id         uuid NOT NULL REFERENCES opportunity(opportunity_id) ON DELETE CASCADE,
  contact_id             uuid NOT NULL REFERENCES contact(contact_id)         ON DELETE CASCADE,
  role                   text NOT NULL DEFAULT 'other'
                           CHECK (role IN (
                             'primary','business_owner','finance','compliance',
                             'operations','technical','legal','other'
                           )),
  is_primary             boolean NOT NULL DEFAULT false,
  notes                  text,
  added_at               timestamptz NOT NULL DEFAULT now(),
  added_by               uuid REFERENCES crm_user(user_id),
  UNIQUE (opportunity_id, contact_id)
);

-- At most one primary per opportunity
CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunity_contact_primary
  ON opportunity_contact (opportunity_id)
  WHERE is_primary = true;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_opp_contact_opportunity ON opportunity_contact (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_contact_contact     ON opportunity_contact (contact_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE opportunity_contact ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view opportunity contacts"
  ON opportunity_contact FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM opportunity o
      WHERE o.opportunity_id = opportunity_contact.opportunity_id
        AND o.is_deleted = false
    )
  );

CREATE POLICY "Authenticated users can add opportunity contacts"
  ON opportunity_contact FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM opportunity o
      WHERE o.opportunity_id = opportunity_contact.opportunity_id
        AND o.is_deleted = false
    )
  );

CREATE POLICY "Authenticated users can update opportunity contacts"
  ON opportunity_contact FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM opportunity o
      WHERE o.opportunity_id = opportunity_contact.opportunity_id
        AND o.is_deleted = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM opportunity o
      WHERE o.opportunity_id = opportunity_contact.opportunity_id
        AND o.is_deleted = false
    )
  );

CREATE POLICY "Authenticated users can remove opportunity contacts"
  ON opportunity_contact FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM opportunity o
      WHERE o.opportunity_id = opportunity_contact.opportunity_id
        AND o.is_deleted = false
    )
  );
