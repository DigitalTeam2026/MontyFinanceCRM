/*
  # Permanently delete old 'status' field definitions

  1. Changes
    - Deletes all view_column records that reference the old 'status' field_definition rows
    - Deletes all field_permission records that reference field_name = 'status'
    - Deletes all field_definition rows where logical_name = 'status' AND physical_column_name = 'status'
      across ALL entities

  2. Affected Entities
    - account, business_unit, campaign, contact, country, crm_user, currency, event,
      industries, industry, journey, lead, marketing_email, opportunity, organization,
      product, product_family, security_role, segment, team, ticket

  3. Why
    - The old 'status' field is a duplicate of 'state_code' (statecode)
    - Keeping it even as inactive causes confusion in column lists, filters, and customization
    - The physical 'status' column was already dropped from all entity tables in migration 211
    - Only state_code (Status) and status_reason (Status Reason) should exist

  4. Safety
    - Only deletes field_definitions where logical_name = 'status' AND physical_column_name = 'status'
    - Does NOT touch state_code, status_reason, or any other fields
    - The activity_log.status column is unrelated (log status, not entity status) and is left intact
*/

-- Delete view_column records referencing old 'status' field_definitions
DELETE FROM view_column
WHERE field_definition_id IN (
  SELECT field_definition_id
  FROM field_definition
  WHERE logical_name = 'status'
    AND physical_column_name = 'status'
);

-- Delete field_permission records referencing old 'status' field
DELETE FROM field_permission
WHERE field_name = 'status';

-- Delete the field_definition rows themselves
DELETE FROM field_definition
WHERE logical_name = 'status'
  AND physical_column_name = 'status';
