
/*
  # Fix crm_source primary key column

  The crm_source table uses `id` as its PK but the app expects a named PK column
  matching the pattern used by all other entities (e.g. industry_id, country_id).
  
  Changes:
  - Rename crm_source.id to crm_source.source_id
  - Set primary_key_column = 'source_id' on the entity_definition row
*/

-- Rename the PK column
ALTER TABLE crm_source RENAME COLUMN id TO source_id;

-- Update the entity definition
UPDATE entity_definition
SET primary_key_column = 'source_id'
WHERE logical_name = 'source';
