/*
  # Backfill lead custom_fields to real columns and clean stale keys

  Fields country, currency, lead_source (source_id), contact, product were previously
  stored as custom_fields JSONB keys when those field definitions were wrongly marked
  is_custom=true. Now they map to real physical columns.

  This migration:
  1. Temporarily disables the product access trigger (admin migration context)
  2. Backfills all five fields from custom_fields to their real columns
  3. Strips those stale keys from the custom_fields JSONB blob
  4. Re-enables the trigger
*/

-- Disable triggers for this migration (admin context)
ALTER TABLE lead DISABLE TRIGGER trg_validate_product_access_lead;
ALTER TABLE lead DISABLE TRIGGER trg_data_policy_lead;

-- 1. Backfill country_id
UPDATE lead
SET country_id = (custom_fields->>'country')::uuid
WHERE country_id IS NULL
  AND custom_fields->>'country' IS NOT NULL
  AND (custom_fields->>'country') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM country WHERE country_id = (custom_fields->>'country')::uuid);

-- 2. Backfill currency_id
UPDATE lead
SET currency_id = (custom_fields->>'currency')::uuid
WHERE currency_id IS NULL
  AND custom_fields->>'currency' IS NOT NULL
  AND (custom_fields->>'currency') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM currency WHERE currency_id = (custom_fields->>'currency')::uuid);

-- 3. Backfill source_id
UPDATE lead
SET source_id = (custom_fields->>'lead_source')::uuid
WHERE source_id IS NULL
  AND custom_fields->>'lead_source' IS NOT NULL
  AND (custom_fields->>'lead_source') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM crm_sources WHERE crm_sources_id = (custom_fields->>'lead_source')::uuid);

-- 4. Backfill contact_id
UPDATE lead
SET contact_id = (custom_fields->>'contact')::uuid
WHERE contact_id IS NULL
  AND custom_fields->>'contact' IS NOT NULL
  AND (custom_fields->>'contact') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM contact WHERE contact_id = (custom_fields->>'contact')::uuid);

-- 5. Backfill product_id
UPDATE lead
SET product_id = (custom_fields->>'product')::uuid
WHERE product_id IS NULL
  AND custom_fields->>'product' IS NOT NULL
  AND (custom_fields->>'product') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM product WHERE product_id = (custom_fields->>'product')::uuid);

-- 6. Strip all stale keys from custom_fields
UPDATE lead
SET custom_fields = custom_fields - 'country' - 'currency' - 'lead_source' - 'contact' - 'product'
WHERE custom_fields IS NOT NULL
  AND (
    custom_fields ? 'country'    OR
    custom_fields ? 'currency'   OR
    custom_fields ? 'lead_source' OR
    custom_fields ? 'contact'    OR
    custom_fields ? 'product'
  );

-- Re-enable triggers
ALTER TABLE lead ENABLE TRIGGER trg_validate_product_access_lead;
ALTER TABLE lead ENABLE TRIGGER trg_data_policy_lead;
