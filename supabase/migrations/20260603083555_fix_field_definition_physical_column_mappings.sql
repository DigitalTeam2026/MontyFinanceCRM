/*
  # Fix field_definition physical_column_name mismatches

  Several field_definition rows reference physical column names that don't match
  the actual column names in the PostgreSQL tables. This migration corrects them.

  ## Changes by entity

  ### crm_user
  - emailaddress -> email
  - firstname -> first_name (doesn't exist yet; we use full_name for display)
  - lastname -> last_name (doesn't exist yet; we use full_name for display)
  - jobtitle -> job_title
  - telephone1 -> mobile_phone
  - is_disabled -> is_active (note: semantics are inverted but it's the closest field)
  - owner_id -> mark as custom_fields since ownership is handled via business_unit_id

  ### Journey
  - ownerid -> owner_id (already exists in DB)
  - entrycriteria -> entry_trigger (closest match in DB)

  ### Marketing Email
  - name (email name) -> subject (closest match in DB)
  - fromemail -> from_email
  - fromname -> from_name
  - ownerid -> owner_id

  ### Segment
  - criteria -> criteria_json
  - membercount -> member_count
  - ownerid -> owner_id

  ### Business Unit, Security Role, Team, Organization
  - owner_id field: these tables don't have owner_id; move to custom_fields or deactivate
*/

-- ── crm_user fixes ──────────────────────────────────────────────────────────
UPDATE field_definition f
SET physical_column_name = 'email'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'crm_user'
  AND f.logical_name = 'emailaddress'
  AND f.is_active = TRUE;

UPDATE field_definition f
SET physical_column_name = 'job_title'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'crm_user'
  AND f.logical_name = 'jobtitle'
  AND f.is_active = TRUE;

UPDATE field_definition f
SET physical_column_name = 'mobile_phone'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'crm_user'
  AND f.logical_name = 'telephone1'
  AND f.is_active = TRUE;

-- first_name / last_name don't exist as separate columns; map to custom_fields
UPDATE field_definition f
SET physical_column_name = 'custom_fields.firstname'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'crm_user'
  AND f.logical_name = 'firstname'
  AND f.is_active = TRUE;

UPDATE field_definition f
SET physical_column_name = 'custom_fields.lastname'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'crm_user'
  AND f.logical_name = 'lastname'
  AND f.is_active = TRUE;

-- is_disabled -> is_active (closest existing column)
UPDATE field_definition f
SET physical_column_name = 'is_active'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'crm_user'
  AND f.logical_name = 'isdisabled'
  AND f.is_active = TRUE;

-- owner_id doesn't exist on crm_user -> use custom_fields
UPDATE field_definition f
SET physical_column_name = 'custom_fields.ownerid'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'crm_user'
  AND f.logical_name = 'ownerid'
  AND f.is_active = TRUE;

-- ── Journey fixes ────────────────────────────────────────────────────────────
UPDATE field_definition f
SET physical_column_name = 'owner_id'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'journey'
  AND f.logical_name = 'ownerid'
  AND f.is_active = TRUE;

UPDATE field_definition f
SET physical_column_name = 'entry_trigger'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'journey'
  AND f.logical_name = 'entrycriteria'
  AND f.is_active = TRUE;

-- ── Marketing Email fixes ────────────────────────────────────────────────────
UPDATE field_definition f
SET physical_column_name = 'owner_id'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'marketing_email'
  AND f.logical_name = 'ownerid'
  AND f.is_active = TRUE;

UPDATE field_definition f
SET physical_column_name = 'from_email'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'marketing_email'
  AND f.logical_name = 'fromemail'
  AND f.is_active = TRUE;

UPDATE field_definition f
SET physical_column_name = 'from_name'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'marketing_email'
  AND f.logical_name = 'fromname'
  AND f.is_active = TRUE;

-- 'name' field on marketing_email -> map to 'subject' (the email name)
UPDATE field_definition f
SET physical_column_name = 'subject'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'marketing_email'
  AND f.logical_name = 'name'
  AND f.is_active = TRUE;

-- ── Segment fixes ────────────────────────────────────────────────────────────
UPDATE field_definition f
SET physical_column_name = 'owner_id'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'segment'
  AND f.logical_name = 'ownerid'
  AND f.is_active = TRUE;

UPDATE field_definition f
SET physical_column_name = 'criteria_json'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'segment'
  AND f.logical_name = 'criteria'
  AND f.is_active = TRUE;

UPDATE field_definition f
SET physical_column_name = 'member_count'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'segment'
  AND f.logical_name = 'membercount'
  AND f.is_active = TRUE;

-- ── Business Unit: owner_id doesn't exist -> custom_fields ───────────────────
UPDATE field_definition f
SET physical_column_name = 'custom_fields.ownerid'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'business_unit'
  AND f.logical_name = 'ownerid'
  AND f.is_active = TRUE;

-- ── Security Role: owner_id doesn't exist -> custom_fields ───────────────────
UPDATE field_definition f
SET physical_column_name = 'custom_fields.ownerid'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'security_role'
  AND f.logical_name = 'ownerid'
  AND f.is_active = TRUE;

-- ── Team: owner_id doesn't exist -> custom_fields ───────────────────────────
UPDATE field_definition f
SET physical_column_name = 'custom_fields.ownerid'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'team'
  AND f.logical_name = 'ownerid'
  AND f.is_active = TRUE;

-- ── Organization: missing columns -> custom_fields ───────────────────────────
UPDATE field_definition f
SET physical_column_name = 'custom_fields.ownerid'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'organization'
  AND f.logical_name = 'ownerid'
  AND f.is_active = TRUE;

UPDATE field_definition f
SET physical_column_name = 'custom_fields.telephone1'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'organization'
  AND f.logical_name = 'telephone1'
  AND f.is_active = TRUE;

UPDATE field_definition f
SET physical_column_name = 'custom_fields.websiteurl'
FROM entity_definition e
WHERE f.entity_definition_id = e.entity_definition_id
  AND e.physical_table_name = 'organization'
  AND f.logical_name = 'websiteurl'
  AND f.is_active = TRUE;
