/*
  # Allow Deleting System Process Flows

  Updates the `soft_delete_process_flow` RPC to:
  - Remove the guard that prevents system flows from being deleted
  - Clear dependent FK references (default_stage_id, entity default flow, record-level FKs)
    before soft-deleting, to avoid constraint errors
  - System admins can delete any flow
*/

CREATE OR REPLACE FUNCTION soft_delete_process_flow(p_flow_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT get_is_system_admin_bypass_rls(auth.uid()) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Permission denied: system admin required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM process_flow WHERE process_flow_id = p_flow_id) THEN
    RAISE EXCEPTION 'Process flow not found';
  END IF;

  -- Clear default_stage_id FK on this flow
  UPDATE process_flow
  SET default_stage_id = NULL
  WHERE process_flow_id = p_flow_id
    AND default_stage_id IS NOT NULL;

  -- Clear entity-level default flow FK
  UPDATE entity_definition
  SET default_process_flow_id = NULL
  WHERE default_process_flow_id = p_flow_id;

  -- Clear record-level FKs on lead
  UPDATE lead
  SET active_process_flow_id = NULL,
      active_process_stage_id = NULL,
      active_process_flow_instance_id = NULL,
      process_flow_id = NULL
  WHERE active_process_flow_id = p_flow_id
     OR process_flow_id = p_flow_id;

  -- Clear record-level FKs on opportunity
  UPDATE opportunity
  SET active_process_flow_id = NULL,
      active_process_stage_id = NULL,
      active_process_flow_instance_id = NULL,
      process_flow_id = NULL
  WHERE active_process_flow_id = p_flow_id
     OR process_flow_id = p_flow_id;

  -- Soft delete
  UPDATE process_flow
  SET deleted_at = now(), is_active = false
  WHERE process_flow_id = p_flow_id;
END;
$$;
