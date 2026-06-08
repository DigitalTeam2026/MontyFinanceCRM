export type TriggerEvent =
  | 'before_delete'
  | 'after_delete'
  | 'qualify_lead'
  | 'reactivate_lead'
  | 'close_opportunity_won'
  | 'close_opportunity_lost'
  | 'reopen_opportunity'
  | 'before_create'
  | 'on_form_load';

export type FormAccessLevel = 'allow_edit' | 'read_only' | 'not_allow';

export type RuleCategory = 'delete' | 'lifecycle' | 'automation' | 'governance';

export type ConditionType =
  | 'related_record_exists'
  | 'field_equals'
  | 'status_equals'
  | 'lookup_not_null'
  | 'custom';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'not_null'
  | 'is_null'
  | 'contains'
  | 'in'
  | 'greater_than'
  | 'less_than';

export type ActionType =
  | 'reopen_related'
  | 'delete_related'
  | 'block_delete'
  | 'clear_lookup'
  | 'update_field'
  | 'confirm_before_delete'
  | 'cascade_delete'
  | 'set_status'
  | 'create_record'
  | 'update_record'
  | 'show_dialog'
  | 'use_field_mappings'
  | 'clear_fields'
  | 'refresh_ui'
  | 'block_create'
  | 'set_form_access';

export type DialogType =
  | 'qualify'
  | 'requalify'
  | 'reopen'
  | 'close_won'
  | 'close_lost'
  | 'reopen_opportunity'
  | 'confirm';

export interface VisibilityCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in';
  value: string | string[];
}

export interface DigitalRule {
  digital_rule_id: string;
  name: string;
  description: string;
  entity_logical_name: string;
  trigger_event: TriggerEvent;
  is_active: boolean;
  priority: number;
  is_system: boolean;
  category: RuleCategory;
  command_label: string | null;
  command_icon: string | null;
  command_style: string | null;
  requires_dialog: boolean;
  dialog_type: DialogType | null;
  dialog_config: Record<string, unknown>;
  visible_when: VisibilityCondition[];
  created_by: string | null;
  created_at: string;
  modified_at: string;
  deleted_at: string | null;
  conditions?: DigitalRuleCondition[];
  actions?: DigitalRuleAction[];
}

export interface DigitalRuleCondition {
  digital_rule_condition_id: string;
  digital_rule_id: string;
  condition_type: ConditionType;
  target_entity: string | null;
  target_field: string | null;
  source_field: string | null;
  operator: ConditionOperator;
  value: string | null;
  display_order: number;
}

export interface DigitalRuleAction {
  digital_rule_action_id: string;
  digital_rule_id: string;
  action_type: ActionType;
  target_entity: string | null;
  target_field: string | null;
  source_field: string | null;
  field_value: string | null;
  message: string | null;
  display_order: number;
  action_config: Record<string, unknown>;
}

export interface DigitalRuleExecutionLog {
  log_id: string;
  digital_rule_id: string | null;
  rule_name: string;
  entity_logical_name: string;
  record_id: string;
  user_id: string;
  action_taken: string;
  success: boolean;
  error_message: string | null;
  executed_at: string;
}

export interface ConditionDraft extends Omit<DigitalRuleCondition, 'digital_rule_condition_id' | 'digital_rule_id'> {
  _tempId: string;
}

export interface ActionDraft extends Omit<DigitalRuleAction, 'digital_rule_action_id' | 'digital_rule_id'> {
  _tempId: string;
}

export const TRIGGER_EVENT_META: Record<TriggerEvent, { label: string; description: string; category: RuleCategory }> = {
  before_delete:          { label: 'Before Delete',           description: 'Runs before the record is deleted',                         category: 'delete' },
  after_delete:           { label: 'After Delete',            description: 'Runs after the record is deleted',                          category: 'delete' },
  qualify_lead:           { label: 'Qualify Lead',            description: 'Runs when a Lead is qualified',                             category: 'lifecycle' },
  reactivate_lead:        { label: 'Reactivate Lead',         description: 'Runs when a Lead is reactivated',                           category: 'lifecycle' },
  close_opportunity_won:  { label: 'Close Opportunity (Won)',  description: 'Runs when an Opportunity is closed as won',                 category: 'lifecycle' },
  close_opportunity_lost: { label: 'Close Opportunity (Lost)', description: 'Runs when an Opportunity is closed as lost',                category: 'lifecycle' },
  reopen_opportunity:     { label: 'Reopen Opportunity',       description: 'Runs when a closed Opportunity is reopened',                category: 'lifecycle' },
  before_create:          { label: 'Before Create',            description: 'Runs before a new record is created (can block creation)',   category: 'governance' },
  on_form_load:           { label: 'On Form Load',             description: 'Evaluated when a record form opens; controls form access',    category: 'governance' },
};

export const CONDITION_TYPE_META: Record<ConditionType, { label: string; description: string; needsTarget: boolean; needsSourceField: boolean; needsValue: boolean }> = {
  related_record_exists: { label: 'Related Record Exists',  description: 'Checks if related records exist in another table',       needsTarget: true,  needsSourceField: true,  needsValue: false },
  field_equals:          { label: 'Field Equals Value',     description: 'Checks if a field on the record equals a specific value', needsTarget: false, needsSourceField: true,  needsValue: true  },
  status_equals:         { label: 'Status/State Equals',    description: 'Checks if the record state_code matches a value',         needsTarget: false, needsSourceField: true,  needsValue: true  },
  lookup_not_null:       { label: 'Lookup Contains Value',  description: 'Checks if a lookup field is populated',                   needsTarget: false, needsSourceField: true,  needsValue: false },
  custom:                { label: 'Custom Condition',       description: 'A user-defined custom condition expression',              needsTarget: false, needsSourceField: false, needsValue: false },
};

export const CONDITION_OPERATOR_META: Record<ConditionOperator, { label: string; needsValue: boolean }> = {
  equals:       { label: 'Equals',            needsValue: true  },
  not_equals:   { label: 'Not Equals',        needsValue: true  },
  not_null:     { label: 'Is Not Null',       needsValue: false },
  is_null:      { label: 'Is Null',           needsValue: false },
  contains:     { label: 'Contains',          needsValue: true  },
  in:           { label: 'In List',           needsValue: true  },
  greater_than: { label: 'Greater Than',      needsValue: true  },
  less_than:    { label: 'Less Than',         needsValue: true  },
};

export const ACTION_TYPE_META: Record<ActionType, { label: string; description: string; needsTarget: boolean; needsField: boolean; needsSource: boolean; needsValue: boolean; needsMessage: boolean; color: string }> = {
  reopen_related:        { label: 'Reopen / Reactivate Related',  description: 'Sets a related record to Open/Active state',                              needsTarget: true,  needsField: false, needsSource: true,  needsValue: false, needsMessage: false, color: '#10b981' },
  delete_related:        { label: 'Delete Related Records',       description: 'Soft-deletes related records matching a lookup',                           needsTarget: true,  needsField: true,  needsSource: true,  needsValue: false, needsMessage: false, color: '#ef4444' },
  block_delete:          { label: 'Block Delete with Message',    description: 'Prevents the delete and shows a message to the user',                      needsTarget: false, needsField: false, needsSource: false, needsValue: false, needsMessage: true,  color: '#dc2626' },
  clear_lookup:          { label: 'Clear Lookup Field',           description: 'Nulls a lookup field on a related record',                                 needsTarget: true,  needsField: true,  needsSource: true,  needsValue: false, needsMessage: false, color: '#6b7280' },
  update_field:          { label: 'Update Field Value',           description: 'Sets a field on a related record to a specific value',                     needsTarget: true,  needsField: true,  needsSource: true,  needsValue: true,  needsMessage: false, color: '#3b82f6' },
  confirm_before_delete: { label: 'Show Confirmation',            description: 'Shows a confirmation dialog before proceeding with the delete',            needsTarget: false, needsField: false, needsSource: false, needsValue: false, needsMessage: true,  color: '#f59e0b' },
  cascade_delete:        { label: 'Cascade Delete Safely',        description: 'Soft-deletes all related records that match the lookup before main delete', needsTarget: true,  needsField: true,  needsSource: true,  needsValue: false, needsMessage: false, color: '#ef4444' },
  set_status:            { label: 'Set Status',                   description: 'Updates the state_code and status_reason of a record',                     needsTarget: true,  needsField: true,  needsSource: false, needsValue: true,  needsMessage: false, color: '#3b82f6' },
  create_record:         { label: 'Create Record',                description: 'Creates a new record in a target entity',                                  needsTarget: true,  needsField: false, needsSource: false, needsValue: false, needsMessage: false, color: '#10b981' },
  update_record:         { label: 'Update Record',                description: 'Updates fields on the current or related record',                          needsTarget: true,  needsField: true,  needsSource: false, needsValue: true,  needsMessage: false, color: '#3b82f6' },
  show_dialog:           { label: 'Show Dialog',                  description: 'Displays a dialog to the user before continuing',                          needsTarget: false, needsField: false, needsSource: false, needsValue: false, needsMessage: true,  color: '#f59e0b' },
  use_field_mappings:    { label: 'Use Field Mappings',           description: 'Creates records using configured field mapping rules',                      needsTarget: true,  needsField: false, needsSource: false, needsValue: false, needsMessage: false, color: '#10b981' },
  clear_fields:          { label: 'Clear Fields',                 description: 'Sets specified fields to null on the record',                              needsTarget: true,  needsField: false, needsSource: false, needsValue: false, needsMessage: false, color: '#6b7280' },
  refresh_ui:            { label: 'Refresh UI',                   description: 'Refreshes form, command bar, BPF, and subgrids',                          needsTarget: false, needsField: false, needsSource: false, needsValue: false, needsMessage: false, color: '#8b5cf6' },
  block_create:          { label: 'Block Create with Message',   description: 'Prevents manual record creation and shows a message',                     needsTarget: false, needsField: false, needsSource: false, needsValue: false, needsMessage: true,  color: '#dc2626' },
  set_form_access:       { label: 'Set Form Access',             description: 'Controls form editability: allow_edit, read_only, or not_allow',           needsTarget: false, needsField: false, needsSource: false, needsValue: true,  needsMessage: true,  color: '#0ea5e9' },
};

export const KNOWN_ENTITIES = [
  { logical_name: 'lead',           display_name: 'Lead' },
  { logical_name: 'opportunity',    display_name: 'Opportunity' },
  { logical_name: 'account',        display_name: 'Account' },
  { logical_name: 'contact',        display_name: 'Contact' },
  { logical_name: 'ticket',         display_name: 'Ticket' },
  { logical_name: 'product',        display_name: 'Product' },
  { logical_name: 'product_family', display_name: 'Product Family' },
];

export const ALL_TRIGGER_EVENTS: TriggerEvent[] = [
  'before_delete', 'after_delete',
  'qualify_lead', 'reactivate_lead',
  'close_opportunity_won', 'close_opportunity_lost', 'reopen_opportunity',
  'before_create',
  'on_form_load',
];

export const ALL_CONDITION_TYPES: ConditionType[] = ['related_record_exists', 'field_equals', 'status_equals', 'lookup_not_null', 'custom'];

export const ALL_ACTION_TYPES: ActionType[] = [
  'reopen_related', 'delete_related', 'block_delete', 'clear_lookup', 'update_field',
  'confirm_before_delete', 'cascade_delete',
  'set_status', 'create_record', 'update_record', 'show_dialog', 'use_field_mappings', 'clear_fields', 'refresh_ui',
  'block_create',
  'set_form_access',
];

export const CATEGORY_META: Record<RuleCategory, { label: string; description: string }> = {
  delete:     { label: 'Delete Rules',     description: 'Rules that control what happens when records are deleted' },
  lifecycle:  { label: 'Lifecycle Rules',   description: 'Rules for status transitions, qualification, and record lifecycle' },
  automation: { label: 'Automation Rules',  description: 'Rules for automated actions and transformations' },
  governance: { label: 'Governance Rules',  description: 'Rules that control record creation and enforce business policies' },
};
