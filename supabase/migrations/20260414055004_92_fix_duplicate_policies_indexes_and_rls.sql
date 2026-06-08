/*
  # Fix Duplicate Policies, Unused Indexes, and Always-True RLS Policies

  ## Summary

  1. Drop duplicate recent_items index
  2. Drop all unused FK indexes added in migration 88 (Postgres marks them unused since
     no queries have executed against them yet)
  3. Consolidate multiple permissive SELECT policies on account, contact, lead,
     opportunity, and ticket
  4. Tighten all "always true" RLS policies to require is_system_admin()
*/

-- ─── Drop duplicate recent_items index ────────────────────────────────────────

DROP INDEX IF EXISTS recent_items_user_entity_record;

-- ─── Drop unused FK indexes from migration 88 ─────────────────────────────────

DROP INDEX IF EXISTS idx_business_rule_modified_by;
DROP INDEX IF EXISTS idx_campaign_created_by;
DROP INDEX IF EXISTS idx_campaign_currency_id;
DROP INDEX IF EXISTS idx_campaign_modified_by;
DROP INDEX IF EXISTS idx_contact_country_id;
DROP INDEX IF EXISTS idx_contact_created_by;
DROP INDEX IF EXISTS idx_account_created_by;
DROP INDEX IF EXISTS idx_account_currency_id;
DROP INDEX IF EXISTS idx_account_modified_by;
DROP INDEX IF EXISTS idx_account_parent_account_id;
DROP INDEX IF EXISTS idx_business_rule_created_by;
DROP INDEX IF EXISTS idx_contact_modified_by;
DROP INDEX IF EXISTS idx_contact_source_id;
DROP INDEX IF EXISTS idx_contact_subsource_id;
DROP INDEX IF EXISTS idx_currency_audit_log_changed_by;
DROP INDEX IF EXISTS idx_currency_audit_log_new_currency_id;
DROP INDEX IF EXISTS idx_currency_audit_log_old_currency_id;
DROP INDEX IF EXISTS idx_dashboard_created_by;
DROP INDEX IF EXISTS idx_dashboard_widget_dashboard_id;
DROP INDEX IF EXISTS idx_duplicate_job_triggered_by;
DROP INDEX IF EXISTS idx_event_created_by;
DROP INDEX IF EXISTS idx_event_modified_by;
DROP INDEX IF EXISTS idx_field_change_log_changed_by;
DROP INDEX IF EXISTS idx_field_definition_lookup_entity_id;
DROP INDEX IF EXISTS idx_field_definition_option_set_id;
DROP INDEX IF EXISTS idx_journey_created_by;
DROP INDEX IF EXISTS idx_journey_modified_by;
DROP INDEX IF EXISTS idx_journey_step_next_step_false_id;
DROP INDEX IF EXISTS idx_journey_step_next_step_id;
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
DROP INDEX IF EXISTS idx_marketing_email_created_by;
DROP INDEX IF EXISTS idx_marketing_email_modified_by;
DROP INDEX IF EXISTS idx_merge_audit_log_performed_by;
DROP INDEX IF EXISTS idx_ticket_opportunity_id;
DROP INDEX IF EXISTS idx_merge_candidate_resolved_by;
DROP INDEX IF EXISTS idx_merge_decision_executed_by;
DROP INDEX IF EXISTS idx_note_modified_by;
DROP INDEX IF EXISTS idx_opportunity_created_by;
DROP INDEX IF EXISTS idx_opportunity_currency_id;
DROP INDEX IF EXISTS idx_opportunity_modified_by;
DROP INDEX IF EXISTS idx_opportunity_source_id;
DROP INDEX IF EXISTS idx_opportunity_contact_added_by;
DROP INDEX IF EXISTS idx_process_flow_default_stage;
DROP INDEX IF EXISTS idx_process_flow_created_by;
DROP INDEX IF EXISTS idx_process_flow_modified_by;
DROP INDEX IF EXISTS idx_process_flow_transition_to_stage_id;
DROP INDEX IF EXISTS idx_product_created_by;
DROP INDEX IF EXISTS idx_product_modified_by;
DROP INDEX IF EXISTS idx_product_bu_access_business_unit_id;
DROP INDEX IF EXISTS idx_product_bu_access_granted_by;
DROP INDEX IF EXISTS idx_product_role_access_granted_by;
DROP INDEX IF EXISTS idx_product_role_access_role_id;
DROP INDEX IF EXISTS idx_product_team_access_granted_by;
DROP INDEX IF EXISTS idx_product_team_access_team_id;
DROP INDEX IF EXISTS idx_product_user_access_granted_by;
DROP INDEX IF EXISTS idx_segment_created_by;
DROP INDEX IF EXISTS idx_segment_modified_by;
DROP INDEX IF EXISTS idx_subgrid_definition_view_id;
DROP INDEX IF EXISTS idx_ticket_created_by;
DROP INDEX IF EXISTS idx_ticket_modified_by;
DROP INDEX IF EXISTS idx_ticket_comment_modified_by;
DROP INDEX IF EXISTS idx_user_notification_sender_id;
DROP INDEX IF EXISTS idx_view_column_field_definition_id;
DROP INDEX IF EXISTS idx_view_definition_created_by;
DROP INDEX IF EXISTS idx_workflow_definition_created_by;
DROP INDEX IF EXISTS idx_workflow_step_next_step_id;
DROP INDEX IF EXISTS idx_workflow_step_next_step_on_false;

-- ─── Fix multiple permissive SELECT policies ──────────────────────────────────

-- account
DROP POLICY IF EXISTS "Users can see their own soft-deleted accounts for update" ON account;
DROP POLICY IF EXISTS "Users can view accounts they have access to" ON account;
CREATE POLICY "Users can view accounts they have access to"
  ON account FOR SELECT TO authenticated
  USING (
    (is_deleted = false AND crm_user_has_access('account'::text, account_id, owner_type, owner_id))
    OR (is_deleted = true AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = (SELECT auth.uid()))
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = account.owner_id AND tu.user_id = (SELECT auth.uid())
      ))
    ))
  );

-- contact
DROP POLICY IF EXISTS "Users can see their own soft-deleted contacts for update" ON contact;
DROP POLICY IF EXISTS "Users can view contacts they have access to" ON contact;
CREATE POLICY "Users can view contacts they have access to"
  ON contact FOR SELECT TO authenticated
  USING (
    (is_deleted = false AND crm_user_has_access('contact'::text, contact_id, owner_type, owner_id))
    OR (is_deleted = true AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = (SELECT auth.uid()))
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = contact.owner_id AND tu.user_id = (SELECT auth.uid())
      ))
    ))
  );

-- lead
DROP POLICY IF EXISTS "Users can see their own soft-deleted leads for update" ON lead;
DROP POLICY IF EXISTS "Users can view leads they have access to" ON lead;
CREATE POLICY "Users can view leads they have access to"
  ON lead FOR SELECT TO authenticated
  USING (
    (is_deleted = false AND crm_user_has_access('lead'::text, lead_id, owner_type, owner_id))
    OR (is_deleted = true AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = (SELECT auth.uid()))
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = lead.owner_id AND tu.user_id = (SELECT auth.uid())
      ))
    ))
  );

-- opportunity
DROP POLICY IF EXISTS "Users can see their own soft-deleted opportunities for update" ON opportunity;
DROP POLICY IF EXISTS "Users can view opportunities they have access to" ON opportunity;
CREATE POLICY "Users can view opportunities they have access to"
  ON opportunity FOR SELECT TO authenticated
  USING (
    (is_deleted = false AND crm_user_has_access('opportunity'::text, opportunity_id, owner_type, owner_id))
    OR (is_deleted = true AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = (SELECT auth.uid()))
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = opportunity.owner_id AND tu.user_id = (SELECT auth.uid())
      ))
    ))
  );

-- ticket
DROP POLICY IF EXISTS "Users can see their own soft-deleted tickets for update" ON ticket;
DROP POLICY IF EXISTS "Users can view tickets they have access to" ON ticket;
CREATE POLICY "Users can view tickets they have access to"
  ON ticket FOR SELECT TO authenticated
  USING (
    (is_deleted = false AND crm_user_has_access('ticket'::text, ticket_id, owner_type, owner_id))
    OR (is_deleted = true AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = (SELECT auth.uid()))
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
        WHERE tu.team_id = ticket.owner_id AND tu.user_id = (SELECT auth.uid())
      ))
    ))
  );

-- ─── Fix always-true RLS policies ─────────────────────────────────────────────

-- action_permission
DROP POLICY IF EXISTS "Authenticated users can insert action permissions" ON action_permission;
DROP POLICY IF EXISTS "Authenticated users can update action permissions" ON action_permission;
DROP POLICY IF EXISTS "Authenticated users can delete action permissions" ON action_permission;
CREATE POLICY "System admins can insert action permissions"
  ON action_permission FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update action permissions"
  ON action_permission FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete action permissions"
  ON action_permission FOR DELETE TO authenticated USING (is_system_admin());

-- approval_condition
DROP POLICY IF EXISTS "Authenticated users can insert approval conditions" ON approval_condition;
DROP POLICY IF EXISTS "Authenticated users can update approval conditions" ON approval_condition;
DROP POLICY IF EXISTS "Authenticated users can delete approval conditions" ON approval_condition;
CREATE POLICY "System admins can insert approval conditions"
  ON approval_condition FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update approval conditions"
  ON approval_condition FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete approval conditions"
  ON approval_condition FOR DELETE TO authenticated USING (is_system_admin());

-- approval_process
DROP POLICY IF EXISTS "Authenticated users can insert approval processes" ON approval_process;
DROP POLICY IF EXISTS "Authenticated users can update approval processes" ON approval_process;
CREATE POLICY "System admins can insert approval processes"
  ON approval_process FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update approval processes"
  ON approval_process FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- approval_step
DROP POLICY IF EXISTS "Authenticated users can insert approval steps" ON approval_step;
DROP POLICY IF EXISTS "Authenticated users can update approval steps" ON approval_step;
DROP POLICY IF EXISTS "Authenticated users can delete approval steps" ON approval_step;
CREATE POLICY "System admins can insert approval steps"
  ON approval_step FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update approval steps"
  ON approval_step FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete approval steps"
  ON approval_step FOR DELETE TO authenticated USING (is_system_admin());

-- business_rule
DROP POLICY IF EXISTS "Authenticated users can insert business rules" ON business_rule;
DROP POLICY IF EXISTS "Authenticated users can update business rules" ON business_rule;
CREATE POLICY "System admins can insert business rules"
  ON business_rule FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update business rules"
  ON business_rule FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- business_unit
DROP POLICY IF EXISTS "Authenticated users can insert business units" ON business_unit;
DROP POLICY IF EXISTS "Authenticated users can update business units" ON business_unit;
CREATE POLICY "System admins can insert business units"
  ON business_unit FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update business units"
  ON business_unit FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- campaign_member
DROP POLICY IF EXISTS "Users can update campaign members for campaigns they own" ON campaign_member;
CREATE POLICY "Users can update campaign members for campaigns they own"
  ON campaign_member FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM campaign c
    WHERE c.campaign_id = campaign_member.campaign_id
    AND crm_user_has_access('campaign'::text, c.campaign_id, c.owner_type, c.owner_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM campaign c
    WHERE c.campaign_id = campaign_member.campaign_id
    AND crm_user_has_access('campaign'::text, c.campaign_id, c.owner_type, c.owner_id)
  ));

-- contact_source
DROP POLICY IF EXISTS "Authenticated users can insert contact sources" ON contact_source;
DROP POLICY IF EXISTS "Authenticated users can update contact sources" ON contact_source;
CREATE POLICY "System admins can insert contact sources"
  ON contact_source FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update contact sources"
  ON contact_source FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- contact_subsource
DROP POLICY IF EXISTS "Authenticated users can insert contact subsources" ON contact_subsource;
DROP POLICY IF EXISTS "Authenticated users can update contact subsources" ON contact_subsource;
CREATE POLICY "System admins can insert contact subsources"
  ON contact_subsource FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update contact subsources"
  ON contact_subsource FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- country
DROP POLICY IF EXISTS "Authenticated users can insert countries" ON country;
DROP POLICY IF EXISTS "Authenticated users can update countries" ON country;
CREATE POLICY "System admins can insert countries"
  ON country FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update countries"
  ON country FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- currency
DROP POLICY IF EXISTS "Authenticated users can insert currencies" ON currency;
DROP POLICY IF EXISTS "Authenticated users can update currencies" ON currency;
CREATE POLICY "System admins can insert currencies"
  ON currency FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update currencies"
  ON currency FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- dashboard
DROP POLICY IF EXISTS "Authenticated users can update dashboards" ON dashboard;
CREATE POLICY "Authenticated users can update their own dashboards"
  ON dashboard FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()) OR is_system_admin())
  WITH CHECK (created_by = (SELECT auth.uid()) OR is_system_admin());

-- dashboard_role_assignment
DROP POLICY IF EXISTS "Authenticated users can manage role assignments" ON dashboard_role_assignment;
DROP POLICY IF EXISTS "Authenticated users can delete role assignments" ON dashboard_role_assignment;
CREATE POLICY "System admins can manage role assignments"
  ON dashboard_role_assignment FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete role assignments"
  ON dashboard_role_assignment FOR DELETE TO authenticated USING (is_system_admin());

-- dashboard_widget
DROP POLICY IF EXISTS "Authenticated users can insert widgets" ON dashboard_widget;
DROP POLICY IF EXISTS "Authenticated users can update widgets" ON dashboard_widget;
DROP POLICY IF EXISTS "Authenticated users can delete widgets" ON dashboard_widget;
CREATE POLICY "Authenticated users can insert widgets"
  ON dashboard_widget FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM dashboard d
    WHERE d.dashboard_id = dashboard_widget.dashboard_id
    AND (d.created_by = (SELECT auth.uid()) OR is_system_admin())
  ));
CREATE POLICY "Authenticated users can update widgets"
  ON dashboard_widget FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM dashboard d
    WHERE d.dashboard_id = dashboard_widget.dashboard_id
    AND (d.created_by = (SELECT auth.uid()) OR is_system_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM dashboard d
    WHERE d.dashboard_id = dashboard_widget.dashboard_id
    AND (d.created_by = (SELECT auth.uid()) OR is_system_admin())
  ));
CREATE POLICY "Authenticated users can delete widgets"
  ON dashboard_widget FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM dashboard d
    WHERE d.dashboard_id = dashboard_widget.dashboard_id
    AND (d.created_by = (SELECT auth.uid()) OR is_system_admin())
  ));

-- data_policy
DROP POLICY IF EXISTS "Authenticated users can insert data policies" ON data_policy;
DROP POLICY IF EXISTS "Authenticated users can update data policies" ON data_policy;
CREATE POLICY "System admins can insert data policies"
  ON data_policy FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update data policies"
  ON data_policy FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- data_policy_condition
DROP POLICY IF EXISTS "Authenticated users can insert policy conditions" ON data_policy_condition;
DROP POLICY IF EXISTS "Authenticated users can update policy conditions" ON data_policy_condition;
DROP POLICY IF EXISTS "Authenticated users can delete policy conditions" ON data_policy_condition;
CREATE POLICY "System admins can insert policy conditions"
  ON data_policy_condition FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update policy conditions"
  ON data_policy_condition FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete policy conditions"
  ON data_policy_condition FOR DELETE TO authenticated USING (is_system_admin());

-- data_policy_enforcement
DROP POLICY IF EXISTS "Authenticated users can insert policy enforcements" ON data_policy_enforcement;
DROP POLICY IF EXISTS "Authenticated users can update policy enforcements" ON data_policy_enforcement;
DROP POLICY IF EXISTS "Authenticated users can delete policy enforcements" ON data_policy_enforcement;
CREATE POLICY "System admins can insert policy enforcements"
  ON data_policy_enforcement FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update policy enforcements"
  ON data_policy_enforcement FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete policy enforcements"
  ON data_policy_enforcement FOR DELETE TO authenticated USING (is_system_admin());

-- duplicate_detection_rule
DROP POLICY IF EXISTS "Authenticated users can insert duplicate rules" ON duplicate_detection_rule;
DROP POLICY IF EXISTS "Authenticated users can update duplicate rules" ON duplicate_detection_rule;
CREATE POLICY "System admins can insert duplicate rules"
  ON duplicate_detection_rule FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update duplicate rules"
  ON duplicate_detection_rule FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- duplicate_job
DROP POLICY IF EXISTS "Authenticated users can insert duplicate jobs" ON duplicate_job;
DROP POLICY IF EXISTS "Authenticated users can update duplicate jobs" ON duplicate_job;
DROP POLICY IF EXISTS "Authenticated users can delete duplicate jobs" ON duplicate_job;
CREATE POLICY "System admins can insert duplicate jobs"
  ON duplicate_job FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update duplicate jobs"
  ON duplicate_job FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete duplicate jobs"
  ON duplicate_job FOR DELETE TO authenticated USING (is_system_admin());

-- entity_definition
DROP POLICY IF EXISTS "Authenticated users can insert entity definitions" ON entity_definition;
DROP POLICY IF EXISTS "Authenticated users can update entity definitions" ON entity_definition;
DROP POLICY IF EXISTS "Authenticated users can delete entity definitions" ON entity_definition;
CREATE POLICY "System admins can insert entity definitions"
  ON entity_definition FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update entity definitions"
  ON entity_definition FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete entity definitions"
  ON entity_definition FOR DELETE TO authenticated USING (is_system_admin());

-- field_definition
DROP POLICY IF EXISTS "Authenticated users can insert field definitions" ON field_definition;
DROP POLICY IF EXISTS "Authenticated users can update field definitions" ON field_definition;
DROP POLICY IF EXISTS "Authenticated users can delete field definitions" ON field_definition;
CREATE POLICY "System admins can insert field definitions"
  ON field_definition FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update field definitions"
  ON field_definition FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete field definitions"
  ON field_definition FOR DELETE TO authenticated USING (is_system_admin());

-- field_permission
DROP POLICY IF EXISTS "Authenticated users can insert field permissions" ON field_permission;
DROP POLICY IF EXISTS "Authenticated users can update field permissions" ON field_permission;
DROP POLICY IF EXISTS "Authenticated users can delete field permissions" ON field_permission;
CREATE POLICY "System admins can insert field permissions"
  ON field_permission FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update field permissions"
  ON field_permission FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete field permissions"
  ON field_permission FOR DELETE TO authenticated USING (is_system_admin());

-- field_type
DROP POLICY IF EXISTS "Authenticated users can insert field types" ON field_type;
DROP POLICY IF EXISTS "Authenticated users can update field types" ON field_type;
CREATE POLICY "System admins can insert field types"
  ON field_type FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update field types"
  ON field_type FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- form_control
DROP POLICY IF EXISTS "Authenticated users can insert form controls" ON form_control;
DROP POLICY IF EXISTS "Authenticated users can update form controls" ON form_control;
DROP POLICY IF EXISTS "Authenticated users can delete form controls" ON form_control;
CREATE POLICY "System admins can insert form controls"
  ON form_control FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update form controls"
  ON form_control FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete form controls"
  ON form_control FOR DELETE TO authenticated USING (is_system_admin());

-- form_definition
DROP POLICY IF EXISTS "Authenticated users can insert form definitions" ON form_definition;
DROP POLICY IF EXISTS "Authenticated users can update form definitions" ON form_definition;
DROP POLICY IF EXISTS "Authenticated users can delete form definitions" ON form_definition;
CREATE POLICY "System admins can insert form definitions"
  ON form_definition FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update form definitions"
  ON form_definition FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete form definitions"
  ON form_definition FOR DELETE TO authenticated USING (is_system_admin());

-- form_event_handler
DROP POLICY IF EXISTS "Authenticated users can insert form_event_handler" ON form_event_handler;
DROP POLICY IF EXISTS "Authenticated users can update form_event_handler" ON form_event_handler;
DROP POLICY IF EXISTS "Authenticated users can delete form_event_handler" ON form_event_handler;
CREATE POLICY "System admins can insert form_event_handler"
  ON form_event_handler FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update form_event_handler"
  ON form_event_handler FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete form_event_handler"
  ON form_event_handler FOR DELETE TO authenticated USING (is_system_admin());

-- form_script
DROP POLICY IF EXISTS "Authenticated users can insert form_script" ON form_script;
DROP POLICY IF EXISTS "Authenticated users can update form_script" ON form_script;
DROP POLICY IF EXISTS "Authenticated users can delete form_script" ON form_script;
CREATE POLICY "System admins can insert form_script"
  ON form_script FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update form_script"
  ON form_script FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete form_script"
  ON form_script FOR DELETE TO authenticated USING (is_system_admin());

-- form_section
DROP POLICY IF EXISTS "Authenticated users can insert form sections" ON form_section;
DROP POLICY IF EXISTS "Authenticated users can update form sections" ON form_section;
DROP POLICY IF EXISTS "Authenticated users can delete form sections" ON form_section;
CREATE POLICY "System admins can insert form sections"
  ON form_section FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update form sections"
  ON form_section FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete form sections"
  ON form_section FOR DELETE TO authenticated USING (is_system_admin());

-- form_tab
DROP POLICY IF EXISTS "Authenticated users can insert form_tab" ON form_tab;
DROP POLICY IF EXISTS "Authenticated users can update form_tab" ON form_tab;
DROP POLICY IF EXISTS "Authenticated users can delete form_tab" ON form_tab;
CREATE POLICY "System admins can insert form_tab"
  ON form_tab FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update form_tab"
  ON form_tab FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete form_tab"
  ON form_tab FOR DELETE TO authenticated USING (is_system_admin());

-- industry
DROP POLICY IF EXISTS "Authenticated users can insert industries" ON industry;
DROP POLICY IF EXISTS "Authenticated users can update industries" ON industry;
CREATE POLICY "System admins can insert industries"
  ON industry FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update industries"
  ON industry FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- journey_step
DROP POLICY IF EXISTS "Authenticated users can insert journey steps" ON journey_step;
DROP POLICY IF EXISTS "Authenticated users can update journey steps" ON journey_step;
DROP POLICY IF EXISTS "Authenticated users can delete journey steps" ON journey_step;
CREATE POLICY "System admins can insert journey steps"
  ON journey_step FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update journey steps"
  ON journey_step FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete journey steps"
  ON journey_step FOR DELETE TO authenticated USING (is_system_admin());

-- lead_qualification_field_mapping
DROP POLICY IF EXISTS "Authenticated users can insert field mappings" ON lead_qualification_field_mapping;
DROP POLICY IF EXISTS "Authenticated users can update field mappings" ON lead_qualification_field_mapping;
DROP POLICY IF EXISTS "Authenticated users can delete field mappings" ON lead_qualification_field_mapping;
CREATE POLICY "System admins can insert field mappings"
  ON lead_qualification_field_mapping FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update field mappings"
  ON lead_qualification_field_mapping FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete field mappings"
  ON lead_qualification_field_mapping FOR DELETE TO authenticated USING (is_system_admin());

-- lead_qualification_rule
DROP POLICY IF EXISTS "Authenticated users can insert qualification rules" ON lead_qualification_rule;
DROP POLICY IF EXISTS "Authenticated users can update qualification rules" ON lead_qualification_rule;
CREATE POLICY "System admins can insert qualification rules"
  ON lead_qualification_rule FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update qualification rules"
  ON lead_qualification_rule FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- merge_audit_log
DROP POLICY IF EXISTS "Authenticated users can insert merge audit entries" ON merge_audit_log;
CREATE POLICY "Authenticated users can insert merge audit entries"
  ON merge_audit_log FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- merge_candidate
DROP POLICY IF EXISTS "Authenticated users can insert merge candidates" ON merge_candidate;
DROP POLICY IF EXISTS "Authenticated users can update merge candidates" ON merge_candidate;
CREATE POLICY "Authenticated users can insert merge candidates"
  ON merge_candidate FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "System admins can update merge candidates"
  ON merge_candidate FOR UPDATE TO authenticated
  USING (is_system_admin()) WITH CHECK (is_system_admin());

-- merge_decision
DROP POLICY IF EXISTS "Authenticated users can insert merge decisions" ON merge_decision;
DROP POLICY IF EXISTS "Authenticated users can update merge decisions" ON merge_decision;
CREATE POLICY "Authenticated users can insert merge decisions"
  ON merge_decision FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "System admins can update merge decisions"
  ON merge_decision FOR UPDATE TO authenticated
  USING (is_system_admin()) WITH CHECK (is_system_admin());

-- nav_area
DROP POLICY IF EXISTS "Authenticated users can insert nav areas" ON nav_area;
DROP POLICY IF EXISTS "Authenticated users can update nav areas" ON nav_area;
CREATE POLICY "System admins can insert nav areas"
  ON nav_area FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update nav areas"
  ON nav_area FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- nav_group
DROP POLICY IF EXISTS "Authenticated users can insert nav groups" ON nav_group;
DROP POLICY IF EXISTS "Authenticated users can update nav groups" ON nav_group;
DROP POLICY IF EXISTS "Authenticated users can delete nav groups" ON nav_group;
CREATE POLICY "System admins can insert nav groups"
  ON nav_group FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update nav groups"
  ON nav_group FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete nav groups"
  ON nav_group FOR DELETE TO authenticated USING (is_system_admin());

-- nav_item
DROP POLICY IF EXISTS "Authenticated users can insert nav items" ON nav_item;
DROP POLICY IF EXISTS "Authenticated users can update nav items" ON nav_item;
DROP POLICY IF EXISTS "Authenticated users can delete nav items" ON nav_item;
CREATE POLICY "System admins can insert nav items"
  ON nav_item FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update nav items"
  ON nav_item FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete nav items"
  ON nav_item FOR DELETE TO authenticated USING (is_system_admin());

-- option_set
DROP POLICY IF EXISTS "Authenticated users can insert option sets" ON option_set;
DROP POLICY IF EXISTS "Authenticated users can update option sets" ON option_set;
CREATE POLICY "System admins can insert option sets"
  ON option_set FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update option sets"
  ON option_set FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- option_set_value
DROP POLICY IF EXISTS "Authenticated users can insert option set values" ON option_set_value;
DROP POLICY IF EXISTS "Authenticated users can update option set values" ON option_set_value;
DROP POLICY IF EXISTS "Authenticated users can delete option set values" ON option_set_value;
CREATE POLICY "System admins can insert option set values"
  ON option_set_value FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update option set values"
  ON option_set_value FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete option set values"
  ON option_set_value FOR DELETE TO authenticated USING (is_system_admin());

-- organization
DROP POLICY IF EXISTS "Authenticated users can insert organizations" ON organization;
DROP POLICY IF EXISTS "Authenticated users can update organizations" ON organization;
CREATE POLICY "System admins can insert organizations"
  ON organization FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update organizations"
  ON organization FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- role_privilege
DROP POLICY IF EXISTS "Authenticated users can delete role privileges" ON role_privilege;
DROP POLICY IF EXISTS "Authenticated users can insert role privileges" ON role_privilege;
DROP POLICY IF EXISTS "Authenticated users can update role privileges" ON role_privilege;
CREATE POLICY "System admins can insert role privileges"
  ON role_privilege FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update role privileges"
  ON role_privilege FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete role privileges"
  ON role_privilege FOR DELETE TO authenticated USING (is_system_admin());

-- section_permission
DROP POLICY IF EXISTS "Authenticated users can insert section permissions" ON section_permission;
DROP POLICY IF EXISTS "Authenticated users can update section permissions" ON section_permission;
DROP POLICY IF EXISTS "Authenticated users can delete section permissions" ON section_permission;
CREATE POLICY "System admins can insert section permissions"
  ON section_permission FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update section permissions"
  ON section_permission FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete section permissions"
  ON section_permission FOR DELETE TO authenticated USING (is_system_admin());

-- security_role
DROP POLICY IF EXISTS "Authenticated users can insert security roles" ON security_role;
DROP POLICY IF EXISTS "Authenticated users can update security roles" ON security_role;
CREATE POLICY "System admins can insert security roles"
  ON security_role FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update security roles"
  ON security_role FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- subgrid_definition
DROP POLICY IF EXISTS "Authenticated users can insert subgrid definitions" ON subgrid_definition;
DROP POLICY IF EXISTS "Authenticated users can update subgrid definitions" ON subgrid_definition;
DROP POLICY IF EXISTS "Authenticated users can delete subgrid definitions" ON subgrid_definition;
CREATE POLICY "System admins can insert subgrid definitions"
  ON subgrid_definition FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update subgrid definitions"
  ON subgrid_definition FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete subgrid definitions"
  ON subgrid_definition FOR DELETE TO authenticated USING (is_system_admin());

-- team
DROP POLICY IF EXISTS "Authenticated users can insert teams" ON team;
DROP POLICY IF EXISTS "Authenticated users can update teams" ON team;
CREATE POLICY "System admins can insert teams"
  ON team FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update teams"
  ON team FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- team_security_role
DROP POLICY IF EXISTS "Authenticated users can insert team roles" ON team_security_role;
DROP POLICY IF EXISTS "Authenticated users can delete team roles" ON team_security_role;
CREATE POLICY "System admins can insert team roles"
  ON team_security_role FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete team roles"
  ON team_security_role FOR DELETE TO authenticated USING (is_system_admin());

-- team_user
DROP POLICY IF EXISTS "Authenticated users can insert team memberships" ON team_user;
DROP POLICY IF EXISTS "Authenticated users can delete team memberships" ON team_user;
CREATE POLICY "System admins can insert team memberships"
  ON team_user FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete team memberships"
  ON team_user FOR DELETE TO authenticated USING (is_system_admin());

-- ticket_priority
DROP POLICY IF EXISTS "Authenticated users can insert ticket priorities" ON ticket_priority;
DROP POLICY IF EXISTS "Authenticated users can update ticket priorities" ON ticket_priority;
CREATE POLICY "System admins can insert ticket priorities"
  ON ticket_priority FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update ticket priorities"
  ON ticket_priority FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- ticket_status
DROP POLICY IF EXISTS "Authenticated users can insert ticket statuses" ON ticket_status;
DROP POLICY IF EXISTS "Authenticated users can update ticket statuses" ON ticket_status;
CREATE POLICY "System admins can insert ticket statuses"
  ON ticket_status FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update ticket statuses"
  ON ticket_status FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- user_notification
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON user_notification;
CREATE POLICY "Authenticated users can create notifications"
  ON user_notification FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- user_security_role
DROP POLICY IF EXISTS "Authenticated users can insert user roles" ON user_security_role;
DROP POLICY IF EXISTS "Authenticated users can delete user roles" ON user_security_role;
CREATE POLICY "System admins can insert user roles"
  ON user_security_role FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete user roles"
  ON user_security_role FOR DELETE TO authenticated USING (is_system_admin());

-- view_column
DROP POLICY IF EXISTS "Authenticated users can insert view columns" ON view_column;
DROP POLICY IF EXISTS "Authenticated users can update view columns" ON view_column;
DROP POLICY IF EXISTS "Authenticated users can delete view columns" ON view_column;
CREATE POLICY "System admins can insert view columns"
  ON view_column FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update view columns"
  ON view_column FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
CREATE POLICY "System admins can delete view columns"
  ON view_column FOR DELETE TO authenticated USING (is_system_admin());

-- view_definition INSERT
DROP POLICY IF EXISTS "Authenticated users can insert views" ON view_definition;
CREATE POLICY "Authenticated users can insert views"
  ON view_definition FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- workflow_definition
DROP POLICY IF EXISTS "Authenticated users can insert workflow definitions" ON workflow_definition;
DROP POLICY IF EXISTS "Authenticated users can update workflow definitions" ON workflow_definition;
CREATE POLICY "System admins can insert workflow definitions"
  ON workflow_definition FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update workflow definitions"
  ON workflow_definition FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- workflow_step
DROP POLICY IF EXISTS "Authenticated users can insert workflow steps" ON workflow_step;
DROP POLICY IF EXISTS "Authenticated users can update workflow steps" ON workflow_step;
CREATE POLICY "System admins can insert workflow steps"
  ON workflow_step FOR INSERT TO authenticated WITH CHECK (is_system_admin());
CREATE POLICY "System admins can update workflow steps"
  ON workflow_step FOR UPDATE TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
