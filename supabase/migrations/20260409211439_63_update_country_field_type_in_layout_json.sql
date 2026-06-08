/*
  # Update Country field_type_name in form layout_json

  ## Changes
  - Updates the `field_type_name` for the `countrycode` control from "text" to "choice"
    in the layout_json of the Account, Contact, and Lead main forms.
  - This ensures the form renderer picks up the searchable dropdown (OptionSetSelect)
    instead of a plain text input.

  ## Affected Forms
  - Account Main Form  (8a6fcaf8-1259-4d8f-a25b-bdbeb285a52e)
  - Contact Main Form  (5ecf4f62-3a9a-48e3-97e7-25a9f6e9b958)
  - Lead Main Form     (e7781cd5-3a91-4ca2-8e65-d524b3712941)
*/

UPDATE form_definition
SET layout_json = jsonb_set(
  layout_json,
  '{tabs,1,sections,0,controls,1,field_type_name}',
  '"choice"'
)
WHERE form_id = '8a6fcaf8-1259-4d8f-a25b-bdbeb285a52e';

UPDATE form_definition
SET layout_json = jsonb_set(
  layout_json,
  '{tabs,1,sections,0,controls,1,field_type_name}',
  '"choice"'
)
WHERE form_id = '5ecf4f62-3a9a-48e3-97e7-25a9f6e9b958';

UPDATE form_definition
SET layout_json = jsonb_set(
  layout_json,
  '{tabs,1,sections,0,controls,1,field_type_name}',
  '"choice"'
)
WHERE form_id = 'e7781cd5-3a91-4ca2-8e65-d524b3712941';
