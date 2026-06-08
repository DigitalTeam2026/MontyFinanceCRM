/*
  # Relationship Definition Metadata Layer

  ## Summary
  Introduces a first-class relationship metadata model that all engines can consume consistently.
  This is a metadata-only table — it describes relationships that already exist structurally
  in the database. No DDL (FKs, columns) is created from this migration beyond the metadata table itself.

  ## New Tables

  ### relationship_definition
  Canonical metadata for every entity-to-entity relationship in the platform.

  | Column | Description |
  |--------|-------------|
  | relationship_definition_id | PK |
  | name | Machine-readable name, e.g. "account_contacts" |
  | display_name | Human label, e.g. "Account → Contacts" |
  | reverse_display_name | From the other side, e.g. "Contact's Account" |
  | source_entity_id | FK → entity_definition |
  | target_entity_id | FK → entity_definition |
  | relationship_type | '1:N', 'N:1', or 'N:N' |
  | relationship_storage_type | 'lookup' or 'junction' |
  | source_lookup_field_id | FK → field_definition (lookup mode only) |
  | junction_table | Physical junction table name (junction mode only) |
  | junction_source_fk | FK column name pointing to source (junction mode only) |
  | junction_target_fk | FK column name pointing to target (junction mode only) |
  | is_system | true = shipped with platform, read-only in admin |
  | is_active | false = hidden from admin UI (future/inactive modules) |
  | created_at / modified_at | Timestamps |

  ## Seeded System Relationships (is_active = true)
  - Account → Contacts (1:N, lookup: account_id on contact)
  - Account → Opportunities (1:N, lookup: account_id on opportunity)
  - Account → Leads (1:N, lookup: account_id on lead)
  - Account → Tickets (1:N, lookup: account_id on ticket)
  - Contact → Account (N:1, lookup: account_id on contact)
  - Opportunity → Account (N:1, lookup: account_id on opportunity)
  - Opportunity ↔ Contacts (N:N, junction: opportunity_contact)
  - Lead → Account (N:1, lookup: account_id on lead)
  - Lead → Opportunity (1:N, lookup: originating_lead_id on opportunity)
  - Ticket → Account (N:1, lookup: account_id on ticket)
  - Ticket → Contact (N:1, lookup: contact_id on ticket)

  ## Pre-created but Inactive (is_active = false)
  Marketing module relationships hidden from admin UI until those modules are activated.

  ## Schema Changes
  - New table: relationship_definition
  - subgrid_definition: add nullable relationship_definition_id FK (backfilled where matched)

  ## Security
  - RLS enabled
  - Authenticated users can read all relationship definitions
  - Only system admins (is_system_admin()) can insert/update/delete
  - System relationships cannot be deleted (is_system = true guard in DELETE policy)
*/

-- ============================================================
-- 1. Create relationship_definition table
-- ============================================================

CREATE TABLE IF NOT EXISTS relationship_definition (
  relationship_definition_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL,
  display_name                text NOT NULL DEFAULT '',
  reverse_display_name        text NOT NULL DEFAULT '',
  source_entity_id            uuid NOT NULL REFERENCES entity_definition(entity_definition_id),
  target_entity_id            uuid NOT NULL REFERENCES entity_definition(entity_definition_id),
  relationship_type           text NOT NULL CHECK (relationship_type IN ('1:N', 'N:1', 'N:N')),
  relationship_storage_type   text NOT NULL DEFAULT 'lookup' CHECK (relationship_storage_type IN ('lookup', 'junction')),
  source_lookup_field_id      uuid REFERENCES field_definition(field_definition_id),
  junction_table              text,
  junction_source_fk          text,
  junction_target_fk          text,
  is_system                   bool NOT NULL DEFAULT false,
  is_active                   bool NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  modified_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_def_source_target_lookup
  ON relationship_definition (source_entity_id, target_entity_id, source_lookup_field_id)
  WHERE source_lookup_field_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_def_source_target_junction
  ON relationship_definition (source_entity_id, target_entity_id, junction_table)
  WHERE junction_table IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rel_def_source_entity ON relationship_definition (source_entity_id);
CREATE INDEX IF NOT EXISTS idx_rel_def_target_entity ON relationship_definition (target_entity_id);
CREATE INDEX IF NOT EXISTS idx_rel_def_active ON relationship_definition (is_active);

CREATE OR REPLACE FUNCTION set_relationship_definition_modified_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.modified_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_relationship_definition_modified ON relationship_definition;
CREATE TRIGGER trg_relationship_definition_modified
  BEFORE UPDATE ON relationship_definition
  FOR EACH ROW EXECUTE FUNCTION set_relationship_definition_modified_at();

-- ============================================================
-- 2. Enable RLS
-- ============================================================

ALTER TABLE relationship_definition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read relationship definitions"
  ON relationship_definition FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System admins can insert relationship definitions"
  ON relationship_definition FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

CREATE POLICY "System admins can update relationship definitions"
  ON relationship_definition FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

CREATE POLICY "System admins can delete non-system relationship definitions"
  ON relationship_definition FOR DELETE
  TO authenticated
  USING (is_system = false AND is_system_admin());

-- ============================================================
-- 3. Add relationship_definition_id to subgrid_definition
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subgrid_definition'
      AND column_name = 'relationship_definition_id'
  ) THEN
    ALTER TABLE subgrid_definition
      ADD COLUMN relationship_definition_id uuid REFERENCES relationship_definition(relationship_definition_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subgrid_relationship_def
  ON subgrid_definition (relationship_definition_id);

-- ============================================================
-- 4. Seed active system relationships
-- ============================================================

DO $$
DECLARE
  v_account_id     uuid;
  v_contact_id     uuid;
  v_lead_id        uuid := '2892cad3-04be-47c2-8de0-cc16509e1fcf';
  v_opportunity_id uuid := 'e9482035-8715-40fa-a9d3-794c5b963c95';
  v_ticket_id      uuid;

  v_contact_account_field_id      uuid;
  v_opportunity_account_field_id  uuid;
  v_opportunity_lead_field_id     uuid;
  v_lead_account_field_id         uuid;
  v_ticket_account_field_id       uuid;
  v_ticket_contact_field_id       uuid;
BEGIN
  SELECT entity_definition_id INTO v_account_id
    FROM entity_definition WHERE logical_name = 'account' LIMIT 1;
  SELECT entity_definition_id INTO v_contact_id
    FROM entity_definition WHERE logical_name = 'contact' LIMIT 1;
  SELECT entity_definition_id INTO v_ticket_id
    FROM entity_definition WHERE logical_name = 'ticket' LIMIT 1;

  SELECT field_definition_id INTO v_contact_account_field_id
    FROM field_definition
    WHERE entity_definition_id = v_contact_id
      AND physical_column_name = 'account_id' LIMIT 1;

  SELECT field_definition_id INTO v_opportunity_account_field_id
    FROM field_definition
    WHERE entity_definition_id = v_opportunity_id
      AND physical_column_name = 'account_id' LIMIT 1;

  SELECT field_definition_id INTO v_opportunity_lead_field_id
    FROM field_definition
    WHERE entity_definition_id = v_opportunity_id
      AND physical_column_name = 'originating_lead_id' LIMIT 1;

  SELECT field_definition_id INTO v_lead_account_field_id
    FROM field_definition
    WHERE entity_definition_id = v_lead_id
      AND physical_column_name = 'account_id' LIMIT 1;

  SELECT field_definition_id INTO v_ticket_account_field_id
    FROM field_definition
    WHERE entity_definition_id = v_ticket_id
      AND physical_column_name = 'account_id' LIMIT 1;

  SELECT field_definition_id INTO v_ticket_contact_field_id
    FROM field_definition
    WHERE entity_definition_id = v_ticket_id
      AND physical_column_name = 'contact_id' LIMIT 1;

  -- Account → Contacts (1:N)
  INSERT INTO relationship_definition (
    name, display_name, reverse_display_name,
    source_entity_id, target_entity_id,
    relationship_type, relationship_storage_type,
    source_lookup_field_id, is_system, is_active
  ) SELECT
    'account_contacts', 'Account → Contacts', 'Contact''s Account',
    v_account_id, v_contact_id, '1:N', 'lookup',
    v_contact_account_field_id, true, true
  WHERE v_account_id IS NOT NULL AND v_contact_id IS NOT NULL
  ON CONFLICT (name) DO NOTHING;

  -- Account → Opportunities (1:N)
  INSERT INTO relationship_definition (
    name, display_name, reverse_display_name,
    source_entity_id, target_entity_id,
    relationship_type, relationship_storage_type,
    source_lookup_field_id, is_system, is_active
  ) SELECT
    'account_opportunities', 'Account → Opportunities', 'Opportunity''s Account',
    v_account_id, v_opportunity_id, '1:N', 'lookup',
    v_opportunity_account_field_id, true, true
  WHERE v_account_id IS NOT NULL AND v_opportunity_id IS NOT NULL
  ON CONFLICT (name) DO NOTHING;

  -- Account → Leads (1:N)
  INSERT INTO relationship_definition (
    name, display_name, reverse_display_name,
    source_entity_id, target_entity_id,
    relationship_type, relationship_storage_type,
    source_lookup_field_id, is_system, is_active
  ) SELECT
    'account_leads', 'Account → Leads', 'Lead''s Account',
    v_account_id, v_lead_id, '1:N', 'lookup',
    v_lead_account_field_id, true, true
  WHERE v_account_id IS NOT NULL
  ON CONFLICT (name) DO NOTHING;

  -- Account → Tickets (1:N)
  INSERT INTO relationship_definition (
    name, display_name, reverse_display_name,
    source_entity_id, target_entity_id,
    relationship_type, relationship_storage_type,
    source_lookup_field_id, is_system, is_active
  ) SELECT
    'account_tickets', 'Account → Tickets', 'Ticket''s Account',
    v_account_id, v_ticket_id, '1:N', 'lookup',
    v_ticket_account_field_id, true, true
  WHERE v_account_id IS NOT NULL AND v_ticket_id IS NOT NULL
  ON CONFLICT (name) DO NOTHING;

  -- Contact → Account (N:1)
  INSERT INTO relationship_definition (
    name, display_name, reverse_display_name,
    source_entity_id, target_entity_id,
    relationship_type, relationship_storage_type,
    source_lookup_field_id, is_system, is_active
  ) SELECT
    'contact_account', 'Contact → Account', 'Account''s Contacts',
    v_contact_id, v_account_id, 'N:1', 'lookup',
    v_contact_account_field_id, true, true
  WHERE v_contact_id IS NOT NULL AND v_account_id IS NOT NULL
  ON CONFLICT (name) DO NOTHING;

  -- Opportunity → Account (N:1)
  INSERT INTO relationship_definition (
    name, display_name, reverse_display_name,
    source_entity_id, target_entity_id,
    relationship_type, relationship_storage_type,
    source_lookup_field_id, is_system, is_active
  ) SELECT
    'opportunity_account', 'Opportunity → Account', 'Account''s Opportunities',
    v_opportunity_id, v_account_id, 'N:1', 'lookup',
    v_opportunity_account_field_id, true, true
  WHERE v_opportunity_id IS NOT NULL AND v_account_id IS NOT NULL
  ON CONFLICT (name) DO NOTHING;

  -- Opportunity ↔ Contacts (N:N, junction)
  INSERT INTO relationship_definition (
    name, display_name, reverse_display_name,
    source_entity_id, target_entity_id,
    relationship_type, relationship_storage_type,
    junction_table, junction_source_fk, junction_target_fk,
    is_system, is_active
  ) SELECT
    'opportunity_contacts', 'Opportunity → Contacts', 'Contact''s Opportunities',
    v_opportunity_id, v_contact_id, 'N:N', 'junction',
    'opportunity_contact', 'opportunity_id', 'contact_id',
    true, true
  WHERE v_opportunity_id IS NOT NULL AND v_contact_id IS NOT NULL
  ON CONFLICT (name) DO NOTHING;

  -- Lead → Account (N:1)
  INSERT INTO relationship_definition (
    name, display_name, reverse_display_name,
    source_entity_id, target_entity_id,
    relationship_type, relationship_storage_type,
    source_lookup_field_id, is_system, is_active
  ) SELECT
    'lead_account', 'Lead → Account', 'Account''s Leads',
    v_lead_id, v_account_id, 'N:1', 'lookup',
    v_lead_account_field_id, true, true
  WHERE v_account_id IS NOT NULL
  ON CONFLICT (name) DO NOTHING;

  -- Lead → Opportunities (1:N via originating_lead_id)
  INSERT INTO relationship_definition (
    name, display_name, reverse_display_name,
    source_entity_id, target_entity_id,
    relationship_type, relationship_storage_type,
    source_lookup_field_id, is_system, is_active
  ) SELECT
    'lead_opportunities', 'Lead → Opportunities', 'Opportunity''s Originating Lead',
    v_lead_id, v_opportunity_id, '1:N', 'lookup',
    v_opportunity_lead_field_id, true, true
  WHERE v_opportunity_id IS NOT NULL
  ON CONFLICT (name) DO NOTHING;

  -- Ticket → Account (N:1)
  INSERT INTO relationship_definition (
    name, display_name, reverse_display_name,
    source_entity_id, target_entity_id,
    relationship_type, relationship_storage_type,
    source_lookup_field_id, is_system, is_active
  ) SELECT
    'ticket_account', 'Ticket → Account', 'Account''s Tickets',
    v_ticket_id, v_account_id, 'N:1', 'lookup',
    v_ticket_account_field_id, true, true
  WHERE v_ticket_id IS NOT NULL AND v_account_id IS NOT NULL
  ON CONFLICT (name) DO NOTHING;

  -- Ticket → Contact (N:1)
  INSERT INTO relationship_definition (
    name, display_name, reverse_display_name,
    source_entity_id, target_entity_id,
    relationship_type, relationship_storage_type,
    source_lookup_field_id, is_system, is_active
  ) SELECT
    'ticket_contact', 'Ticket → Contact', 'Contact''s Tickets',
    v_ticket_id, v_contact_id, 'N:1', 'lookup',
    v_ticket_contact_field_id, true, true
  WHERE v_ticket_id IS NOT NULL AND v_contact_id IS NOT NULL
  ON CONFLICT (name) DO NOTHING;

END $$;

-- ============================================================
-- 5. Seed inactive marketing module relationships
-- ============================================================

DO $$
DECLARE
  v_campaign_id        uuid;
  v_campaign_member_id uuid;
  v_event_id           uuid;
BEGIN
  SELECT entity_definition_id INTO v_campaign_id
    FROM entity_definition WHERE logical_name = 'campaign' LIMIT 1;
  SELECT entity_definition_id INTO v_campaign_member_id
    FROM entity_definition WHERE logical_name = 'campaign_member' LIMIT 1;
  SELECT entity_definition_id INTO v_event_id
    FROM entity_definition WHERE logical_name = 'event' LIMIT 1;

  IF v_campaign_id IS NOT NULL AND v_campaign_member_id IS NOT NULL THEN
    INSERT INTO relationship_definition (
      name, display_name, reverse_display_name,
      source_entity_id, target_entity_id,
      relationship_type, relationship_storage_type,
      is_system, is_active
    ) VALUES (
      'campaign_members', 'Campaign → Members', 'Member''s Campaign',
      v_campaign_id, v_campaign_member_id, '1:N', 'lookup',
      true, false
    ) ON CONFLICT (name) DO NOTHING;
  END IF;

  IF v_campaign_id IS NOT NULL AND v_event_id IS NOT NULL THEN
    INSERT INTO relationship_definition (
      name, display_name, reverse_display_name,
      source_entity_id, target_entity_id,
      relationship_type, relationship_storage_type,
      is_system, is_active
    ) VALUES (
      'campaign_events', 'Campaign → Events', 'Event''s Campaign',
      v_campaign_id, v_event_id, '1:N', 'lookup',
      true, false
    ) ON CONFLICT (name) DO NOTHING;
  END IF;

END $$;

-- ============================================================
-- 6. Backfill subgrid_definition.relationship_definition_id
-- ============================================================

UPDATE subgrid_definition sd
SET relationship_definition_id = rd.relationship_definition_id
FROM relationship_definition rd
JOIN field_definition fd
  ON fd.field_definition_id = rd.source_lookup_field_id
WHERE sd.relationship_definition_id IS NULL
  AND sd.related_entity_definition_id = rd.target_entity_id
  AND sd.relationship_field = fd.physical_column_name
  AND rd.is_active = true;
