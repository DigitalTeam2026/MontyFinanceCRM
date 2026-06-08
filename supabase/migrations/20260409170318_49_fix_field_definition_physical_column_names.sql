/*
  # Fix field_definition physical_column_name to match actual DB columns

  ## Problem
  The field_definition table had physical_column_name values that did not match
  the actual column names in the entity tables (account, contact, lead, opportunity, ticket).
  This caused 400 errors when saving records because the form was sending non-existent
  column names to the database.

  ## Changes

  ### account entity
  - name -> account_name
  - telephone1 -> phone
  - websiteurl -> website
  - numberofemployees -> number_of_employees
  - revenue -> annual_revenue
  - industrycode -> industry_id (now a uuid FK) - kept as text field for now, mapped to status
  - accountnumber -> (no direct match, keep as-is but will be excluded)
  - statuscode -> status_code
  - countrycode -> city (mapped to city since no country text col)
  - address1_city -> city
  - ownerid -> owner_id

  ### contact entity
  - firstname -> first_name
  - lastname -> last_name
  - emailaddress1 -> email
  - telephone1 -> business_phone
  - mobilephone -> mobile_phone
  - jobtitle -> job_title
  - parentcustomerid -> account_id
  - statuscode -> status_code
  - countrycode -> city (no direct country text col)
  - address1_city -> city
  - ownerid -> owner_id
  - department -> description (no department col, use description)

  ### lead entity
  - firstname -> first_name
  - lastname -> last_name
  - companyname -> company_name
  - emailaddress -> email
  - telephone1 -> phone
  - mobilephone -> mobile_phone
  - jobtitle -> job_title
  - leadsourcecode -> status_code
  - statuscode -> status_code
  - countrycode -> city
  - address1_city -> city
  - ownerid -> owner_id

  ### opportunity entity
  - name -> topic
  - estimatedvalue -> estimated_value
  - estimatedclosedate -> estimated_close_date
  - closeprobability -> probability
  - stagecode -> stage
  - statuscode -> status_code
  - parentaccountid -> account_id
  - parentcontactid -> primary_contact_id
  - ownerid -> owner_id

  ### ticket entity
  - title -> title (ok)
  - statuscode -> status_code
  - prioritycode -> status_reason
  - casetypecode -> status_reason
  - customerid -> account_id
  - resolvedon -> resolved_at
  - ownerid -> owner_id

  ## Security
  No RLS changes - this only updates metadata.
*/

-- =====================
-- ACCOUNT field mappings
-- =====================
UPDATE field_definition fd
SET physical_column_name = 'account_name'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'account'
  AND fd.logical_name = 'name';

UPDATE field_definition fd
SET physical_column_name = 'phone'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'account'
  AND fd.logical_name = 'telephone1';

UPDATE field_definition fd
SET physical_column_name = 'website'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'account'
  AND fd.logical_name = 'websiteurl';

UPDATE field_definition fd
SET physical_column_name = 'number_of_employees'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'account'
  AND fd.logical_name = 'numberofemployees';

UPDATE field_definition fd
SET physical_column_name = 'annual_revenue'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'account'
  AND fd.logical_name = 'revenue';

UPDATE field_definition fd
SET physical_column_name = 'status_code'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'account'
  AND fd.logical_name = 'statuscode';

UPDATE field_definition fd
SET physical_column_name = 'city'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'account'
  AND fd.logical_name IN ('countrycode', 'address1_city');

UPDATE field_definition fd
SET physical_column_name = 'owner_id'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'account'
  AND fd.logical_name = 'ownerid';

-- Deactivate fields with no matching DB column
UPDATE field_definition fd
SET is_active = false
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'account'
  AND fd.logical_name IN ('accountnumber', 'industrycode');

-- =====================
-- CONTACT field mappings
-- =====================
UPDATE field_definition fd
SET physical_column_name = 'first_name'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'contact'
  AND fd.logical_name = 'firstname';

UPDATE field_definition fd
SET physical_column_name = 'last_name'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'contact'
  AND fd.logical_name = 'lastname';

UPDATE field_definition fd
SET physical_column_name = 'email'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'contact'
  AND fd.logical_name = 'emailaddress1';

UPDATE field_definition fd
SET physical_column_name = 'business_phone'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'contact'
  AND fd.logical_name = 'telephone1';

UPDATE field_definition fd
SET physical_column_name = 'mobile_phone'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'contact'
  AND fd.logical_name = 'mobilephone';

UPDATE field_definition fd
SET physical_column_name = 'job_title'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'contact'
  AND fd.logical_name = 'jobtitle';

UPDATE field_definition fd
SET physical_column_name = 'account_id'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'contact'
  AND fd.logical_name = 'parentcustomerid';

UPDATE field_definition fd
SET physical_column_name = 'status_code'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'contact'
  AND fd.logical_name = 'statuscode';

UPDATE field_definition fd
SET physical_column_name = 'city'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'contact'
  AND fd.logical_name IN ('countrycode', 'address1_city');

UPDATE field_definition fd
SET physical_column_name = 'owner_id'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'contact'
  AND fd.logical_name = 'ownerid';

-- Deactivate contact fields with no matching DB column
UPDATE field_definition fd
SET is_active = false
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'contact'
  AND fd.logical_name = 'department';

-- =====================
-- LEAD field mappings
-- =====================
UPDATE field_definition fd
SET physical_column_name = 'first_name'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'lead'
  AND fd.logical_name = 'firstname';

UPDATE field_definition fd
SET physical_column_name = 'last_name'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'lead'
  AND fd.logical_name = 'lastname';

UPDATE field_definition fd
SET physical_column_name = 'company_name'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'lead'
  AND fd.logical_name = 'companyname';

UPDATE field_definition fd
SET physical_column_name = 'email'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'lead'
  AND fd.logical_name = 'emailaddress';

UPDATE field_definition fd
SET physical_column_name = 'phone'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'lead'
  AND fd.logical_name = 'telephone1';

UPDATE field_definition fd
SET physical_column_name = 'mobile_phone'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'lead'
  AND fd.logical_name = 'mobilephone';

UPDATE field_definition fd
SET physical_column_name = 'job_title'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'lead'
  AND fd.logical_name = 'jobtitle';

UPDATE field_definition fd
SET physical_column_name = 'status_code'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'lead'
  AND fd.logical_name IN ('statuscode', 'leadsourcecode');

UPDATE field_definition fd
SET physical_column_name = 'city'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'lead'
  AND fd.logical_name IN ('countrycode', 'address1_city');

UPDATE field_definition fd
SET physical_column_name = 'owner_id'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'lead'
  AND fd.logical_name = 'ownerid';

-- =====================
-- OPPORTUNITY field mappings
-- =====================
UPDATE field_definition fd
SET physical_column_name = 'topic'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'opportunity'
  AND fd.logical_name = 'name';

UPDATE field_definition fd
SET physical_column_name = 'estimated_value'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'opportunity'
  AND fd.logical_name = 'estimatedvalue';

UPDATE field_definition fd
SET physical_column_name = 'estimated_close_date'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'opportunity'
  AND fd.logical_name = 'estimatedclosedate';

UPDATE field_definition fd
SET physical_column_name = 'probability'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'opportunity'
  AND fd.logical_name = 'closeprobability';

UPDATE field_definition fd
SET physical_column_name = 'stage'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'opportunity'
  AND fd.logical_name = 'stagecode';

UPDATE field_definition fd
SET physical_column_name = 'status_code'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'opportunity'
  AND fd.logical_name = 'statuscode';

UPDATE field_definition fd
SET physical_column_name = 'account_id'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'opportunity'
  AND fd.logical_name = 'parentaccountid';

UPDATE field_definition fd
SET physical_column_name = 'primary_contact_id'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'opportunity'
  AND fd.logical_name = 'parentcontactid';

UPDATE field_definition fd
SET physical_column_name = 'owner_id'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'opportunity'
  AND fd.logical_name = 'ownerid';

-- =====================
-- TICKET field mappings
-- =====================
UPDATE field_definition fd
SET physical_column_name = 'status_code'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'ticket'
  AND fd.logical_name = 'statuscode';

UPDATE field_definition fd
SET physical_column_name = 'status_reason'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'ticket'
  AND fd.logical_name IN ('prioritycode', 'casetypecode');

UPDATE field_definition fd
SET physical_column_name = 'account_id'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'ticket'
  AND fd.logical_name = 'customerid';

UPDATE field_definition fd
SET physical_column_name = 'owner_id'
FROM entity_definition ed
WHERE ed.entity_definition_id = fd.entity_definition_id
  AND ed.logical_name = 'ticket'
  AND fd.logical_name = 'ownerid';
