/*
  # Soft Delete Process Flow via RPC

  ## Problem
  The process_flow UPDATE RLS policy blocks soft-delete even for admin users
  because auth.uid() context is unreliable when evaluated inside SECURITY DEFINER
  functions called from RLS policies in some Supabase environments.

  ## Solution
  Create a SECURITY DEFINER RPC function that performs the soft-delete directly
  as postgres (bypassing RLS), after verifying the caller is an admin and the
  flow is not a system flow. This is the same pattern used for other privileged
  operations in this codebase.

  ## New Functions
  - `soft_delete_process_flow(p_flow_id uuid)` - Soft-deletes a non-system process
    flow after verifying the caller is a system admin. Raises an exception if the
    caller is not an admin or if the flow is a system flow.
*/

CREATE OR REPLACE FUNCTION public.soft_delete_process_flow(p_flow_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_is_system boolean;
BEGIN
  SELECT get_is_system_admin_bypass_rls(auth.uid()) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Permission denied: system admin required';
  END IF;

  SELECT is_system INTO v_is_system
  FROM process_flow
  WHERE process_flow_id = p_flow_id;

  IF v_is_system IS NULL THEN
    RAISE EXCEPTION 'Process flow not found';
  END IF;

  IF v_is_system THEN
    RAISE EXCEPTION 'Cannot delete a system process flow';
  END IF;

  UPDATE process_flow
  SET deleted_at = now(), is_active = false
  WHERE process_flow_id = p_flow_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_process_flow(uuid) TO authenticated;
