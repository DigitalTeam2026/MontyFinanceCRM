/*
  # Fix soft_delete_process_flow — remove auth.uid() guard incompatible with service_role

  ## Problem
  The function contains `IF NOT security.is_system_admin() THEN RAISE ...` which calls
  `auth.uid()` internally. When invoked by the admin-process-flow Edge Function using
  the service_role key, `auth.uid()` returns NULL (no user JWT), so the admin check
  always fails and the function raises "Permission denied", causing the Edge Function
  to return 400.

  ## Solution
  Remove the `security.is_system_admin()` guard from inside the function body.
  This is safe because:
  - EXECUTE is granted only to `service_role` — no authenticated user can call it directly
  - The Edge Function already validates system admin status before invoking the RPC
*/

CREATE OR REPLACE FUNCTION public.soft_delete_process_flow(p_flow_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM process_flow WHERE process_flow_id = p_flow_id
  ) THEN
    RAISE EXCEPTION 'Process flow not found';
  END IF;

  -- Clear default_stage_id reference
  UPDATE process_flow
  SET default_stage_id = NULL
  WHERE process_flow_id = p_flow_id
    AND default_stage_id IS NOT NULL;

  -- Clear entity default flow reference
  UPDATE entity_definition
  SET default_process_flow_id = NULL
  WHERE default_process_flow_id = p_flow_id;

  -- Detach leads from this flow
  UPDATE lead
  SET active_process_flow_id          = NULL,
      active_process_stage_id         = NULL,
      active_process_flow_instance_id = NULL,
      process_flow_id                 = NULL
  WHERE active_process_flow_id = p_flow_id
     OR process_flow_id        = p_flow_id;

  -- Detach opportunities from this flow
  UPDATE opportunity
  SET active_process_flow_id          = NULL,
      active_process_stage_id         = NULL,
      active_process_flow_instance_id = NULL,
      process_flow_id                 = NULL
  WHERE active_process_flow_id = p_flow_id
     OR process_flow_id        = p_flow_id;

  -- Soft-delete the flow itself
  UPDATE process_flow
  SET deleted_at = now(),
      is_active  = false
  WHERE process_flow_id = p_flow_id;
END;
$$;

-- Only service_role (used by the Edge Function) may call this
REVOKE ALL   ON FUNCTION public.soft_delete_process_flow(uuid) FROM PUBLIC;
REVOKE ALL   ON FUNCTION public.soft_delete_process_flow(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.soft_delete_process_flow(uuid) TO service_role;
