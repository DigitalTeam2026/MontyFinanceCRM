/*
  # Fix soft_delete_process_flow — add SECURITY DEFINER and EXECUTE grant

  The function runs as SECURITY INVOKER, so the RLS UPDATE policy on process_flow
  blocks the call for authenticated users. Since the function already contains its
  own security.is_system_admin() guard, switching to SECURITY DEFINER is safe and
  consistent with other soft-delete RPCs in the codebase.
*/

CREATE OR REPLACE FUNCTION public.soft_delete_process_flow(p_flow_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT security.is_system_admin() THEN
    RAISE EXCEPTION 'Permission denied: system admin required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM process_flow WHERE process_flow_id = p_flow_id
  ) THEN
    RAISE EXCEPTION 'Process flow not found';
  END IF;

  UPDATE process_flow
  SET default_stage_id = NULL
  WHERE process_flow_id = p_flow_id
    AND default_stage_id IS NOT NULL;

  UPDATE entity_definition
  SET default_process_flow_id = NULL
  WHERE default_process_flow_id = p_flow_id;

  UPDATE lead
  SET active_process_flow_id          = NULL,
      active_process_stage_id         = NULL,
      active_process_flow_instance_id = NULL,
      process_flow_id                 = NULL
  WHERE active_process_flow_id = p_flow_id
     OR process_flow_id        = p_flow_id;

  UPDATE opportunity
  SET active_process_flow_id          = NULL,
      active_process_stage_id         = NULL,
      active_process_flow_instance_id = NULL,
      process_flow_id                 = NULL
  WHERE active_process_flow_id = p_flow_id
     OR process_flow_id        = p_flow_id;

  UPDATE process_flow
  SET deleted_at = now(),
      is_active  = false
  WHERE process_flow_id = p_flow_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_process_flow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_process_flow(uuid) TO authenticated;
