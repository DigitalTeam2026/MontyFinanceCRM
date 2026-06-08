/*
  # Fix POS process flow stage_field and corrupted lead records

  1. Changes
    - Update the POS process flow `stage_field` from `state_code` to `bpf_stage`
    - The `state_code` column is reserved for entity lifecycle states (Open/Qualified/Disqualified)
    - BPF stage tracking should use the `bpf_stage` column instead
    - Fix corrupted lead records where BPF stage keys were written into `state_code`
    - Set those records back to state_code = '1' (Open)
    - Copy the corrupted stage key into `bpf_stage` so the BPF stage is preserved

  2. Affected Tables
    - `process_flow` - POS flow stage_field corrected
    - `lead` - corrupted state_code values fixed
*/

-- Fix the POS flow to use bpf_stage instead of state_code
UPDATE process_flow
SET stage_field = 'bpf_stage',
    modified_at = now()
WHERE name = 'POS'
  AND stage_field = 'state_code'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'lead'
  );

-- Fix corrupted leads: copy stage key to bpf_stage, reset state_code to '1' (Open)
UPDATE lead
SET bpf_stage = state_code,
    state_code = '1',
    status_reason = '1'
WHERE state_code LIKE 'stage_%'
   OR state_code LIKE 'condition_%';
