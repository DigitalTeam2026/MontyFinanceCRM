/*
  # Fix Opportunity Main Form layout_json structure

  ## Problem
  A prior migration (fix_opportunity_contact_lookup_account_filter) correctly patched the
  parentcontactid lookup_config but accidentally changed the layout_json from the expected
  object format  { "tabs": [...] }  to a bare array  [...].

  The application reads layout_json.tabs — a bare array breaks form rendering entirely.

  ## Fix
  Rewrap the layout_json back into { "tabs": [...] } for the Opportunity Main Form.
  All other opportunity forms already use the bare-array format natively so they are unaffected.
*/

UPDATE form_definition
SET layout_json = jsonb_build_object('tabs', layout_json),
    modified_at = now()
WHERE form_id = '1a49940b-900e-4784-bda2-5d0bcc35ba90'
  AND jsonb_typeof(layout_json) = 'array';
