
/*
  # Migration 9: Field Management Extensions

  ## Overview
  Extends the field_definition table and seeds all required field types for the
  Admin Studio Field Management module.

  ## Modified Tables

  ### field_definition
  - `validation_rules` (jsonb) — Stores structured validation rules such as min/max, regex patterns,
    custom error messages, and other type-specific constraints
  - `config_json` (jsonb) — Arbitrary type-specific configuration (e.g. formula for calculated fields)
  - `deleted_at` (timestamptz) — Soft delete timestamp; NULL means the field is active

  ## Seeded Data

  ### field_type
  Ensures all core field types exist. Uses ON CONFLICT DO NOTHING to be safe on re-runs:
  text, textarea, number, decimal, currency, boolean, date, datetime, time, email,
  phone, url, lookup, choice, multi_choice, file, image, autonumber

  ## Notes
  - All column additions use IF NOT EXISTS guard
  - No existing data is altered
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_definition' AND column_name = 'validation_rules'
  ) THEN
    ALTER TABLE field_definition ADD COLUMN validation_rules jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_definition' AND column_name = 'config_json'
  ) THEN
    ALTER TABLE field_definition ADD COLUMN config_json jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_definition' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE field_definition ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_field_definition_deleted ON field_definition(deleted_at);

INSERT INTO field_type (name, display_name, description, sort_order) VALUES
  ('text',         'Text',             'Single line of text',                                1),
  ('textarea',     'Text Area',        'Multiple lines of text',                             2),
  ('number',       'Whole Number',     'Integer number',                                     3),
  ('decimal',      'Decimal Number',   'Number with decimal precision',                      4),
  ('currency',     'Currency',         'Monetary value',                                     5),
  ('boolean',      'Yes / No',         'True or false toggle',                               6),
  ('date',         'Date',             'Calendar date without time',                         7),
  ('datetime',     'Date & Time',      'Date with time',                                     8),
  ('time',         'Time',             'Time of day',                                        9),
  ('email',        'Email',            'Email address with validation',                     10),
  ('phone',        'Phone',            'Phone number',                                      11),
  ('url',          'URL',              'Web address',                                       12),
  ('lookup',       'Lookup',           'Reference to another entity record',                13),
  ('choice',       'Choice',           'Single select from a local list of options',        14),
  ('multi_choice', 'Multi Choice',     'Multiple selections from a local list of options',  15),
  ('file',         'File',             'File attachment',                                   16),
  ('image',        'Image',            'Image attachment',                                  17),
  ('autonumber',   'Auto Number',      'System-generated sequential number',                18)
ON CONFLICT (name) DO NOTHING;
