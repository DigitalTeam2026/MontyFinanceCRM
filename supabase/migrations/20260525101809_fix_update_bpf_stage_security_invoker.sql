/*
  # Switch update_bpf_stage to SECURITY INVOKER

  ## Problem
  `update_bpf_stage` was SECURITY DEFINER, exposing it to privilege escalation via the
  dynamic `EXECUTE format(...)` branch (arbitrary table writes under the function owner's
  superuser-equivalent context).

  ## Solution
  - Rebuild as SECURITY INVOKER — the caller's own RLS policies govern what they can update.
  - Remove the dynamic arbitrary-table branch; hardcode only the two known tables (lead,
    opportunity). Any other table is rejected with an exception.
  - The explicit `security.crm_user_has_access()` permission check is retained for defence
    in depth, but RLS is now the primary enforcement layer.
  - Revoke EXECUTE from `authenticated` on the old (now-replaced) signature and re-grant
    so permissions are clean after the replace.
*/

CREATE OR REPLACE FUNCTION public.update_bpf_stage(
  p_table    text,
  p_pk       text,
  p_record_id uuid,
  p_stage_id  uuid,
  p_finished  boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Only allow known entity tables — reject arbitrary table names
  IF p_table NOT IN ('lead', 'opportunity') THEN
    RAISE EXCEPTION 'update_bpf_stage: unsupported table "%"', p_table;
  END IF;

  -- Defence-in-depth: verify the caller has update access to this entity
  IF NOT (security.is_system_admin() OR security.crm_user_has_access(p_table, 'update')) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_table = 'lead' THEN
    UPDATE lead
    SET active_process_stage_id = p_stage_id,
        bpf_is_finished         = p_finished
    WHERE lead_id = p_record_id;
  ELSIF p_table = 'opportunity' THEN
    UPDATE opportunity
    SET active_process_stage_id = p_stage_id,
        bpf_is_finished         = p_finished
    WHERE opportunity_id = p_record_id;
  END IF;
END;
$$;

-- Ensure only authenticated users (logged-in CRM users) can call this — not anon
REVOKE EXECUTE ON FUNCTION public.update_bpf_stage(text, text, uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_bpf_stage(text, text, uuid, uuid, boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_bpf_stage(text, text, uuid, uuid, boolean) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_bpf_stage(text, text, uuid, uuid, boolean) TO service_role;
