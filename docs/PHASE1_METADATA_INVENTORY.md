# PHASE 1 — CRM METADATA INVENTORY

Generated from live Postgres (monty_finance_crm). Choice options are stored **inline** in field_definition.config_json.choices (the option_set/option_set_value tables are empty). Status/Status-Reason come from statecode_definition / status_reason_definition.


## Account — `account` (table `account`)
Primary field: `account_name` · Fields: 33

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| industry | industry | industry_id | lookup | → **Industry** (`industry`, name col `name`) |
| name | Account Name | account_name | text |  |
| telephone1 | Phone | phone | phone |  |
| websiteurl | Website | website | url |  |
| revenue | Annual Revenue | annual_revenue | currency |  |
| numberofemployees | Employees | number_of_employees | number |  |
| address1_city | City | city | text |  |
| countrycode | Country | country_id | lookup | → **Country** (`country`, name col `name`) |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| description | Description | description | textarea |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |
| account_id | Account Id | account_id | text |  |
| currency_id | Currency Id | currency_id | lookup | → **Currency** (`currency`, name col `name`) |
| parent_account_id | Parent Account Id | parent_account_id | lookup | → **Account** (`account`, name col `account_name`) |
| email | Email | email | text |  |
| address_line1 | Address Line1 | address_line1 | text |  |
| address_line2 | Address Line2 | address_line2 | text |  |
| state_province | State Province | state_province | text |  |
| postal_code | Postal Code | postal_code | text |  |
| owner_type | Owner Type | owner_type | text |  |
| business_unit_id | Business Unit Id | business_unit_id | lookup | → **Business Unit** (`business_unit`, name col `name`) |
| is_deleted | Is Deleted | is_deleted | boolean |  |
| version_no | Version No | version_no | whole_number |  |
| currency_locked | Currency Locked | currency_locked | boolean |  |
| currency_lock_reason | Currency Lock Reason | currency_lock_reason | text |  |
| country_code | Country Code | country_code | text |  |
| active_process_flow_instance_id | Active Process Flow Instance Id | active_process_flow_instance_id | text |  |
| deleted_at | Deleted At | deleted_at | datetime |  |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Appointment — `appointment` (table `timeline_appointment`)
Primary field: `subject` · Fields: 8

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| subject | Name | subject | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Attachment — `attachment` (table `timeline_attachment`)
Primary field: `file_name` · Fields: 8

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| file_name | Name | file_name | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Business Unit — `business_unit` (table `business_unit`)
Primary field: `name` · Fields: 12

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Name | name | text |  |
| description | Description | description | text |  |
| is_active | Is Active | is_active | boolean |  |
| parent_business_unit_id | Parent Business Unit | parent_business_unit_id | lookup | → **Business Unit** (`business_unit`, name col `name`) |
| created_at | Created At | created_at | datetime |  |
| modified_at | Modified At | modified_at | datetime |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Campaign — `campaign` (table `campaign`)
Primary field: `name` · Fields: 26

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| campaign_source | Campaign Source | campaign_source | choice | 1=Meta, 2=Linkedin, 3=GSA |
| multi_source | Multi Source | multi_source | multi_choice | 1=Meta, 2=Insta |
| note | Note | note | long_text |  |
| business_entity | Business Entity  | business_entity | text |  |
| name | Campaign Name | name | text |  |
| budgetedcost | Budgeted Cost | budget | currency |  |
| actualcost | Actual Cost | actual_cost | currency |  |
| startdate | Start Date | start_date | date |  |
| enddate | End Date | end_date | date |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| description | Description | description | textarea |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |
| campaign_id | Campaign Id | campaign_id | text |  |
| currency_id | Currency Id | currency_id | lookup | → **Currency** (`currency`, name col `name`) |
| expected_response | Expected Response | expected_response | whole_number |  |
| expected_revenue | Expected Revenue | expected_revenue | decimal |  |
| owner_type | Owner Type | owner_type | text |  |
| business_unit_id | Business Unit Id | business_unit_id | lookup | → **Business Unit** (`business_unit`, name col `name`) |
| is_deleted | Is Deleted | is_deleted | boolean |  |
| version_no | Version No | version_no | whole_number |  |
| deleted_at | Deleted At | deleted_at | datetime |  |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Contact — `contact` (table `contact`)
Primary field: `full_name` · Fields: 18

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| full_name | Full Name | full_name | text |  |
| firstname | First Name | first_name | text |  |
| lastname | Last Name | last_name | text |  |
| emailaddress1 | Email | email | email |  |
| telephone1 | Business Phone | business_phone | phone |  |
| mobilephone | Mobile Phone | mobile_phone | phone |  |
| parentcustomerid | Account | account_id | lookup | → **Account** (`account`, name col `account_name`) |
| jobtitle | Job Title | job_title | text |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| address1_city | City | city | text |  |
| countrycode | Country | country_code | choice | (no inline choices) |
| description | Description | description | textarea |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Country — `country` (table `country`)
Primary field: `name` · Fields: 21

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| is_region | Is Region | is_region | boolean |  |
| country_code | Country Code | country_code | text |  |
| import_sequence_number | Import Sequence Number | import_sequence_number | whole_number |  |
| continent | Continent | continent | lookup | → **Continent** (`crm_continent`, name col `name`) |
| common_abbreviation | Common abbreviation | common_abbreviation | text |  |
| owning_business_unt | Owning business Unt | owning_business_unt | lookup | → **Business Unit** (`business_unit`, name col `name`) |
| owning_user | Owning User | owning_user | lookup | → **User** (`crm_user`, name col `full_name`) |
| manager | Manager | manager | lookup | → **User** (`crm_user`, name col `full_name`) |
| name | Name | name | text |  |
| isocode2 | ISO Code (2-digit) | code | text |  |
| isocode3 | ISO Code (3-digit) | iso_code_3 | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | Active=0, Inactive=1 |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |
| country_id | Country Id | country_id | text |  |
| is_active | Is Active | is_active | boolean |  |
| deleted_at | Deleted At | deleted_at | datetime |  |

**Status (state_code):** 1=Active, 2=Inactive, 3=Nsdui
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## User — `crm_user` (table `crm_user`)
Primary field: `full_name` · Fields: 10

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| emailaddress | Email | email | email |  |
| telephone1 | Phone | mobile_phone | phone |  |
| jobtitle | Job Title | job_title | text |  |
| isdisabled | Is Disabled | is_active | boolean |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Currency — `currency` (table `currency`)
Primary field: `name` · Fields: 10

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Name | name | text |  |
| code | Code | code | text |  |
| symbol | Symbol | symbol | text |  |
| exchange_rate | Exchange Rate | exchange_rate | decimal |  |
| is_base | Is Base | is_base | boolean |  |
| is_active | Is Active | is_active | boolean |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Email — `email` (table `timeline_email`)
Primary field: `subject` · Fields: 8

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| subject | Name | subject | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Event — `event` (table `event`)
Primary field: `name` · Fields: 14

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Event Name | name | text |  |
| typecode | Type | event_type | choice | (no inline choices) |
| starttime | Start Date/Time | start_date | datetime |  |
| endtime | End Date/Time | end_date | datetime |  |
| location | Location | location | text |  |
| maxcapacity | Max Capacity | max_capacity | number |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| description | Description | description | textarea |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Industry — `industry` (table `industry`)
Primary field: `name` · Fields: 22

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| product | Product | product | lookup | → **Product** (`product`, name col `name`) |
| main_product | Main product | main_product | lookup | → **Product** (`product`, name col `name`) |
| owning_user | Owning User | owning_user | lookup | → **User** (`crm_user`, name col `full_name`) |
| business_unit | Business unit | business_unit | text |  |
| owner | Owner | owner | lookup | → **User** (`crm_user`, name col `full_name`) |
| owning_business_unit | Owning Business Unit | owning_business_unit | lookup | → **Business Unit** (`business_unit`, name col `name`) |
| temp | Temp | temp | text |  |
| name | Name | name | text |  |
| description | Description | description | text |  |
| code | Code | code | text |  |
| parentindustryid | Parent Industry | parent_industry_id | lookup | → **Industry** (`industry`, name col `name`) |
| isactive | Is Active | is_active | boolean |  |
| displayorder | Display Order | display_order | number |  |
| createdon | Created On | created_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | Active=0, Inactive=1 |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |
| industry_id | Industry Id | industry_id | text |  |
| deleted_at | Deleted At | deleted_at | datetime |  |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Journey — `journey` (table `journey`)
Primary field: `name` · Fields: 10

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Journey Name | name | text |  |
| entrycriteria | Entry Criteria | entry_trigger | text |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| description | Description | description | textarea |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Lead — `lead` (table `lead`)
Primary field: `full_name` · Fields: 138

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| schedule_conduct_meeting | Schedule & Conduct Meeting | schedule_conduct_meeting | boolean |  |
| state_province | State/Province | state_province | long_text |  |
| lead_referral | Lead Referral | lead_referral | lookup | → **User** (`crm_user`, name col `full_name`) |
| custom_region | Custom Region | custom_region | choice | 1=Eastern Africa, 2=Middle Africa, 3=Northen Africa, 4=Southern Africa, 5=western Africa, 6=Oceania, 7=European Union, 8=Europe, 9=Caribbean, 10=South America, 11=Northen America, 12=West America, 13=Central Asia, 14=Eastern Asia, 15=Southern Asia, 16=South-Eastern Asia, 17=Global |
| existing_loans_or_debt | Existing Loans or Debt | existing_loans_or_debt | boolean |  |
| product_family | Product Family | product_family | lookup | → **Product Family** (`product_family`, name col `name`) |
| other_referral | Other Referral | other_referral | text |  |
| communication_mobile_number | Communication Mobile Number | communication_mobile_number | phone |  |
| communication_email | Communication Email | communication_email | email |  |
| rating | Rating | rating | choice | hot=Hot, warm=Warm, cold=Cold |
| leadsource | LeadSource | leadsource | lookup | → **LeadSource** (`crm_leadsource`, name col `name`) |
| zip_postal_code | ZIP/Postal Code | zip_postal_code | long_text |  |
| address1_line3 | Address1_line3 | address1_line3 | text |  |
| support_monty_care | Support Monty Care | support_monty_care | boolean |  |
| campaign | Campaign | campaign_id | lookup | → **Campaign** (`campaign`, name col `name`) |
| owner_country | Owner Country | owner_country | text |  |
| contact | Contact | contact_id | lookup | → **Contact** (`contact`, name col `full_name`) |
| parent_account | Parent Account | parent_account | lookup | → **Account** (`account`, name col `account_name`) |
| country_region | Country/Region | country_region | long_text |  |
| exisiting_accouts | Exisiting Accouts | exisiting_accouts | lookup | → **Account** (`account`, name col `account_name`) |
| event_attendee_reference | Event Attendee Reference | event_attendee_reference | lookup | → **User** (`crm_user`, name col `full_name`) |
| building | Building | building | long_text |  |
| compliance_approval | Compliance Approval | compliance_approval | boolean |  |
| operation_approval | Operation Approval | operation_approval | boolean |  |
| message | Message | message | long_text |  |
| existing_accounts | Existing Account | existing_accounts | boolean |  |
| on_hold_until | On Hold until | on_hold_until | date |  |
| what_feature_s_arre_you_interested_in | What feature(s) arre you interested in? | what_feature_s_arre_you_interested_in | text |  |
| business_unit | Business Unit | business_unit | text |  |
| addtess1_line2 | Addtess1_Line2 | addtess1_line2 | long_text |  |
| online_revenue_band | Online Revenue Band | online_revenue_band | choice | 1=$0 - 10k, 2=$10k - 100k, 3=$100k - 1M, 4=$1M |
| marital_status | Marital Status | marital_status | choice | 1=Single, 2=Married, 3=Divorced, 4=Widowed |
| governate | Governate | governate | lookup | → **Governate** (`crm_governate`, name col `name`) |
| country_of_incorporation | Country of Incorporation | country_of_incorporation | choice | 1=LB (Lebanon), 2=Non-LB (Non-Lebanon) |
| country | Country | country_id | lookup | → **Country** (`country`, name col `name`) |
| middle_name | Middle Name | middle_name | text |  |
| city | City | city | long_text |  |
| can_disqualify | Can Disqualify | can_disqualify | boolean |  |
| currency | Currency | currency_id | lookup | → **Currency** (`currency`, name col `name`) |
| event | Event | event_id | lookup | → **Event** (`event`, name col `name`) |
| business_phone | Business Phone | business_phone | phone |  |
| company_type_non_lb | Company Type Non-LB | company_type_non_lb | multi_choice | 1=Corporation, 2=Partnership, 3=LLC, 4=International Business Company, 5=Foundation, 6=Trust |
| company_type_lb | Company Type LB | company_type_lb | choice | 1=SAL (société anonyme libanaise incl. Offshore and Holding), 2=SARL (société à responsabilité limitée), 3=SNC (société en nom collectif), 4=SCA (société en commandite par action), 5=SCS (société en commandite simple), 6=ETS (Etablissement Individuel), 7=NPO (Non Profit Organization), 8=Cooperative, 9=SC (Société Civile) |
| demo | Demo | demo | boolean |  |
| industry | Industry | industry | lookup | → **Industry** (`industry`, name col `name`) |
| agency_name | Agency Name | agency_name | text |  |
| floor | Floor | floor | long_text |  |
| presentation | Presentation | presentation | boolean |  |
| legacy_id | Legacy Id | legacy_id | text |  |
| card_price | Card Price | card_price | decimal |  |
| cash_paremeter_code | Cash Paremeter Code | cash_paremeter_code | choice | 1=MTYC_CC2, 2=MTYC_CC3 |
| monthly_settlement_percentage | Monthly settlement Percentage | monthly_settlement_percentage | choice | 1=10%, 2=100% |
| account_manager | Account Manager | account_manager | lookup | → **User** (`crm_user`, name col `full_name`) |
| address_location | Address Location | address_location | long_text |  |
| pickup_branch | PIckup Branch | pickup_branch | lookup | → **Pickup Branch** (`crm_pickup_branch`, name col `name`) |
| card_pickup_option | Card Pickup option | card_pickup_option | choice | 1=Branch, 2=Aramex, 3=Account Manager |
| register_number | Register Number | register_number | decimal |  |
| register_place | Register Place | register_place | text |  |
| date_of_birth | Date Of Birth | date_of_birth | datetime |  |
| number_of_dependents | Number Of Dependents | number_of_dependents | decimal |  |
| gender | Gender | gender | choice | 1=Male, 2=Female |
| mobile_phone | Mobile Phone | mobile_phone | phone |  |
| maiden_name | Maiden name | maiden_name | text |  |
| mother_name | Mother Name | mother_name | text |  |
| accountid | Account | account_id | lookup | → **Account** (`account`, name col `account_name`) |
| online_revenue | Online revenue | online_revenue | boolean |  |
| on_hold_reason | On Hold Reason | on_hold_reason | textarea |  |
| productid | Product | product_id | lookup | → **Product** (`product`, name col `name`) |
| website | Website | website | url |  |
| requested_credit_limit | Requested Credit Limit | requested_credit_limit | text |  |
| street_1 | Street 1 | street_1 | long_text |  |
| card_color | Card Color | card_color | choice | 1=Red, 2=Green, 3=White "Evil Eye" |
| card_type | Card Type | card_type | lookup | → **MyMonty Credit Card Type** (`crm_mymonty_credit_card_type`, name col `name`) |
| mymonty_wallet | MyMonty Wallet? | mymonty_wallet | boolean |  |
| father_name | Father Name | father_name | text |  |
| nationality | Nationality | nationality | lookup | → **Country** (`country`, name col `name`) |
| primary_income_usd | pRIMARY INCOME usd | primary_income_usd | text |  |
| other_income_usd | Other Income usD | other_income_usd | decimal |  |
| monthly_expenses_usd | Monthly expenses USD | monthly_expenses_usd | decimal |  |
| salary_bracket | Salary Bracket | salary_bracket | long_text |  |
| employer_floor | Employer Floor | employer_floor | text |  |
| employer_street | Employer Street | employer_street | text |  |
| employer_building | Employer Building | employer_building | text |  |
| employer_city | Employer City | employer_city | text |  |
| employer_country | Employer Country | employer_country | text |  |
| years_of_service | Years of Service | years_of_service | decimal |  |
| employer_s_name | Employer's Name | employer_s_name | text |  |
| occupatin | Occupatin | occupatin | text |  |
| sponsor_name | Sponsor name | sponsor_name | text |  |
| employment_status | Employment Status | employment_status | choice | 1=Employed, 2=Self-Employed, 3=Unemployed/Sponsor |
| supplementary_crad_option | Supplementary Crad Option | supplementary_crad_option | boolean |  |
| firstname | First Name | first_name | text |  |
| lastname | Last Name | last_name | text |  |
| emailaddress | Email | email | email |  |
| telephone1 | Phone | phone | phone |  |
| mobilephone | Mobile Phone | mobile_phone | phone |  |
| topic | Topic | topic | text |  |
| companyname | Company | company_name | text |  |
| jobtitle | Job Title | job_title | text |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| description | Description | description | textarea |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |
| lead_id | Lead Id | lead_id | text |  |
| industry_id | Industry Id | industry_id | text |  |
| subsource_id | Subsource Id | subsource_id | text |  |
| estimated_value | Estimated Value | estimated_value | decimal |  |
| is_qualified | Is Qualified | is_qualified | boolean |  |
| qualified_account_id | Qualified Account Id | qualified_account_id | lookup | → **Account** (`account`, name col `account_name`) |
| qualified_contact_id | Qualified Contact Id | qualified_contact_id | lookup | → **Contact** (`contact`, name col `full_name`) |
| qualified_opportunity_id | Qualified Opportunity Id | qualified_opportunity_id | lookup | → **Opportunity** (`opportunity`, name col `topic`) |
| do_not_email | Do Not Email | do_not_email | boolean |  |
| do_not_phone | Do Not Phone | do_not_phone | boolean |  |
| owner_type | Owner Type | owner_type | text |  |
| business_unit_id | Business Unit Id | business_unit_id | lookup | → **Business Unit** (`business_unit`, name col `name`) |
| is_deleted | Is Deleted | is_deleted | boolean |  |
| version_no | Version No | version_no | whole_number |  |
| currency_locked | Currency Locked | currency_locked | boolean |  |
| currency_lock_reason | Currency Lock Reason | currency_lock_reason | text |  |
| full_name | Full Name | full_name | text |  |
| disqualify_reason | Disqualify Reason | disqualify_reason | text |  |
| disqualified_at | Disqualified At | disqualified_at | datetime |  |
| disqualified_by | Disqualified By | disqualified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| reopen_reason | Reopen Reason | reopen_reason | text |  |
| reopened_at | Reopened At | reopened_at | datetime |  |
| reopened_by | Reopened By | reopened_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| active_process_flow_id | Active Process Flow Id | active_process_flow_id | text |  |
| active_process_stage_id | Active Process Stage Id | active_process_stage_id | text |  |
| active_process_flow_instance_id | Active Process Flow Instance Id | active_process_flow_instance_id | text |  |
| bpf_is_finished | Bpf Is Finished | bpf_is_finished | boolean |  |
| document_path | Document Path | document_path | text |  |
| originating_prospect_id | Originating Prospect Id | originating_prospect_id | lookup | → **Prospect** (`crm_prospect`, name col `name`) |
| deleted_at | Deleted At | deleted_at | datetime |  |
| completed_stage_ids | Completed Stage Ids | completed_stage_ids | text |  |

**Status (state_code):** 1=Open, 2=Qualified, 3=Disqualified
**Status Reason (status_reason):** 1=New[#3B82F6], 2=Contacted[#8B5CF6], 3=Engaged[#06B6D4], 4=Qualified[#10B981], 5=Lost[#EF4444], 6=Cannot Contact[#F97316], 7=No Longer Interested[#6B7280], 8=Canceled[#DC2626]

## Marketing Email — `marketing_email` (table `marketing_email`)
Primary field: `subject` · Fields: 11

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Email Name | subject | text |  |
| subject | Subject | subject | text |  |
| fromemail | From Email | from_email | email |  |
| fromname | From Name | from_name | text |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Note — `note` (table `timeline_note`)
Primary field: `title` · Fields: 8

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| title | Name | title | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Opportunity — `opportunity` (table `opportunity`)
Primary field: `topic` · Fields: 190

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| go_live | Go Live | go_live | boolean |  |
| m18 | M18 | m18 | boolean |  |
| originatingleadid | Originating Lead | originating_lead_id | lookup | → **Lead** (`lead`, name col `full_name`) |
| current_client_level | Current Client Level  | current_client_level | multi_choice | 0=VIP(5M+), 1=HIGH (up to 1M), 2=MID (up to 500k), 3=LOW (up to 100k) |
| owner_country | Owner Country  | owner_country | text |  |
| expected_end_date | Expected End Date | expected_end_date | date |  |
| forecast_category | Forecast Category  | forecast_category | multi_choice | 1=Pipeline, 2=Best Case, 3=Committed, 4=Omitted, 5=Won, 6=Lost |
| start_date | Start Date | start_date | date |  |
| website_type | Website Type | website_type | choice | 1=Informatice, 2=E-commerce |
| proposal_shared | Proposal Shared | proposal_shared | boolean |  |
| hosting_per_month | Hosting per month | hosting_per_month | decimal |  |
| website_price | Website Price | website_price | decimal |  |
| status_pg | Status PG | status_pg | choice | 1=Approve, 2=Reject, 3=Pending, 4=Under Process |
| test_integration | Test Integration | test_integration | boolean |  |
| settlement_approved_by | Settlement Approved By | settlement_approved_by | text |  |
| documents_received | Documents Received | documents_received | boolean |  |
| estimated_average_volume | Estimated Average Volume | estimated_average_volume | decimal |  |
| min_transaction_amount | Min Transaction Amount | min_transaction_amount | decimal |  |
| processing_currency | Processing Currency | processing_currency | lookup | → **Currency** (`currency`, name col `name`) |
| monthly_vat | Monthly VAT | monthly_vat | boolean |  |
| on_hold_until | On Hold Until | on_hold_until | date |  |
| currency | Currency | currency | lookup | → **Currency** (`currency`, name col `name`) |
| setup_currency | Setup Currency | setup_currency | lookup | → **Currency** (`currency`, name col `name`) |
| profit_margin | Profit Margin | profit_margin | decimal |  |
| max_transaction_amount | Max Transaction Amount | max_transaction_amount | decimal |  |
| cash_withdrawal_from_our_mymonty_branches_and_atms | Cash Withdrawal from our MyMonty Branches and ATMs % | cash_withdrawal_from_our_mymonty_branches_and_atms | whole_number |  |
| cardless_atm_withdrawals_from_mymonty_atms | Cardless ATM withdrawals from MyMonty ATMs % | cardless_atm_withdrawals_from_mymonty_atms | whole_number |  |
| cash_withdrawal_from_our_bank_partners_atms_fsb | Cash Withdrawal from our Bank Partners’ ATMs FSB % | cash_withdrawal_from_our_bank_partners_atms_fsb | whole_number |  |
| cardless_atm_withdrawals_from_our_bank_partners_atms_fsb_blc | Cardless ATM withdrawals from our Bank Partners' ATMs FSB BLC % | cardless_atm_withdrawals_from_our_bank_partners_atms_fsb_blc | whole_number |  |
| cash_withdrawal_from_our_bank_partners_atms_blc_bankmed_byblos | Cash Withdrawal from our Bank Partners’ ATMs BLC BankMed Byblos % | cash_withdrawal_from_our_bank_partners_atms_blc_bankmed_byblos | whole_number |  |
| cash_withdrawal_at_our_appointed_agent_omt | Cash Withdrawal at our Appointed Agent OMT % | cash_withdrawal_at_our_appointed_agent_omt | whole_number |  |
| approval_process | Approval Process | approval_process | boolean |  |
| received_by_the_executive | Received by the executive | received_by_the_executive | boolean |  |
| legal_status | Legal Status | legal_status | choice | 0=Pending, 1=Under Process, 2=Approve, 3=Reject |
| legal_approved_by | Legal Approved By | legal_approved_by | text |  |
| approved_by_legal_on | Approved by Legal on | approved_by_legal_on | datetime |  |
| company_legal_name | Company Legal Name | company_legal_name | text |  |
| legacy_id | Legacy Id | legacy_id | text |  |
| company_s_bylaws | Company’s Bylaws | company_s_bylaws | boolean |  |
| trade_register | Trade Register | trade_register | boolean |  |
| commercial_circular | Commercial Circular | commercial_circular | boolean |  |
| recent_global_attestation | Recent Global Attestation | recent_global_attestation | boolean |  |
| moms_of_ga_electing_gm_and_authorized_signatorie | MoMs of GA electing GM and authorized signatorie | moms_of_ga_electing_gm_and_authorized_signatorie | boolean |  |
| certificate_of_registration_mof | Certificate of Registration (MOF) | certificate_of_registration_mof | boolean |  |
| agreement_signature_type | Agreement Signature Type | agreement_signature_type | choice | 1=the client had already signed the agreement, 2=the agreement must be signed from our side first |
| signature_type | Signature Type | signature_type | multi_choice | 1=Hard Copy |
| start_approval_process | Start Approval Process | start_approval_process | boolean |  |
| offer_proposal | Offer Proposal | offer_proposal | boolean |  |
| negotiation_revision | Negotiation & Revision | negotiation_revision | boolean |  |
| signature_date | Signature Date | signature_date | date |  |
| compass | Compass | compass | boolean |  |
| on_hold_reason | On Hold Reason | on_hold_reason | long_text |  |
| business_unit | Business Unit | business_unit | text |  |
| est_volume | Est Volume | est_volume | decimal |  |
| settlement_frequency | Settlement Frequency | settlement_frequency | choice | 1=Monthly, 2=Daily, 3=Weekly, 4=Biweekly |
| product | Product | product | lookup | → **Product** (`product`, name col `name`) |
| setup_fees | Setup Fees | setup_fees | decimal |  |
| local_rate | Local Rate | local_rate | decimal |  |
| premium_local | Premium Local | premium_local | decimal |  |
| content_management | Content Management | content_management | decimal |  |
| settlement_contact | Settlement Contact | settlement_contact | text |  |
| technical_status | Technical Status | technical_status | choice | 1=Pending, 2=Approve, 3=Reject, 4=Under Process, 5=Installed, 6=FSB Under Review |
| operation_status | Operation Status | operation_status | choice | 0=Pending, 1=Under Process, 2=Approve, 3=Reject, 4=FSB Under Review |
| ok_to_proceed | Ok To Proceed | ok_to_proceed | boolean |  |
| signed | Signed | signed | boolean |  |
| operations_approved_by | Operations Approved by | operations_approved_by | text |  |
| agreement_sent_to_merchant | Agreement Sent To Merchant | agreement_sent_to_merchant | boolean |  |
| partner_agreement_signed | Partner Agreement Signed | partner_agreement_signed | boolean |  |
| technical_approved_by | Technical Approved By | technical_approved_by | text |  |
| international_rate | International Rate | international_rate | decimal |  |
| settlement_account | Settlement Account | settlement_account | choice | 1=Bank Account, 2=eWallet, 3=Cash |
| compliance_approved_by | Compliance Approved By | compliance_approved_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| approved_by_cc_team | Approved By CC team | approved_by_cc_team | choice | 1=Noel Moukheiber, 2=Mountasser Hachem, 3=Credit Committee |
| card_activated_on | Card Activated On | card_activated_on | date |  |
| card_pickup_option_updated_on | Card Pickup Option Updated ON | card_pickup_option_updated_on | date |  |
| bank_transfer | Bank Transfer | bank_transfer | decimal |  |
| setup_vat | Setup VAT | setup_vat | boolean |  |
| partners_count | Partners Count | partners_count | decimal |  |
| statement_email | Statement email | statement_email | email |  |
| qa_approved_by |  QA Approved by | qa_approved_by | text |  |
| company_size | Company Size | company_size | choice | 1=1 - 10 (Microenterprise), 2=11 - 50 (Small business), 3=51 - 200 (Medium-sized business), 4=201 - 500 (Large business), 5=501 - 1000 (Very large business), 6=1000+ (Enterprise) |
| organizational_chart | organizational Chart | organizational_chart | boolean |  |
| related_to_the_company | Related To the Company | related_to_the_company | choice | 1=Monty Mobile, 2=Monty UK, 3=Monty Finance SAL, 4=Monty ESIM Limited, 5=Comium, 6=Monty International |
| upload_and_live | Upload and live | upload_and_live | boolean |  |
| proposed_solution | Proposed Solution | proposed_solution | long_text |  |
| uk_card | UK Card | uk_card | decimal |  |
| start_agreemnt_approval | Start agreemnt Approval | start_agreemnt_approval | boolean |  |
| approval_completed | Approval Completed | approval_completed | boolean |  |
| current_situation | Current Situation | current_situation | long_text |  |
| training_completed | Training Completed | training_completed | boolean |  |
| start_approval | Start Approval | start_approval | boolean |  |
| technical_integration_completed | Technical Integration Completed | technical_integration_completed | boolean |  |
| settlement_status | Settlement Status | settlement_status | choice | 0=Pending, 1=Under Process, 2=Approve, 3=Reject, 4=FSB Under Review |
| compliance_status | Compliance Status | compliance_status | choice | 0=Pending, 1=Under Process, 2=Approve, 3=Reject, 4=FSB Under Review |
| send_the_questionnaire_file | Send the questionnaire file | send_the_questionnaire_file | boolean |  |
| processing_rate | Processing Rate | processing_rate | decimal |  |
| monthly_fees | Monthly Fees | monthly_fees | decimal |  |
| estimated_average_transactions_per_month | Estimated Average Transactions Per Month | estimated_average_transactions_per_month | decimal |  |
| qris | Qris | qris | decimal |  |
| opportunity_status | Opportunity Status | opportunity_status | choice | 1=Under discussion, 2=Hold |
| email_address | Email Address | email_address | email |  |
| compliance_approved_on | Compliance Approved On | compliance_approved_on | datetime |  |
| date_of_submission | Date of submission | date_of_submission | text |  |
| running_process | Running Process | running_process | boolean |  |
| wallet_type | Wallet Type | wallet_type | choice | 1=Business Wallet, 2=Personal Wallet |
| qa_approved_on |  QA Approved On | qa_approved_on | datetime |  |
| completed_type | Completed Type | completed_type | choice | 0=Webiste, 1=POS, 2=Both, 3=Pay By Link |
| soft_copy_available | Soft Copy Available | soft_copy_available | boolean |  |
| operations_approved_on | Operations Approved on | operations_approved_on | datetime |  |
| technical_approved_on | Technical Approved On | technical_approved_on | datetime |  |
| international_processing | International processing | international_processing | decimal |  |
| bank_name | Bank Name | bank_name | text |  |
| wallet_fee | Wallet Fee | wallet_fee | decimal |  |
| monthly_currency | Monthly Currency | monthly_currency | lookup | → **Currency** (`currency`, name col `name`) |
| send_note | Send Note | send_note | boolean |  |
| company_name | Company Name | company_name | text |  |
| application_status | Application Status | application_status | choice | 1=Under Review, 2=Waiting Approval, 3=Approved |
| cct_assessed_by | CCT Assessed By | cct_assessed_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| cct_assessed_on | CCT Assessed On | cct_assessed_on | datetime |  |
| recommended_limit_by_cc | Recommended Limit By CC | recommended_limit_by_cc | text |  |
| credit_card_limit_approval | Credit Card Limit Approval  | credit_card_limit_approval | text |  |
| card_requested | Card Requested | card_requested | boolean |  |
| card_submission_date | Card Submission date | card_submission_date | datetime |  |
| card_submission_owner | Card Submission Owner | card_submission_owner | lookup | → **User** (`crm_user`, name col `full_name`) |
| card_received | Card Received | card_received | boolean |  |
| card_received_on | Card Received On | card_received_on | datetime |  |
| card_received_owner | Card Received Owner | card_received_owner | lookup | → **User** (`crm_user`, name col `full_name`) |
| card_released | Card Released | card_released | boolean |  |
| card_released_on | Card Released On | card_released_on | datetime |  |
| card_released_owner | Card Released Owner | card_released_owner | lookup | → **User** (`crm_user`, name col `full_name`) |
| souchet_received_by_email | Souchet Received by Email  | souchet_received_by_email | boolean |  |
| souchet_received_by_email_on | Souchet Received by Email On | souchet_received_by_email_on | datetime |  |
| souchet_received_by_email_by | Souchet Received By Email By | souchet_received_by_email_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| card_active | Card Active | card_active | boolean |  |
| card_activated_by | Card Activated By | card_activated_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| card_pickup_option | Card Pickup Option | card_pickup_option | choice | 1=Branch , 2=Aramex, 3=Account Manager |
| pickup_branch | Pickup Branch | pickup_branch | lookup | → **Pickup Branch** (`crm_pickup_branch`, name col `name`) |
| address_location | Address Location | address_location | text |  |
| account_manager | Account Manager | account_manager | lookup | → **User** (`crm_user`, name col `full_name`) |
| card_pickup_option_updated_by | Card Pickup Option Updated By | card_pickup_option_updated_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| card_pickup_comments | Card Pickup Comments | card_pickup_comments | text |  |
| settlement_approved_on | Settlement Approved On | settlement_approved_on | datetime |  |
| country | Country | country | lookup | → **Country** (`country`, name col `name`) |
| country_of_incorporation | Country of Incorporation | country_of_incorporation | choice | 1=Lb(Lebanon), 2=Non-LB (Non- Lebanon) |
| company_type_lb | Company Type LB | company_type_lb | choice | 1=SAL (société anonyme libanaise incl. Offshore and Holding), 2=SARL (société à responsabilité limitée), 3=SNC (société en nom collectif), 4=SCA (société en commandite par action), 5=SCS (société en commandite simple), 6=ETS (Etablissement Individuel), 7=NPO (Non Profit Organization), 8=Cooperative, 9=SC (Société Civile) |
| company_type_non_lb | Company Type Non Lb | company_type_non_lb | choice | 1=Corporation, 2=Partnership, 3=LLC, 4=International Business Company, 5=Foundation, 6=Trust |
| customer_needed | Customer Needed | customer_needed | long_text |  |
| salary_domiciliation | Salary Domiciliation | salary_domiciliation | boolean |  |
| number_of_employees | Number of Employees | number_of_employees | number |  |
| company_cash_deposit_for_salaries_using_our_own_branches | Company Cash Deposit for Salaries using our own branches % | company_cash_deposit_for_salaries_using_our_own_branches | whole_number |  |
| company_cash_out_using_mymonty_branches | Company Cash Out using Mymonty Branches % | company_cash_out_using_mymonty_branches | whole_number |  |
| account_opening | Account Opening % | account_opening | whole_number |  |
| annual_fee | Annual Fee | annual_fee | currency |  |
| sms_fee | SMS Fee | sms_fee | currency |  |
| standard_virtual_card_fee | Standard Virtual Card Fee | standard_virtual_card_fee | currency |  |
| platinum_prepaid_card_fee | Platinum Prepaid Card Fee | platinum_prepaid_card_fee | currency |  |
| topic | Topic | topic | text |  |
| parentaccountid | Account | account_id | lookup | → **Account** (`account`, name col `account_name`) |
| parentcontactid | Contact | primary_contact_id | lookup | → **Contact** (`contact`, name col `full_name`) |
| estimatedclosedate | Close Date | estimated_close_date | date |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| oppprocessflowid | Process Flow | process_flow_id | text |  |
| description | Description | description | textarea |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| stage | Stage | stage | text |  |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |
| opportunity_id | Opportunity Id | opportunity_id | text |  |
| currency_id | Currency Id | currency_id | lookup | → **Currency** (`currency`, name col `name`) |
| actual_close_date | Actual Close Date | actual_close_date | date |  |
| actual_value | Actual Value | actual_value | decimal |  |
| loss_reason | Loss Reason | loss_reason | text |  |
| source_id | Source Id | source_id | text |  |
| owner_type | Owner Type | owner_type | text |  |
| business_unit_id | Business Unit Id | business_unit_id | lookup | → **Business Unit** (`business_unit`, name col `name`) |
| is_deleted | Is Deleted | is_deleted | boolean |  |
| version_no | Version No | version_no | whole_number |  |
| currency_locked | Currency Locked | currency_locked | boolean |  |
| currency_lock_reason | Currency Lock Reason | currency_lock_reason | text |  |
| active_process_flow_id | Active Process Flow Id | active_process_flow_id | text |  |
| active_process_stage_id | Active Process Stage Id | active_process_stage_id | text |  |
| active_process_flow_instance_id | Active Process Flow Instance Id | active_process_flow_instance_id | text |  |
| product_locked | Product Locked | product_locked | boolean |  |
| bpf_is_finished | Bpf Is Finished | bpf_is_finished | boolean |  |
| deleted_at | Deleted At | deleted_at | datetime |  |
| bpf_stage | Bpf Stage | bpf_stage | text |  |
| completed_stage_ids | Completed Stage Ids | completed_stage_ids | text |  |

**Status (state_code):** 1=Open, 2=Won, 3=Lost
**Status Reason (status_reason):** 1=In Progress[#3B82F6], 2=On Hold[#F59E0B], 3=Won[#10B981], 4=Canceled[#EF4444], 5=Out-Sold[#DC2626]

## Organization — `organization` (table `organization`)
Primary field: `name` · Fields: 7

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Organization Name | name | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Product — `product` (table `product`)
Primary field: `name` · Fields: 19

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Name | name | text |  |
| description | Description | description | text |  |
| code | Product Code | code | text |  |
| familyid | Product Family | family_id | lookup | → **Product Family** (`product_family`, name col `name`) |
| isactive | Is Active | is_active | boolean |  |
| displayorder | Display Order | display_order | number |  |
| createdon | Created On | created_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |
| product_id | Product Id | product_id | text |  |
| is_system | Is System | is_system | boolean |  |
| default_process_flow_id | Default Process Flow Id | default_process_flow_id | text |  |
| default_form_id | Default Form Id | default_form_id | text |  |
| business_unit_id | Business Unit Id | business_unit_id | text |  |
| deleted_at | Deleted At | deleted_at | datetime |  |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Product Family — `product_family` (table `product_family`)
Primary field: `name` · Fields: 12

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Name | name | text |  |
| description | Description | description | text |  |
| code | Code | code | text |  |
| isactive | Is Active | is_active | boolean |  |
| displayorder | Display Order | display_order | number |  |
| createdon | Created On | created_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Prospect — `prospect` (table `crm_prospect`)
Primary field: `name` · Fields: 17

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Name | name | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |
| prospect_id | Prospect Id | prospect_id | text |  |
| owner_type | Owner Type | owner_type | text |  |
| business_unit_id | Business Unit Id | business_unit_id | lookup | → **Business Unit** (`business_unit`, name col `name`) |
| is_deleted | Is Deleted | is_deleted | boolean |  |
| version_no | Version No | version_no | whole_number |  |
| converted_lead_id | Converted Lead Id | converted_lead_id | lookup | → **Lead** (`lead`, name col `full_name`) |
| converted_at | Converted At | converted_at | datetime |  |
| converted_by | Converted By | converted_by | text |  |
| deleted_at | Deleted At | deleted_at | datetime |  |

**Status (state_code):** 1=Active, 2=Inactive, 3=Converted
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626], 7=Convert to lead[#84CC16], 8=Converted to Lead[#10B981]

## Security Role — `security_role` (table `security_role`)
Primary field: `name` · Fields: 13

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Name | name | text |  |
| description | Description | description | text |  |
| business_unit_id | Business Unit | business_unit_id | lookup | → **Business Unit** (`business_unit`, name col `name`) |
| is_active | Is Active | is_active | boolean |  |
| is_system | Is System | is_system | boolean |  |
| created_at | Created On | created_at | datetime |  |
| modified_at | Modified On | modified_at | datetime |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Segment — `segment` (table `segment`)
Primary field: `name` · Fields: 10

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Segment Name | name | text |  |
| criteria | Criteria | criteria_json | textarea |  |
| membercount | Member Count | member_count | number |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Team — `team` (table `team`)
Primary field: `name` · Fields: 13

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Name | name | text |  |
| team_type | Team Type | team_type | text |  |
| description | Description | description | text |  |
| business_unit_id | Business Unit | business_unit_id | lookup | → **Business Unit** (`business_unit`, name col `name`) |
| is_active | Is Active | is_active | boolean |  |
| created_at | Created On | created_at | datetime |  |
| modified_at | Modified On | modified_at | datetime |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Continent — `continent` (table `crm_continent`) _[custom]_
Primary field: `name` · Fields: 8

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Name | name | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Email Recipient — `email_recipients` (table `email_recipients`) _[custom]_
Primary field: `email` · Fields: 10

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| email | Email | email | email |  |
| unit | Unit | unit | text |  |
| enabled | Enabled | enabled | boolean |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Governate — `governate` (table `crm_governate`) _[custom]_
Primary field: `name` · Fields: 8

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Name | name | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## LeadSource — `leadsource` (table `crm_leadsource`) _[custom]_
Primary field: `name` · Fields: 8

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Name | name | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## MyMonty Credit Card Type — `mymonty_credit_card_type` (table `crm_mymonty_credit_card_type`) _[custom]_
Primary field: `name` · Fields: 8

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Name | name | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Opportunity Partner — `opportunity_partner` (table `crm_opportunity_partner`) _[custom]_
Primary field: `name` · Fields: 11

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| opportunity | opportunity | opportunity | lookup | → **Opportunity** (`opportunity`, name col `topic`) |
| condition | Condition | condition | choice | 1=With Collatear, 2=Without Collateral |
| partner | Partner | partner | lookup | → **Partners** (`crm_partners`, name col `name`) |
| name | Name | name | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Partners — `partners` (table `crm_partners`) _[custom]_
Primary field: `name` · Fields: 31

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| uk_card | UK Card | uk_card | decimal |  |
| processing_cost | Processing Cost | processing_cost | currency |  |
| qris | Qris | qris | decimal |  |
| refund_fee | Refund fee | refund_fee | currency |  |
| refund_percentage | Refund Percentage | refund_percentage | decimal |  |
| setup_cost | Setup Cost | setup_cost | currency |  |
| soopypay | Soopypay | soopypay | decimal |  |
| website | Website | website | url |  |
| currency | Currency | currency | lookup | → **Currency** (`currency`, name col `name`) |
| address | Address | address | textarea |  |
| bank_transfer | Bank Transfer | bank_transfer | decimal |  |
| chargeback_fee | ChargeBack Fee | chargeback_fee | currency |  |
| date | Date | date | datetime |  |
| doku_wallet | Doku Wallet | doku_wallet | decimal |  |
| eu_premium_card | EU Premium Card | eu_premium_card | decimal |  |
| eu_standard_card | EU Standard Card | eu_standard_card | decimal |  |
| international_cost | International Cost | international_cost | decimal |  |
| international_processing_cost | International Processing Cost | international_processing_cost | decimal |  |
| local_cost | Local Cost | local_cost | decimal |  |
| monthly_cost | Monthly Cost | monthly_cost | decimal |  |
| note | Note | note | textarea |  |
| ovo | Ovo | ovo | decimal |  |
| phone_number | Phone Number | phone_number | phone |  |
| name | Name | name | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## Pickup Branch — `pickup_branch` (table `crm_pickup_branch`) _[custom]_
Primary field: `name` · Fields: 8

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| name | Name | name | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

## SupplementartCards — `supplementartcards` (table `crm_supplementartcards`) _[custom]_
Primary field: `name` · Fields: 18

| Logical | Display | Physical | Type | Options / Lookup target |
|---|---|---|---|---|
| lead | Lead | lead | lookup | → **Lead** (`lead`, name col `full_name`) |
| email | Email | email | email |  |
| card_varient | Card Varient | card_varient | choice | 2=Red, 1=Green, 3=White "Evel Eye" |
| mobile | Mobile | mobile | phone |  |
| name | Name | name | text |  |
| createdon | Created On | created_at | datetime |  |
| modifiedon | Modified On | modified_at | datetime |  |
| ownerid | Owner | owner_id | lookup | → **User** (`crm_user`, name col `full_name`) |
| createdby | Created By | created_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| modifiedby | Modified By | modified_by | lookup | → **User** (`crm_user`, name col `full_name`) |
| statecode | Status | state_code | choice | (Status — see statecode below) |
| statusreason | Status Reason | status_reason | choice | (Status Reason — see below) |
| supplementartcards_id | Supplementartcards Id | supplementartcards_id | text |  |
| owner_type | Owner Type | owner_type | text |  |
| business_unit_id | Business Unit Id | business_unit_id | lookup | → **Business Unit** (`business_unit`, name col `name`) |
| is_deleted | Is Deleted | is_deleted | boolean |  |
| version_no | Version No | version_no | whole_number |  |
| deleted_at | Deleted At | deleted_at | datetime |  |

**Status (state_code):** 1=Active, 2=Inactive
**Status Reason (status_reason):** 1=Active[#10B981], 2=Inactive[#6B7280], 3=In Progress[#3B82F6], 4=Pending[#F59E0B], 5=Cancelled[#EF4444], 6=Rejected[#DC2626]

---
Totals: 33 entities, 756 active fields, 169 lookups, 45 inline-choice fields.
