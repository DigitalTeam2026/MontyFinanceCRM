/*
  # Fix sync_stage_is_terminal trigger function

  The trigger was referencing s.stage_id which does not exist.
  The correct column name is process_stage_id.

  This fixes the 400 error when inserting a new process stage.
*/

CREATE OR REPLACE FUNCTION public.sync_stage_is_terminal()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  NEW.is_terminal := (
    NEW.stage_type IN ('terminal_success', 'terminal_failure', 'terminal_neutral')
  );
  RETURN NEW;
END;
$$;
