/*
  # Seed Default Digital Rules

  1. Rule: "Reopen Lead when Opportunity is deleted"
    - Entity: opportunity
    - Trigger: before_delete
    - Condition: originating_lead_id is not null (has a related lead)
    - Actions:
      a. Reopen the related lead (set state_code=1, status_reason=1, clear qualified fields)
      b. Delete the opportunity (soft delete)

  2. Rule: "Cascade delete Opportunities when Lead is deleted"
    - Entity: lead
    - Trigger: before_delete
    - Condition: related opportunities exist where originating_lead_id = lead_id
    - Actions:
      a. Show confirmation: "This Lead has related Opportunities. Deleting this Lead will also delete the related Opportunities. Do you want to continue?"
      b. Cascade delete all related opportunities
      c. Delete the lead (soft delete)
*/

-- ── Rule 1: Reopen Lead when Opportunity is deleted ──

INSERT INTO digital_rule (digital_rule_id, name, description, entity_logical_name, trigger_event, is_active, priority, is_system)
VALUES (
  'a1b2c3d4-1111-4000-8000-000000000001',
  'Reopen Lead when Opportunity is deleted',
  'When an Opportunity that was created from a Lead qualification is deleted, the originating Lead is automatically reopened so it can be reworked or re-qualified.',
  'opportunity',
  'before_delete',
  true,
  10,
  true
) ON CONFLICT (digital_rule_id) DO NOTHING;

INSERT INTO digital_rule_condition (digital_rule_condition_id, digital_rule_id, condition_type, source_field, operator, display_order)
VALUES (
  'b1b2c3d4-1111-4000-8000-000000000001',
  'a1b2c3d4-1111-4000-8000-000000000001',
  'lookup_not_null',
  'originating_lead_id',
  'not_null',
  0
) ON CONFLICT (digital_rule_condition_id) DO NOTHING;

INSERT INTO digital_rule_action (digital_rule_action_id, digital_rule_id, action_type, target_entity, target_field, source_field, field_value, display_order)
VALUES
  -- Action 1: Update the lead state back to Open/Active
  (
    'c1b2c3d4-1111-4000-8000-000000000001',
    'a1b2c3d4-1111-4000-8000-000000000001',
    'update_field',
    'lead',
    'state_code',
    'originating_lead_id',
    '1',
    0
  ),
  -- Action 2: Update the lead status_reason to Active
  (
    'c1b2c3d4-1111-4000-8000-000000000002',
    'a1b2c3d4-1111-4000-8000-000000000001',
    'update_field',
    'lead',
    'status_reason',
    'originating_lead_id',
    '1',
    1
  ),
  -- Action 3: Clear the qualified_opportunity_id on the lead
  (
    'c1b2c3d4-1111-4000-8000-000000000003',
    'a1b2c3d4-1111-4000-8000-000000000001',
    'clear_lookup',
    'lead',
    'qualified_opportunity_id',
    'originating_lead_id',
    NULL,
    2
  ),
  -- Action 4: Clear the qualified_contact_id on the lead
  (
    'c1b2c3d4-1111-4000-8000-000000000004',
    'a1b2c3d4-1111-4000-8000-000000000001',
    'clear_lookup',
    'lead',
    'qualified_contact_id',
    'originating_lead_id',
    NULL,
    3
  ),
  -- Action 5: Clear the qualified_account_id on the lead
  (
    'c1b2c3d4-1111-4000-8000-000000000005',
    'a1b2c3d4-1111-4000-8000-000000000001',
    'clear_lookup',
    'lead',
    'qualified_account_id',
    'originating_lead_id',
    NULL,
    4
  )
ON CONFLICT (digital_rule_action_id) DO NOTHING;

-- ── Rule 2: Cascade delete Opportunities when Lead is deleted ──

INSERT INTO digital_rule (digital_rule_id, name, description, entity_logical_name, trigger_event, is_active, priority, is_system)
VALUES (
  'a1b2c3d4-2222-4000-8000-000000000001',
  'Cascade delete Opportunities when Lead is deleted',
  'When a Lead is deleted, all Opportunities that were created from this Lead (via qualification) are also deleted. A confirmation is shown before proceeding.',
  'lead',
  'before_delete',
  true,
  10,
  true
) ON CONFLICT (digital_rule_id) DO NOTHING;

INSERT INTO digital_rule_condition (digital_rule_condition_id, digital_rule_id, condition_type, target_entity, target_field, source_field, operator, display_order)
VALUES (
  'b1b2c3d4-2222-4000-8000-000000000001',
  'a1b2c3d4-2222-4000-8000-000000000001',
  'related_record_exists',
  'opportunity',
  'originating_lead_id',
  'lead_id',
  'equals',
  0
) ON CONFLICT (digital_rule_condition_id) DO NOTHING;

INSERT INTO digital_rule_action (digital_rule_action_id, digital_rule_id, action_type, target_entity, target_field, source_field, message, display_order)
VALUES
  -- Action 1: Show confirmation message
  (
    'c1b2c3d4-2222-4000-8000-000000000001',
    'a1b2c3d4-2222-4000-8000-000000000001',
    'confirm_before_delete',
    NULL,
    NULL,
    NULL,
    'This Lead has related Opportunities. Deleting this Lead will also delete the related Opportunities. Do you want to continue?',
    0
  ),
  -- Action 2: Cascade delete all related opportunities
  (
    'c1b2c3d4-2222-4000-8000-000000000002',
    'a1b2c3d4-2222-4000-8000-000000000001',
    'cascade_delete',
    'opportunity',
    'originating_lead_id',
    'lead_id',
    NULL,
    1
  )
ON CONFLICT (digital_rule_action_id) DO NOTHING;
