/*
  # Fix Sources navigation item and Currency view columns

  1. Changes
    - Deactivate the 'Sources' nav_item (the `crm_sources` physical table does not exist)
    - Remove view_column rows for the Currency "Active Currencies" view that reference
      columns (`owner_id`, `created_at`, `modified_at`) not present on the `currency` table
    - Also clean the "All Currencies" and "Inactive Currencies" views

  2. Why
    - The Sources nav_item was still active despite the entity_definition being deactivated,
      causing a 404 when the list page tried to query `crm_sources`
    - Currency views referenced system columns (`owner_id`, `created_at`, `modified_at`)
      that do not exist on the `currency` table, causing PGRST204 errors

  3. Notes
    - Only deactivates the nav_item; does not delete it
    - Only removes view_columns that reference non-existent physical columns on currency
*/

-- 1. Deactivate the Sources nav_item
UPDATE nav_item
SET is_active = false
WHERE entity_name = 'sources'
  AND is_active = true;

-- 2. Remove view_columns that reference columns not on the currency table.
--    The currency table only has: currency_id, code, name, symbol, exchange_rate,
--    is_base, is_active, state_code, status_reason.
--    View columns referencing owner_id, created_at, modified_at must be removed.
DO $$
DECLARE
  v_currency_entity_id uuid;
BEGIN
  SELECT entity_definition_id INTO v_currency_entity_id
  FROM entity_definition
  WHERE logical_name = 'currency'
  LIMIT 1;

  IF v_currency_entity_id IS NULL THEN
    RETURN;
  END IF;

  -- Delete view_columns whose field_definition points to a column not on the currency table
  DELETE FROM view_column vc
  USING view_definition vd, field_definition fd
  WHERE vc.view_id = vd.view_id
    AND vc.field_definition_id = fd.field_definition_id
    AND vd.entity_definition_id = v_currency_entity_id
    AND fd.physical_column_name IN ('owner_id', 'created_at', 'modified_at', 'created_by', 'modified_by');
END $$;

-- 3. Also deactivate field_definitions for currency that reference non-existent columns
UPDATE field_definition
SET is_active = false
WHERE entity_definition_id = (
  SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'currency' LIMIT 1
)
AND physical_column_name IN ('owner_id', 'created_at', 'modified_at', 'created_by', 'modified_by')
AND is_active = true;
