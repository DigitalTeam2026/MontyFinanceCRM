/*
  # Fix Contact lookup filter on Opportunity forms

  ## Problem
  The Contact lookup field (parentcontactid) on all Opportunity forms had no
  account filter configured. Opening the Contact picker showed ALL contacts in
  the system instead of only contacts belonging to the selected Account.

  The Lead forms already had this correctly configured
  (filter_by_field_logical_name: "accountid", filter_fk_column: "account_id").

  ## Changes
  For every active Opportunity form that contains a `parentcontactid` lookup
  control, patch its `lookup_config` to set:
    - filter_by_field_logical_name: "parentaccountid"  (the account field logical name on opportunity)
    - filter_fk_column: "account_id"                   (the FK column on the contact table)

  This causes LookupDialog to:
  1. Block the contact picker with a "select an account first" message when no account is chosen.
  2. Filter the contact list to only contacts linked to the selected account when one is chosen.

  ## Affected forms
  - Opportunity Main Form  (1a49940b-900e-4784-bda2-5d0bcc35ba90)
  - MontyPay-PG            (bc9e76aa-e2f3-47fd-b0f9-67539ab0c535)
  - Any other active opportunity form with a parentcontactid lookup control
*/

UPDATE form_definition fd
SET layout_json = (
  SELECT jsonb_agg(
    jsonb_set(
      tab,
      '{sections}',
      (
        SELECT jsonb_agg(
          jsonb_set(
            sec,
            '{controls}',
            (
              SELECT jsonb_agg(
                CASE
                  WHEN ctrl->>'field_logical_name' = 'parentcontactid'
                    AND ctrl->>'field_type_name' = 'lookup'
                  THEN
                    jsonb_set(
                      jsonb_set(
                        ctrl,
                        '{lookup_config}',
                        COALESCE(ctrl->'lookup_config', '{}'::jsonb) ||
                        '{"filter_by_field_logical_name": "parentaccountid", "filter_fk_column": "account_id"}'::jsonb
                      ),
                      '{lookup_config, target_entity_id}',
                      COALESCE(
                        ctrl->'lookup_config'->'target_entity_id',
                        '"bbb2b0af-2d11-46dc-9316-52106b816825"'::jsonb
                      )
                    )
                  ELSE ctrl
                END
              )
              FROM jsonb_array_elements(sec->'controls') AS ctrl
            )
          )
        )
        FROM jsonb_array_elements(tab->'sections') AS sec
      )
    )
  )
  FROM jsonb_array_elements(fd.layout_json->'tabs') AS tab
),
modified_at = now()
WHERE fd.entity_definition_id = (
  SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'opportunity'
)
AND fd.is_active = true
AND EXISTS (
  SELECT 1
  FROM jsonb_array_elements(fd.layout_json->'tabs') AS t,
       jsonb_array_elements(t->'sections') AS s,
       jsonb_array_elements(s->'controls') AS c
  WHERE c->>'field_logical_name' = 'parentcontactid'
    AND c->>'field_type_name' = 'lookup'
);
