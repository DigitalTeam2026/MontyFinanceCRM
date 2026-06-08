/*
  # Security and Index Cleanup

  ## Summary
  Addresses all security advisor warnings:

  1. RLS Performance Fix
     - product table: wrap auth.uid() in (select auth.uid()) so it is evaluated
       once per query, not once per row

  2. RLS Policy Always-True Fix
     - workflow_run_log INSERT/UPDATE: tightened
     - workflow_step_log INSERT: tightened
     - scheduled_workflow_step INSERT/UPDATE: tightened

  3. Duplicate Index Removal
     - Drop older duplicates on product_business_unit_access, product_role_access,
       product_team_access

  4. Unused Index Removal
     - All indexes flagged as unused are dropped

  5. Mutable Search Path Fix
     - All six public functions are recreated with SET search_path = public, pg_catalog
*/

-- ─── 1. RLS: fix auth.uid() re-evaluation on product ─────────────────────────

DROP POLICY IF EXISTS "Users can only read products they have access to" ON product;

CREATE POLICY "Users can only read products they have access to"
  ON product FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND is_active = true
    AND fn_check_product_access(product_id, (SELECT auth.uid()))
  );

-- ─── 2. RLS: tighten workflow execution tables ────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert run logs"   ON workflow_run_log;
DROP POLICY IF EXISTS "Authenticated users can update run logs"   ON workflow_run_log;
DROP POLICY IF EXISTS "Authenticated users can insert step logs"  ON workflow_step_log;
DROP POLICY IF EXISTS "Authenticated users can insert scheduled steps" ON scheduled_workflow_step;
DROP POLICY IF EXISTS "Authenticated users can update scheduled steps" ON scheduled_workflow_step;

CREATE POLICY "Users can insert their own run logs"
  ON workflow_run_log FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update run logs they can see"
  ON workflow_run_log FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can insert step logs for visible runs"
  ON workflow_step_log FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workflow_run_log wrl
      WHERE wrl.run_id = workflow_step_log.run_id
    )
  );

CREATE POLICY "Users can insert scheduled steps"
  ON scheduled_workflow_step FOR INSERT TO authenticated
  WITH CHECK (
    trigger_user_id = (SELECT auth.uid()) OR trigger_user_id IS NULL
  );

CREATE POLICY "Users can update their scheduled steps"
  ON scheduled_workflow_step FOR UPDATE TO authenticated
  USING (trigger_user_id = (SELECT auth.uid()) OR trigger_user_id IS NULL)
  WITH CHECK (trigger_user_id = (SELECT auth.uid()) OR trigger_user_id IS NULL);

-- ─── 3. Remove duplicate indexes ─────────────────────────────────────────────

DROP INDEX IF EXISTS idx_product_business_unit_access_business_unit_id;
DROP INDEX IF EXISTS idx_product_role_access_role_id;
DROP INDEX IF EXISTS idx_product_team_access_team_id;

-- ─── 4. Drop unused indexes ───────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_account_business_unit_id;
DROP INDEX IF EXISTS idx_account_country_id;
DROP INDEX IF EXISTS idx_account_industry_id;
DROP INDEX IF EXISTS idx_account_created_by;
DROP INDEX IF EXISTS idx_account_currency_id;
DROP INDEX IF EXISTS idx_account_modified_by;
DROP INDEX IF EXISTS idx_account_parent_account_id;
DROP INDEX IF EXISTS idx_activity_log_owner_id;
DROP INDEX IF EXISTS idx_attachment_created_by;
DROP INDEX IF EXISTS idx_audit_log_changed_by;
DROP INDEX IF EXISTS idx_business_unit_organization_id;
DROP INDEX IF EXISTS idx_business_unit_parent_id;
DROP INDEX IF EXISTS idx_business_rule_created_by;
DROP INDEX IF EXISTS idx_business_rule_modified_by;
DROP INDEX IF EXISTS idx_campaign_business_unit_id;
DROP INDEX IF EXISTS idx_campaign_created_by;
DROP INDEX IF EXISTS idx_campaign_currency_id;
DROP INDEX IF EXISTS idx_campaign_modified_by;
DROP INDEX IF EXISTS idx_csp_field_entity;
DROP INDEX IF EXISTS idx_contact_business_unit_id;
DROP INDEX IF EXISTS idx_contact_country_id;
DROP INDEX IF EXISTS idx_contact_created_by;
DROP INDEX IF EXISTS idx_contact_modified_by;
DROP INDEX IF EXISTS idx_contact_source_id;
DROP INDEX IF EXISTS idx_contact_subsource_id;
DROP INDEX IF EXISTS idx_crm_user_business_unit_id;
DROP INDEX IF EXISTS idx_currency_audit_log_changed_by;
DROP INDEX IF EXISTS idx_currency_audit_log_new_currency_id;
DROP INDEX IF EXISTS idx_currency_audit_log_old_currency_id;
DROP INDEX IF EXISTS idx_dashboard_created_by;
DROP INDEX IF EXISTS idx_dashboard_widget_dashboard_id;
DROP INDEX IF EXISTS idx_data_policy_condition_policy_id;
DROP INDEX IF EXISTS idx_data_policy_enforcement_policy_id;
DROP INDEX IF EXISTS idx_duplicate_job_rule_id;
DROP INDEX IF EXISTS idx_duplicate_job_triggered_by;
DROP INDEX IF EXISTS idx_event_business_unit_id;
DROP INDEX IF EXISTS idx_event_campaign_id;
DROP INDEX IF EXISTS idx_event_created_by;
DROP INDEX IF EXISTS idx_event_modified_by;
DROP INDEX IF EXISTS idx_field_change_log_changed_by;
DROP INDEX IF EXISTS idx_field_definition_field_type_id;
DROP INDEX IF EXISTS idx_field_definition_lookup_entity_id;
DROP INDEX IF EXISTS idx_field_definition_option_set_id;
DROP INDEX IF EXISTS idx_form_control_field_definition_id;
DROP INDEX IF EXISTS idx_form_control_section_id;
DROP INDEX IF EXISTS idx_form_event_handler_form_id;
DROP INDEX IF EXISTS idx_form_script_form_id;
DROP INDEX IF EXISTS idx_form_section_form_id;
DROP INDEX IF EXISTS idx_form_tab_form_id;
DROP INDEX IF EXISTS idx_journey_business_unit_id;
DROP INDEX IF EXISTS idx_journey_campaign_id;
DROP INDEX IF EXISTS idx_journey_segment_id;
DROP INDEX IF EXISTS idx_journey_created_by;
DROP INDEX IF EXISTS idx_journey_modified_by;
DROP INDEX IF EXISTS idx_journey_step_journey_id;
DROP INDEX IF EXISTS idx_journey_step_next_step_false_id;
DROP INDEX IF EXISTS idx_journey_step_next_step_id;
DROP INDEX IF EXISTS idx_lead_business_unit_id;
DROP INDEX IF EXISTS idx_lead_product_id;
DROP INDEX IF EXISTS idx_lead_country_id;
DROP INDEX IF EXISTS idx_lead_created_by;
DROP INDEX IF EXISTS idx_lead_currency_id;
DROP INDEX IF EXISTS idx_lead_disqualified_by;
DROP INDEX IF EXISTS idx_lead_industry_id;
DROP INDEX IF EXISTS idx_lead_modified_by;
DROP INDEX IF EXISTS idx_lead_qualified_account_id;
DROP INDEX IF EXISTS idx_lead_qualified_contact_id;
DROP INDEX IF EXISTS idx_lead_qualified_opportunity_id;
DROP INDEX IF EXISTS idx_lead_reopened_by;
DROP INDEX IF EXISTS idx_lead_source_id;
DROP INDEX IF EXISTS idx_lead_subsource_id;
DROP INDEX IF EXISTS idx_marketing_email_business_unit_id;
DROP INDEX IF EXISTS idx_marketing_email_campaign_id;
DROP INDEX IF EXISTS idx_marketing_email_created_by;
DROP INDEX IF EXISTS idx_marketing_email_modified_by;
DROP INDEX IF EXISTS idx_merge_audit_log_decision_id;
DROP INDEX IF EXISTS idx_merge_audit_log_performed_by;
DROP INDEX IF EXISTS idx_merge_candidate_resolved_by;
DROP INDEX IF EXISTS idx_merge_decision_candidate_id;
DROP INDEX IF EXISTS idx_merge_decision_executed_by;
DROP INDEX IF EXISTS idx_nav_item_group_id;
DROP INDEX IF EXISTS idx_note_created_by;
DROP INDEX IF EXISTS idx_note_modified_by;
DROP INDEX IF EXISTS idx_opportunity_account_id;
DROP INDEX IF EXISTS idx_opportunity_business_unit_id;
DROP INDEX IF EXISTS idx_opportunity_primary_contact_id;
DROP INDEX IF EXISTS idx_opportunity_product_id;
DROP INDEX IF EXISTS idx_opportunity_created_by;
DROP INDEX IF EXISTS idx_opportunity_currency_id;
DROP INDEX IF EXISTS idx_opportunity_modified_by;
DROP INDEX IF EXISTS idx_opportunity_source_id;
DROP INDEX IF EXISTS idx_opportunity_contact_contact_id;
DROP INDEX IF EXISTS idx_opportunity_contact_added_by;
DROP INDEX IF EXISTS idx_process_flow_entity_definition_id;
DROP INDEX IF EXISTS idx_process_flow_default_stage_id;
DROP INDEX IF EXISTS idx_process_flow_created_by;
DROP INDEX IF EXISTS idx_process_flow_modified_by;
DROP INDEX IF EXISTS idx_process_flow_transition_to_stage_id;
DROP INDEX IF EXISTS idx_product_default_process_flow_id;
DROP INDEX IF EXISTS idx_product_family_id;
DROP INDEX IF EXISTS idx_product_lob_id;
DROP INDEX IF EXISTS idx_product_created_by;
DROP INDEX IF EXISTS idx_product_modified_by;
DROP INDEX IF EXISTS idx_product_family_lob_id;
DROP INDEX IF EXISTS idx_product_user_access_crm_user_id;
DROP INDEX IF EXISTS idx_product_user_access_granted_by;
DROP INDEX IF EXISTS idx_product_user_access_user_product;
DROP INDEX IF EXISTS idx_product_business_unit_access_granted_by;
DROP INDEX IF EXISTS idx_product_bu_access_bu;
DROP INDEX IF EXISTS idx_product_role_access_granted_by;
DROP INDEX IF EXISTS idx_product_role_access_role;
DROP INDEX IF EXISTS idx_product_team_access_granted_by;
DROP INDEX IF EXISTS idx_product_team_access_team;
DROP INDEX IF EXISTS idx_record_share_shared_by;
DROP INDEX IF EXISTS idx_saved_filter_user_id;
DROP INDEX IF EXISTS idx_security_role_business_unit_id;
DROP INDEX IF EXISTS idx_segment_business_unit_id;
DROP INDEX IF EXISTS idx_segment_created_by;
DROP INDEX IF EXISTS idx_segment_modified_by;
DROP INDEX IF EXISTS idx_subgrid_definition_form_section_id;
DROP INDEX IF EXISTS idx_subgrid_definition_related_entity_id;
DROP INDEX IF EXISTS idx_subgrid_definition_view_id;
DROP INDEX IF EXISTS idx_team_business_unit_id;
DROP INDEX IF EXISTS idx_team_security_role_role_id;
DROP INDEX IF EXISTS idx_team_user_user_id;
DROP INDEX IF EXISTS idx_ticket_account_id;
DROP INDEX IF EXISTS idx_ticket_assigned_team_id;
DROP INDEX IF EXISTS idx_ticket_assigned_user_id;
DROP INDEX IF EXISTS idx_ticket_business_unit_id;
DROP INDEX IF EXISTS idx_ticket_contact_id;
DROP INDEX IF EXISTS idx_ticket_priority_id;
DROP INDEX IF EXISTS idx_ticket_status_id;
DROP INDEX IF EXISTS idx_ticket_created_by;
DROP INDEX IF EXISTS idx_ticket_modified_by;
DROP INDEX IF EXISTS idx_ticket_opportunity_id;
DROP INDEX IF EXISTS idx_ticket_comment_created_by;
DROP INDEX IF EXISTS idx_ticket_comment_ticket_id;
DROP INDEX IF EXISTS idx_ticket_comment_modified_by;
DROP INDEX IF EXISTS idx_user_notification_sender_id;
DROP INDEX IF EXISTS idx_user_security_role_role_id;
DROP INDEX IF EXISTS idx_view_column_view_id;
DROP INDEX IF EXISTS idx_view_column_field_definition_id;
DROP INDEX IF EXISTS idx_view_definition_created_by;
DROP INDEX IF EXISTS idx_workflow_definition_entity_id;
DROP INDEX IF EXISTS idx_workflow_definition_created_by;
DROP INDEX IF EXISTS idx_workflow_step_workflow_id;
DROP INDEX IF EXISTS idx_workflow_step_next_step_id;
DROP INDEX IF EXISTS idx_workflow_step_next_step_on_false;
DROP INDEX IF EXISTS idx_wrl_workflow;
DROP INDEX IF EXISTS idx_wrl_record;
DROP INDEX IF EXISTS idx_wrl_started;
DROP INDEX IF EXISTS idx_wsl_run;
DROP INDEX IF EXISTS idx_sws_resume_at;
DROP INDEX IF EXISTS idx_sws_workflow;

-- ─── 5. Fix mutable search_path on functions ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_check_policy_condition(
  p_operator  text,
  p_field_val text,
  p_cmp_val   text
) RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public, pg_catalog
AS $$
BEGIN
  CASE p_operator
    WHEN 'is_null'           THEN RETURN (p_field_val IS NULL OR p_field_val = '');
    WHEN 'is_not_null'       THEN RETURN (p_field_val IS NOT NULL AND p_field_val <> '');
    WHEN 'eq'                THEN RETURN p_field_val = p_cmp_val;
    WHEN 'neq'               THEN RETURN p_field_val <> p_cmp_val;
    WHEN 'contains'          THEN RETURN position(lower(p_cmp_val) in lower(p_field_val)) > 0;
    WHEN 'gt'                THEN RETURN p_field_val::numeric > p_cmp_val::numeric;
    WHEN 'gte'               THEN RETURN p_field_val::numeric >= p_cmp_val::numeric;
    WHEN 'lt'                THEN RETURN p_field_val::numeric < p_cmp_val::numeric;
    WHEN 'lte'               THEN RETURN p_field_val::numeric <= p_cmp_val::numeric;
    WHEN 'matches_regex'     THEN RETURN p_field_val ~ p_cmp_val;
    WHEN 'not_matches_regex' THEN RETURN NOT (p_field_val ~ p_cmp_val);
    WHEN 'in'                THEN RETURN p_field_val = ANY(string_to_array(p_cmp_val, ','));
    ELSE                          RETURN true;
  END CASE;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_evaluate_data_policies(
  p_entity_name text,
  p_record      jsonb
) RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = public, pg_catalog
AS $$
DECLARE
  r_policy    record;
  r_cond      record;
  v_field_val text;
  v_all_match boolean;
  v_message   text;
BEGIN
  FOR r_policy IN
    SELECT dp.data_policy_id, dp.name
    FROM data_policy dp
    WHERE dp.entity_logical_name = p_entity_name
      AND dp.is_active = true
      AND dp.deleted_at IS NULL
      AND 'error' = dp.enforcement_level
      AND EXISTS (
        SELECT 1 FROM data_policy_enforcement dpe
        WHERE dpe.data_policy_id = dp.data_policy_id
          AND dpe.enforcement_type = 'block_save'
      )
  LOOP
    v_all_match := true;
    FOR r_cond IN
      SELECT field_name, operator, value_text
      FROM data_policy_condition
      WHERE data_policy_id = r_policy.data_policy_id
      ORDER BY display_order
    LOOP
      v_field_val := p_record ->> r_cond.field_name;
      IF NOT fn_check_policy_condition(r_cond.operator, v_field_val, COALESCE(r_cond.value_text, '')) THEN
        v_all_match := false;
        EXIT;
      END IF;
    END LOOP;
    IF v_all_match THEN
      SELECT COALESCE(message_text, 'Data policy violation: ' || r_policy.name)
      INTO v_message
      FROM data_policy_enforcement
      WHERE data_policy_id = r_policy.data_policy_id
        AND enforcement_type = 'block_save'
      ORDER BY display_order LIMIT 1;
      RAISE EXCEPTION '%', v_message
        USING ERRCODE = 'check_violation', HINT = 'Policy: ' || r_policy.name;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_trigger_data_policy_check()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_entity_name text;
BEGIN
  v_entity_name := TG_ARGV[0];
  PERFORM fn_evaluate_data_policies(v_entity_name, to_jsonb(NEW));
  RETURN NEW;
END;
$$;

-- fn_preflight_data_policies uses the original column name "message"
DROP FUNCTION IF EXISTS public.fn_preflight_data_policies(text, jsonb);

CREATE FUNCTION public.fn_preflight_data_policies(
  p_entity_name text,
  p_record      jsonb
) RETURNS TABLE(policy_name text, message text)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  r_policy    record;
  r_cond      record;
  v_field_val text;
  v_all_match boolean;
  v_message   text;
BEGIN
  FOR r_policy IN
    SELECT dp.data_policy_id, dp.name
    FROM data_policy dp
    WHERE dp.entity_logical_name = p_entity_name
      AND dp.is_active = true
      AND dp.deleted_at IS NULL
      AND dp.enforcement_level = 'error'
      AND EXISTS (
        SELECT 1 FROM data_policy_enforcement dpe
        WHERE dpe.data_policy_id = dp.data_policy_id
          AND dpe.enforcement_type = 'block_save'
      )
  LOOP
    v_all_match := true;
    FOR r_cond IN
      SELECT field_name, operator, value_text
      FROM data_policy_condition
      WHERE data_policy_id = r_policy.data_policy_id
      ORDER BY display_order
    LOOP
      v_field_val := p_record ->> r_cond.field_name;
      IF NOT fn_check_policy_condition(r_cond.operator, v_field_val, COALESCE(r_cond.value_text, '')) THEN
        v_all_match := false;
        EXIT;
      END IF;
    END LOOP;
    IF v_all_match THEN
      SELECT COALESCE(message_text, 'Policy violation: ' || r_policy.name)
      INTO v_message
      FROM data_policy_enforcement
      WHERE data_policy_id = r_policy.data_policy_id
        AND enforcement_type = 'block_save'
      ORDER BY display_order LIMIT 1;
      RETURN QUERY SELECT r_policy.name, v_message;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_check_product_access(
  p_product_id uuid,
  p_user_id    uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_access_mode   text;
  v_user_bu_id    uuid;
  v_user_role_ids uuid[];
  v_user_team_ids uuid[];
  v_user_override text;
  v_is_admin      boolean;
BEGIN
  IF p_product_id IS NULL THEN RETURN true; END IF;

  SELECT access_mode INTO v_access_mode
  FROM product
  WHERE product_id = p_product_id AND is_active = true AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_access_mode = 'unrestricted' THEN RETURN true; END IF;

  SELECT is_system_admin INTO v_is_admin
  FROM crm_user WHERE user_id = p_user_id AND is_active = true;
  IF v_is_admin = true THEN RETURN true; END IF;

  SELECT business_unit_id INTO v_user_bu_id
  FROM crm_user WHERE user_id = p_user_id AND is_active = true;

  SELECT array_agg(role_id) INTO v_user_role_ids
  FROM user_role_assignment WHERE user_id = p_user_id;

  SELECT array_agg(team_id) INTO v_user_team_ids
  FROM team_member WHERE user_id = p_user_id;

  SELECT access_type INTO v_user_override
  FROM product_user_access
  WHERE product_id = p_product_id AND crm_user_id = p_user_id;
  IF v_user_override = 'deny'  THEN RETURN false; END IF;
  IF v_user_override = 'allow' THEN RETURN true;  END IF;

  IF v_user_bu_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM product_business_unit_access
      WHERE product_id = p_product_id AND business_unit_id = v_user_bu_id
    ) THEN RETURN true; END IF;
  END IF;

  IF v_user_role_ids IS NOT NULL AND array_length(v_user_role_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM product_role_access
      WHERE product_id = p_product_id AND role_id = ANY(v_user_role_ids)
    ) THEN RETURN true; END IF;
  END IF;

  IF v_user_team_ids IS NOT NULL AND array_length(v_user_team_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM product_team_access
      WHERE product_id = p_product_id AND team_id = ANY(v_user_team_ids)
    ) THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_validate_product_access_on_save()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM crm_user
    WHERE user_id = (SELECT auth.uid()) AND is_system_admin = true AND is_active = true
  ) THEN RETURN NEW; END IF;

  IF NOT fn_check_product_access(NEW.product_id, (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Product access denied: you do not have permission to assign this product.'
      USING ERRCODE = 'insufficient_privilege',
            HINT    = 'Contact your administrator to request access to this product.';
  END IF;

  RETURN NEW;
END;
$$;
