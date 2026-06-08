/*
  # Add BPF finished flag to lead and opportunity

  Adds a bpf_is_finished boolean column to lead and opportunity so the
  Business Process Flow bar can mark the flow as completed (green) when
  the user clicks Finish on the last stage, and reset it when going back.

  Also creates a security-definer RPC to update active_process_stage_id
  without firing the product-access trigger.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'bpf_is_finished'
  ) THEN
    ALTER TABLE lead ADD COLUMN bpf_is_finished boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunity' AND column_name = 'bpf_is_finished'
  ) THEN
    ALTER TABLE opportunity ADD COLUMN bpf_is_finished boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- RPC to update BPF stage + finished flag without triggering product-access validation
CREATE OR REPLACE FUNCTION public.update_bpf_stage(
  p_table      text,
  p_pk         text,
  p_record_id  uuid,
  p_stage_id   uuid,
  p_finished   boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
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
  ELSE
    EXECUTE format(
      'UPDATE %I SET active_process_stage_id = $1, bpf_is_finished = $2 WHERE %I = $3',
      p_table, p_pk
    ) USING p_stage_id, p_finished, p_record_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_bpf_stage(text, text, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_bpf_stage(text, text, uuid, uuid, boolean) TO authenticated;
