/*
  # Add campaign_id and event_id physical columns to lead table

  1. Schema Changes
    - Add `campaign_id` (uuid, nullable, FK to campaign) on `lead`
    - Add `event_id` (uuid, nullable, FK to event) on `lead`
    - Add indexes on both FK columns

  2. Data Migration
    - Copy existing values from custom_fields JSONB to new physical columns
    - Clear the migrated keys from custom_fields

  3. Metadata Updates
    - Update field_definition rows to point to real physical columns
    - Mark fields as non-custom since they now have physical columns
*/

-- 1. Add columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'campaign_id'
  ) THEN
    ALTER TABLE lead ADD COLUMN campaign_id uuid REFERENCES campaign(campaign_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE lead ADD COLUMN event_id uuid REFERENCES event(event_id);
  END IF;
END $$;

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_lead_campaign_id ON lead(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lead_event_id ON lead(event_id);

-- 3. Migrate existing JSONB values to physical columns
UPDATE lead
SET campaign_id = (custom_fields->>'campaign')::uuid
WHERE custom_fields->>'campaign' IS NOT NULL
  AND campaign_id IS NULL;

UPDATE lead
SET event_id = (custom_fields->>'event')::uuid
WHERE custom_fields->>'event' IS NOT NULL
  AND event_id IS NULL;

-- 4. Clean migrated keys from custom_fields
UPDATE lead
SET custom_fields = custom_fields - 'campaign' - 'event'
WHERE custom_fields ? 'campaign' OR custom_fields ? 'event';

-- 5. Update field_definitions to point to real physical columns
UPDATE field_definition
SET physical_column_name = 'campaign_id',
    is_custom = false
WHERE field_definition_id = 'e02cea29-c751-49d5-aa46-b9f02a25090f';

UPDATE field_definition
SET physical_column_name = 'event_id',
    is_custom = false
WHERE field_definition_id = '66ff8174-c83f-4ba7-a8e7-1759bc7f29e3';
