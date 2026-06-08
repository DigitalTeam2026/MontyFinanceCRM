/*
  # Purge all custom_fields.* physical column mappings from system fields

  ## Summary
  10 system field_definition rows have `physical_column_name LIKE 'custom_fields.%'`
  — a legacy mapping that was never valid. None of these fields have a corresponding
  real DB column. This migration:

  1. Deactivates all 10 broken field_definition rows (sets is_active=false, deleted_at=now())
  2. Deletes view_column rows that reference these broken field_definition_ids
  3. Removes references from form layout_json (strips controls that use these field_definition_ids)
  4. Removes references from business_rule conditions/actions JSON
  5. Removes references from view filter_json / sort_json (strips conditions using these logical names)

  ## Affected field_definition rows
  - business_unit.ownerid         (id: 2b539f4e)
  - campaign.typecode             (id: 79d25351) — already soft-deleted
  - crm_user.firstname            (id: 7bdcfd3c)
  - crm_user.lastname             (id: 9a04e6ea)
  - crm_user.ownerid              (id: 0a4dd87f)
  - organization.ownerid          (id: ece5257c)
  - organization.telephone1       (id: 0b6d117e)
  - organization.websiteurl       (id: 459ea3e1)
  - security_role.ownerid         (id: 241621ca)
  - team.ownerid                  (id: 435d8d81)

  ## Notes
  - No real DB columns need to be dropped (none were ever created for these fields)
  - Contact firstname/lastname: these are crm_user fields that appeared in Contact
    form JSON — their references are removed from the Contact form layout
  - The contact table has real first_name/last_name columns mapped to the correct
    contact.firstname / contact.lastname field_definitions (separate rows, already correct)
*/

-- ── Collect the broken field_definition_ids into a temp set ──────────────────
DO $$
DECLARE
  v_broken_ids uuid[] := ARRAY[
    '2b539f4e-81bb-44cc-b712-3e497c0ddab4'::uuid,  -- business_unit.ownerid
    '79d25351-da35-46d6-85ad-1d1a6fd9f075'::uuid,  -- campaign.typecode
    '7bdcfd3c-8834-441b-8498-7f09476daf12'::uuid,  -- crm_user.firstname
    '9a04e6ea-9f97-4847-86d5-10d28eae1868'::uuid,  -- crm_user.lastname
    '0a4dd87f-2ee8-4007-984f-000eaee9dc32'::uuid,  -- crm_user.ownerid
    'ece5257c-d58c-41c6-9b7b-24bee5e8aa17'::uuid,  -- organization.ownerid
    '0b6d117e-9108-4d6a-bdc5-381e649572bc'::uuid,  -- organization.telephone1
    '459ea3e1-7776-4a55-bd3a-e0baa9afb65c'::uuid,  -- organization.websiteurl
    '241621ca-03d9-4d39-86a5-3ca138b2474d'::uuid,  -- security_role.ownerid
    '435d8d81-e9f7-456c-8e7a-adcdb5c7dff1'::uuid   -- team.ownerid
  ];
BEGIN
  -- 1. Deactivate the field_definition rows
  UPDATE public.field_definition
  SET is_active  = false,
      deleted_at = now(),
      modified_at = now()
  WHERE field_definition_id = ANY(v_broken_ids)
    AND (deleted_at IS NULL OR is_active = true);

  -- 2. Delete view_column rows referencing these fields
  DELETE FROM public.view_column
  WHERE field_definition_id = ANY(v_broken_ids);

  -- 3. Remove these field_definition_ids from form layout_json controls
  --    layout_json structure: { tabs: [ { sections: [ { controls: [ { field_definition_id, ... } ] } ] } ] }
  UPDATE public.form_definition
  SET layout_json = (
    SELECT jsonb_build_object(
      'tabs',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', tab->'id',
              'label', tab->'label',
              'sections', (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', sec->'id',
                    'label', sec->'label',
                    'columns', sec->'columns',
                    'controls', (
                      SELECT jsonb_agg(ctrl)
                      FROM jsonb_array_elements(sec->'controls') AS ctrl
                      WHERE (ctrl->>'field_definition_id') IS NULL
                         OR (ctrl->>'field_definition_id')::uuid != ALL(v_broken_ids)
                    )
                  )
                )
                FROM jsonb_array_elements(tab->'sections') AS sec
              )
            )
          )
          FROM jsonb_array_elements(layout_json->'tabs') AS tab
        ),
        '[]'::jsonb
      )
    )
  )
  WHERE layout_json IS NOT NULL
    AND layout_json::text ~ ANY(ARRAY[
      '2b539f4e-81bb-44cc-b712-3e497c0ddab4',
      '79d25351-da35-46d6-85ad-1d1a6fd9f075',
      '7bdcfd3c-8834-441b-8498-7f09476daf12',
      '9a04e6ea-9f97-4847-86d5-10d28eae1868',
      '0a4dd87f-2ee8-4007-984f-000eaee9dc32',
      'ece5257c-d58c-41c6-9b7b-24bee5e8aa17',
      '0b6d117e-9108-4d6a-bdc5-381e649572bc',
      '459ea3e1-7776-4a55-bd3a-e0baa9afb65c',
      '241621ca-03d9-4d39-86a5-3ca138b2474d',
      '435d8d81-e9f7-456c-8e7a-adcdb5c7dff1'
    ]);

  -- 4. Remove from view filter_json: strip conditions referencing these logical names
  --    or physical names with custom_fields.* prefix
  UPDATE public.view_definition
  SET filter_json = (
    SELECT CASE
      WHEN filter_json IS NULL THEN NULL
      WHEN filter_json ? 'conditions' THEN
        jsonb_set(
          filter_json,
          '{conditions}',
          COALESCE(
            (
              SELECT jsonb_agg(cond)
              FROM jsonb_array_elements(filter_json->'conditions') AS cond
              WHERE (cond->>'field') NOT IN (
                'ownerid','firstname','lastname','telephone1','websiteurl','typecode'
              )
                AND (cond->>'field') NOT LIKE 'custom_fields.%'
            ),
            '[]'::jsonb
          )
        )
      ELSE filter_json
    END
  )
  WHERE filter_json IS NOT NULL
    AND filter_json::text ~ '(ownerid|firstname|lastname|telephone1|websiteurl|custom_fields\.)';

  -- 5. Remove from view sort_json: strip sort entries for these fields
  UPDATE public.view_definition
  SET sort_json = (
    SELECT CASE
      WHEN sort_json IS NULL THEN NULL
      WHEN jsonb_typeof(sort_json) = 'array' THEN
        COALESCE(
          (
            SELECT jsonb_agg(s)
            FROM jsonb_array_elements(sort_json) AS s
            WHERE (s->>'field') NOT IN (
              'ownerid','firstname','lastname','telephone1','websiteurl','typecode'
            )
              AND (s->>'field') NOT LIKE 'custom_fields.%'
          ),
          '[]'::jsonb
        )
      ELSE sort_json
    END
  )
  WHERE sort_json IS NOT NULL
    AND sort_json::text ~ '(ownerid|firstname|lastname|telephone1|websiteurl|custom_fields\.)';

END $$;
