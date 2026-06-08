/*
  # Security Hardening: Search Path, RLS Policies, and EXECUTE Privileges

  1. Function Search Path Fixes (8 functions)
    - Set `search_path = public` on all functions with mutable search paths
    - Affected: update_rtr_modified_at, set_relationship_definition_modified_at,
      fn_trigger_data_policy_check, trg_provision_entity_statecodes,
      _add_status_column_if_missing, provision_entity_statecodes (2 overloads),
      soft_delete_process_flow

  2. RLS Policy Tightening (8 tables)
    - Replace always-true INSERT/UPDATE/DELETE policies with admin-only checks
    - process_flow_instance: INSERT/UPDATE restricted to owner (created_by)
    - process_flow_stage_history: INSERT restricted to the user performing the move
    - process_stage_step: INSERT/UPDATE/DELETE restricted to admins
    - record_transformation_field_mapping: INSERT/UPDATE/DELETE restricted to admins
    - record_transformation_rule: INSERT/UPDATE restricted to admins
    - record_transformation_target: INSERT/UPDATE/DELETE restricted to admins
    - status_reason_definition: Remove duplicate open policies, keep admin-only
    - workflow_run_log: INSERT/UPDATE restricted to the workflow owner (via started_by)

  3. EXECUTE Privilege Revocations (21 SECURITY DEFINER functions)
    - Revoke EXECUTE from anon on ALL SECURITY DEFINER functions
    - Revoke EXECUTE from authenticated on trigger functions (engine-invoked only)
    - Revoke EXECUTE from authenticated on internal helpers not called from frontend

  4. Important Notes
    - Frontend RPC calls preserved for: soft_delete_qualification_rule,
      soft_delete_process_flow, increment_workflow_run_count, fn_check_product_access
    - RLS helper functions (is_system_admin, etc.) are used within RLS policies
      which run as SECURITY DEFINER, so they don't need direct user EXECUTE
    - Trigger functions are invoked by the database engine, not via RPC
*/

-- ============================================================================
-- PART 1: Fix mutable search_path on functions
-- ============================================================================

-- 1a. update_rtr_modified_at (trigger, not SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.update_rtr_modified_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.modified_at = now();
  RETURN NEW;
END;
$function$;

-- 1b. set_relationship_definition_modified_at (trigger, not SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.set_relationship_definition_modified_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.modified_at := now();
  RETURN NEW;
END;
$function$;

-- 1c. fn_trigger_data_policy_check (trigger, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.fn_trigger_data_policy_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_entity_name text;
  v_old_record  jsonb;
BEGIN
  v_entity_name := TG_ARGV[0];
  v_old_record  := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  PERFORM fn_evaluate_data_policies(v_entity_name, to_jsonb(NEW), TG_OP, v_old_record);
  RETURN NEW;
END;
$function$;

-- 1d. trg_provision_entity_statecodes (trigger, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.trg_provision_entity_statecodes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM provision_entity_statecodes(NEW.entity_definition_id);
  RETURN NEW;
END;
$function$;

-- 1e. _add_status_column_if_missing (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public._add_status_column_if_missing(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'status'
  ) THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN status text NOT NULL DEFAULT ''active''', p_table);
  END IF;
END;
$function$;

-- 1f. provision_entity_statecodes() -- trigger overload (not SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.provision_entity_statecodes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_entity_id   uuid := NEW.entity_definition_id;
  v_ft_choice   uuid;
  v_sc_active   uuid;
  v_sc_inactive uuid;
BEGIN
  SELECT field_type_id INTO v_ft_choice FROM field_type WHERE name = 'choice' LIMIT 1;
  IF v_ft_choice IS NULL THEN RETURN NEW; END IF;

  INSERT INTO field_definition (
    entity_definition_id, logical_name, physical_column_name, display_name,
    field_type_id, is_system, is_active, is_required, config_json
  ) VALUES (
    v_entity_id, 'statecode', 'state_code', 'Status',
    v_ft_choice, true, true, false, '{"is_statecode_field": true}'::jsonb
  ) ON CONFLICT DO NOTHING;

  INSERT INTO field_definition (
    entity_definition_id, logical_name, physical_column_name, display_name,
    field_type_id, is_system, is_active, is_required, config_json
  ) VALUES (
    v_entity_id, 'statusreason', 'status_reason', 'Status Reason',
    v_ft_choice, true, true, false, '{"is_statusreason_field": true}'::jsonb
  ) ON CONFLICT DO NOTHING;

  INSERT INTO statecode_definition (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES
    (v_entity_id, 1, 'Active', true,  1, true),
    (v_entity_id, 2, 'Inactive', false, 2, true)
  ON CONFLICT DO NOTHING;

  SELECT statecode_id INTO v_sc_active
    FROM statecode_definition WHERE entity_definition_id = v_entity_id AND state_value = 1;
  SELECT statecode_id INTO v_sc_inactive
    FROM statecode_definition WHERE entity_definition_id = v_entity_id AND state_value = 2;

  IF v_sc_active IS NOT NULL THEN
    INSERT INTO status_reason_definition (statecode_id, reason_value, display_label, sort_order)
    VALUES
      (v_sc_active, 1, 'Active', 1),
      (v_sc_active, 3, 'In Progress', 2),
      (v_sc_active, 4, 'Pending', 3)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_sc_inactive IS NOT NULL THEN
    INSERT INTO status_reason_definition (statecode_id, reason_value, display_label, sort_order)
    VALUES
      (v_sc_inactive, 2, 'Inactive', 1),
      (v_sc_inactive, 5, 'Cancelled', 2),
      (v_sc_inactive, 6, 'Rejected', 3)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- 1g. provision_entity_statecodes(p_entity_id uuid) -- callable overload (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.provision_entity_statecodes(p_entity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_choice_type_id  uuid;
  v_active_sc_id    uuid;
  v_inactive_sc_id  uuid;
  v_entity_exists   boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM entity_definition WHERE entity_definition_id = p_entity_id
  ) INTO v_entity_exists;
  IF NOT v_entity_exists THEN RETURN; END IF;

  SELECT field_type_id INTO v_choice_type_id
    FROM field_type WHERE name = 'choice' LIMIT 1;

  INSERT INTO statecode_definition
    (entity_definition_id, state_value, display_label, is_active_state, sort_order, is_system)
  VALUES
    (p_entity_id, 1, 'Active',   true,  10, true),
    (p_entity_id, 2, 'Inactive', false, 20, true)
  ON CONFLICT DO NOTHING;

  SELECT statecode_id INTO v_active_sc_id
    FROM statecode_definition
    WHERE entity_definition_id = p_entity_id AND state_value = 1;

  SELECT statecode_id INTO v_inactive_sc_id
    FROM statecode_definition
    WHERE entity_definition_id = p_entity_id AND state_value = 2;

  INSERT INTO status_reason_definition
    (statecode_id, entity_definition_id, reason_value, display_label,
     color, sort_order, is_default, is_active, is_system, description)
  VALUES
    (v_active_sc_id,   p_entity_id, 1, 'Active',      '#10B981', 10, true,  true, true, ''),
    (v_active_sc_id,   p_entity_id, 3, 'In Progress', '#3B82F6', 20, false, true, false, ''),
    (v_active_sc_id,   p_entity_id, 4, 'Pending',     '#F59E0B', 30, false, true, false, ''),
    (v_inactive_sc_id, p_entity_id, 2, 'Inactive',    '#6B7280', 10, true,  true, true, ''),
    (v_inactive_sc_id, p_entity_id, 5, 'Cancelled',   '#EF4444', 20, false, true, false, ''),
    (v_inactive_sc_id, p_entity_id, 6, 'Rejected',    '#DC2626', 30, false, true, false, '')
  ON CONFLICT DO NOTHING;

  INSERT INTO field_definition
    (entity_definition_id, field_type_id, logical_name, display_name,
     physical_column_name, is_system, is_required, is_searchable,
     is_sortable, is_filterable, is_custom, is_active, sort_order, config_json)
  VALUES
    (p_entity_id, v_choice_type_id, 'statecode', 'Status',
     'state_code', true, false, true, true, true, false, true, 9000,
     '{"choices":[],"is_statecode_field":true}'::jsonb)
  ON CONFLICT (entity_definition_id, logical_name)
  WHERE deleted_at IS NULL
  DO UPDATE SET
    display_name = 'Status',
    config_json  = '{"choices":[],"is_statecode_field":true}'::jsonb;

  INSERT INTO field_definition
    (entity_definition_id, field_type_id, logical_name, display_name,
     physical_column_name, is_system, is_required, is_searchable,
     is_sortable, is_filterable, is_custom, is_active, sort_order, config_json)
  VALUES
    (p_entity_id, v_choice_type_id, 'statusreason', 'Status Reason',
     'status_reason', true, false, false, true, true, false, true, 9001,
     '{"choices":[],"is_statusreason_field":true}'::jsonb)
  ON CONFLICT (entity_definition_id, logical_name)
  WHERE deleted_at IS NULL
  DO UPDATE SET
    display_name = 'Status Reason',
    config_json  = '{"choices":[],"is_statusreason_field":true}'::jsonb;

  INSERT INTO view_definition
    (entity_definition_id, name, view_type, is_default, is_system, is_deletable,
     filter_json, sort_json, is_active)
  VALUES
    (p_entity_id, 'Active Records', 'public', false, true, false,
     '{"operator":"AND","conditions":[{"field_logical_name":"statecode","field_type_name":"choice","field_display_name":"Status","operator":"eq","value":"1"}]}'::jsonb,
     '[]'::jsonb, true),
    (p_entity_id, 'Inactive Records', 'public', false, true, false,
     '{"operator":"AND","conditions":[{"field_logical_name":"statecode","field_type_name":"choice","field_display_name":"Status","operator":"eq","value":"2"}]}'::jsonb,
     '[]'::jsonb, true),
    (p_entity_id, 'All Records', 'public', true, true, false,
     NULL, '[]'::jsonb, true)
  ON CONFLICT DO NOTHING;
END;
$function$;

-- 1h. soft_delete_process_flow (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.soft_delete_process_flow(p_flow_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  UPDATE process_flow
    SET default_stage_id = NULL
    WHERE process_flow_id = p_flow_id AND default_stage_id IS NOT NULL;

  UPDATE entity_definition
    SET default_process_flow_id = NULL
    WHERE default_process_flow_id = p_flow_id;

  UPDATE lead
    SET active_process_flow_id = NULL, active_process_stage_id = NULL,
        active_process_flow_instance_id = NULL, process_flow_id = NULL
    WHERE active_process_flow_id = p_flow_id OR process_flow_id = p_flow_id;

  UPDATE opportunity
    SET active_process_flow_id = NULL, active_process_stage_id = NULL,
        active_process_flow_instance_id = NULL, process_flow_id = NULL
    WHERE active_process_flow_id = p_flow_id OR process_flow_id = p_flow_id;

  UPDATE process_flow
    SET deleted_at = now(), is_active = false
    WHERE process_flow_id = p_flow_id;
END;
$function$;


-- ============================================================================
-- PART 2: Fix always-true RLS policies
-- ============================================================================

-- 2a. process_flow_instance
--     INSERT: only the user who creates it (via created_by = auth.uid())
--     UPDATE: only the creator or admin
DROP POLICY IF EXISTS "Authenticated users can insert process flow instances" ON process_flow_instance;
CREATE POLICY "Authenticated users can insert process flow instances"
  ON process_flow_instance FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid() OR is_system_admin());

DROP POLICY IF EXISTS "Authenticated users can update process flow instances" ON process_flow_instance;
CREATE POLICY "Authenticated users can update process flow instances"
  ON process_flow_instance FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR is_system_admin())
  WITH CHECK (created_by = auth.uid() OR is_system_admin());

-- 2b. process_flow_stage_history
--     Remove duplicate policies, restrict INSERT to the user performing the move
DROP POLICY IF EXISTS "Authenticated users can insert flow stage history" ON process_flow_stage_history;
DROP POLICY IF EXISTS "Authenticated users can insert stage history" ON process_flow_stage_history;
CREATE POLICY "Authenticated users can insert stage history"
  ON process_flow_stage_history FOR INSERT
  TO authenticated
  WITH CHECK (moved_by = auth.uid() OR is_system_admin());

-- Remove duplicate SELECT, keep one
DROP POLICY IF EXISTS "Authenticated users can read flow stage history" ON process_flow_stage_history;

-- 2c. process_stage_step (admin-managed config data)
DROP POLICY IF EXISTS "Authenticated users can insert stage steps" ON process_stage_step;
CREATE POLICY "Admins can insert stage steps"
  ON process_stage_step FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

DROP POLICY IF EXISTS "Authenticated users can update stage steps" ON process_stage_step;
CREATE POLICY "Admins can update stage steps"
  ON process_stage_step FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

DROP POLICY IF EXISTS "Authenticated users can delete stage steps" ON process_stage_step;
CREATE POLICY "Admins can delete stage steps"
  ON process_stage_step FOR DELETE
  TO authenticated
  USING (is_system_admin());

-- 2d. record_transformation_field_mapping (admin-managed config)
DROP POLICY IF EXISTS "Authenticated users can insert transformation field mappings" ON record_transformation_field_mapping;
CREATE POLICY "Admins can insert transformation field mappings"
  ON record_transformation_field_mapping FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

DROP POLICY IF EXISTS "Authenticated users can update transformation field mappings" ON record_transformation_field_mapping;
CREATE POLICY "Admins can update transformation field mappings"
  ON record_transformation_field_mapping FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

DROP POLICY IF EXISTS "Authenticated users can delete transformation field mappings" ON record_transformation_field_mapping;
CREATE POLICY "Admins can delete transformation field mappings"
  ON record_transformation_field_mapping FOR DELETE
  TO authenticated
  USING (is_system_admin());

-- 2e. record_transformation_rule (admin-managed config)
DROP POLICY IF EXISTS "Authenticated users can insert transformation rules" ON record_transformation_rule;
CREATE POLICY "Admins can insert transformation rules"
  ON record_transformation_rule FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

DROP POLICY IF EXISTS "Authenticated users can update transformation rules" ON record_transformation_rule;
CREATE POLICY "Admins can update transformation rules"
  ON record_transformation_rule FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND is_system_admin())
  WITH CHECK (is_system_admin());

-- 2f. record_transformation_target (admin-managed config)
DROP POLICY IF EXISTS "Authenticated users can insert transformation targets" ON record_transformation_target;
CREATE POLICY "Admins can insert transformation targets"
  ON record_transformation_target FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());

DROP POLICY IF EXISTS "Authenticated users can update transformation targets" ON record_transformation_target;
CREATE POLICY "Admins can update transformation targets"
  ON record_transformation_target FOR UPDATE
  TO authenticated
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

DROP POLICY IF EXISTS "Authenticated users can delete transformation targets" ON record_transformation_target;
CREATE POLICY "Admins can delete transformation targets"
  ON record_transformation_target FOR DELETE
  TO authenticated
  USING (is_system_admin());

-- 2g. status_reason_definition
--     Remove the always-true duplicate policies; admin policies already exist
DROP POLICY IF EXISTS "Authenticated users can insert status reason definitions" ON status_reason_definition;
DROP POLICY IF EXISTS "Authenticated users can update status reason definitions" ON status_reason_definition;
-- Remove duplicate SELECT
DROP POLICY IF EXISTS "Authenticated users can read status reason definitions" ON status_reason_definition;

-- 2h. workflow_run_log
--     Add started_by column for ownership tracking, then restrict policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_run_log' AND column_name = 'started_by'
  ) THEN
    ALTER TABLE workflow_run_log ADD COLUMN started_by uuid REFERENCES crm_user(user_id);
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can insert their own run logs" ON workflow_run_log;
CREATE POLICY "Users can insert their own run logs"
  ON workflow_run_log FOR INSERT
  TO authenticated
  WITH CHECK (started_by = auth.uid() OR is_system_admin());

DROP POLICY IF EXISTS "Users can update run logs they can see" ON workflow_run_log;
CREATE POLICY "Users can update run logs they can see"
  ON workflow_run_log FOR UPDATE
  TO authenticated
  USING (started_by = auth.uid() OR is_system_admin())
  WITH CHECK (started_by = auth.uid() OR is_system_admin());


-- ============================================================================
-- PART 3: Revoke EXECUTE privileges on SECURITY DEFINER functions
-- ============================================================================

-- 3a. Revoke all EXECUTE from anon on ALL SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.fn_trigger_data_policy_check() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_validate_product_access_on_save() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_stage_is_terminal() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_provision_entity_statecodes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.crm_user_has_access(text, uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.crm_user_has_privilege(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_check_product_access(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_current_user_is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_is_system_admin_bypass_rls(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_system_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_view_owner(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_view_share(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public._add_status_column_if_missing(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.provision_entity_statecodes(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.advance_process_stage(uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_process_flow_instance(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_or_create_process_flow_instance(uuid, uuid, uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_workflow_run_count(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_process_flow(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_qualification_rule(uuid) FROM anon;

-- 3b. Revoke EXECUTE from authenticated on trigger functions (invoked by engine only)
REVOKE EXECUTE ON FUNCTION public.fn_trigger_data_policy_check() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_validate_product_access_on_save() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_stage_is_terminal() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_provision_entity_statecodes() FROM authenticated;

-- 3c. Revoke EXECUTE from authenticated on internal helper functions
--     These are used within RLS policies (which run as SECURITY DEFINER) or other functions,
--     not called directly from the frontend
REVOKE EXECUTE ON FUNCTION public._add_status_column_if_missing(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.provision_entity_statecodes(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_evaluate_data_policies(text, jsonb, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_is_system_admin_bypass_rls(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_process_stage(uuid, uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_process_flow_instance(uuid, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_process_flow_instance(uuid, uuid, uuid, uuid, uuid) FROM authenticated;

-- Note: The following functions remain callable by authenticated users because
-- the frontend calls them via supabase.rpc():
--   - soft_delete_process_flow(uuid)
--   - soft_delete_qualification_rule(uuid)
--   - increment_workflow_run_count(uuid)
--   - fn_check_product_access(uuid, text, uuid)
--   - is_system_admin()
--   - get_current_user_is_admin()
--   - crm_user_has_access(text, uuid, text, uuid)
--   - crm_user_has_privilege(text, text)
--   - is_view_owner(uuid)
--   - user_has_view_share(uuid, text)
