
/*
  # Fix default public views for lead, account, contact, sources

  - lead/account/contact had only personal views marked as is_default=true.
    Public views had no default, so users without that personal view saw
    the hardcoded "All Records" fallback.
  - Set the "Active *" public view as the default for each entity.
  - Personal views should not be marked is_default (that flag is per-user preference
    stored server-side; marking a personal view as global default breaks other users).
  - Fix sources: change default from "All Records" to "Active Records".
*/

-- Clear personal view is_default flags (they break the global default for other users)
UPDATE view_definition
SET is_default = false
WHERE view_type = 'personal' AND is_default = true;

-- lead: set Active Leads as default public view
UPDATE view_definition
SET is_default = true
WHERE name = 'Active Leads'
  AND view_type = 'public'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'lead'
  )
  AND deleted_at IS NULL;

UPDATE view_definition
SET is_default = false
WHERE name != 'Active Leads'
  AND view_type = 'public'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'lead'
  )
  AND deleted_at IS NULL;

-- account: set Active Accounts as default public view
UPDATE view_definition
SET is_default = true
WHERE name = 'Active Accounts'
  AND view_type = 'public'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'account'
  )
  AND deleted_at IS NULL;

UPDATE view_definition
SET is_default = false
WHERE name != 'Active Accounts'
  AND view_type = 'public'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'account'
  )
  AND deleted_at IS NULL;

-- contact: set Active Contacts as default public view
UPDATE view_definition
SET is_default = true
WHERE name = 'Active Contacts'
  AND view_type = 'public'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'contact'
  )
  AND deleted_at IS NULL;

UPDATE view_definition
SET is_default = false
WHERE name != 'Active Contacts'
  AND view_type = 'public'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'contact'
  )
  AND deleted_at IS NULL;

-- sources: change default from "All Records" to "Active Records"
UPDATE view_definition
SET is_default = false
WHERE name = 'All Records'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'sources'
  )
  AND deleted_at IS NULL;

UPDATE view_definition
SET is_default = true
WHERE name = 'Active Records'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'sources'
  )
  AND deleted_at IS NULL;
