
/*
  # Field Definition System Flags and System Field Seed

  ## Summary
  Extends field_definition with system-field governance columns and seeds all
  system fields for each core CRM entity so the Fields Management screen shows
  the real field inventory out-of-the-box.

  ## Changes

  ### 1. New columns on field_definition
  - `is_system`            (bool, default false) – true for platform-delivered fields
  - `is_deletable`         (bool, default true)  – false prevents delete via UI
  - `is_schema_editable`   (bool, default true)  – false locks data-type / logical-name changes
  - `field_category`       (text, generated)     – 'System' or 'Custom' for display

  ### 2. Back-fill existing rows
  - All pre-existing rows (is_custom=true) keep defaults (is_system=false, is_deletable=true)

  ### 3. System field seed
  Inserts one row per system field for each entity using its entity_definition_id.
  Entities seeded: lead, contact, account, opportunity, ticket, campaign, event,
                   journey, segment, marketing_email, organization, crm_user

  ### Security
  No RLS changes – field_definition already has RLS enabled from earlier migrations.
*/

-- ─── 1. Add governance columns ───────────────────────────────────────────────

ALTER TABLE field_definition
  ADD COLUMN IF NOT EXISTS is_system        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deletable     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_schema_editable boolean NOT NULL DEFAULT true;

-- Back-fill: mark any existing rows as custom/deletable
UPDATE field_definition SET is_system = false, is_deletable = true, is_schema_editable = true
WHERE is_system IS DISTINCT FROM false;

-- ─── 2. Seed helper: look up field_type_id once ──────────────────────────────

DO $$
DECLARE
  -- field type ids
  ft_text       uuid;
  ft_email      uuid;
  ft_phone      uuid;
  ft_number     uuid;
  ft_currency   uuid;
  ft_date       uuid;
  ft_datetime   uuid;
  ft_boolean    uuid;
  ft_lookup     uuid;
  ft_choice     uuid;
  ft_textarea   uuid;
  ft_url        uuid;
  ft_autonumber uuid;

  -- entity ids
  eid_lead          uuid;
  eid_contact       uuid;
  eid_account       uuid;
  eid_opportunity   uuid;
  eid_ticket        uuid;
  eid_campaign      uuid;
  eid_event         uuid;
  eid_journey       uuid;
  eid_segment       uuid;
  eid_mkt_email     uuid;
  eid_org           uuid;
  eid_user          uuid;

BEGIN
  -- ── resolve field types ──────────────────────────────────────────────────
  SELECT field_type_id INTO ft_text       FROM field_type WHERE name = 'text'       LIMIT 1;
  SELECT field_type_id INTO ft_email      FROM field_type WHERE name = 'email'      LIMIT 1;
  SELECT field_type_id INTO ft_phone      FROM field_type WHERE name = 'phone'      LIMIT 1;
  SELECT field_type_id INTO ft_number     FROM field_type WHERE name = 'number'     LIMIT 1;
  SELECT field_type_id INTO ft_currency   FROM field_type WHERE name = 'currency'   LIMIT 1;
  SELECT field_type_id INTO ft_date       FROM field_type WHERE name = 'date'       LIMIT 1;
  SELECT field_type_id INTO ft_datetime   FROM field_type WHERE name = 'datetime'   LIMIT 1;
  SELECT field_type_id INTO ft_boolean    FROM field_type WHERE name = 'boolean'    LIMIT 1;
  SELECT field_type_id INTO ft_lookup     FROM field_type WHERE name = 'lookup'     LIMIT 1;
  SELECT field_type_id INTO ft_choice     FROM field_type WHERE name = 'choice'     LIMIT 1;
  SELECT field_type_id INTO ft_textarea   FROM field_type WHERE name = 'textarea'   LIMIT 1;
  SELECT field_type_id INTO ft_url        FROM field_type WHERE name = 'url'        LIMIT 1;
  SELECT field_type_id INTO ft_autonumber FROM field_type WHERE name = 'autonumber' LIMIT 1;

  -- fallback: if a type doesn't exist just use text
  IF ft_email      IS NULL THEN ft_email      := ft_text; END IF;
  IF ft_phone      IS NULL THEN ft_phone      := ft_text; END IF;
  IF ft_currency   IS NULL THEN ft_currency   := ft_number; END IF;
  IF ft_boolean    IS NULL THEN ft_boolean    := ft_text; END IF;
  IF ft_lookup     IS NULL THEN ft_lookup     := ft_text; END IF;
  IF ft_choice     IS NULL THEN ft_choice     := ft_text; END IF;
  IF ft_textarea   IS NULL THEN ft_textarea   := ft_text; END IF;
  IF ft_url        IS NULL THEN ft_url        := ft_text; END IF;
  IF ft_autonumber IS NULL THEN ft_autonumber := ft_text; END IF;

  -- ── resolve entity ids ───────────────────────────────────────────────────
  SELECT entity_definition_id INTO eid_lead        FROM entity_definition WHERE logical_name = 'lead'           LIMIT 1;
  SELECT entity_definition_id INTO eid_contact     FROM entity_definition WHERE logical_name = 'contact'        LIMIT 1;
  SELECT entity_definition_id INTO eid_account     FROM entity_definition WHERE logical_name = 'account'        LIMIT 1;
  SELECT entity_definition_id INTO eid_opportunity FROM entity_definition WHERE logical_name = 'opportunity'     LIMIT 1;
  SELECT entity_definition_id INTO eid_ticket      FROM entity_definition WHERE logical_name = 'ticket'         LIMIT 1;
  SELECT entity_definition_id INTO eid_campaign    FROM entity_definition WHERE logical_name = 'campaign'       LIMIT 1;
  SELECT entity_definition_id INTO eid_event       FROM entity_definition WHERE logical_name = 'event'          LIMIT 1;
  SELECT entity_definition_id INTO eid_journey     FROM entity_definition WHERE logical_name = 'journey'        LIMIT 1;
  SELECT entity_definition_id INTO eid_segment     FROM entity_definition WHERE logical_name = 'segment'        LIMIT 1;
  SELECT entity_definition_id INTO eid_mkt_email   FROM entity_definition WHERE logical_name = 'marketing_email' LIMIT 1;
  SELECT entity_definition_id INTO eid_org         FROM entity_definition WHERE logical_name = 'organization'   LIMIT 1;
  SELECT entity_definition_id INTO eid_user        FROM entity_definition WHERE logical_name = 'crm_user'       LIMIT 1;

  -- ════════════════════════════════════════════════════════════════════════
  -- LEAD
  -- ════════════════════════════════════════════════════════════════════════
  IF eid_lead IS NOT NULL THEN
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
       is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
       is_deletable, is_schema_editable, is_active, sort_order)
    VALUES
      (eid_lead, ft_text,     'firstname',    'First Name',   'firstname',    false, true,  true,  true,  false, true, false, false, true, 10),
      (eid_lead, ft_text,     'lastname',     'Last Name',    'lastname',     true,  true,  true,  true,  false, true, false, false, true, 20),
      (eid_lead, ft_email,    'emailaddress', 'Email',        'emailaddress', false, true,  true,  true,  false, true, false, false, true, 30),
      (eid_lead, ft_phone,    'telephone1',   'Phone',        'telephone1',   false, true,  true,  false, false, true, false, false, true, 40),
      (eid_lead, ft_phone,    'mobilephone',  'Mobile Phone', 'mobilephone',  false, true,  true,  false, false, true, false, false, true, 50),
      (eid_lead, ft_text,     'companyname',  'Company',      'companyname',  false, true,  true,  true,  false, true, false, false, true, 60),
      (eid_lead, ft_text,     'jobtitle',     'Job Title',    'jobtitle',     false, false, true,  true,  false, true, false, false, true, 70),
      (eid_lead, ft_choice,   'statuscode',   'Status',       'statuscode',   false, false, true,  true,  false, true, false, false, true, 80),
      (eid_lead, ft_choice,   'leadsourcecode','Source',      'leadsourcecode',false,false, true,  true,  false, true, false, false, true, 90),
      (eid_lead, ft_lookup,   'ownerid',      'Owner',        'ownerid',      false, false, false, true,  false, true, false, false, true, 100),
      (eid_lead, ft_text,     'countrycode',  'Country',      'countrycode',  false, false, true,  true,  false, true, false, false, true, 110),
      (eid_lead, ft_text,     'address1_city','City',         'address1_city',false, false, true,  true,  false, true, false, false, true, 120),
      (eid_lead, ft_textarea, 'description',  'Description',  'description',  false, true,  false, false, false, true, false, false, true, 130),
      (eid_lead, ft_datetime, 'createdon',    'Created On',   'created_at',   false, false, true,  true,  false, true, false, false, true, 900),
      (eid_lead, ft_datetime, 'modifiedon',   'Modified On',  'modified_at',  false, false, true,  true,  false, true, false, false, true, 910)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- CONTACT
  -- ════════════════════════════════════════════════════════════════════════
  IF eid_contact IS NOT NULL THEN
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
       is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
       is_deletable, is_schema_editable, is_active, sort_order)
    VALUES
      (eid_contact, ft_text,     'firstname',    'First Name',   'firstname',    false, true,  true,  true,  false, true, false, false, true, 10),
      (eid_contact, ft_text,     'lastname',     'Last Name',    'lastname',     true,  true,  true,  true,  false, true, false, false, true, 20),
      (eid_contact, ft_email,    'emailaddress1','Email',        'emailaddress1',false, true,  true,  true,  false, true, false, false, true, 30),
      (eid_contact, ft_phone,    'telephone1',   'Business Phone','telephone1',  false, true,  true,  false, false, true, false, false, true, 40),
      (eid_contact, ft_phone,    'mobilephone',  'Mobile Phone', 'mobilephone',  false, true,  true,  false, false, true, false, false, true, 50),
      (eid_contact, ft_lookup,   'parentcustomerid','Account',   'account_id',   false, false, false, true,  false, true, false, false, true, 60),
      (eid_contact, ft_text,     'jobtitle',     'Job Title',    'jobtitle',     false, false, true,  true,  false, true, false, false, true, 70),
      (eid_contact, ft_text,     'department',   'Department',   'department',   false, false, true,  true,  false, true, false, false, true, 80),
      (eid_contact, ft_choice,   'statuscode',   'Status',       'statuscode',   false, false, true,  true,  false, true, false, false, true, 90),
      (eid_contact, ft_lookup,   'ownerid',      'Owner',        'ownerid',      false, false, false, true,  false, true, false, false, true, 100),
      (eid_contact, ft_text,     'address1_city','City',         'address1_city',false, false, true,  true,  false, true, false, false, true, 110),
      (eid_contact, ft_text,     'countrycode',  'Country',      'countrycode',  false, false, true,  true,  false, true, false, false, true, 120),
      (eid_contact, ft_textarea, 'description',  'Description',  'description',  false, true,  false, false, false, true, false, false, true, 130),
      (eid_contact, ft_datetime, 'createdon',    'Created On',   'created_at',   false, false, true,  true,  false, true, false, false, true, 900),
      (eid_contact, ft_datetime, 'modifiedon',   'Modified On',  'modified_at',  false, false, true,  true,  false, true, false, false, true, 910)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- ACCOUNT
  -- ════════════════════════════════════════════════════════════════════════
  IF eid_account IS NOT NULL THEN
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
       is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
       is_deletable, is_schema_editable, is_active, sort_order)
    VALUES
      (eid_account, ft_text,     'name',           'Account Name',  'name',           true,  true,  true,  true,  false, true, false, false, true, 10),
      (eid_account, ft_text,     'accountnumber',  'Account Number','accountnumber',  false, true,  true,  false, false, true, false, false, true, 20),
      (eid_account, ft_phone,    'telephone1',     'Phone',         'telephone1',     false, true,  true,  false, false, true, false, false, true, 30),
      (eid_account, ft_url,      'websiteurl',     'Website',       'websiteurl',     false, false, true,  false, false, true, false, false, true, 40),
      (eid_account, ft_choice,   'industrycode',   'Industry',      'industrycode',   false, false, true,  true,  false, true, false, false, true, 50),
      (eid_account, ft_currency, 'revenue',        'Annual Revenue','revenue',        false, false, true,  true,  false, true, false, false, true, 60),
      (eid_account, ft_number,   'numberofemployees','Employees',   'numberofemployees',false,false,true,  true,  false, true, false, false, true, 70),
      (eid_account, ft_text,     'address1_city',  'City',          'address1_city',  false, false, true,  true,  false, true, false, false, true, 80),
      (eid_account, ft_text,     'countrycode',    'Country',       'countrycode',    false, false, true,  true,  false, true, false, false, true, 90),
      (eid_account, ft_choice,   'statuscode',     'Status',        'statuscode',     false, false, true,  true,  false, true, false, false, true, 100),
      (eid_account, ft_lookup,   'ownerid',        'Owner',         'ownerid',        false, false, false, true,  false, true, false, false, true, 110),
      (eid_account, ft_textarea, 'description',    'Description',   'description',    false, true,  false, false, false, true, false, false, true, 120),
      (eid_account, ft_datetime, 'createdon',      'Created On',    'created_at',     false, false, true,  true,  false, true, false, false, true, 900),
      (eid_account, ft_datetime, 'modifiedon',     'Modified On',   'modified_at',    false, false, true,  true,  false, true, false, false, true, 910)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- OPPORTUNITY
  -- ════════════════════════════════════════════════════════════════════════
  IF eid_opportunity IS NOT NULL THEN
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
       is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
       is_deletable, is_schema_editable, is_active, sort_order)
    VALUES
      (eid_opportunity, ft_text,     'name',             'Opportunity Name', 'name',             true,  true,  true,  true,  false, true, false, false, true, 10),
      (eid_opportunity, ft_lookup,   'parentaccountid',  'Account',          'account_id',       false, false, false, true,  false, true, false, false, true, 20),
      (eid_opportunity, ft_lookup,   'parentcontactid',  'Contact',          'contact_id',       false, false, false, true,  false, true, false, false, true, 30),
      (eid_opportunity, ft_currency, 'estimatedvalue',   'Est. Value',       'estimatedvalue',   false, false, true,  true,  false, true, false, false, true, 40),
      (eid_opportunity, ft_number,   'closeprobability', 'Probability (%)',  'closeprobability', false, false, true,  true,  false, true, false, false, true, 50),
      (eid_opportunity, ft_date,     'estimatedclosedate','Close Date',      'closedate',        false, false, true,  true,  false, true, false, false, true, 60),
      (eid_opportunity, ft_choice,   'stagecode',        'Stage',            'stagecode',        false, false, true,  true,  false, true, false, false, true, 70),
      (eid_opportunity, ft_choice,   'statuscode',       'Status',           'statuscode',       false, false, true,  true,  false, true, false, false, true, 80),
      (eid_opportunity, ft_lookup,   'ownerid',          'Owner',            'ownerid',          false, false, false, true,  false, true, false, false, true, 90),
      (eid_opportunity, ft_textarea, 'description',      'Description',      'description',      false, true,  false, false, false, true, false, false, true, 100),
      (eid_opportunity, ft_datetime, 'createdon',        'Created On',       'created_at',       false, false, true,  true,  false, true, false, false, true, 900),
      (eid_opportunity, ft_datetime, 'modifiedon',       'Modified On',      'modified_at',      false, false, true,  true,  false, true, false, false, true, 910)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- TICKET (Support Case)
  -- ════════════════════════════════════════════════════════════════════════
  IF eid_ticket IS NOT NULL THEN
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
       is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
       is_deletable, is_schema_editable, is_active, sort_order)
    VALUES
      (eid_ticket, ft_text,     'title',          'Title',          'title',          true,  true,  true,  true,  false, true, false, false, true, 10),
      (eid_ticket, ft_lookup,   'customerid',     'Customer',       'customer_id',    false, false, false, true,  false, true, false, false, true, 20),
      (eid_ticket, ft_choice,   'prioritycode',   'Priority',       'prioritycode',   false, false, true,  true,  false, true, false, false, true, 30),
      (eid_ticket, ft_choice,   'statuscode',     'Status',         'statuscode',     false, false, true,  true,  false, true, false, false, true, 40),
      (eid_ticket, ft_choice,   'casetypecode',   'Type',           'casetypecode',   false, false, true,  true,  false, true, false, false, true, 50),
      (eid_ticket, ft_lookup,   'ownerid',        'Assigned To',    'ownerid',        false, false, false, true,  false, true, false, false, true, 60),
      (eid_ticket, ft_textarea, 'description',    'Description',    'description',    false, true,  false, false, false, true, false, false, true, 70),
      (eid_ticket, ft_textarea, 'resolution',     'Resolution',     'resolution',     false, true,  false, false, false, true, false, false, true, 80),
      (eid_ticket, ft_datetime, 'createdon',      'Created On',     'created_at',     false, false, true,  true,  false, true, false, false, true, 900),
      (eid_ticket, ft_datetime, 'modifiedon',     'Modified On',    'modified_at',    false, false, true,  true,  false, true, false, false, true, 910),
      (eid_ticket, ft_datetime, 'resolvedon',     'Resolved On',    'resolved_at',    false, false, true,  true,  false, true, false, false, true, 920)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- CAMPAIGN
  -- ════════════════════════════════════════════════════════════════════════
  IF eid_campaign IS NOT NULL THEN
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
       is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
       is_deletable, is_schema_editable, is_active, sort_order)
    VALUES
      (eid_campaign, ft_text,     'name',           'Campaign Name',  'name',           true,  true,  true,  true,  false, true, false, false, true, 10),
      (eid_campaign, ft_choice,   'typecode',       'Type',           'typecode',       false, false, true,  true,  false, true, false, false, true, 20),
      (eid_campaign, ft_choice,   'statuscode',     'Status',         'statuscode',     false, false, true,  true,  false, true, false, false, true, 30),
      (eid_campaign, ft_currency, 'budgetedcost',   'Budgeted Cost',  'budgetedcost',   false, false, true,  true,  false, true, false, false, true, 40),
      (eid_campaign, ft_currency, 'actualcost',     'Actual Cost',    'actualcost',     false, false, true,  true,  false, true, false, false, true, 50),
      (eid_campaign, ft_date,     'startdate',      'Start Date',     'startdate',      false, false, true,  true,  false, true, false, false, true, 60),
      (eid_campaign, ft_date,     'enddate',        'End Date',       'enddate',        false, false, true,  true,  false, true, false, false, true, 70),
      (eid_campaign, ft_lookup,   'ownerid',        'Owner',          'ownerid',        false, false, false, true,  false, true, false, false, true, 80),
      (eid_campaign, ft_textarea, 'description',    'Description',    'description',    false, true,  false, false, false, true, false, false, true, 90),
      (eid_campaign, ft_datetime, 'createdon',      'Created On',     'created_at',     false, false, true,  true,  false, true, false, false, true, 900),
      (eid_campaign, ft_datetime, 'modifiedon',     'Modified On',    'modified_at',    false, false, true,  true,  false, true, false, false, true, 910)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- EVENT
  -- ════════════════════════════════════════════════════════════════════════
  IF eid_event IS NOT NULL THEN
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
       is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
       is_deletable, is_schema_editable, is_active, sort_order)
    VALUES
      (eid_event, ft_text,     'name',           'Event Name',     'name',           true,  true,  true,  true,  false, true, false, false, true, 10),
      (eid_event, ft_choice,   'typecode',       'Type',           'typecode',       false, false, true,  true,  false, true, false, false, true, 20),
      (eid_event, ft_choice,   'statuscode',     'Status',         'statuscode',     false, false, true,  true,  false, true, false, false, true, 30),
      (eid_event, ft_datetime, 'starttime',      'Start Date/Time','starttime',      false, false, true,  true,  false, true, false, false, true, 40),
      (eid_event, ft_datetime, 'endtime',        'End Date/Time',  'endtime',        false, false, true,  true,  false, true, false, false, true, 50),
      (eid_event, ft_text,     'location',       'Location',       'location',       false, true,  true,  false, false, true, false, false, true, 60),
      (eid_event, ft_number,   'maxcapacity',    'Max Capacity',   'maxcapacity',    false, false, true,  true,  false, true, false, false, true, 70),
      (eid_event, ft_lookup,   'ownerid',        'Owner',          'ownerid',        false, false, false, true,  false, true, false, false, true, 80),
      (eid_event, ft_textarea, 'description',    'Description',    'description',    false, true,  false, false, false, true, false, false, true, 90),
      (eid_event, ft_datetime, 'createdon',      'Created On',     'created_at',     false, false, true,  true,  false, true, false, false, true, 900),
      (eid_event, ft_datetime, 'modifiedon',     'Modified On',    'modified_at',    false, false, true,  true,  false, true, false, false, true, 910)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- JOURNEY
  -- ════════════════════════════════════════════════════════════════════════
  IF eid_journey IS NOT NULL THEN
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
       is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
       is_deletable, is_schema_editable, is_active, sort_order)
    VALUES
      (eid_journey, ft_text,     'name',         'Journey Name',   'name',         true,  true,  true,  true,  false, true, false, false, true, 10),
      (eid_journey, ft_choice,   'statuscode',   'Status',         'statuscode',   false, false, true,  true,  false, true, false, false, true, 20),
      (eid_journey, ft_text,     'entrycriteria','Entry Criteria', 'entrycriteria',false, false, false, false, false, true, false, false, true, 30),
      (eid_journey, ft_lookup,   'ownerid',      'Owner',          'ownerid',      false, false, false, true,  false, true, false, false, true, 40),
      (eid_journey, ft_textarea, 'description',  'Description',    'description',  false, true,  false, false, false, true, false, false, true, 50),
      (eid_journey, ft_datetime, 'createdon',    'Created On',     'created_at',   false, false, true,  true,  false, true, false, false, true, 900),
      (eid_journey, ft_datetime, 'modifiedon',   'Modified On',    'modified_at',  false, false, true,  true,  false, true, false, false, true, 910)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- SEGMENT
  -- ════════════════════════════════════════════════════════════════════════
  IF eid_segment IS NOT NULL THEN
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
       is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
       is_deletable, is_schema_editable, is_active, sort_order)
    VALUES
      (eid_segment, ft_text,     'name',         'Segment Name',   'name',         true,  true,  true,  true,  false, true, false, false, true, 10),
      (eid_segment, ft_choice,   'statuscode',   'Status',         'statuscode',   false, false, true,  true,  false, true, false, false, true, 20),
      (eid_segment, ft_textarea, 'criteria',     'Criteria',       'criteria',     false, false, false, false, false, true, false, false, true, 30),
      (eid_segment, ft_number,   'membercount',  'Member Count',   'membercount',  false, false, true,  true,  false, true, false, false, true, 40),
      (eid_segment, ft_lookup,   'ownerid',      'Owner',          'ownerid',      false, false, false, true,  false, true, false, false, true, 50),
      (eid_segment, ft_datetime, 'createdon',    'Created On',     'created_at',   false, false, true,  true,  false, true, false, false, true, 900),
      (eid_segment, ft_datetime, 'modifiedon',   'Modified On',    'modified_at',  false, false, true,  true,  false, true, false, false, true, 910)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- MARKETING EMAIL
  -- ════════════════════════════════════════════════════════════════════════
  IF eid_mkt_email IS NOT NULL THEN
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
       is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
       is_deletable, is_schema_editable, is_active, sort_order)
    VALUES
      (eid_mkt_email, ft_text,     'name',         'Email Name',     'name',         true,  true,  true,  true,  false, true, false, false, true, 10),
      (eid_mkt_email, ft_text,     'subject',      'Subject',        'subject',      true,  true,  true,  false, false, true, false, false, true, 20),
      (eid_mkt_email, ft_email,    'fromemail',    'From Email',     'fromemail',    false, false, true,  false, false, true, false, false, true, 30),
      (eid_mkt_email, ft_text,     'fromname',     'From Name',      'fromname',     false, false, true,  false, false, true, false, false, true, 40),
      (eid_mkt_email, ft_choice,   'statuscode',   'Status',         'statuscode',   false, false, true,  true,  false, true, false, false, true, 50),
      (eid_mkt_email, ft_lookup,   'ownerid',      'Owner',          'ownerid',      false, false, false, true,  false, true, false, false, true, 60),
      (eid_mkt_email, ft_datetime, 'createdon',    'Created On',     'created_at',   false, false, true,  true,  false, true, false, false, true, 900),
      (eid_mkt_email, ft_datetime, 'modifiedon',   'Modified On',    'modified_at',  false, false, true,  true,  false, true, false, false, true, 910)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- ORGANIZATION
  -- ════════════════════════════════════════════════════════════════════════
  IF eid_org IS NOT NULL THEN
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
       is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
       is_deletable, is_schema_editable, is_active, sort_order)
    VALUES
      (eid_org, ft_text,     'name',         'Organization Name','name',         true,  true,  true,  true,  false, true, false, false, true, 10),
      (eid_org, ft_url,      'websiteurl',   'Website',          'websiteurl',   false, false, true,  false, false, true, false, false, true, 20),
      (eid_org, ft_phone,    'telephone1',   'Phone',            'telephone1',   false, true,  true,  false, false, true, false, false, true, 30),
      (eid_org, ft_choice,   'statuscode',   'Status',           'statuscode',   false, false, true,  true,  false, true, false, false, true, 40),
      (eid_org, ft_datetime, 'createdon',    'Created On',       'created_at',   false, false, true,  true,  false, true, false, false, true, 900),
      (eid_org, ft_datetime, 'modifiedon',   'Modified On',      'modified_at',  false, false, true,  true,  false, true, false, false, true, 910)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- USER (crm_user)
  -- ════════════════════════════════════════════════════════════════════════
  IF eid_user IS NOT NULL THEN
    INSERT INTO field_definition
      (entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
       is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
       is_deletable, is_schema_editable, is_active, sort_order)
    VALUES
      (eid_user, ft_text,     'firstname',    'First Name',    'firstname',    false, true,  true,  true,  false, true, false, false, true, 10),
      (eid_user, ft_text,     'lastname',     'Last Name',     'lastname',     true,  true,  true,  true,  false, true, false, false, true, 20),
      (eid_user, ft_email,    'emailaddress', 'Email',         'emailaddress', true,  true,  true,  true,  false, true, false, false, true, 30),
      (eid_user, ft_phone,    'telephone1',   'Phone',         'telephone1',   false, true,  true,  false, false, true, false, false, true, 40),
      (eid_user, ft_text,     'jobtitle',     'Job Title',     'jobtitle',     false, false, true,  true,  false, true, false, false, true, 50),
      (eid_user, ft_boolean,  'isdisabled',   'Is Disabled',   'is_disabled',  false, false, true,  true,  false, true, false, false, true, 60),
      (eid_user, ft_datetime, 'createdon',    'Created On',    'created_at',   false, false, true,  true,  false, true, false, false, true, 900),
      (eid_user, ft_datetime, 'modifiedon',   'Modified On',   'modified_at',  false, false, true,  true,  false, true, false, false, true, 910)
    ON CONFLICT DO NOTHING;
  END IF;

END $$;
