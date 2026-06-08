/*
  # Reset lead BPF stage to first stage

  The lead record had active_process_stage_id pointing to Opportunity (last stage)
  due to incorrect stage_field configuration on the process flow. Reset it to the
  Lead stage (first stage) so the BPF bar starts correctly.
*/

ALTER TABLE lead DISABLE TRIGGER USER;

UPDATE lead 
SET active_process_stage_id = '3e5ef63b-1cbc-4255-96f0-968988744b57',
    active_process_flow_id = '65f199e1-e37d-4d34-a2a0-592fe499bf16'
WHERE lead_id = '6927eb64-29c8-40d8-8277-1ce2b611d083';

ALTER TABLE lead ENABLE TRIGGER USER;
