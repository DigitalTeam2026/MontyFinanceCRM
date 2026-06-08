/*
  # Fix Owner Required Data Policy Field Name

  ## Summary
  The "Owner Required" data policy for the opportunity entity has a condition
  that checks field_name = 'ownerid', but the physical column on the opportunity
  table is 'owner_id' (with underscore). The trigger uses to_jsonb(NEW) which
  keys by physical column name, so the condition always evaluated to true
  (field always appeared null), causing every opportunity insert/update to be
  blocked with "An owner must be assigned before this record can be saved."

  ## Fix
  Update the condition field_name from 'ownerid' to 'owner_id' to match the
  actual physical column name.
*/

UPDATE data_policy_condition
SET field_name = 'owner_id'
WHERE field_name = 'ownerid'
  AND data_policy_id IN (
    SELECT dp.data_policy_id
    FROM data_policy dp
    WHERE dp.entity_logical_name = 'opportunity'
      AND dp.name = 'Owner Required'
  );
