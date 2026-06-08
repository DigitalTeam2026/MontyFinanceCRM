/*
  # Add created_by and modified_by columns to all tables

  1. Changes
    - Adds `created_by` (uuid, nullable, references auth.users) to every public table that lacks it
    - Adds `modified_by` (uuid, nullable, references auth.users) to every public table that lacks it
    - Both columns default to `auth.uid()` so they are automatically populated
    - These are system-level audit columns for tracking record ownership

  2. Tables receiving created_by (was missing)
    - action_permission, activity_log, admin_grid_column_pref,
      approval_condition, approval_process, approval_step,
      audit_log, business_unit, campaign_member,
      column_security_profile, column_security_profile_assignment,
      column_security_profile_field, contact_source, contact_subsource,
      country, crm_user, currency, currency_audit_log,
      dashboard_role_assignment, dashboard_widget,
      data_policy, data_policy_condition, data_policy_enforcement,
      digital_rule_action, digital_rule_condition, digital_rule_execution_log,
      duplicate_detection_rule, duplicate_job,
      entity_definition, field_change_log, field_definition, field_permission,
      field_type, form_control, form_definition, form_event_handler,
      form_script, form_section, form_tab,
      journey_step, lead_qualification_field_mapping, lead_qualification_rule,
      line_of_business, merge_audit_log, merge_candidate, merge_decision,
      nav_area, nav_group, nav_item,
      opportunity_contact, organization, pinned_records,
      process_flow_entity_config, process_flow_stage_history,
      process_flow_transition, process_stage, process_stage_actions,
      process_stage_fields, process_stage_history, process_stage_step,
      product_business_unit_access, product_role_access,
      product_team_access, product_user_access,
      recent_items, record_share, relationship_definition,
      role_privilege, saved_filter, scheduled_workflow_step,
      section_permission, security_role,
      statecode_definition, status_reason_definition,
      subgrid_definition, team, team_security_role, team_user,
      test_entity, ticket_priority, ticket_status,
      user_notification, user_security_role,
      view_column, workflow_run_log, workflow_step, workflow_step_log

  3. Tables receiving modified_by only (already had created_by)
    - attachment, dashboard, digital_rule,
      process_flow_assignment_rule, process_flow_instance,
      process_instances, view_definition, view_sharing, workflow_definition

  4. Important Notes
    - Uses IF NOT EXISTS checks to be idempotent
    - Columns are nullable so existing rows are unaffected
    - Default is auth.uid() so new inserts auto-populate
*/

-- ============================================================
-- Helper: adds created_by and/or modified_by if missing
-- ============================================================

DO $$ 
DECLARE
  tbl TEXT;
  -- Tables that need BOTH created_by AND modified_by
  tables_need_both TEXT[] := ARRAY[
    'action_permission', 'activity_log', 'admin_grid_column_pref',
    'approval_condition', 'approval_process', 'approval_step',
    'audit_log', 'business_unit', 'campaign_member',
    'column_security_profile', 'column_security_profile_assignment',
    'column_security_profile_field', 'contact_source', 'contact_subsource',
    'country', 'crm_user', 'currency', 'currency_audit_log',
    'dashboard_role_assignment', 'dashboard_widget',
    'data_policy', 'data_policy_condition', 'data_policy_enforcement',
    'digital_rule_action', 'digital_rule_condition', 'digital_rule_execution_log',
    'duplicate_detection_rule', 'duplicate_job',
    'entity_definition', 'field_change_log', 'field_definition', 'field_permission',
    'field_type', 'form_control', 'form_definition', 'form_event_handler',
    'form_script', 'form_section', 'form_tab',
    'journey_step', 'lead_qualification_field_mapping', 'lead_qualification_rule',
    'line_of_business', 'merge_audit_log', 'merge_candidate', 'merge_decision',
    'nav_area', 'nav_group', 'nav_item',
    'opportunity_contact', 'organization', 'pinned_records',
    'process_flow_entity_config', 'process_flow_stage_history',
    'process_flow_transition', 'process_stage', 'process_stage_actions',
    'process_stage_fields', 'process_stage_history', 'process_stage_step',
    'product_business_unit_access', 'product_role_access',
    'product_team_access', 'product_user_access',
    'recent_items', 'record_share', 'relationship_definition',
    'role_privilege', 'saved_filter', 'scheduled_workflow_step',
    'section_permission', 'security_role',
    'statecode_definition', 'status_reason_definition',
    'subgrid_definition', 'team', 'team_security_role', 'team_user',
    'test_entity', 'ticket_priority', 'ticket_status',
    'user_notification', 'user_security_role',
    'view_column', 'workflow_run_log', 'workflow_step', 'workflow_step_log'
  ];

  -- Tables that already have created_by but need modified_by
  tables_need_modified_only TEXT[] := ARRAY[
    'attachment', 'dashboard', 'digital_rule',
    'process_flow_assignment_rule', 'process_flow_instance',
    'process_instances', 'view_definition', 'view_sharing', 'workflow_definition'
  ];

  -- Tables that already have both (need modified_by only to be safe)
  tables_already_have_both TEXT[] := ARRAY[
    'account', 'business_rule', 'campaign', 'contact', 'crm_sources',
    'event', 'industry', 'journey', 'lead', 'marketing_email',
    'note', 'opportunity', 'process_flow', 'product', 'product_family',
    'segment', 'ticket', 'ticket_comment'
  ];

BEGIN
  -- Add BOTH columns to tables missing both
  FOREACH tbl IN ARRAY tables_need_both LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'created_by'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN created_by uuid DEFAULT auth.uid()',
        tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'modified_by'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN modified_by uuid DEFAULT auth.uid()',
        tbl
      );
    END IF;
  END LOOP;

  -- Add modified_by only to tables that already have created_by
  FOREACH tbl IN ARRAY tables_need_modified_only LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'modified_by'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN modified_by uuid DEFAULT auth.uid()',
        tbl
      );
    END IF;
  END LOOP;

  -- Safety: ensure tables_already_have_both also have modified_by
  FOREACH tbl IN ARRAY tables_already_have_both LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'modified_by'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN modified_by uuid DEFAULT auth.uid()',
        tbl
      );
    END IF;
  END LOOP;
END $$;
