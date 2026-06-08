/*
  # Add Missing FK Indexes - Round 2

  ## Summary
  Adds covering indexes for all remaining unindexed foreign key columns flagged in
  the second security audit pass.

  ## Tables / Columns Indexed
  - account: business_unit_id, country_id, industry_id
  - activity_log: owner_id
  - attachment: created_by
  - audit_log: changed_by
  - business_unit: organization_id, parent_business_unit_id
  - campaign: business_unit_id
  - contact: business_unit_id
  - crm_user: business_unit_id
  - data_policy_condition: data_policy_id
  - data_policy_enforcement: data_policy_id
  - duplicate_job: duplicate_rule_id
  - event: business_unit_id, campaign_id
  - field_definition: field_type_id
  - form_control: field_definition_id, section_id
  - form_event_handler: form_id
  - form_script: form_id
  - form_section: form_id
  - form_tab: form_id
  - journey: business_unit_id, campaign_id, segment_id
  - journey_step: journey_id
  - lead: business_unit_id, product_id
  - marketing_email: business_unit_id, campaign_id
  - merge_audit_log: merge_decision_id
  - merge_decision: merge_candidate_id
  - nav_item: nav_group_id
  - note: created_by
  - opportunity: account_id, business_unit_id, primary_contact_id, product_id
  - opportunity_contact: contact_id
  - process_flow: entity_definition_id
  - product: default_process_flow_id, family_id, lob_id
  - product_family: lob_id
  - product_user_access: crm_user_id
  - record_share: shared_by
  - saved_filter: user_id
  - security_role: business_unit_id
  - segment: business_unit_id
  - subgrid_definition: form_section_id, related_entity_definition_id
  - team: business_unit_id
  - team_security_role: role_id
  - team_user: user_id
  - ticket: account_id, assigned_team_id, assigned_user_id, business_unit_id, contact_id, priority_id, status_id
  - ticket_comment: created_by, ticket_id
  - user_security_role: role_id
  - view_column: view_id
  - workflow_definition: entity_definition_id
  - workflow_step: workflow_id
*/

CREATE INDEX IF NOT EXISTS idx_account_business_unit_id ON account(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_account_country_id ON account(country_id);
CREATE INDEX IF NOT EXISTS idx_account_industry_id ON account(industry_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_owner_id ON activity_log(owner_id);

CREATE INDEX IF NOT EXISTS idx_attachment_created_by ON attachment(created_by);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by ON audit_log(changed_by);

CREATE INDEX IF NOT EXISTS idx_business_unit_organization_id ON business_unit(organization_id);
CREATE INDEX IF NOT EXISTS idx_business_unit_parent_id ON business_unit(parent_business_unit_id);

CREATE INDEX IF NOT EXISTS idx_campaign_business_unit_id ON campaign(business_unit_id);

CREATE INDEX IF NOT EXISTS idx_contact_business_unit_id ON contact(business_unit_id);

CREATE INDEX IF NOT EXISTS idx_crm_user_business_unit_id ON crm_user(business_unit_id);

CREATE INDEX IF NOT EXISTS idx_data_policy_condition_policy_id ON data_policy_condition(data_policy_id);

CREATE INDEX IF NOT EXISTS idx_data_policy_enforcement_policy_id ON data_policy_enforcement(data_policy_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_job_rule_id ON duplicate_job(duplicate_rule_id);

CREATE INDEX IF NOT EXISTS idx_event_business_unit_id ON event(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_event_campaign_id ON event(campaign_id);

CREATE INDEX IF NOT EXISTS idx_field_definition_field_type_id ON field_definition(field_type_id);

CREATE INDEX IF NOT EXISTS idx_form_control_field_definition_id ON form_control(field_definition_id);
CREATE INDEX IF NOT EXISTS idx_form_control_section_id ON form_control(section_id);

CREATE INDEX IF NOT EXISTS idx_form_event_handler_form_id ON form_event_handler(form_id);

CREATE INDEX IF NOT EXISTS idx_form_script_form_id ON form_script(form_id);

CREATE INDEX IF NOT EXISTS idx_form_section_form_id ON form_section(form_id);

CREATE INDEX IF NOT EXISTS idx_form_tab_form_id ON form_tab(form_id);

CREATE INDEX IF NOT EXISTS idx_journey_business_unit_id ON journey(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_journey_campaign_id ON journey(campaign_id);
CREATE INDEX IF NOT EXISTS idx_journey_segment_id ON journey(segment_id);

CREATE INDEX IF NOT EXISTS idx_journey_step_journey_id ON journey_step(journey_id);

CREATE INDEX IF NOT EXISTS idx_lead_business_unit_id ON lead(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_lead_product_id ON lead(product_id);

CREATE INDEX IF NOT EXISTS idx_marketing_email_business_unit_id ON marketing_email(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_marketing_email_campaign_id ON marketing_email(campaign_id);

CREATE INDEX IF NOT EXISTS idx_merge_audit_log_decision_id ON merge_audit_log(merge_decision_id);

CREATE INDEX IF NOT EXISTS idx_merge_decision_candidate_id ON merge_decision(merge_candidate_id);

CREATE INDEX IF NOT EXISTS idx_nav_item_group_id ON nav_item(nav_group_id);

CREATE INDEX IF NOT EXISTS idx_note_created_by ON note(created_by);

CREATE INDEX IF NOT EXISTS idx_opportunity_account_id ON opportunity(account_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_business_unit_id ON opportunity(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_primary_contact_id ON opportunity(primary_contact_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_product_id ON opportunity(product_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_contact_contact_id ON opportunity_contact(contact_id);

CREATE INDEX IF NOT EXISTS idx_process_flow_entity_definition_id ON process_flow(entity_definition_id);

CREATE INDEX IF NOT EXISTS idx_product_default_process_flow_id ON product(default_process_flow_id);
CREATE INDEX IF NOT EXISTS idx_product_family_id ON product(family_id);
CREATE INDEX IF NOT EXISTS idx_product_lob_id ON product(lob_id);

CREATE INDEX IF NOT EXISTS idx_product_family_lob_id ON product_family(lob_id);

CREATE INDEX IF NOT EXISTS idx_product_user_access_crm_user_id ON product_user_access(crm_user_id);

CREATE INDEX IF NOT EXISTS idx_record_share_shared_by ON record_share(shared_by);

CREATE INDEX IF NOT EXISTS idx_saved_filter_user_id ON saved_filter(user_id);

CREATE INDEX IF NOT EXISTS idx_security_role_business_unit_id ON security_role(business_unit_id);

CREATE INDEX IF NOT EXISTS idx_segment_business_unit_id ON segment(business_unit_id);

CREATE INDEX IF NOT EXISTS idx_subgrid_definition_form_section_id ON subgrid_definition(form_section_id);
CREATE INDEX IF NOT EXISTS idx_subgrid_definition_related_entity_id ON subgrid_definition(related_entity_definition_id);

CREATE INDEX IF NOT EXISTS idx_team_business_unit_id ON team(business_unit_id);

CREATE INDEX IF NOT EXISTS idx_team_security_role_role_id ON team_security_role(role_id);

CREATE INDEX IF NOT EXISTS idx_team_user_user_id ON team_user(user_id);

CREATE INDEX IF NOT EXISTS idx_ticket_account_id ON ticket(account_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assigned_team_id ON ticket(assigned_team_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assigned_user_id ON ticket(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_business_unit_id ON ticket(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_ticket_contact_id ON ticket(contact_id);
CREATE INDEX IF NOT EXISTS idx_ticket_priority_id ON ticket(priority_id);
CREATE INDEX IF NOT EXISTS idx_ticket_status_id ON ticket(status_id);

CREATE INDEX IF NOT EXISTS idx_ticket_comment_created_by ON ticket_comment(created_by);
CREATE INDEX IF NOT EXISTS idx_ticket_comment_ticket_id ON ticket_comment(ticket_id);

CREATE INDEX IF NOT EXISTS idx_user_security_role_role_id ON user_security_role(role_id);

CREATE INDEX IF NOT EXISTS idx_view_column_view_id ON view_column(view_id);

CREATE INDEX IF NOT EXISTS idx_workflow_definition_entity_id ON workflow_definition(entity_definition_id);

CREATE INDEX IF NOT EXISTS idx_workflow_step_workflow_id ON workflow_step(workflow_id);
