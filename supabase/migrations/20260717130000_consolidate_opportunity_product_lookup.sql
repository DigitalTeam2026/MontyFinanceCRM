/*
  # Consolidate Opportunity Product onto a single lookup field

  ## Problem
  The `opportunity` entity had TWO overlapping "Product" fields (both displayed as
  "Product"), backed by TWO physical columns:

    - `productid`  → column `product_id`  (type choice / product_picker)
        This is the LOAD-BEARING field: it holds the product on all existing rows and
        is what the qualify flow, the BPF process-flow selector
        (processFlowEngine matches process_flow.product_id) and the form all use.
        It was left INACTIVE, however.

    - `product`    → column `product`      (type lookup)
        Added later as a "proper" lookup relationship, but nothing ever wrote to it —
        the column is NULL on every row. This is the field the grid/view showed, which
        is why the opportunity grid rendered a duplicate "Product" column with only
        blank ("—") cells.

  ## Fix
  Keep `product_id` (the column that actually holds the data and drives BPF selection)
  and upgrade ITS field definition to a real Product lookup so the grid resolves the
  product name. Move the existing Opportunity<->Product relationship + any view columns
  onto it, then delete the empty orphan `product` field and drop its column.

  The custom product-picker form control is preserved: FormField renders
  ProductPickerSelect for a `lookup` field whenever config_json.control =
  'product_picker', so the form keeps its access-filtered picker with no code change.

  No application code changes are required — every write path already targets
  `product_id`.
*/

DO $$
DECLARE
  eid_opp      uuid;
  eid_product  uuid;
  fid_keep     uuid;  -- productid (product_id column) — the survivor
  fid_orphan   uuid;  -- product   (product column)    — to delete
  ft_lookup    uuid;
BEGIN
  SELECT entity_definition_id INTO eid_opp     FROM entity_definition WHERE logical_name = 'opportunity';
  SELECT entity_definition_id INTO eid_product FROM entity_definition WHERE logical_name = 'product';
  SELECT field_type_id        INTO ft_lookup   FROM field_type       WHERE name = 'lookup';

  SELECT field_definition_id INTO fid_keep
    FROM field_definition
    WHERE entity_definition_id = eid_opp AND physical_column_name = 'product_id';

  SELECT field_definition_id INTO fid_orphan
    FROM field_definition
    WHERE entity_definition_id = eid_opp AND physical_column_name = 'product';

  IF fid_keep IS NULL THEN
    RAISE NOTICE 'opportunity.product_id field not found — nothing to consolidate.';
    RETURN;
  END IF;

  -- 1. Safety backfill: preserve any product that ever landed in the orphan column.
  IF fid_orphan IS NOT NULL THEN
    UPDATE opportunity
      SET product_id = product
      WHERE product_id IS NULL AND product IS NOT NULL;
  END IF;

  -- 2. Upgrade the surviving field into a proper Product lookup. Keep the
  --    product_picker control flag so the form still renders the access-filtered
  --    picker (FormField handles this for type = lookup).
  UPDATE field_definition SET
    field_type_id    = ft_lookup,
    lookup_entity_id = eid_product,
    is_active        = true,
    display_name     = 'Product',
    is_searchable    = true,
    is_sortable      = true,
    is_filterable    = true,
    config_json      = '{"control":"product_picker"}'::jsonb
  WHERE field_definition_id = fid_keep;

  IF fid_orphan IS NOT NULL THEN
    -- 3. Move the existing Opportunity<->Product relationship rows onto the survivor.
    UPDATE relationship_definition
      SET source_lookup_field_id = fid_keep
      WHERE source_lookup_field_id = fid_orphan;

    -- 4. Repoint view columns off the orphan. First drop orphan columns in any view
    --    that already shows the survivor (avoids a duplicate column in one view),
    --    then repoint the rest.
    DELETE FROM view_column vc
      WHERE vc.field_definition_id = fid_orphan
        AND EXISTS (
          SELECT 1 FROM view_column v2
          WHERE v2.view_id = vc.view_id AND v2.field_definition_id = fid_keep
        );
    UPDATE view_column
      SET field_definition_id = fid_keep
      WHERE field_definition_id = fid_orphan;

    -- 5. Delete the now-unreferenced orphan field definition.
    DELETE FROM field_definition WHERE field_definition_id = fid_orphan;
  END IF;
END $$;

-- 6. Drop the orphan physical column (NULL on every row).
ALTER TABLE opportunity DROP COLUMN IF EXISTS product;
