/*
  # Add state_code and status_reason columns to product and product_family

  1. Modified Tables
    - `product`
      - Add `state_code` (integer, default 1 = Active)
      - Add `status_reason` (integer, default 1 = Active)
    - `product_family`
      - Add `state_code` (integer, default 1 = Active)
      - Add `status_reason` (integer, default 1 = Active)

  2. Data Backfill
    - Existing rows with status='active' get state_code=1, status_reason=1
    - Existing rows with other status values get state_code=2, status_reason=2

  3. Important Notes
    - These columns align product/product_family with the standard entity status model
      used by account, contact, lead, opportunity, ticket, etc.
    - The statecode_definition and status_reason_definition entries already exist
    - View filters referencing statecode will now resolve correctly
*/

-- product: add state_code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product' AND column_name = 'state_code'
  ) THEN
    ALTER TABLE product ADD COLUMN state_code integer NOT NULL DEFAULT 1;
  END IF;
END $$;

-- product: add status_reason
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product' AND column_name = 'status_reason'
  ) THEN
    ALTER TABLE product ADD COLUMN status_reason integer NOT NULL DEFAULT 1;
  END IF;
END $$;

-- product_family: add state_code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_family' AND column_name = 'state_code'
  ) THEN
    ALTER TABLE product_family ADD COLUMN state_code integer NOT NULL DEFAULT 1;
  END IF;
END $$;

-- product_family: add status_reason
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_family' AND column_name = 'status_reason'
  ) THEN
    ALTER TABLE product_family ADD COLUMN status_reason integer NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Backfill product rows: active -> 1/1, anything else -> 2/2
UPDATE product SET state_code = 1, status_reason = 1 WHERE status = 'active';
UPDATE product SET state_code = 2, status_reason = 2 WHERE status IS DISTINCT FROM 'active';

-- Backfill product_family rows
UPDATE product_family SET state_code = 1, status_reason = 1 WHERE status = 'active';
UPDATE product_family SET state_code = 2, status_reason = 2 WHERE status IS DISTINCT FROM 'active';

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_product_state_code ON product(state_code);
CREATE INDEX IF NOT EXISTS idx_product_family_state_code ON product_family(state_code);
