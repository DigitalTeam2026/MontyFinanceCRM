/*
  # Lead Account Link and Originating Lead on Opportunity

  ## Summary
  Implements two structural changes to enforce the rule:
  "A lead can only be qualified if it is related to an account,
  and qualification always creates an opportunity with the lead set as its originating lead."

  ## Changes

  ### 1. lead table — add account_id column
  - `account_id` (uuid, FK → account): the account this lead belongs to.
    A lead must have this populated before it can be qualified.

  ### 2. opportunity table — add originating_lead_id column
  - `originating_lead_id` (uuid, FK → lead): the lead that generated this opportunity
    via qualification. Set automatically during lead qualification.

  ### 3. Field definition — lead.accountid
  - Registers the Account lookup field in platform metadata so the lead form renders it.
  - field_type: lookup (id = 1923fc3b-b2d4-49b0-988f-31773bed353e)
  - lookup_entity_id: account entity (e8c85d9b-2883-416e-8b49-1e83e641c530)

  ### 4. Field definition — opportunity.originatingleadid
  - Registers the Originating Lead readonly lookup on the opportunity form.
  - Marked is_system = true so it cannot be deleted.

  ### 5. Lead Main Form layout_json update
  - Injects the Account lookup control into the Lead Information section (first position)
    so users can associate a lead with an account before qualifying it.

  ## Security
  - No new tables. Existing RLS on lead and opportunity tables covers these columns.
*/

-- 1. Add account_id to lead table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE lead ADD COLUMN account_id uuid REFERENCES account(account_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_account_id ON lead(account_id);

-- 2. Add originating_lead_id to opportunity table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunity' AND column_name = 'originating_lead_id'
  ) THEN
    ALTER TABLE opportunity ADD COLUMN originating_lead_id uuid REFERENCES lead(lead_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opportunity_originating_lead ON opportunity(originating_lead_id);

-- 3. Register accountid field definition on lead entity
DO $$
DECLARE
  v_field_def_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM field_definition
    WHERE entity_definition_id = '2892cad3-04be-47c2-8de0-cc16509e1fcf'
      AND logical_name = 'accountid'
  ) THEN
    INSERT INTO field_definition (
      field_definition_id,
      entity_definition_id,
      field_type_id,
      lookup_entity_id,
      logical_name,
      display_name,
      physical_column_name,
      is_required,
      is_searchable,
      is_sortable,
      is_filterable,
      is_custom,
      is_active,
      is_system,
      is_deletable,
      is_schema_editable,
      is_secured,
      config_json
    ) VALUES (
      v_field_def_id,
      '2892cad3-04be-47c2-8de0-cc16509e1fcf',
      '1923fc3b-b2d4-49b0-988f-31773bed353e',
      'e8c85d9b-2883-416e-8b49-1e83e641c530',
      'accountid',
      'Account',
      'account_id',
      false,
      false,
      false,
      true,
      false,
      true,
      false,
      false,
      false,
      false,
      '{"lookupEntity": "accounts", "lookupLabelField": "account_name"}'::jsonb
    );
  END IF;
END $$;

-- 4. Register originatingleadid field definition on opportunity entity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM field_definition
    WHERE entity_definition_id = 'e9482035-8715-40fa-a9d3-794c5b963c95'
      AND logical_name = 'originatingleadid'
  ) THEN
    INSERT INTO field_definition (
      field_definition_id,
      entity_definition_id,
      field_type_id,
      lookup_entity_id,
      logical_name,
      display_name,
      physical_column_name,
      is_required,
      is_searchable,
      is_sortable,
      is_filterable,
      is_custom,
      is_active,
      is_system,
      is_deletable,
      is_schema_editable,
      is_secured,
      config_json
    ) VALUES (
      gen_random_uuid(),
      'e9482035-8715-40fa-a9d3-794c5b963c95',
      '1923fc3b-b2d4-49b0-988f-31773bed353e',
      '2892cad3-04be-47c2-8de0-cc16509e1fcf',
      'originatingleadid',
      'Originating Lead',
      'originating_lead_id',
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      '{"lookupEntity": "leads", "lookupLabelField": "full_name", "readonly": true}'::jsonb
    );
  END IF;
END $$;

-- 5. Inject Account lookup control into Lead Main Form layout_json
-- Prepends the account control to the first section's controls array
UPDATE form_definition
SET layout_json = jsonb_set(
  layout_json,
  '{tabs,0,sections,0,controls}',
  (
    SELECT jsonb_build_array(
      jsonb_build_object(
        'id', 'ctrl_lead_account',
        'is_visible', true,
        'column_span', 1,
        'is_readonly', false,
        'control_type', 'field',
        'label_override', null,
        'subgrid_config', null,
        'field_type_name', 'lookup',
        'field_display_name', 'Account',
        'field_logical_name', 'accountid',
        'field_definition_id', fd.field_definition_id::text,
        'is_required_override', false
      )
    ) || (layout_json->'tabs'->0->'sections'->0->'controls')
    FROM field_definition fd
    WHERE fd.entity_definition_id = '2892cad3-04be-47c2-8de0-cc16509e1fcf'
      AND fd.logical_name = 'accountid'
  )
)
WHERE form_id = 'e7781cd5-3a91-4ca2-8e65-d524b3712941'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(layout_json->'tabs'->0->'sections'->0->'controls') ctrl
    WHERE ctrl->>'field_logical_name' = 'accountid'
  );
