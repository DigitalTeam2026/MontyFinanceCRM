/*
  # Fix Campaign and Event field definition physical column names

  1. Problem
    - Campaign and Event field definitions have logical-style physical_column_name values
      (e.g. 'ownerid', 'typecode', 'startdate') that don't match the actual database columns
      (e.g. 'owner_id', 'campaign_type', 'start_date')
    - This causes 400 Bad Request errors when querying these tables via PostgREST

  2. Campaign fixes
    - ownerid      -> owner_id
    - typecode     -> campaign_type
    - budgetedcost -> budget
    - actualcost   -> actual_cost
    - startdate    -> start_date
    - enddate      -> end_date

  3. Event fixes
    - ownerid    -> owner_id
    - typecode   -> event_type
    - starttime  -> start_date
    - endtime    -> end_date
    - maxcapacity -> max_capacity
*/

-- Campaign entity field definition fixes
UPDATE field_definition
SET physical_column_name = 'owner_id'
WHERE field_definition_id = '51d558bf-7109-4512-a428-d939bf6c72a0'
  AND physical_column_name = 'ownerid';

UPDATE field_definition
SET physical_column_name = 'campaign_type'
WHERE field_definition_id = '79d25351-da35-46d6-85ad-1d1a6fd9f075'
  AND physical_column_name = 'typecode';

UPDATE field_definition
SET physical_column_name = 'budget'
WHERE field_definition_id = '90351147-cf9a-4ec3-89d5-37d892240a59'
  AND physical_column_name = 'budgetedcost';

UPDATE field_definition
SET physical_column_name = 'actual_cost'
WHERE field_definition_id = '26537962-c0ec-4551-b826-ea808fb31b48'
  AND physical_column_name = 'actualcost';

UPDATE field_definition
SET physical_column_name = 'start_date'
WHERE field_definition_id = '8bd1956d-6350-42f1-8efd-e673a362d73b'
  AND physical_column_name = 'startdate';

UPDATE field_definition
SET physical_column_name = 'end_date'
WHERE field_definition_id = 'c59c1ded-11e1-43b5-909c-0bacc34987db'
  AND physical_column_name = 'enddate';

-- Event entity field definition fixes
UPDATE field_definition
SET physical_column_name = 'owner_id'
WHERE logical_name = 'ownerid'
  AND physical_column_name = 'ownerid'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'event'
  );

UPDATE field_definition
SET physical_column_name = 'event_type'
WHERE logical_name = 'typecode'
  AND physical_column_name = 'typecode'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'event'
  );

UPDATE field_definition
SET physical_column_name = 'start_date'
WHERE logical_name = 'starttime'
  AND physical_column_name = 'starttime'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'event'
  );

UPDATE field_definition
SET physical_column_name = 'end_date'
WHERE logical_name = 'endtime'
  AND physical_column_name = 'endtime'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'event'
  );

UPDATE field_definition
SET physical_column_name = 'max_capacity'
WHERE logical_name = 'maxcapacity'
  AND physical_column_name = 'maxcapacity'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'event'
  );

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
