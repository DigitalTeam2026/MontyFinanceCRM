/*
  # Process Flow LOB and Product FK Scope

  ## Summary
  Replaces the free-text `line_of_business` and `product_line` columns on `process_flow`
  with proper FK references to `line_of_business` (lob_id) and `product` (product_id).

  A process flow can now be scoped to:
  - Nothing (global/entity-level default)
  - A Line of Business (lob_id set, product_id null)
  - A specific Product (product_id set, lob_id null)

  The flow resolution engine uses these FKs to automatically assign the correct
  flow to a record based on its selected product and that product's LOB.

  ## Changes
  1. Add `lob_id` (uuid, FK → line_of_business, nullable) to process_flow
  2. Add `product_id` (uuid, FK → product, nullable) to process_flow
  3. Drop old free-text `line_of_business` and `product_line` columns
  4. Add indexes for fast lookup by lob_id and product_id
*/

-- 1. Add new FK columns
ALTER TABLE process_flow
  ADD COLUMN IF NOT EXISTS lob_id uuid REFERENCES line_of_business(lob_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES product(product_id) ON DELETE SET NULL;

-- 2. Indexes for flow resolution lookups
CREATE INDEX IF NOT EXISTS idx_process_flow_lob_id ON process_flow(lob_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_process_flow_product_id ON process_flow(product_id) WHERE deleted_at IS NULL;

-- 3. Drop the old free-text columns
ALTER TABLE process_flow
  DROP COLUMN IF EXISTS line_of_business,
  DROP COLUMN IF EXISTS product_line;
