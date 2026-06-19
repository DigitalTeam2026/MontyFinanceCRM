/*
  # Permanently drop the `source` entity (physical table crm_source)

  Requested hard delete. The UI "Permanently Delete Custom Table" path
  (public.drop_crm_entity) could not complete because:
    - it failed with FK constraint field_definition_lookup_entity_id_fkey, and
    - its is_system_admin() guard rejects Management-API (no auth user) execution.

  So the teardown is performed here, atomically, clearing every NO ACTION inbound
  reference first. CASCADE/SET NULL inbound FKs (business_rule, form_definition,
  view_definition, workflow_definition, process_flow_assignment_rule,
  process_flow_entity_config, dashboard*, process_stage* conditions) resolve
  themselves on the entity_definition delete.

  Entity: source / crm_source / entity_definition_id 672f0481-f23f-42b1-90f4-edc87570a8a1
  At time of writing: crm_source held 4 records (deleted with the table).

  Cross-entity lookups pointing at source (other entities) are UNLINKED, not deleted,
  so those fields and their stored values survive:
    - lead.lead_source  (already soft-deleted; lead.source_id column already removed)
    - prospect.source   (active lookup -> lookup_entity_id set NULL; column data kept)
*/

DO $$
DECLARE
  v_id uuid := '672f0481-f23f-42b1-90f4-edc87570a8a1';
BEGIN
  -- 1. Unlink other-entity lookup fields that target source (keep fields + data).
  UPDATE field_definition
  SET lookup_entity_id = NULL, modified_at = now()
  WHERE lookup_entity_id = v_id
    AND entity_definition_id <> v_id;

  -- 2. Remove relationship definitions involving source (NO ACTION FK).
  DELETE FROM relationship_definition
  WHERE source_entity_id = v_id OR target_entity_id = v_id;

  -- 3. Remove source's own state / status-reason metadata (NO ACTION FK).
  DELETE FROM status_reason_definition WHERE entity_definition_id = v_id;
  DELETE FROM statecode_definition     WHERE entity_definition_id = v_id;

  -- 4. Drop the physical table and its dependent objects (indexes, RLS, triggers).
  EXECUTE 'DROP TABLE IF EXISTS public.crm_source CASCADE';

  -- 5. Remove source's own field metadata, then the entity row itself.
  --    (field_definition_entity_definition_id_fkey is CASCADE, but be explicit.)
  DELETE FROM field_definition  WHERE entity_definition_id = v_id;
  DELETE FROM entity_definition WHERE entity_definition_id = v_id;
END $$;

-- Refresh PostgREST schema cache so the dropped table/RPC state is current.
NOTIFY pgrst, 'reload schema';
