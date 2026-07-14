-- Lifecycle status fields (state_code / status_reason) must NEVER carry inline
-- config_json.choices. Their labels come from statecode_definition /
-- status_reason_definition. Some fields (e.g. Country, Industry "Status") were
-- corrupted with swapped inline choices — {"label":"0","value":"Active"} — which
-- the grid inline-choice resolver then applied on top of the already-resolved
-- "Active", rendering a raw "0" in the Status column.
--
-- Strip any choices from lifecycle fields, preserving only the is_statecode_field /
-- is_statusreason_field marker so they keep behaving as lifecycle columns.
update field_definition
   set config_json = jsonb_build_object('is_statecode_field', true),
       modified_at = now()
 where physical_column_name = 'state_code'
   and coalesce(jsonb_array_length(config_json->'choices'), 0) > 0;

update field_definition
   set config_json = jsonb_build_object('is_statusreason_field', true),
       modified_at = now()
 where physical_column_name = 'status_reason'
   and coalesce(jsonb_array_length(config_json->'choices'), 0) > 0;
