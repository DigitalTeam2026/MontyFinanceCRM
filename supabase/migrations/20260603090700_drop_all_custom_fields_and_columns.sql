/*
  # Drop all custom fields — metadata and physical columns

  ## Summary
  Removes every custom field from the system:
  1. Drops relationship_definition rows that reference custom fields (FK constraint)
  2. Drops the 3 real physical columns created in the previous migration
     (contact.test, event.test, lead.lead_source)
  3. Hard-deletes ALL rows in field_definition where is_custom = true
  4. Clears residual custom_fields JSONB data

  ## Tables affected
  - relationship_definition → DELETE rows referencing custom field IDs
  - contact     → DROP COLUMN test
  - event       → DROP COLUMN test
  - lead        → DROP COLUMN lead_source
  - field_definition → DELETE WHERE is_custom = true
  - account, lead, contact, event → JSONB custom_fields cleanup
*/

-- 1. Delete relationship_definition rows that reference custom fields
DELETE FROM public.relationship_definition
WHERE source_lookup_field_id IN (
  SELECT field_definition_id FROM public.field_definition WHERE is_custom = true
);

-- 2. Drop real physical columns
ALTER TABLE public.contact DROP COLUMN IF EXISTS test;
ALTER TABLE public.event   DROP COLUMN IF EXISTS test;
ALTER TABLE public.lead    DROP COLUMN IF EXISTS lead_source;

-- 3. Hard-delete ALL custom field definition rows (active + soft-deleted)
DELETE FROM public.field_definition WHERE is_custom = true;

-- 4. Clean up residual JSONB keys from old custom_fields storage
UPDATE public.account
SET custom_fields = custom_fields - 'security'
WHERE custom_fields ? 'security';

UPDATE public.lead
SET custom_fields = custom_fields - 'source' - 'lead_source'
WHERE custom_fields ?| ARRAY['source', 'lead_source'];

UPDATE public.contact
SET custom_fields = custom_fields - 'test'
WHERE custom_fields ? 'test';

UPDATE public.event
SET custom_fields = custom_fields - 'test'
WHERE custom_fields ? 'test';
