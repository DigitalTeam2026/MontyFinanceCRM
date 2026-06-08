/*
  # Fix INSERT policies to use security.is_system_admin()

  1. Problem
    - The previous migration revoked EXECUTE on public.is_system_admin() from authenticated users
    - 62 INSERT policies call is_system_admin() without the security. prefix
    - These resolve to the public schema version, which authenticated users can no longer call
    - This causes 403 errors on any table with these INSERT policies

  2. Fix
    - Drop and recreate all affected INSERT policies using security.is_system_admin()
    - Also fix 1 policy using get_current_user_is_admin() -> security.get_current_user_is_admin()
    - No data changes, only policy definitions

  3. Affected Tables (62 policies across these tables)
    - action_permission, approval_condition, approval_process, approval_step
    - business_unit, column_security_profile, column_security_profile_assignment
    - column_security_profile_field, contact_source, contact_subsource, country
    - crm_user, currency, dashboard_role_assignment, dashboard_widget
    - data_policy, data_policy_condition, data_policy_enforcement
    - duplicate_detection_rule, duplicate_job, entity_definition, field_definition
    - field_permission, field_type, form_control, form_definition
    - form_event_handler, form_script, form_section, form_tab
    - lead_qualification_rule, line_of_business, nav_area, nav_group, nav_item
    - organization, process_flow_assignment_rule, process_flow_entity_config
    - process_flow_instance, process_flow_stage_history, process_flow_transition
    - process_stage_actions, process_stage_fields, process_stage_step
    - product, product_family, relationship_definition, role_privilege
    - section_permission, security_role, statecode_definition, status_reason_definition
    - subgrid_definition, team, team_security_role, team_user
    - ticket_priority, ticket_status, user_security_role
    - workflow_definition, workflow_run_log, workflow_step
*/

-- ============================================================
-- Group 1: Simple policies — WITH CHECK (is_system_admin())
-- ============================================================

-- action_permission
DROP POLICY IF EXISTS "System admins can insert action permissions" ON action_permission;
CREATE POLICY "System admins can insert action permissions" ON action_permission
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- approval_condition
DROP POLICY IF EXISTS "System admins can insert approval conditions" ON approval_condition;
CREATE POLICY "System admins can insert approval conditions" ON approval_condition
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- approval_process
DROP POLICY IF EXISTS "System admins can insert approval processes" ON approval_process;
CREATE POLICY "System admins can insert approval processes" ON approval_process
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- approval_step
DROP POLICY IF EXISTS "System admins can insert approval steps" ON approval_step;
CREATE POLICY "System admins can insert approval steps" ON approval_step
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- business_unit
DROP POLICY IF EXISTS "System admins can insert business units" ON business_unit;
CREATE POLICY "System admins can insert business units" ON business_unit
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- column_security_profile
DROP POLICY IF EXISTS "Admins can insert column security profiles" ON column_security_profile;
CREATE POLICY "Admins can insert column security profiles" ON column_security_profile
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- column_security_profile_assignment
DROP POLICY IF EXISTS "Admins can insert column security profile assignments" ON column_security_profile_assignment;
CREATE POLICY "Admins can insert column security profile assignments" ON column_security_profile_assignment
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- column_security_profile_field
DROP POLICY IF EXISTS "Admins can insert column security profile fields" ON column_security_profile_field;
CREATE POLICY "Admins can insert column security profile fields" ON column_security_profile_field
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- contact_source
DROP POLICY IF EXISTS "System admins can insert contact sources" ON contact_source;
CREATE POLICY "System admins can insert contact sources" ON contact_source
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- contact_subsource
DROP POLICY IF EXISTS "System admins can insert contact subsources" ON contact_subsource;
CREATE POLICY "System admins can insert contact subsources" ON contact_subsource
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- country
DROP POLICY IF EXISTS "System admins can insert countries" ON country;
CREATE POLICY "System admins can insert countries" ON country
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- currency
DROP POLICY IF EXISTS "System admins can insert currencies" ON currency;
CREATE POLICY "System admins can insert currencies" ON currency
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- dashboard_role_assignment
DROP POLICY IF EXISTS "System admins can manage role assignments" ON dashboard_role_assignment;
CREATE POLICY "System admins can manage role assignments" ON dashboard_role_assignment
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- data_policy
DROP POLICY IF EXISTS "System admins can insert data policies" ON data_policy;
CREATE POLICY "System admins can insert data policies" ON data_policy
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- data_policy_condition
DROP POLICY IF EXISTS "System admins can insert policy conditions" ON data_policy_condition;
CREATE POLICY "System admins can insert policy conditions" ON data_policy_condition
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- data_policy_enforcement
DROP POLICY IF EXISTS "System admins can insert policy enforcements" ON data_policy_enforcement;
CREATE POLICY "System admins can insert policy enforcements" ON data_policy_enforcement
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- duplicate_detection_rule
DROP POLICY IF EXISTS "System admins can insert duplicate rules" ON duplicate_detection_rule;
CREATE POLICY "System admins can insert duplicate rules" ON duplicate_detection_rule
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- duplicate_job
DROP POLICY IF EXISTS "System admins can insert duplicate jobs" ON duplicate_job;
CREATE POLICY "System admins can insert duplicate jobs" ON duplicate_job
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- entity_definition
DROP POLICY IF EXISTS "System admins can insert entity definitions" ON entity_definition;
CREATE POLICY "System admins can insert entity definitions" ON entity_definition
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- field_definition
DROP POLICY IF EXISTS "System admins can insert field definitions" ON field_definition;
CREATE POLICY "System admins can insert field definitions" ON field_definition
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- field_permission
DROP POLICY IF EXISTS "System admins can insert field permissions" ON field_permission;
CREATE POLICY "System admins can insert field permissions" ON field_permission
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- field_type
DROP POLICY IF EXISTS "System admins can insert field types" ON field_type;
CREATE POLICY "System admins can insert field types" ON field_type
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- form_control
DROP POLICY IF EXISTS "System admins can insert form controls" ON form_control;
CREATE POLICY "System admins can insert form controls" ON form_control
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- form_definition
DROP POLICY IF EXISTS "System admins can insert form definitions" ON form_definition;
CREATE POLICY "System admins can insert form definitions" ON form_definition
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- form_event_handler
DROP POLICY IF EXISTS "System admins can insert form_event_handler" ON form_event_handler;
CREATE POLICY "System admins can insert form_event_handler" ON form_event_handler
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- form_script
DROP POLICY IF EXISTS "System admins can insert form_script" ON form_script;
CREATE POLICY "System admins can insert form_script" ON form_script
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- form_section
DROP POLICY IF EXISTS "System admins can insert form sections" ON form_section;
CREATE POLICY "System admins can insert form sections" ON form_section
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- form_tab
DROP POLICY IF EXISTS "System admins can insert form_tab" ON form_tab;
CREATE POLICY "System admins can insert form_tab" ON form_tab
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- lead_qualification_rule
DROP POLICY IF EXISTS "System admins can insert qualification rules" ON lead_qualification_rule;
CREATE POLICY "System admins can insert qualification rules" ON lead_qualification_rule
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- line_of_business
DROP POLICY IF EXISTS "Admins can insert lines of business" ON line_of_business;
CREATE POLICY "Admins can insert lines of business" ON line_of_business
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- nav_area
DROP POLICY IF EXISTS "System admins can insert nav areas" ON nav_area;
CREATE POLICY "System admins can insert nav areas" ON nav_area
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- nav_group
DROP POLICY IF EXISTS "System admins can insert nav groups" ON nav_group;
CREATE POLICY "System admins can insert nav groups" ON nav_group
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- nav_item
DROP POLICY IF EXISTS "System admins can insert nav items" ON nav_item;
CREATE POLICY "System admins can insert nav items" ON nav_item
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- organization
DROP POLICY IF EXISTS "System admins can insert organizations" ON organization;
CREATE POLICY "System admins can insert organizations" ON organization
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- process_flow_assignment_rule
DROP POLICY IF EXISTS "Admins can insert assignment rules" ON process_flow_assignment_rule;
CREATE POLICY "Admins can insert assignment rules" ON process_flow_assignment_rule
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- process_flow_entity_config
DROP POLICY IF EXISTS "System admins can insert entity configs" ON process_flow_entity_config;
CREATE POLICY "System admins can insert entity configs" ON process_flow_entity_config
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- process_flow_transition
DROP POLICY IF EXISTS "Admins can insert process transitions" ON process_flow_transition;
CREATE POLICY "Admins can insert process transitions" ON process_flow_transition
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- process_stage_actions
DROP POLICY IF EXISTS "Admins can insert stage actions" ON process_stage_actions;
CREATE POLICY "Admins can insert stage actions" ON process_stage_actions
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- process_stage_fields
DROP POLICY IF EXISTS "Admins can insert stage fields" ON process_stage_fields;
CREATE POLICY "Admins can insert stage fields" ON process_stage_fields
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- process_stage_step
DROP POLICY IF EXISTS "Admins can insert stage steps" ON process_stage_step;
CREATE POLICY "Admins can insert stage steps" ON process_stage_step
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- product
DROP POLICY IF EXISTS "Admins can insert products" ON product;
CREATE POLICY "Admins can insert products" ON product
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- product_family
DROP POLICY IF EXISTS "Admins can insert product families" ON product_family;
CREATE POLICY "Admins can insert product families" ON product_family
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- relationship_definition
DROP POLICY IF EXISTS "System admins can insert relationship definitions" ON relationship_definition;
CREATE POLICY "System admins can insert relationship definitions" ON relationship_definition
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- role_privilege
DROP POLICY IF EXISTS "System admins can insert role privileges" ON role_privilege;
CREATE POLICY "System admins can insert role privileges" ON role_privilege
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- section_permission
DROP POLICY IF EXISTS "System admins can insert section permissions" ON section_permission;
CREATE POLICY "System admins can insert section permissions" ON section_permission
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- security_role
DROP POLICY IF EXISTS "System admins can insert security roles" ON security_role;
CREATE POLICY "System admins can insert security roles" ON security_role
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- statecode_definition
DROP POLICY IF EXISTS "Admins can insert statecodes" ON statecode_definition;
CREATE POLICY "Admins can insert statecodes" ON statecode_definition
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- status_reason_definition
DROP POLICY IF EXISTS "Admins can insert status reasons" ON status_reason_definition;
CREATE POLICY "Admins can insert status reasons" ON status_reason_definition
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- subgrid_definition
DROP POLICY IF EXISTS "System admins can insert subgrid definitions" ON subgrid_definition;
CREATE POLICY "System admins can insert subgrid definitions" ON subgrid_definition
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- team
DROP POLICY IF EXISTS "System admins can insert teams" ON team;
CREATE POLICY "System admins can insert teams" ON team
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- team_security_role
DROP POLICY IF EXISTS "System admins can insert team roles" ON team_security_role;
CREATE POLICY "System admins can insert team roles" ON team_security_role
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- team_user
DROP POLICY IF EXISTS "System admins can insert team memberships" ON team_user;
CREATE POLICY "System admins can insert team memberships" ON team_user
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- ticket_priority
DROP POLICY IF EXISTS "System admins can insert ticket priorities" ON ticket_priority;
CREATE POLICY "System admins can insert ticket priorities" ON ticket_priority
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- ticket_status
DROP POLICY IF EXISTS "System admins can insert ticket statuses" ON ticket_status;
CREATE POLICY "System admins can insert ticket statuses" ON ticket_status
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- user_security_role
DROP POLICY IF EXISTS "System admins can insert user roles" ON user_security_role;
CREATE POLICY "System admins can insert user roles" ON user_security_role
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- workflow_definition
DROP POLICY IF EXISTS "System admins can insert workflow definitions" ON workflow_definition;
CREATE POLICY "System admins can insert workflow definitions" ON workflow_definition
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- workflow_step
DROP POLICY IF EXISTS "System admins can insert workflow steps" ON workflow_step;
CREATE POLICY "System admins can insert workflow steps" ON workflow_step
  FOR INSERT TO authenticated WITH CHECK (security.is_system_admin());

-- ============================================================
-- Group 2: Compound policies — WITH CHECK includes is_system_admin() in subexpression
-- ============================================================

-- crm_user: ((user_id = auth.uid()) OR get_current_user_is_admin())
DROP POLICY IF EXISTS "Users can insert own profile or admins can insert any" ON crm_user;
CREATE POLICY "Users can insert own profile or admins can insert any" ON crm_user
  FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()) OR security.get_current_user_is_admin());

-- dashboard_widget: (EXISTS (SELECT 1 FROM dashboard d WHERE d.dashboard_id = dashboard_widget.dashboard_id AND (d.created_by = auth.uid() OR is_system_admin())))
DROP POLICY IF EXISTS "Authenticated users can insert widgets" ON dashboard_widget;
CREATE POLICY "Authenticated users can insert widgets" ON dashboard_widget
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dashboard d
      WHERE d.dashboard_id = dashboard_widget.dashboard_id
        AND (d.created_by = auth.uid() OR security.is_system_admin())
    )
  );

-- process_flow_instance: ((created_by = auth.uid()) OR is_system_admin())
DROP POLICY IF EXISTS "Authenticated users can insert process flow instances" ON process_flow_instance;
CREATE POLICY "Authenticated users can insert process flow instances" ON process_flow_instance
  FOR INSERT TO authenticated
  WITH CHECK ((created_by = auth.uid()) OR security.is_system_admin());

-- process_flow_stage_history: ((moved_by = auth.uid()) OR is_system_admin())
DROP POLICY IF EXISTS "Authenticated users can insert stage history" ON process_flow_stage_history;
CREATE POLICY "Authenticated users can insert stage history" ON process_flow_stage_history
  FOR INSERT TO authenticated
  WITH CHECK ((moved_by = auth.uid()) OR security.is_system_admin());

-- workflow_run_log: ((started_by = auth.uid()) OR is_system_admin())
DROP POLICY IF EXISTS "Users can insert their own run logs" ON workflow_run_log;
CREATE POLICY "Users can insert their own run logs" ON workflow_run_log
  FOR INSERT TO authenticated
  WITH CHECK ((started_by = auth.uid()) OR security.is_system_admin());
