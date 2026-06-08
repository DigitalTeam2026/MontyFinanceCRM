export type StageType = 'active' | 'terminal_success' | 'terminal_failure' | 'terminal_neutral';

export type ComponentType = 'stage' | 'condition';

export type StageCategory =
  | 'general'
  | 'prospecting'
  | 'qualification'
  | 'proposal'
  | 'negotiation'
  | 'closing'
  | 'post_sale'
  | 'review'
  | 'onboarding';

export const STAGE_CATEGORIES: { id: StageCategory; label: string }[] = [
  { id: 'general',       label: 'General' },
  { id: 'prospecting',   label: 'Prospecting' },
  { id: 'qualification', label: 'Qualification' },
  { id: 'proposal',      label: 'Proposal' },
  { id: 'negotiation',   label: 'Negotiation' },
  { id: 'closing',       label: 'Closing' },
  { id: 'post_sale',     label: 'Post-Sale' },
  { id: 'review',        label: 'Review' },
  { id: 'onboarding',    label: 'Onboarding' },
];

export interface RuleCondition {
  field: string;
  operator: string;
  value: string | number | boolean | null;
}

export interface StageVisibleField {
  field: string;
}

export interface GateRequiredField {
  field: string;
  label: string;
}

export interface GateCondition {
  field: string;
  label: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'not_empty';
  value: string | number | boolean | null;
  message: string;
}

export interface ProcessStageField {
  psf_id: string;
  process_stage_id: string;
  process_flow_id: string;
  field_logical_name: string;
  display_label: string | null;
  is_visible: boolean;
  is_required: boolean;
  is_readonly: boolean;
  display_order: number;
  related_entity_id: string | null;
  created_at: string;
}

export interface TransitionCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'not_empty' | 'empty' | 'contains' | 'not_contains';
  value: string | number | boolean | null;
  logic?: 'AND' | 'OR';
}

export interface ProcessStage {
  process_stage_id: string;
  process_flow_id: string;
  component_type: ComponentType;
  name: string;
  description: string;
  stage_key: string;
  display_order: number;
  stage_color: string;
  stage_type: StageType;
  stage_category: StageCategory;
  is_default: boolean;
  is_fixed: boolean;
  is_terminal: boolean;
  probability: number | null;
  allow_backward_movement: boolean;
  requires_entry_approval: boolean;
  requires_exit_approval: boolean;
  entry_rules: RuleCondition[];
  exit_rules: RuleCondition[];
  allowed_transitions: string[] | null;
  stage_visible_fields: StageVisibleField[];
  gate_required_fields: GateRequiredField[];
  gate_conditions: GateCondition[];
  target_entity_id: string | null;
  stage_entity_id: string | null;
  target_relationship_name: string;
  relationship_definition_id: string | null;
  create_linked_record: boolean;
  // Condition branch fields
  branch_yes_stage_id: string | null;
  branch_no_stage_id: string | null;
  condition_entity_id: string | null;
  condition_field: string | null;
  condition_operator: string | null;
  condition_value: string | null;
  created_at: string;
  modified_at: string;
}

export interface ProcessFlowTransition {
  transition_id: string;
  process_flow_id: string;
  from_stage_id: string;
  to_stage_id: string;
  transition_name: string;
  requires_fields: string[];
  conditions: TransitionCondition[];
  priority: number;
  is_default: boolean;
  created_at: string;
}

export type ProcessFlowScope = 'global' | 'lob' | 'product';

export type LinkBehavior = 'open_existing' | 'create_if_missing' | 'ask_user' | 'auto_create' | 'use_latest';

export const LINK_BEHAVIOR_OPTIONS: { value: LinkBehavior; label: string; description: string }[] = [
  { value: 'open_existing',    label: 'Open Existing Record',         description: 'Navigate to the existing related record' },
  { value: 'create_if_missing', label: 'Create Record if Missing',    description: 'Create a new record only if none exists' },
  { value: 'ask_user',         label: 'Ask User to Select Record',    description: 'Prompt the user to select or create a record' },
  { value: 'auto_create',      label: 'Auto-create Related Record',   description: 'Always create a new linked record automatically' },
  { value: 'use_latest',       label: 'Use Latest Related Record',    description: 'Automatically use the most recently created related record' },
];

export interface ProcessFlowEntityConfig {
  config_id: string;
  process_flow_id: string;
  entity_definition_id: string;
  is_primary: boolean;
  form_id: string | null;
  relationship_definition_id: string | null;
  relationship_column: string;
  link_behavior: LinkBehavior;
  display_order: number;
  created_at: string;
  modified_at: string;
  // Joined fields (loaded by service, not in DB)
  entity_display_name?: string;
  entity_logical_name?: string;
  form_name?: string;
  relationship_display_name?: string;
}

export interface ProcessFlowEntityConfigFormData {
  entity_definition_id: string;
  form_id: string | null;
  relationship_definition_id: string | null;
  relationship_column: string;
  link_behavior: LinkBehavior;
  display_order: number;
}

export interface ProcessFlow {
  process_flow_id: string;
  name: string;
  description: string;
  entity_definition_id: string;
  lob_id: string | null;
  product_id: string | null;
  form_id: string | null;
  stage_field: string;
  is_active: boolean;
  is_system: boolean;
  default_stage_id: string | null;
  created_at: string;
  created_by: string | null;
  modified_at: string;
  modified_by: string | null;
  deleted_at: string | null;
  stages?: ProcessStage[];
  transitions?: ProcessFlowTransition[];
}

export interface ProcessFlowFormData {
  name: string;
  description: string;
  entity_definition_id: string;
  lob_id: string | null;
  product_id: string | null;
  form_id: string | null;
  stage_field: string;
  is_active: boolean;
}

export interface ProcessStageFormData {
  name: string;
  description: string;
  stage_key: string;
  component_type?: ComponentType;
  display_order: number;
  stage_color: string;
  stage_type: StageType;
  stage_category: StageCategory;
  is_default: boolean;
  is_fixed?: boolean;
  probability: number | null;
  allow_backward_movement: boolean;
  requires_entry_approval: boolean;
  requires_exit_approval: boolean;
  entry_rules: RuleCondition[];
  exit_rules: RuleCondition[];
  target_entity_id: string | null;
  stage_entity_id: string | null;
  target_relationship_name: string;
  relationship_definition_id: string | null;
  create_linked_record: boolean;
  // Condition branch fields
  branch_yes_stage_id?: string | null;
  branch_no_stage_id?: string | null;
  condition_entity_id?: string | null;
  condition_field?: string | null;
  condition_operator?: string | null;
  condition_value?: string | null;
}

export interface ProcessFlowInstance {
  instance_id: string;
  process_flow_id: string;
  entity_definition_id: string;
  record_id: string;
  current_stage_id: string | null;
  status: 'active' | 'completed' | 'abandoned';
  started_on: string;
  completed_on: string | null;
  created_by: string | null;
  created_at: string;
  modified_at: string;
}

export interface StageHistoryEntry {
  history_id: string;
  instance_id: string;
  from_stage_id: string | null;
  from_stage_key: string | null;
  to_stage_id: string;
  to_stage_key: string;
  changed_by: string | null;
  changed_on: string;
  duration_seconds: number | null;
  comment: string | null;
  transition_result: string | null;
}

export const STAGE_TYPE_META: Record<StageType, { label: string; color: string; description: string }> = {
  active: {
    label: 'Active',
    color: '#3b82f6',
    description: 'A regular progression stage in the lifecycle',
  },
  terminal_success: {
    label: 'Terminal (Success)',
    color: '#10b981',
    description: 'A final stage representing a successful outcome (e.g. Won, Converted)',
  },
  terminal_failure: {
    label: 'Terminal (Failure)',
    color: '#ef4444',
    description: 'A final stage representing a negative outcome (e.g. Lost, Disqualified)',
  },
  terminal_neutral: {
    label: 'Terminal (Neutral)',
    color: '#6b7280',
    description: 'A final stage that is neither success nor failure (e.g. Cancelled)',
  },
};

export const TRANSITION_OPERATORS: { value: TransitionCondition['operator']; label: string }[] = [
  { value: 'eq',           label: 'equals' },
  { value: 'neq',          label: 'not equals' },
  { value: 'gt',           label: 'greater than' },
  { value: 'gte',          label: 'greater than or equal' },
  { value: 'lt',           label: 'less than' },
  { value: 'lte',          label: 'less than or equal' },
  { value: 'not_empty',    label: 'is set' },
  { value: 'empty',        label: 'is empty' },
  { value: 'contains',     label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
];

export const CONDITION_OPERATORS = [
  { value: 'eq',           label: 'Equals' },
  { value: 'neq',          label: 'Not Equals' },
  { value: 'gt',           label: 'Greater Than' },
  { value: 'gte',          label: 'Greater Than or Equal' },
  { value: 'lt',           label: 'Less Than' },
  { value: 'lte',          label: 'Less Than or Equal' },
  { value: 'not_empty',    label: 'Is Set' },
  { value: 'empty',        label: 'Is Empty' },
  { value: 'contains',     label: 'Contains' },
  { value: 'not_contains', label: 'Does Not Contain' },
];
