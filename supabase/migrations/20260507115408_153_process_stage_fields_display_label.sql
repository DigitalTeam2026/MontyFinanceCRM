/*
  # Add display_label to process_stage_fields

  ## Changes
  - `process_stage_fields`: adds `display_label` (text, nullable)
    - When null the UI falls back to the field's own display_name
    - Allows BPF bar steps to show a custom label different from the field's default label
*/

ALTER TABLE process_stage_fields
  ADD COLUMN IF NOT EXISTS display_label text;
