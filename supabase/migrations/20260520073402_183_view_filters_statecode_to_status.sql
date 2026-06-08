/*
  # Migrate view filters from statecode to status

  1. Changes
    - All view_definition filter_json conditions that reference field_logical_name = 'statecode'
      are updated to reference 'status' instead
    - Filter values changed from numeric (1 = active, 2 = inactive) to string ('active', 'inactive')
    - Affects 26 views across all entities (Account, Business Unit, Campaign, Contact, Currency,
      Event, Industry, Journey, Lead, Marketing Email, Opportunity, Organization, Product,
      Product Family, Security Role, Segment, Team, Ticket, User)

  2. Notes
    - No data loss — only filter metadata is updated
    - The 'status' field (physical column: status) stores 'active'/'inactive' string values
    - The old 'statecode' field (physical column: state_code) stored numeric 1/2 values
    - Views will now filter correctly against the status column
*/

-- Update all view filter conditions from statecode to status
-- Replace field_logical_name 'statecode' → 'status'
-- Replace value '1' → 'active' and '2' → 'inactive'
UPDATE view_definition
SET
  filter_json = replace(
    replace(
      replace(
        filter_json::text,
        '"field_logical_name":"statecode"',
        '"field_logical_name":"status"'
      ),
      '"value":"1"',
      '"value":"active"'
    ),
    '"value":"2"',
    '"value":"inactive"'
  )::jsonb,
  modified_at = now()
WHERE deleted_at IS NULL
AND filter_json::text LIKE '%"field_logical_name":"statecode"%';
