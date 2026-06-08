/*
  # Fix duplicate physical_column_name mappings in field_definition

  ## Problem
  Multiple logical fields were mapping to the same physical column, causing
  400 errors when saving records (duplicate keys in the INSERT/UPDATE payload).
  Supabase rejects payloads with non-existent or duplicate column names.

  ## Changes

  ### account entity
  - Deactivate `countrycode` (duplicate with address1_city → both map to `city`)
  - Deactivate `accountnumber` (DB-managed auto-sequence, must not be written by user)

  ### contact entity
  - Deactivate `countrycode` (duplicate with address1_city → both map to `city`)

  ### lead entity
  - Deactivate `countrycode` (duplicate with address1_city → both map to `city`)
  - Deactivate `leadsourcecode` (duplicate with statuscode → both map to `status_code`)

  ### ticket entity
  - Deactivate `casetypecode` (duplicate with prioritycode → both map to `status_reason`)

  ## Security
  No RLS changes — metadata only.
*/

-- account: deactivate countrycode (duplicate of address1_city → city) and accountnumber (DB-managed)
UPDATE field_definition fd
SET is_active = false
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'account'
  AND fd.logical_name IN ('countrycode', 'accountnumber');

-- contact: deactivate countrycode (duplicate of address1_city → city)
UPDATE field_definition fd
SET is_active = false
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'contact'
  AND fd.logical_name = 'countrycode';

-- lead: deactivate countrycode (duplicate → city) and leadsourcecode (duplicate → status_code)
UPDATE field_definition fd
SET is_active = false
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'lead'
  AND fd.logical_name IN ('countrycode', 'leadsourcecode');

-- ticket: deactivate casetypecode (duplicate with prioritycode → status_reason)
UPDATE field_definition fd
SET is_active = false
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'ticket'
  AND fd.logical_name = 'casetypecode';
