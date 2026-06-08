/*
  # Fix Duplicate Policies, Unused Indexes, Mutable Search Path, and Other Issues

  ## Summary

  1. Consolidate duplicate permissive policies on multiple tables
  2. Drop all unused indexes to reduce write overhead and storage
  3. Fix mutable search_path on functions sync_stage_is_terminal and increment_workflow_run_count
  4. Drop duplicate recent_items index

  ## Duplicate Policy Fixes
  - business_rule: merge two DELETE policies into one
  - role_privilege: merge duplicate INSERT/UPDATE/DELETE policies
  - team_security_role: merge duplicate INSERT/DELETE policies
  - team_user: merge duplicate INSERT/DELETE policies
  - user_security_role: merge duplicate INSERT/DELETE policies
  - workflow_definition: merge two DELETE policies
  - workflow_step: merge two DELETE policies
*/

-- ─── business_rule: remove duplicate DELETE ───────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can delete business rules" ON business_rule;

-- ─── role_privilege: remove duplicates ───────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can delete privileges" ON role_privilege;
DROP POLICY IF EXISTS "Authenticated users can insert privileges" ON role_privilege;
DROP POLICY IF EXISTS "Authenticated users can update privileges" ON role_privilege;

-- ─── team_security_role: remove duplicates ───────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can delete team role assignments" ON team_security_role;
DROP POLICY IF EXISTS "Authenticated users can insert team role assignments" ON team_security_role;

-- ─── team_user: remove duplicates ────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can delete team members" ON team_user;
DROP POLICY IF EXISTS "Authenticated users can insert team members" ON team_user;

-- ─── user_security_role: remove duplicates ───────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can delete user role assignments" ON user_security_role;
DROP POLICY IF EXISTS "Authenticated users can insert user role assignments" ON user_security_role;

-- ─── workflow_definition: remove duplicate DELETE ────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can delete workflow definitions" ON workflow_definition;

-- ─── workflow_step: remove duplicate DELETE ───────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can delete workflow steps" ON workflow_step;

-- ─── Drop duplicate recent_items index ───────────────────────────────────────

DROP INDEX IF EXISTS recent_items_user_viewed;

-- ─── Fix mutable search_path functions ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_stage_is_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.is_terminal := (
    SELECT COALESCE(
      (SELECT s.is_terminal FROM process_stage s WHERE s.stage_id = NEW.current_stage_id),
      false
    )
  );
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.increment_workflow_run_count(uuid);
CREATE FUNCTION public.increment_workflow_run_count(wf_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE workflow_definition
  SET run_count = COALESCE(run_count, 0) + 1
  WHERE workflow_id = wf_id;
END;
$$;

-- ─── Drop unused indexes ──────────────────────────────────────────────────────

DROP INDEX IF EXISTS field_change_log_record_idx;
DROP INDEX IF EXISTS idx_process_stage_category;
DROP INDEX IF EXISTS idx_process_stage_is_terminal;
DROP INDEX IF EXISTS idx_dup_rule_entity;
DROP INDEX IF EXISTS idx_dup_job_rule;
DROP INDEX IF EXISTS idx_dup_job_status;
DROP INDEX IF EXISTS idx_business_unit_organization;
DROP INDEX IF EXISTS idx_business_unit_parent;
DROP INDEX IF EXISTS idx_crm_user_business_unit;
DROP INDEX IF EXISTS idx_crm_user_email;
DROP INDEX IF EXISTS idx_team_business_unit;
DROP INDEX IF EXISTS idx_lead_qual_mapping_rule;
DROP INDEX IF EXISTS idx_team_user_team;
DROP INDEX IF EXISTS idx_team_user_user;
DROP INDEX IF EXISTS idx_security_role_business_unit;
DROP INDEX IF EXISTS idx_user_security_role_user;
DROP INDEX IF EXISTS idx_user_security_role_role;
DROP INDEX IF EXISTS idx_team_security_role_team;
DROP INDEX IF EXISTS idx_team_security_role_role;
DROP INDEX IF EXISTS idx_role_privilege_role;
DROP INDEX IF EXISTS idx_role_privilege_entity;
DROP INDEX IF EXISTS idx_record_share_record;
DROP INDEX IF EXISTS idx_record_share_principal;
DROP INDEX IF EXISTS idx_record_share_shared_by;
DROP INDEX IF EXISTS idx_field_definition_type;
DROP INDEX IF EXISTS idx_form_section_form;
DROP INDEX IF EXISTS idx_form_control_section;
DROP INDEX IF EXISTS idx_form_control_field;
DROP INDEX IF EXISTS idx_view_column_view;
DROP INDEX IF EXISTS idx_subgrid_section;
DROP INDEX IF EXISTS idx_subgrid_entity;
DROP INDEX IF EXISTS idx_workflow_definition_entity;
DROP INDEX IF EXISTS idx_workflow_step_workflow;
DROP INDEX IF EXISTS idx_contact_subsource_source;
DROP INDEX IF EXISTS idx_account_owner;
DROP INDEX IF EXISTS idx_account_business_unit;
DROP INDEX IF EXISTS idx_account_industry;
DROP INDEX IF EXISTS idx_account_country;
DROP INDEX IF EXISTS idx_account_status;
DROP INDEX IF EXISTS idx_account_name;
DROP INDEX IF EXISTS idx_contact_owner;
DROP INDEX IF EXISTS idx_data_policy_entity;
DROP INDEX IF EXISTS idx_opportunity_account;
DROP INDEX IF EXISTS idx_opportunity_contact;
DROP INDEX IF EXISTS idx_opportunity_owner;
DROP INDEX IF EXISTS idx_opportunity_business_unit;
DROP INDEX IF EXISTS idx_opportunity_stage;
DROP INDEX IF EXISTS idx_opportunity_status;
DROP INDEX IF EXISTS idx_ticket_account;
DROP INDEX IF EXISTS idx_ticket_contact;
DROP INDEX IF EXISTS idx_ticket_priority;
DROP INDEX IF EXISTS idx_ticket_status;
DROP INDEX IF EXISTS idx_ticket_owner;
DROP INDEX IF EXISTS idx_ticket_business_unit;
DROP INDEX IF EXISTS idx_ticket_assigned_user;
DROP INDEX IF EXISTS idx_ticket_assigned_team;
DROP INDEX IF EXISTS idx_ticket_is_deleted;
DROP INDEX IF EXISTS idx_ticket_number;
DROP INDEX IF EXISTS idx_campaign_owner;
DROP INDEX IF EXISTS idx_campaign_business_unit;
DROP INDEX IF EXISTS idx_ticket_comment_ticket;
DROP INDEX IF EXISTS idx_ticket_comment_created_by;
DROP INDEX IF EXISTS idx_ticket_comment_is_deleted;
DROP INDEX IF EXISTS idx_campaign_status;
DROP INDEX IF EXISTS idx_campaign_is_deleted;
DROP INDEX IF EXISTS idx_event_campaign;
DROP INDEX IF EXISTS idx_event_owner;
DROP INDEX IF EXISTS idx_event_business_unit;
DROP INDEX IF EXISTS idx_event_is_deleted;
DROP INDEX IF EXISTS idx_marketing_email_campaign;
DROP INDEX IF EXISTS idx_marketing_email_owner;
DROP INDEX IF EXISTS idx_marketing_email_business_unit;
DROP INDEX IF EXISTS idx_marketing_email_is_deleted;
DROP INDEX IF EXISTS idx_segment_owner;
DROP INDEX IF EXISTS idx_segment_business_unit;
DROP INDEX IF EXISTS idx_segment_is_deleted;
DROP INDEX IF EXISTS currency_audit_log_field_idx;
DROP INDEX IF EXISTS currency_audit_log_source_idx;
DROP INDEX IF EXISTS idx_data_policy_condition_policy;
DROP INDEX IF EXISTS idx_journey_segment;
DROP INDEX IF EXISTS idx_journey_campaign;
DROP INDEX IF EXISTS idx_journey_owner;
DROP INDEX IF EXISTS idx_journey_business_unit;
DROP INDEX IF EXISTS idx_journey_is_deleted;
DROP INDEX IF EXISTS idx_audit_log_record;
DROP INDEX IF EXISTS idx_audit_log_changed_by;
DROP INDEX IF EXISTS idx_journey_step_journey;
DROP INDEX IF EXISTS idx_audit_log_changed_at;
DROP INDEX IF EXISTS idx_audit_log_action;
DROP INDEX IF EXISTS idx_campaign_member_campaign;
DROP INDEX IF EXISTS idx_campaign_member_member;
DROP INDEX IF EXISTS idx_data_policy_enforcement_policy;
DROP INDEX IF EXISTS idx_note_record;
DROP INDEX IF EXISTS idx_note_created_by;
DROP INDEX IF EXISTS idx_note_is_deleted;
DROP INDEX IF EXISTS idx_attachment_record;
DROP INDEX IF EXISTS idx_attachment_created_by;
DROP INDEX IF EXISTS idx_attachment_is_deleted;
DROP INDEX IF EXISTS idx_entity_definition_deleted;
DROP INDEX IF EXISTS idx_field_definition_deleted;
DROP INDEX IF EXISTS idx_form_tab_form_id;
DROP INDEX IF EXISTS idx_form_script_form_id;
DROP INDEX IF EXISTS idx_form_event_form_id;
DROP INDEX IF EXISTS idx_nav_group_area;
DROP INDEX IF EXISTS idx_nav_item_group;
DROP INDEX IF EXISTS idx_activity_log_regarding;
DROP INDEX IF EXISTS idx_activity_log_owner;
DROP INDEX IF EXISTS idx_activity_log_type;
DROP INDEX IF EXISTS idx_field_permission_entity;
DROP INDEX IF EXISTS idx_section_permission_entity;
DROP INDEX IF EXISTS saved_filter_user_entity_idx;
DROP INDEX IF EXISTS idx_activity_log_pinned;
DROP INDEX IF EXISTS idx_action_permission_entity;
DROP INDEX IF EXISTS idx_user_notification_unread;
DROP INDEX IF EXISTS idx_opp_contact_contact;
DROP INDEX IF EXISTS idx_merge_candidate_entity_status;
DROP INDEX IF EXISTS idx_merge_decision_candidate;
DROP INDEX IF EXISTS idx_merge_audit_log_decision;
DROP INDEX IF EXISTS idx_merge_audit_log_created;
DROP INDEX IF EXISTS idx_product_bu_access_product;
DROP INDEX IF EXISTS idx_product_role_access_product;
DROP INDEX IF EXISTS idx_product_team_access_product;
DROP INDEX IF EXISTS idx_product_user_access_product;
DROP INDEX IF EXISTS idx_product_user_access_user;
DROP INDEX IF EXISTS idx_opportunity_product_id;
DROP INDEX IF EXISTS idx_lead_product_id;
DROP INDEX IF EXISTS idx_process_flow_entity;
DROP INDEX IF EXISTS idx_process_stage_flow;
DROP INDEX IF EXISTS idx_process_transition_from;
DROP INDEX IF EXISTS idx_contact_business_unit;
DROP INDEX IF EXISTS idx_contact_email;
DROP INDEX IF EXISTS idx_lead_owner;
DROP INDEX IF EXISTS idx_lead_business_unit;
DROP INDEX IF EXISTS idx_lead_status;
DROP INDEX IF EXISTS idx_lead_is_qualified;
DROP INDEX IF EXISTS idx_lead_email;
DROP INDEX IF EXISTS idx_lob_order;
DROP INDEX IF EXISTS idx_family_lob;
DROP INDEX IF EXISTS idx_product_lob;
DROP INDEX IF EXISTS idx_product_family;
DROP INDEX IF EXISTS idx_product_flow;
