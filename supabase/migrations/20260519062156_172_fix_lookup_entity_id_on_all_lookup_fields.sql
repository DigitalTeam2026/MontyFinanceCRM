/*
  # Fix lookup_entity_id on all lookup field definitions

  1. Problem
    - All owner_id fields have field_type = 'lookup' but lookup_entity_id = NULL
    - account_id and primary_contact_id lookup fields also have lookup_entity_id = NULL
    - This causes viewService.fetchViewColumns to return null for lookup_table and lookup_label_field
    - As a result, column filter dropdowns can't search lookup records in non-default views

  2. Changes
    - Set lookup_entity_id = crm_user entity for all ownerid/owner_id lookup fields
    - Set lookup_entity_id = account entity for account_id lookup fields on contact/opportunity/ticket
    - Set lookup_entity_id = contact entity for primary_contact_id on opportunity

  3. Entity IDs
    - crm_user entity: a02e5785-a461-447c-b61b-1051dafcfe74
    - account entity:  e8c85d9b-2883-416e-8b49-1e83e641c530
    - contact entity:  bbb2b0af-2d11-46dc-9316-52106b816825
*/

-- Fix owner_id fields → crm_user
UPDATE field_definition
SET lookup_entity_id = 'a02e5785-a461-447c-b61b-1051dafcfe74'
WHERE logical_name = 'ownerid'
  AND field_type_id = (SELECT field_type_id FROM field_type WHERE name = 'lookup')
  AND lookup_entity_id IS NULL;

-- Fix contact.account_id → account entity
UPDATE field_definition
SET lookup_entity_id = 'e8c85d9b-2883-416e-8b49-1e83e641c530'
WHERE field_definition_id = '272bb636-0f60-4db8-a651-688c70f3c9cc';

-- Fix opportunity.account_id → account entity
UPDATE field_definition
SET lookup_entity_id = 'e8c85d9b-2883-416e-8b49-1e83e641c530'
WHERE field_definition_id = '716b80a2-4e43-4691-a6d1-51d8fd657109';

-- Fix opportunity.primary_contact_id → contact entity
UPDATE field_definition
SET lookup_entity_id = 'bbb2b0af-2d11-46dc-9316-52106b816825'
WHERE field_definition_id = '2aa89764-cde7-4eae-b186-cd09a9c7d727';

-- Fix ticket.account_id (customerid) → account entity
UPDATE field_definition
SET lookup_entity_id = 'e8c85d9b-2883-416e-8b49-1e83e641c530'
WHERE field_definition_id = '2df92415-f6f8-46c7-97b6-162311fb36b8';
