/*
  # Fix Lead BPF flows that used state_code as the stage field

  Three active Lead business process flows were configured with
  stage_field = 'state_code':
    - MyMonty Business wallet
    - Monty Pay Payment Gateway Business process Flow
    - My Monty Credit Card

  Because ProcessStageBar persists the current stage KEY into the column named
  by stage_field, every stage advance overwrote the record's state_code with a
  stage key (e.g. 'stage_1780914561053'). Two breakages followed:

    1. The "Qualify Lead" lifecycle rule is only visible when
       state_code IN ('1'), so a lead whose state_code became a stage key lost
       its Qualify command entirely once the BPF was completed.
    2. The lead's real lifecycle state (Active/Inactive/Qualified) was corrupted.

  Fix:
    Part 1 (root cause) — repoint those flows to the dedicated bpf_stage column
    (text, already used to store stage keys by other flows). active_process_stage_id
    remains the authoritative stage pointer, so the BPF bar recovers the correct
    stage automatically.

    Part 2 (data repair) — restore the clobbered state_code values:
      * Mid-flow, not-yet-qualified leads (stage key leaked in) -> Active ('1').
      * Already-qualified leads showing textual 'inactive'      -> canonical '2'.
*/

-- ── Part 1: root-cause config fix ───────────────────────────────────────────
UPDATE process_flow
SET stage_field = 'bpf_stage'
WHERE stage_field = 'state_code'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'lead'
  );

-- ── Part 2: repair corrupted lead rows ──────────────────────────────────────
-- Follows the existing precedent of disabling USER triggers during lead data
-- repair so audit/lifecycle triggers don't react to the corrective writes.
ALTER TABLE lead DISABLE TRIGGER USER;

-- Active mid-flow leads: a stage key leaked into state_code.
UPDATE lead
SET state_code = '1'
WHERE state_code LIKE 'stage_%'
  AND is_qualified = false;

-- Qualified leads: normalize the textual 'inactive' label to the canonical value.
UPDATE lead
SET state_code = '2'
WHERE state_code = 'inactive'
  AND is_qualified = true;

ALTER TABLE lead ENABLE TRIGGER USER;
