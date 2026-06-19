/*
  # Drop CRM Entity RPC (hard delete)

  ## Overview
  Adds `public.drop_crm_entity(p_entity_id uuid)` — a secure server-side function that
  PERMANENTLY deletes a custom CRM entity: it DROPs the physical PostgreSQL table
  (CASCADE) and removes the entity's field_definition + entity_definition metadata in a
  single atomic transaction.

  This is the destructive counterpart to the existing soft delete. Soft delete only sets
  entity_definition.deleted_at; this function physically removes the table and data with
  no recycle-bin recovery.

  ## Behaviour
  - Admin guard: requires security.is_system_admin().
  - Refuses system (is_custom = false) entities — only custom tables can be dropped.
  - Re-validates the stored physical_table_name against a strict identifier regex before
    any dynamic SQL (defence in depth against injection via tampered metadata).
  - DROP TABLE IF EXISTS public.<table> CASCADE — also removes dependent indexes, RLS
    policies, triggers, and any views/FKs that referenced the table.
  - Deletes field_definition rows for the entity, then the entity_definition row.
    Remaining metadata that FK-references entity_definition is removed via existing
    ON DELETE CASCADE constraints; if any blocking reference remains the whole call rolls
    back and returns the error.
  - Returns {ok:true, table_name, dropped_table} or {ok:false, error}. Any failure rolls
    back atomically (EXCEPTION handler).

  ## Security
  - SECURITY DEFINER, fixed search_path, admin-guarded, revoked from anon.
*/

CREATE OR REPLACE FUNCTION public.drop_crm_entity(p_entity_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_temp
AS $$
DECLARE
  v_entity        entity_definition%ROWTYPE;
  v_table_existed boolean;
BEGIN
  -- Admin guard
  IF NOT security.is_system_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;

  SELECT * INTO v_entity
  FROM entity_definition
  WHERE entity_definition_id = p_entity_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Entity not found');
  END IF;

  IF NOT v_entity.is_custom THEN
    RETURN json_build_object('ok', false, 'error',
      'System entities cannot be deleted.');
  END IF;

  -- Safety: re-validate the stored identifier before using it in dynamic DDL.
  IF v_entity.physical_table_name !~ '^[a-z][a-z0-9_]{0,39}$' THEN
    RETURN json_build_object('ok', false, 'error',
      format('Stored table name "%s" is not a valid identifier', v_entity.physical_table_name));
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = v_entity.physical_table_name
  ) INTO v_table_existed;

  -- Drop the physical table (and its dependent objects). IF EXISTS so metadata-only
  -- orphans (table already gone) still clean up their metadata below.
  EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', v_entity.physical_table_name);

  -- Remove the entity's column metadata, then the entity row itself. Other metadata
  -- referencing entity_definition is expected to cascade; any blocking FK aborts here.
  DELETE FROM field_definition WHERE entity_definition_id = p_entity_id;
  DELETE FROM entity_definition WHERE entity_definition_id = p_entity_id AND is_custom = true;

  RETURN json_build_object(
    'ok',            true,
    'entity_id',     p_entity_id,
    'table_name',    v_entity.physical_table_name,
    'dropped_table', v_table_existed
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT  EXECUTE ON FUNCTION public.drop_crm_entity(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.drop_crm_entity(uuid) FROM anon;
