
/*
  # Migration 7: Add Calculated, Option Set, and Multi Option Set Field Types

  ## Overview
  Adds three additional field types to complete the field type catalog.

  ## Changes

  ### Updated Table: field_type
  Three new rows added:

  - `calculated` — Formula-based field whose value is derived from other fields.
    The formula/expression is stored in field_definition metadata (not persisted as a raw column).
    Evaluated at read time by the application or a database function.

  - `option_set` — Single-select choice that references a NAMED, SHARED option set definition
    from the option_set table. Distinct from the existing `choice` type (which can be inline/local).
    This is the Dynamics 365-aligned "Option Set" field type.

  - `multi_option_set` — Multi-select choice that references a NAMED, SHARED option set definition.
    Allows selecting multiple values from a shared option set.
    Distinct from `multi_choice` (inline/local choices).
    Values stored as a JSON array in the physical column.

  ## Notes
  - `choice` and `multi_choice` are retained for local/inline dropdown definitions
  - `option_set` and `multi_option_set` explicitly link to a shared option_set record
  - `calculated` fields do not require a physical column; their formula lives in field_definition.config_json
*/

INSERT INTO field_type (name, display_name, description, sort_order) VALUES
  ('calculated',       'Calculated',        'Formula-based field derived from other field values',                          17),
  ('option_set',       'Option Set',        'Single selection referencing a shared, named option set definition',          18),
  ('multi_option_set', 'Multi Option Set',  'Multiple selections referencing a shared, named option set definition',       19)
ON CONFLICT (name) DO NOTHING;
