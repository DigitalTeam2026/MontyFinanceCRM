/*
  # Add Missing Foreign Key Indexes

  ## Summary
  Adds covering indexes for all foreign key columns that were flagged as unindexed.
  These indexes prevent sequential scans during JOIN operations and ON DELETE/UPDATE
  constraint checks, improving query performance significantly at scale.

  ## Tables Affected
  - account: created_by, currency_id, modified_by, parent_account_id
  - business_rule: created_by, modified_by
  - campaign: created_by, currency_id, modified_by
  - contact: country_id, created_by, modified_by, source_id, subsource_id
  - currency_audit_log: changed_by, new_currency_id, old_currency_id
  - dashboard: created_by
  - dashboard_widget: dashboard_id
  - duplicate_job: triggered_by
  - event: created_by, modified_by
  - field_change_log: changed_by
  - field_definition: lookup_entity_id, option_set_id
  - journey: created_by, modified_by
  - journey_step: next_step_false_id, next_step_id
  - lead: country_id, created_by, currency_id, disqualified_by, industry_id, modified_by,
          qualified_account_id, qualified_contact_id, qualified_opportunity_id,
          reopened_by, source_id, subsource_id
  - marketing_email: created_by, modified_by
  - merge_audit_log: performed_by
  - merge_candidate: resolved_by
  - merge_decision: executed_by
  - note: modified_by
  - opportunity: created_by, currency_id, modified_by, source_id
  - opportunity_contact: added_by
  - process_flow: default_stage, created_by, modified_by
  - process_flow_transition: to_stage_id
  - product: created_by, modified_by
  - product_business_unit_access: business_unit_id, granted_by
  - product_role_access: granted_by, role_id
  - product_team_access: granted_by, team_id
  - product_user_access: granted_by
  - segment: created_by, modified_by
  - subgrid_definition: view_id
  - ticket: created_by, modified_by, opportunity_id
  - ticket_comment: modified_by
  - user_notification: sender_id
  - view_column: field_definition_id
  - view_definition: created_by
  - workflow_definition: created_by
  - workflow_step: next_step_id, next_step_on_false
*/

CREATE INDEX IF NOT EXISTS idx_account_created_by ON account(created_by);
CREATE INDEX IF NOT EXISTS idx_account_currency_id ON account(currency_id);
CREATE INDEX IF NOT EXISTS idx_account_modified_by ON account(modified_by);
CREATE INDEX IF NOT EXISTS idx_account_parent_account_id ON account(parent_account_id);

CREATE INDEX IF NOT EXISTS idx_business_rule_created_by ON business_rule(created_by);
CREATE INDEX IF NOT EXISTS idx_business_rule_modified_by ON business_rule(modified_by);

CREATE INDEX IF NOT EXISTS idx_campaign_created_by ON campaign(created_by);
CREATE INDEX IF NOT EXISTS idx_campaign_currency_id ON campaign(currency_id);
CREATE INDEX IF NOT EXISTS idx_campaign_modified_by ON campaign(modified_by);

CREATE INDEX IF NOT EXISTS idx_contact_country_id ON contact(country_id);
CREATE INDEX IF NOT EXISTS idx_contact_created_by ON contact(created_by);
CREATE INDEX IF NOT EXISTS idx_contact_modified_by ON contact(modified_by);
CREATE INDEX IF NOT EXISTS idx_contact_source_id ON contact(source_id);
CREATE INDEX IF NOT EXISTS idx_contact_subsource_id ON contact(subsource_id);

CREATE INDEX IF NOT EXISTS idx_currency_audit_log_changed_by ON currency_audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_currency_audit_log_new_currency_id ON currency_audit_log(new_currency_id);
CREATE INDEX IF NOT EXISTS idx_currency_audit_log_old_currency_id ON currency_audit_log(old_currency_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_created_by ON dashboard(created_by);

CREATE INDEX IF NOT EXISTS idx_dashboard_widget_dashboard_id ON dashboard_widget(dashboard_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_job_triggered_by ON duplicate_job(triggered_by);

CREATE INDEX IF NOT EXISTS idx_event_created_by ON event(created_by);
CREATE INDEX IF NOT EXISTS idx_event_modified_by ON event(modified_by);

CREATE INDEX IF NOT EXISTS idx_field_change_log_changed_by ON field_change_log(changed_by);

CREATE INDEX IF NOT EXISTS idx_field_definition_lookup_entity_id ON field_definition(lookup_entity_id);
CREATE INDEX IF NOT EXISTS idx_field_definition_option_set_id ON field_definition(option_set_id);

CREATE INDEX IF NOT EXISTS idx_journey_created_by ON journey(created_by);
CREATE INDEX IF NOT EXISTS idx_journey_modified_by ON journey(modified_by);

CREATE INDEX IF NOT EXISTS idx_journey_step_next_step_false_id ON journey_step(next_step_false_id);
CREATE INDEX IF NOT EXISTS idx_journey_step_next_step_id ON journey_step(next_step_id);

CREATE INDEX IF NOT EXISTS idx_lead_country_id ON lead(country_id);
CREATE INDEX IF NOT EXISTS idx_lead_created_by ON lead(created_by);
CREATE INDEX IF NOT EXISTS idx_lead_currency_id ON lead(currency_id);
CREATE INDEX IF NOT EXISTS idx_lead_disqualified_by ON lead(disqualified_by);
CREATE INDEX IF NOT EXISTS idx_lead_industry_id ON lead(industry_id);
CREATE INDEX IF NOT EXISTS idx_lead_modified_by ON lead(modified_by);
CREATE INDEX IF NOT EXISTS idx_lead_qualified_account_id ON lead(qualified_account_id);
CREATE INDEX IF NOT EXISTS idx_lead_qualified_contact_id ON lead(qualified_contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_qualified_opportunity_id ON lead(qualified_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_lead_reopened_by ON lead(reopened_by);
CREATE INDEX IF NOT EXISTS idx_lead_source_id ON lead(source_id);
CREATE INDEX IF NOT EXISTS idx_lead_subsource_id ON lead(subsource_id);

CREATE INDEX IF NOT EXISTS idx_marketing_email_created_by ON marketing_email(created_by);
CREATE INDEX IF NOT EXISTS idx_marketing_email_modified_by ON marketing_email(modified_by);

CREATE INDEX IF NOT EXISTS idx_merge_audit_log_performed_by ON merge_audit_log(performed_by);

CREATE INDEX IF NOT EXISTS idx_merge_candidate_resolved_by ON merge_candidate(resolved_by);

CREATE INDEX IF NOT EXISTS idx_merge_decision_executed_by ON merge_decision(executed_by);

CREATE INDEX IF NOT EXISTS idx_note_modified_by ON note(modified_by);

CREATE INDEX IF NOT EXISTS idx_opportunity_created_by ON opportunity(created_by);
CREATE INDEX IF NOT EXISTS idx_opportunity_currency_id ON opportunity(currency_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_modified_by ON opportunity(modified_by);
CREATE INDEX IF NOT EXISTS idx_opportunity_source_id ON opportunity(source_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_contact_added_by ON opportunity_contact(added_by);

CREATE INDEX IF NOT EXISTS idx_process_flow_default_stage ON process_flow(default_stage_id);
CREATE INDEX IF NOT EXISTS idx_process_flow_created_by ON process_flow(created_by);
CREATE INDEX IF NOT EXISTS idx_process_flow_modified_by ON process_flow(modified_by);

CREATE INDEX IF NOT EXISTS idx_process_flow_transition_to_stage_id ON process_flow_transition(to_stage_id);

CREATE INDEX IF NOT EXISTS idx_product_created_by ON product(created_by);
CREATE INDEX IF NOT EXISTS idx_product_modified_by ON product(modified_by);

CREATE INDEX IF NOT EXISTS idx_product_bu_access_business_unit_id ON product_business_unit_access(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_product_bu_access_granted_by ON product_business_unit_access(granted_by);

CREATE INDEX IF NOT EXISTS idx_product_role_access_granted_by ON product_role_access(granted_by);
CREATE INDEX IF NOT EXISTS idx_product_role_access_role_id ON product_role_access(role_id);

CREATE INDEX IF NOT EXISTS idx_product_team_access_granted_by ON product_team_access(granted_by);
CREATE INDEX IF NOT EXISTS idx_product_team_access_team_id ON product_team_access(team_id);

CREATE INDEX IF NOT EXISTS idx_product_user_access_granted_by ON product_user_access(granted_by);

CREATE INDEX IF NOT EXISTS idx_segment_created_by ON segment(created_by);
CREATE INDEX IF NOT EXISTS idx_segment_modified_by ON segment(modified_by);

CREATE INDEX IF NOT EXISTS idx_subgrid_definition_view_id ON subgrid_definition(view_id);

CREATE INDEX IF NOT EXISTS idx_ticket_created_by ON ticket(created_by);
CREATE INDEX IF NOT EXISTS idx_ticket_modified_by ON ticket(modified_by);
CREATE INDEX IF NOT EXISTS idx_ticket_opportunity_id ON ticket(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_ticket_comment_modified_by ON ticket_comment(modified_by);

CREATE INDEX IF NOT EXISTS idx_user_notification_sender_id ON user_notification(sender_id);

CREATE INDEX IF NOT EXISTS idx_view_column_field_definition_id ON view_column(field_definition_id);

CREATE INDEX IF NOT EXISTS idx_view_definition_created_by ON view_definition(created_by);

CREATE INDEX IF NOT EXISTS idx_workflow_definition_created_by ON workflow_definition(created_by);

CREATE INDEX IF NOT EXISTS idx_workflow_step_next_step_id ON workflow_step(next_step_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_next_step_on_false ON workflow_step(next_step_on_false);
