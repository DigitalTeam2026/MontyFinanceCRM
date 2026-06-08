/*
  # Clean up stale custom_fields.industry on account records

  1. Changes
    - Removes the 'industry' key from the custom_fields JSONB column
      on all account rows where it exists
    - This key was left over from before industry was migrated to a
      first-class industry_id FK column, and was causing value
      collisions during field mapping

  2. Affected Tables
    - account (custom_fields column only, no data loss)
*/

UPDATE account
SET custom_fields = custom_fields - 'industry'
WHERE custom_fields ? 'industry';
