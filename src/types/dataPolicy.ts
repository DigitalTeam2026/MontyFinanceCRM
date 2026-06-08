export type PolicyCategory = 'uniqueness' | 'format' | 'mandatory' | 'relational' | 'lock' | 'custom';

export type EnforcementLevel = 'error' | 'warning' | 'info';

export type TriggerEvent = 'create' | 'update' | 'delete' | 'stage_change' | 'import' | 'api';

export type PolicyConditionOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'is_null' | 'is_not_null'
  | 'matches_regex' | 'not_matches_regex'
  | 'contains' | 'in';

export type EnforcementType =
  | 'block_save'
  | 'show_message'
  | 'require_field'
  | 'lock_field'
  | 'set_value'
  | 'notify_user';

// ─── Core Entities ─────────────────────────────────────────────────────────

export interface DataPolicy {
  data_policy_id: string;
  name: string;
  description: string;
  entity_logical_name: string;
  policy_category: PolicyCategory;
  enforcement_level: EnforcementLevel;
  trigger_on: TriggerEvent[];
  applies_to_products: string[] | null;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  modified_at: string;
  deleted_at: string | null;
  conditions?: PolicyCondition[];
  enforcements?: PolicyEnforcement[];
}

export interface PolicyCondition {
  condition_id: string;
  data_policy_id: string;
  field_name: string;
  operator: PolicyConditionOperator;
  value_text: string | null;
  display_order: number;
  created_at: string;
}

export interface PolicyEnforcement {
  enforcement_id: string;
  data_policy_id: string;
  enforcement_type: EnforcementType;
  target_field: string | null;
  message_text: string | null;
  value_text: string | null;
  display_order: number;
  created_at: string;
}

// ─── Draft (UI working copies) ─────────────────────────────────────────────

export interface PolicyConditionDraft extends Omit<PolicyCondition, 'condition_id' | 'data_policy_id' | 'created_at'> {
  _tempId: string;
}

export interface PolicyEnforcementDraft extends Omit<PolicyEnforcement, 'enforcement_id' | 'data_policy_id' | 'created_at'> {
  _tempId: string;
}

// ─── Form Data ─────────────────────────────────────────────────────────────

export interface DataPolicyFormData {
  name: string;
  description: string;
  entity_logical_name: string;
  policy_category: PolicyCategory;
  enforcement_level: EnforcementLevel;
  trigger_on: TriggerEvent[];
  is_active: boolean;
}

// ─── Metadata ──────────────────────────────────────────────────────────────

export const POLICY_CATEGORY_META: Record<PolicyCategory, { label: string; description: string; color: string }> = {
  uniqueness:  { label: 'Uniqueness',    description: 'Prevents duplicate values for a field',              color: '#3b82f6' },
  format:      { label: 'Format',        description: 'Validates data format (regex, E.164, email, etc.)',   color: '#8b5cf6' },
  mandatory:   { label: 'Mandatory',     description: 'Requires a field or relation to be present',          color: '#ef4444' },
  relational:  { label: 'Relational',    description: 'Enforces relationships between records',              color: '#f59e0b' },
  lock:        { label: 'Lock',          description: 'Prevents changes to a field once a condition is met', color: '#6b7280' },
  custom:      { label: 'Custom',        description: 'Any other data governance rule',                      color: '#10b981' },
};

export const ENFORCEMENT_LEVEL_META: Record<EnforcementLevel, { label: string; description: string; color: string; bg: string; border: string }> = {
  error:   { label: 'Error',   description: 'Blocks the save — the user cannot proceed',             color: '#dc2626', bg: 'bg-red-50',    border: 'border-red-200' },
  warning: { label: 'Warning', description: 'Shows an alert but allows save to continue',            color: '#d97706', bg: 'bg-amber-50',  border: 'border-amber-200' },
  info:    { label: 'Info',    description: 'Informational — does not block or warn, just displays', color: '#2563eb', bg: 'bg-blue-50',   border: 'border-blue-200' },
};

export const TRIGGER_EVENT_META: Record<TriggerEvent, { label: string }> = {
  create:       { label: 'Create' },
  update:       { label: 'Update' },
  delete:       { label: 'Delete' },
  stage_change: { label: 'Stage Change' },
  import:       { label: 'Import' },
  api:          { label: 'API Write' },
};

export const POLICY_CONDITION_OPERATOR_META: Record<PolicyConditionOperator, { label: string; needsValue: boolean }> = {
  eq:                  { label: 'Equals',             needsValue: true  },
  neq:                 { label: 'Not Equals',         needsValue: true  },
  gt:                  { label: 'Greater Than',       needsValue: true  },
  gte:                 { label: 'Greater Than or Equal', needsValue: true },
  lt:                  { label: 'Less Than',          needsValue: true  },
  lte:                 { label: 'Less Than or Equal', needsValue: true  },
  is_null:             { label: 'Is Empty',           needsValue: false },
  is_not_null:         { label: 'Is Not Empty',       needsValue: false },
  matches_regex:       { label: 'Matches Pattern',    needsValue: true  },
  not_matches_regex:   { label: 'Does Not Match Pattern', needsValue: true },
  contains:            { label: 'Contains',           needsValue: true  },
  in:                  { label: 'In List',            needsValue: true  },
};

export const ENFORCEMENT_TYPE_META: Record<EnforcementType, { label: string; description: string; needsField: boolean; needsMessage: boolean; needsValue: boolean }> = {
  block_save:    { label: 'Block Save',      description: 'Prevents the record from being saved',         needsField: false, needsMessage: true,  needsValue: false },
  show_message:  { label: 'Show Message',    description: 'Displays a message to the user',               needsField: false, needsMessage: true,  needsValue: false },
  require_field: { label: 'Require Field',   description: 'Marks a field as mandatory',                   needsField: true,  needsMessage: false, needsValue: false },
  lock_field:    { label: 'Lock Field',      description: 'Makes a field read-only',                      needsField: true,  needsMessage: false, needsValue: false },
  set_value:     { label: 'Set Value',       description: 'Sets a field to a specific value',             needsField: true,  needsMessage: false, needsValue: true  },
  notify_user:   { label: 'Notify User',     description: 'Sends a notification to the record owner',     needsField: false, needsMessage: true,  needsValue: false },
};

export const KNOWN_ENTITIES = [
  { logical_name: 'opportunity', display_name: 'Opportunity' },
  { logical_name: 'account',     display_name: 'Account' },
  { logical_name: 'contact',     display_name: 'Contact' },
  { logical_name: 'lead',        display_name: 'Lead' },
  { logical_name: 'case',        display_name: 'Case' },
  { logical_name: 'order',       display_name: 'Order' },
  { logical_name: 'quote',       display_name: 'Quote' },
  { logical_name: 'contract',    display_name: 'Contract' },
];

export const ALL_TRIGGER_EVENTS: TriggerEvent[] = ['create', 'update', 'delete', 'stage_change', 'import', 'api'];
