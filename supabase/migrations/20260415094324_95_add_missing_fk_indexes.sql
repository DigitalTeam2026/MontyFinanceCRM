/*
  # Add Missing Foreign Key Indexes

  ## Summary
  Creates covering indexes for all foreign key columns that currently lack them.
  This resolves "Unindexed foreign key" warnings and prevents slow sequential
  scans on joins and cascaded deletes.

  ## Tables Covered
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
  - lead: country_id, created_by, currency_id, disqualified_by, industry_id,
          modified_by, qualified_account_id, qualified_contact_id,
          qualified_opportunity_id, reopened_by, source_id, subsource_id
  - marketing_email: created_by, modified_by
  - merge_audit_log: performed_by
  - merge_candidate: resolved_by
  - merge_decision: executed_by
  - note: modified_by
  - opportunity: created_by, currency_id, modified_by, source_id
  - opportunity_contact: added_by
  - process_flow: default_stage (fk_process_flow_default_stage), created_by, modified_by
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

-- account
CREATE INDEX IF NOT EXISTS idx_account_created_by ON public.account (created_by);
CREATE INDEX IF NOT EXISTS idx_account_currency_id ON public.account (currency_id);
CREATE INDEX IF NOT EXISTS idx_account_modified_by ON public.account (modified_by);
CREATE INDEX IF NOT EXISTS idx_account_parent_account_id ON public.account (parent_account_id);

-- business_rule
CREATE INDEX IF NOT EXISTS idx_business_rule_created_by ON public.business_rule (created_by);
CREATE INDEX IF NOT EXISTS idx_business_rule_modified_by ON public.business_rule (modified_by);

-- campaign
CREATE INDEX IF NOT EXISTS idx_campaign_created_by ON public.campaign (created_by);
CREATE INDEX IF NOT EXISTS idx_campaign_currency_id ON public.campaign (currency_id);
CREATE INDEX IF NOT EXISTS idx_campaign_modified_by ON public.campaign (modified_by);

-- contact
CREATE INDEX IF NOT EXISTS idx_contact_country_id ON public.contact (country_id);
CREATE INDEX IF NOT EXISTS idx_contact_created_by ON public.contact (created_by);
CREATE INDEX IF NOT EXISTS idx_contact_modified_by ON public.contact (modified_by);
CREATE INDEX IF NOT EXISTS idx_contact_source_id ON public.contact (source_id);
CREATE INDEX IF NOT EXISTS idx_contact_subsource_id ON public.contact (subsource_id);

-- currency_audit_log
CREATE INDEX IF NOT EXISTS idx_currency_audit_log_changed_by ON public.currency_audit_log (changed_by);
CREATE INDEX IF NOT EXISTS idx_currency_audit_log_new_currency_id ON public.currency_audit_log (new_currency_id);
CREATE INDEX IF NOT EXISTS idx_currency_audit_log_old_currency_id ON public.currency_audit_log (old_currency_id);

-- dashboard
CREATE INDEX IF NOT EXISTS idx_dashboard_created_by ON public.dashboard (created_by);

-- dashboard_widget
CREATE INDEX IF NOT EXISTS idx_dashboard_widget_dashboard_id ON public.dashboard_widget (dashboard_id);

-- duplicate_job
CREATE INDEX IF NOT EXISTS idx_duplicate_job_triggered_by ON public.duplicate_job (triggered_by);

-- event
CREATE INDEX IF NOT EXISTS idx_event_created_by ON public.event (created_by);
CREATE INDEX IF NOT EXISTS idx_event_modified_by ON public.event (modified_by);

-- field_change_log
CREATE INDEX IF NOT EXISTS idx_field_change_log_changed_by ON public.field_change_log (changed_by);

-- field_definition
CREATE INDEX IF NOT EXISTS idx_field_definition_lookup_entity_id ON public.field_definition (lookup_entity_id);
CREATE INDEX IF NOT EXISTS idx_field_definition_option_set_id ON public.field_definition (option_set_id);

-- journey
CREATE INDEX IF NOT EXISTS idx_journey_created_by ON public.journey (created_by);
CREATE INDEX IF NOT EXISTS idx_journey_modified_by ON public.journey (modified_by);

-- journey_step
CREATE INDEX IF NOT EXISTS idx_journey_step_next_step_false_id ON public.journey_step (next_step_false_id);
CREATE INDEX IF NOT EXISTS idx_journey_step_next_step_id ON public.journey_step (next_step_id);

-- lead
CREATE INDEX IF NOT EXISTS idx_lead_country_id ON public.lead (country_id);
CREATE INDEX IF NOT EXISTS idx_lead_created_by ON public.lead (created_by);
CREATE INDEX IF NOT EXISTS idx_lead_currency_id ON public.lead (currency_id);
CREATE INDEX IF NOT EXISTS idx_lead_disqualified_by ON public.lead (disqualified_by);
CREATE INDEX IF NOT EXISTS idx_lead_industry_id ON public.lead (industry_id);
CREATE INDEX IF NOT EXISTS idx_lead_modified_by ON public.lead (modified_by);
CREATE INDEX IF NOT EXISTS idx_lead_qualified_account_id ON public.lead (qualified_account_id);
CREATE INDEX IF NOT EXISTS idx_lead_qualified_contact_id ON public.lead (qualified_contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_qualified_opportunity_id ON public.lead (qualified_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_lead_reopened_by ON public.lead (reopened_by);
CREATE INDEX IF NOT EXISTS idx_lead_source_id ON public.lead (source_id);
CREATE INDEX IF NOT EXISTS idx_lead_subsource_id ON public.lead (subsource_id);

-- marketing_email
CREATE INDEX IF NOT EXISTS idx_marketing_email_created_by ON public.marketing_email (created_by);
CREATE INDEX IF NOT EXISTS idx_marketing_email_modified_by ON public.marketing_email (modified_by);

-- merge_audit_log
CREATE INDEX IF NOT EXISTS idx_merge_audit_log_performed_by ON public.merge_audit_log (performed_by);

-- merge_candidate
CREATE INDEX IF NOT EXISTS idx_merge_candidate_resolved_by ON public.merge_candidate (resolved_by);

-- merge_decision
CREATE INDEX IF NOT EXISTS idx_merge_decision_executed_by ON public.merge_decision (executed_by);

-- note
CREATE INDEX IF NOT EXISTS idx_note_modified_by ON public.note (modified_by);

-- opportunity
CREATE INDEX IF NOT EXISTS idx_opportunity_created_by ON public.opportunity (created_by);
CREATE INDEX IF NOT EXISTS idx_opportunity_currency_id ON public.opportunity (currency_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_modified_by ON public.opportunity (modified_by);
CREATE INDEX IF NOT EXISTS idx_opportunity_source_id ON public.opportunity (source_id);

-- opportunity_contact
CREATE INDEX IF NOT EXISTS idx_opportunity_contact_added_by ON public.opportunity_contact (added_by);

-- process_flow
CREATE INDEX IF NOT EXISTS idx_process_flow_default_stage_id ON public.process_flow (default_stage_id);
CREATE INDEX IF NOT EXISTS idx_process_flow_created_by ON public.process_flow (created_by);
CREATE INDEX IF NOT EXISTS idx_process_flow_modified_by ON public.process_flow (modified_by);

-- process_flow_transition
CREATE INDEX IF NOT EXISTS idx_process_flow_transition_to_stage_id ON public.process_flow_transition (to_stage_id);

-- product
CREATE INDEX IF NOT EXISTS idx_product_created_by ON public.product (created_by);
CREATE INDEX IF NOT EXISTS idx_product_modified_by ON public.product (modified_by);

-- product_business_unit_access
CREATE INDEX IF NOT EXISTS idx_product_business_unit_access_business_unit_id ON public.product_business_unit_access (business_unit_id);
CREATE INDEX IF NOT EXISTS idx_product_business_unit_access_granted_by ON public.product_business_unit_access (granted_by);

-- product_role_access
CREATE INDEX IF NOT EXISTS idx_product_role_access_granted_by ON public.product_role_access (granted_by);
CREATE INDEX IF NOT EXISTS idx_product_role_access_role_id ON public.product_role_access (role_id);

-- product_team_access
CREATE INDEX IF NOT EXISTS idx_product_team_access_granted_by ON public.product_team_access (granted_by);
CREATE INDEX IF NOT EXISTS idx_product_team_access_team_id ON public.product_team_access (team_id);

-- product_user_access
CREATE INDEX IF NOT EXISTS idx_product_user_access_granted_by ON public.product_user_access (granted_by);

-- segment
CREATE INDEX IF NOT EXISTS idx_segment_created_by ON public.segment (created_by);
CREATE INDEX IF NOT EXISTS idx_segment_modified_by ON public.segment (modified_by);

-- subgrid_definition
CREATE INDEX IF NOT EXISTS idx_subgrid_definition_view_id ON public.subgrid_definition (view_id);

-- ticket
CREATE INDEX IF NOT EXISTS idx_ticket_created_by ON public.ticket (created_by);
CREATE INDEX IF NOT EXISTS idx_ticket_modified_by ON public.ticket (modified_by);
CREATE INDEX IF NOT EXISTS idx_ticket_opportunity_id ON public.ticket (opportunity_id);

-- ticket_comment
CREATE INDEX IF NOT EXISTS idx_ticket_comment_modified_by ON public.ticket_comment (modified_by);

-- user_notification
CREATE INDEX IF NOT EXISTS idx_user_notification_sender_id ON public.user_notification (sender_id);

-- view_column
CREATE INDEX IF NOT EXISTS idx_view_column_field_definition_id ON public.view_column (field_definition_id);

-- view_definition
CREATE INDEX IF NOT EXISTS idx_view_definition_created_by ON public.view_definition (created_by);

-- workflow_definition
CREATE INDEX IF NOT EXISTS idx_workflow_definition_created_by ON public.workflow_definition (created_by);

-- workflow_step
CREATE INDEX IF NOT EXISTS idx_workflow_step_next_step_id ON public.workflow_step (next_step_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_next_step_on_false ON public.workflow_step (next_step_on_false);
