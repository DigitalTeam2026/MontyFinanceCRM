/*
  # Prospect → Lead Conversion System

  ## Overview
  Implements the full Prospect-to-Lead conversion flow:
  - Generalised entity_conversion_rule + entity_conversion_field_mapping tables
    (reusable for any future entity conversions beyond Prospect→Lead)
  - Atomic RPC: convert_prospect_to_lead(prospect_id, user_id)
  - Conversion tracking columns on crm_prospect and lead
  - Seed: default Prospect→Lead rule with field mappings
  - Seed: Digital Rules (lifecycle button + on_form_load read-only gate)

  ## Tables Created / Modified
  - entity_conversion_rule           (new)
  - entity_conversion_field_mapping  (new)
  - crm_prospect                     ADD COLUMNS converted_lead_id, converted_at, converted_by
  - lead                             ADD COLUMN  originating_prospect_id

  ## Function Created
  - convert_prospect_to_lead(uuid, uuid) RETURNS jsonb

  ## Digital Rules Seeded
  - prospect / convert_prospect        (lifecycle button — visible when Active + not yet converted)
  - prospect / on_form_load read-only  (form locks when state_code = 'converted')

  ## Status / Reason
  - Ensures a "Converted" statecode (state_value = 3) exists for the prospect entity
  - Ensures a "Converted to Lead" status reason exists under that statecode
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  TRACKING COLUMNS ON crm_prospect
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crm_prospect
  ADD COLUMN IF NOT EXISTS converted_lead_id uuid REFERENCES lead(lead_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by      uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  ORIGINATING PROSPECT LINK ON lead
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE lead
  ADD COLUMN IF NOT EXISTS originating_prospect_id uuid REFERENCES crm_prospect(prospect_id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  ENSURE "CONVERTED" STATECODE + "CONVERTED TO LEAD" REASON FOR PROSPECT
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_entity_def_id        uuid;
  v_converted_sc_id      uuid;
  v_max_reason           integer;
BEGIN
  -- Find the prospect entity definition
  SELECT entity_definition_id INTO v_entity_def_id
  FROM entity_definition
  WHERE logical_name = 'prospect' OR physical_table_name = 'crm_prospect'
  LIMIT 1;

  IF v_entity_def_id IS NULL THEN
    RAISE NOTICE 'prospect entity_definition not found – skipping statecode seed';
    RETURN;
  END IF;

  -- Ensure "Converted" statecode (state_value = 3) exists
  INSERT INTO statecode_definition
    (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES
    (v_entity_def_id, 3, 'Converted', false, 30, true)
  ON CONFLICT DO NOTHING;

  SELECT statecode_id INTO v_converted_sc_id
  FROM statecode_definition
  WHERE entity_definition_id = v_entity_def_id
    AND state_value = 3;

  -- Ensure "Converted to Lead" reason under the Converted statecode
  IF v_converted_sc_id IS NOT NULL THEN
    SELECT COALESCE(MAX(reason_value), 0) INTO v_max_reason
    FROM status_reason_definition
    WHERE entity_definition_id = v_entity_def_id;

    INSERT INTO status_reason_definition
      (statecode_id, entity_definition_id, reason_value, display_label, color,
       sort_order, is_default, is_active, is_system)
    SELECT
      v_converted_sc_id,
      v_entity_def_id,
      v_max_reason + 1,
      'Converted to Lead',
      '#10B981',
      10,
      true,
      true,
      true
    WHERE NOT EXISTS (
      SELECT 1 FROM status_reason_definition
      WHERE entity_definition_id = v_entity_def_id
        AND lower(display_label) LIKE '%converted%lead%'
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  GENERALISED ENTITY CONVERSION RULE TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entity_conversion_rule (
  entity_conversion_rule_id uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text          NOT NULL,
  description               text,
  source_entity             text          NOT NULL,   -- logical_name, e.g. 'prospect'
  target_entity             text          NOT NULL,   -- logical_name, e.g. 'lead'
  trigger_event             text          NOT NULL,   -- e.g. 'convert_prospect'
  is_active                 boolean       NOT NULL DEFAULT true,
  is_default                boolean       NOT NULL DEFAULT false,
  is_system                 boolean       NOT NULL DEFAULT false,
  created_by                uuid,
  created_at                timestamptz   NOT NULL DEFAULT now(),
  modified_at               timestamptz   NOT NULL DEFAULT now(),
  deleted_at                timestamptz
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  GENERALISED ENTITY CONVERSION FIELD MAPPING TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entity_conversion_field_mapping (
  entity_conversion_field_mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_conversion_rule_id          uuid NOT NULL
    REFERENCES entity_conversion_rule(entity_conversion_rule_id) ON DELETE CASCADE,
  source_field                       text NOT NULL,
    -- physical column name in the source table (e.g. 'first_name' in crm_prospect)
  target_field                       text NOT NULL,
    -- physical column name in the target table (e.g. 'first_name' in lead)
  mapping_type                       text NOT NULL DEFAULT 'direct',
    -- 'direct' | 'lookup' | 'choice' | 'default_value' | 'boolean' | 'date' | 'number' | 'currency'
  default_value                      text,
    -- populated when mapping_type = 'default_value'
  lookup_match_field                 text,
    -- for lookup type: alternate key field on the lookup target (e.g. 'iso_code', 'name', 'email')
  is_required                        boolean NOT NULL DEFAULT false,
  display_order                      integer NOT NULL DEFAULT 0,
  created_at                         timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.  RLS POLICIES FOR THE NEW TABLES
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE entity_conversion_rule         ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_conversion_field_mapping ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read rules and mappings
CREATE POLICY "entity_conversion_rule_read"
  ON entity_conversion_rule FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "entity_conversion_rule_write"
  ON entity_conversion_rule FOR ALL
  USING (security.is_system_admin());

CREATE POLICY "entity_conversion_field_mapping_read"
  ON entity_conversion_field_mapping FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "entity_conversion_field_mapping_write"
  ON entity_conversion_field_mapping FOR ALL
  USING (security.is_system_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.  ATOMIC CONVERSION RPC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION convert_prospect_to_lead(
  p_prospect_id  uuid,
  p_user_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
DECLARE
  v_prospect              jsonb;
  v_entity_def_id         uuid;
  v_rule                  record;
  v_mapping               record;
  v_source_val            text;
  v_lead_data             jsonb := '{}';
  v_missing_required      text[] := '{}';
  v_lead_id               uuid   := gen_random_uuid();
  v_lead_name             text;
  v_converted_sc_id       uuid;
  v_converted_state_value int;
  v_converted_reason      int;
  v_lead_def_id           uuid;
  v_lead_active_reason    int;
  v_set_clause            text;
BEGIN
  -- ── 1. Lock the prospect row (prevents concurrent double-conversion) ─────
  SELECT row_to_json(cp)::jsonb INTO v_prospect
  FROM crm_prospect cp
  WHERE cp.prospect_id = p_prospect_id
    AND (cp.is_deleted IS NULL OR cp.is_deleted = false)
  FOR UPDATE;

  IF v_prospect IS NULL THEN
    RAISE EXCEPTION 'Prospect % not found or has been deleted', p_prospect_id;
  END IF;

  -- ── 2. Validate: must be Active ──────────────────────────────────────────
  -- state_code is stored as 'active' (text) after the normalisation migration.
  -- Also accept '1' for backward-compatibility with older prospect records.
  IF (v_prospect->>'state_code') NOT IN ('active', '1', 'Active') THEN
    RAISE EXCEPTION 'Only Active prospects can be converted. Current state: %',
      COALESCE(v_prospect->>'state_code', 'unknown');
  END IF;

  -- ── 3. Validate: not already converted ───────────────────────────────────
  IF v_prospect->>'converted_lead_id' IS NOT NULL THEN
    RAISE EXCEPTION 'Prospect % has already been converted to Lead %',
      p_prospect_id, v_prospect->>'converted_lead_id';
  END IF;

  -- ── 4. Load the default Prospect→Lead conversion rule ───────────────────
  SELECT * INTO v_rule
  FROM entity_conversion_rule
  WHERE source_entity = 'prospect'
    AND target_entity = 'lead'
    AND is_active     = true
    AND deleted_at    IS NULL
  ORDER BY is_default DESC, created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active Prospect→Lead conversion rule found. Please configure one in Admin Studio.';
  END IF;

  -- ── 5. Build lead data from field mappings ───────────────────────────────
  FOR v_mapping IN
    SELECT *
    FROM entity_conversion_field_mapping
    WHERE entity_conversion_rule_id = v_rule.entity_conversion_rule_id
    ORDER BY display_order
  LOOP
    CASE v_mapping.mapping_type
      WHEN 'default_value' THEN
        v_source_val := v_mapping.default_value;

      WHEN 'lookup' THEN
        -- Direct UUID copy; lookup_match_field support can be extended here.
        v_source_val := v_prospect->>v_mapping.source_field;

      ELSE
        -- 'direct', 'choice', 'boolean', 'date', 'number', 'currency'
        v_source_val := v_prospect->>v_mapping.source_field;
    END CASE;

    -- Required field check
    IF v_mapping.is_required AND (v_source_val IS NULL OR trim(v_source_val) = '') THEN
      v_missing_required := array_append(v_missing_required, v_mapping.source_field);
    END IF;

    IF v_source_val IS NOT NULL AND v_source_val <> '' THEN
      -- Guard: only allow safe identifier names as target column names
      IF v_mapping.target_field ~ '^[a-z_][a-z0-9_]*$' THEN
        v_lead_data := v_lead_data || jsonb_build_object(v_mapping.target_field, v_source_val);
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_missing_required, 1) > 0 THEN
    RAISE EXCEPTION 'Conversion blocked – required fields are empty on the Prospect: %',
      array_to_string(v_missing_required, ', ');
  END IF;

  -- ── 6. Resolve default Active status reason for the new Lead ────────────
  SELECT entity_definition_id INTO v_lead_def_id
  FROM entity_definition
  WHERE logical_name = 'lead'
  LIMIT 1;

  IF v_lead_def_id IS NOT NULL THEN
    SELECT srd.reason_value INTO v_lead_active_reason
    FROM status_reason_definition srd
    JOIN statecode_definition sc ON srd.statecode_id = sc.statecode_id
    WHERE sc.entity_definition_id = v_lead_def_id
      AND sc.state_value           = 1
      AND srd.is_default           = true
    LIMIT 1;
  END IF;

  -- ── 7. Insert the new Lead (system columns only) ─────────────────────────
  INSERT INTO lead (
    lead_id,
    state_code,
    status_reason,
    created_by,
    owner_id,
    owner_type,
    originating_prospect_id,
    created_at,
    modified_at
  )
  VALUES (
    v_lead_id,
    'active',
    COALESCE(v_lead_active_reason::text, '1'),
    p_user_id,
    p_user_id,
    'user',
    p_prospect_id,
    now(),
    now()
  );

  -- ── 8. Apply mapped field values to the Lead ────────────────────────────
  IF v_lead_data <> '{}' THEN
    SELECT string_agg(format('%I = %L', key, value), ', ')
    INTO   v_set_clause
    FROM   jsonb_each_text(v_lead_data)
    WHERE  key ~ '^[a-z_][a-z0-9_]*$';

    IF v_set_clause IS NOT NULL AND v_set_clause <> '' THEN
      EXECUTE format('UPDATE lead SET %s WHERE lead_id = %L', v_set_clause, v_lead_id);
    END IF;
  END IF;

  -- ── 9. Build a human-readable lead name for the response ────────────────
  v_lead_name := trim(
    coalesce(v_lead_data->>'first_name', '') || ' ' ||
    coalesce(v_lead_data->>'last_name',  '')
  );
  IF v_lead_name = '' OR v_lead_name IS NULL THEN
    v_lead_name := coalesce(v_lead_data->>'company_name', v_lead_id::text);
  END IF;

  -- ── 10. Resolve "Converted" statecode + "Converted to Lead" reason ──────
  SELECT entity_definition_id INTO v_entity_def_id
  FROM entity_definition
  WHERE logical_name = 'prospect' OR physical_table_name = 'crm_prospect'
  LIMIT 1;

  IF v_entity_def_id IS NOT NULL THEN
    SELECT state_value INTO v_converted_state_value
    FROM statecode_definition
    WHERE entity_definition_id = v_entity_def_id
      AND state_value           = 3  -- Converted is always state 3 for prospect
    LIMIT 1;

    IF v_converted_state_value IS NULL THEN
      -- Fallback: any non-active state labelled 'converted'
      SELECT state_value INTO v_converted_state_value
      FROM statecode_definition
      WHERE entity_definition_id = v_entity_def_id
        AND lower(display_label)  = 'converted'
      LIMIT 1;
    END IF;

    SELECT sc.statecode_id INTO v_converted_sc_id
    FROM statecode_definition sc
    WHERE sc.entity_definition_id = v_entity_def_id
      AND sc.state_value           = COALESCE(v_converted_state_value, 3)
    LIMIT 1;

    IF v_converted_sc_id IS NOT NULL THEN
      SELECT srd.reason_value INTO v_converted_reason
      FROM status_reason_definition srd
      WHERE srd.statecode_id          = v_converted_sc_id
        AND lower(srd.display_label) LIKE '%converted%'
      ORDER BY srd.is_default DESC, srd.sort_order
      LIMIT 1;
    END IF;
  END IF;

  -- ── 11. Update the Prospect to Converted ────────────────────────────────
  UPDATE crm_prospect
  SET
    state_code         = 'converted',
    status_reason      = COALESCE(v_converted_reason::text, ''),
    converted_lead_id  = v_lead_id,
    converted_at       = now(),
    converted_by       = p_user_id,
    modified_at        = now()
  WHERE prospect_id = p_prospect_id;

  -- ── 12. Audit log ────────────────────────────────────────────────────────
  INSERT INTO digital_rule_execution_log (
    rule_name,
    entity_logical_name,
    record_id,
    user_id,
    action_taken,
    success,
    executed_at
  )
  VALUES (
    'convert_prospect_to_lead',
    'prospect',
    p_prospect_id,
    p_user_id,
    format('Lead %s created from Prospect %s using rule %s',
           v_lead_id, p_prospect_id, v_rule.entity_conversion_rule_id),
    true,
    now()
  );

  -- ── 13. Return result ────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',     true,
    'prospectId',  p_prospect_id,
    'leadId',      v_lead_id,
    'leadName',    v_lead_name,
    'ruleId',      v_rule.entity_conversion_rule_id
  );

EXCEPTION WHEN OTHERS THEN
  -- Log failure
  INSERT INTO digital_rule_execution_log (
    rule_name, entity_logical_name, record_id, user_id,
    action_taken, success, error_message, executed_at
  )
  VALUES (
    'convert_prospect_to_lead', 'prospect', p_prospect_id, p_user_id,
    'conversion_failed', false, SQLERRM, now()
  );
  RAISE;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.  BACKEND UPDATE GUARD – prevent normal saves on a converted Prospect
-- ─────────────────────────────────────────────────────────────────────────────
-- The RPC sets converted_lead_id so the trigger rejects further non-system saves.

CREATE OR REPLACE FUNCTION prevent_converted_prospect_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
BEGIN
  -- Allow internal/system updates (converted_lead_id being SET is the conversion itself)
  IF TG_OP = 'UPDATE' THEN
    -- If row is already converted AND this is not the conversion setting it
    IF OLD.converted_lead_id IS NOT NULL
       AND NEW.converted_lead_id IS NOT DISTINCT FROM OLD.converted_lead_id
    THEN
      -- The conversion already completed; block any normal field edits
      RAISE EXCEPTION 'A converted Prospect cannot be edited. Record %', OLD.prospect_id
        USING HINT = 'CONVERTED_RECORD_READONLY';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger (idempotent: drop before recreating)
DROP TRIGGER IF EXISTS trg_prevent_converted_prospect_update ON crm_prospect;

CREATE TRIGGER trg_prevent_converted_prospect_update
  BEFORE UPDATE ON crm_prospect
  FOR EACH ROW
  EXECUTE FUNCTION prevent_converted_prospect_update();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.  SEED: DEFAULT CONVERSION RULE
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO entity_conversion_rule (
  entity_conversion_rule_id,
  name,
  description,
  source_entity,
  target_entity,
  trigger_event,
  is_active,
  is_default,
  is_system
)
VALUES (
  'ec000000-0001-4000-8000-000000000001',
  'Default Prospect to Lead Conversion',
  'System default rule that copies Prospect fields to a new Lead when converting.',
  'prospect',
  'lead',
  'convert_prospect',
  true,
  true,
  true
)
ON CONFLICT (entity_conversion_rule_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10.  SEED: DEFAULT FIELD MAPPINGS  (Prospect → Lead)
-- ─────────────────────────────────────────────────────────────────────────────
-- These map the physical column names of crm_prospect to lead.
-- Administrators can add / modify / remove mappings in Admin Studio.
-- mapping_type = 'direct' copies the raw value as-is.
-- is_required = true blocks the conversion when the field is blank.

INSERT INTO entity_conversion_field_mapping
  (entity_conversion_rule_id, source_field, target_field, mapping_type, is_required, display_order)
VALUES
  ('ec000000-0001-4000-8000-000000000001', 'first_name',    'first_name',    'direct', false, 10),
  ('ec000000-0001-4000-8000-000000000001', 'last_name',     'last_name',     'direct', false, 20),
  ('ec000000-0001-4000-8000-000000000001', 'company_name',  'company_name',  'direct', false, 30),
  ('ec000000-0001-4000-8000-000000000001', 'email',         'email',         'direct', false, 40),
  ('ec000000-0001-4000-8000-000000000001', 'mobile_phone',  'mobile_phone',  'direct', false, 50),
  ('ec000000-0001-4000-8000-000000000001', 'phone',         'phone',         'direct', false, 60),
  ('ec000000-0001-4000-8000-000000000001', 'industry',      'industry',      'direct', false, 70),
  ('ec000000-0001-4000-8000-000000000001', 'lead_source',   'lead_source',   'direct', false, 80),
  ('ec000000-0001-4000-8000-000000000001', 'country_id',    'country_id',    'lookup', false, 90),
  ('ec000000-0001-4000-8000-000000000001', 'owner_id',      'owner_id',      'direct', false, 100),
  ('ec000000-0001-4000-8000-000000000001', 'description',   'description',   'direct', false, 110)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.  WIDEN trigger_event CHECK CONSTRAINT TO ALLOW 'convert_prospect'
-- ─────────────────────────────────────────────────────────────────────────────
-- Preserves all previously-allowed values and adds the new conversion trigger.

ALTER TABLE digital_rule DROP CONSTRAINT IF EXISTS digital_rule_trigger_event_check;
ALTER TABLE digital_rule ADD CONSTRAINT digital_rule_trigger_event_check
  CHECK (trigger_event IN (
    'before_delete', 'after_delete',
    'qualify_lead', 'reactivate_lead',
    'close_opportunity_won', 'close_opportunity_lost',
    'reopen_opportunity',
    'before_create',
    'on_form_load',
    'convert_prospect'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 12.  SEED: DIGITAL RULE — Convert Prospect lifecycle button
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO digital_rule (
  digital_rule_id, name, description, entity_logical_name,
  trigger_event, category,
  command_label, command_icon, command_style,
  visible_when,
  is_active, priority, is_system
)
VALUES (
  'd1000000-0001-4000-8000-000000000001',
  'Convert Prospect to Lead',
  'Shows the Convert to Lead button when the Prospect is Active and has not yet been converted.',
  'prospect',
  'convert_prospect',
  'lifecycle',
  'Convert to Lead',
  'LogIn',
  'emerald',
  '[
    {"field": "state_code",        "operator": "equals",  "value": "active"},
    {"field": "converted_lead_id", "operator": "equals",  "value": ""}
  ]'::jsonb,
  true,
  10,
  true
)
ON CONFLICT (digital_rule_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13.  SEED: DIGITAL RULE — Converted Prospect form read-only
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO digital_rule (
  digital_rule_id, name, description, entity_logical_name,
  trigger_event, category,
  visible_when,
  is_active, priority, is_system
)
VALUES (
  'd1000000-0002-4000-8000-000000000001',
  'Converted Prospect – Read-Only Form',
  'Locks the entire Prospect form when the record has been converted to a Lead.',
  'prospect',
  'on_form_load',
  'governance',
  '[{"field": "state_code", "operator": "equals", "value": "converted"}]'::jsonb,
  true,
  5,
  true
)
ON CONFLICT (digital_rule_id) DO NOTHING;

-- Correct the category on any row inserted by an earlier run of this migration
-- (the seed originally used a non-standard 'form_access' category).
UPDATE digital_rule
SET category = 'governance'
WHERE digital_rule_id = 'd1000000-0002-4000-8000-000000000001'
  AND category <> 'governance';

-- Action: set_form_access = read_only
INSERT INTO digital_rule_action (
  digital_rule_action_id,
  digital_rule_id,
  action_type,
  field_value,
  message,
  display_order
)
VALUES (
  'd2a00000-0002-4000-8000-000000000001',
  'd1000000-0002-4000-8000-000000000001',
  'set_form_access',
  'read_only',
  'This Prospect has been converted to a Lead and is now read-only.',
  0
)
ON CONFLICT (digital_rule_action_id) DO NOTHING;
