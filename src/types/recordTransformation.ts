export type TransformationTrigger = 'manual' | 'on_create' | 'on_status_change';
export type TransformationExecutionMode = 'create_only' | 'create_or_update' | 'create_or_delete';
export type TransformationCreationMode = 'always' | 'optional' | 'never';
export type TransformationSourceEntity = 'lead' | 'opportunity' | 'contact' | 'account';
export type TransformationTargetEntity = 'lead' | 'opportunity' | 'contact' | 'account' | 'ticket';
export type FieldValueType = 'field' | 'static' | 'expression';
export type TransformationActionVisibility = 'always' | 'when_not_created' | 'when_created' | 'never';
export type TransformationInheritMode = 'source' | 'user_input' | 'default';
export type TransformationInstanceStatus = 'pending' | 'completed' | 'failed' | 'skipped';

export interface RecordTransformationRule {
  record_transformation_rule_id: string;
  name: string;
  description: string;
  source_entity: TransformationSourceEntity;
  trigger_type: TransformationTrigger;
  trigger_status_value: string | null;
  button_label: string;
  execution_mode: TransformationExecutionMode;
  is_active: boolean;
  is_default: boolean;
  is_system: boolean;
  conditions_json: ConditionGroup | null;
  created_at: string;
  modified_at: string;
  deleted_at: string | null;

  targets?: RecordTransformationTarget[];
  mappings?: RecordTransformationFieldMapping[];
}

export interface RecordTransformationTarget {
  record_transformation_target_id: string;
  rule_id: string;
  target_entity: TransformationTargetEntity;
  creation_mode: TransformationCreationMode;
  display_order: number;
  created_at: string;
  max_instances_per_source: number;
  requires_source_entity: string | null;
  action_visibility: TransformationActionVisibility;
  blocked_message: string | null;
  relationship_definition_id: string | null;
}

export interface RecordTransformationFieldMapping {
  record_transformation_field_mapping_id: string;
  rule_id: string;
  target_entity: TransformationTargetEntity;
  source_field: string;
  target_field: string;
  value_type: FieldValueType;
  static_value: string | null;
  expression_value: string | null;
  is_required: boolean;
  display_order: number;
  created_at: string;
  inherit_mode: TransformationInheritMode;
  locked: boolean;
  default_value: string | null;
}

export interface RecordTransformationInstance {
  record_transformation_instance_id: string;
  rule_id: string;
  source_entity: string;
  source_record_id: string;
  target_entity: string;
  target_record_id: string | null;
  status: TransformationInstanceStatus;
  initiated_by: string;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface RecordTransformationRuleFormData {
  name: string;
  description: string;
  source_entity: TransformationSourceEntity;
  trigger_type: TransformationTrigger;
  trigger_status_value: string;
  button_label: string;
  execution_mode: TransformationExecutionMode;
  is_active: boolean;
  is_default: boolean;
  conditions_json: ConditionGroup | null;
}

export interface ConditionGroup {
  id: string;
  operator: 'AND' | 'OR';
  conditions: Condition[];
  groups: ConditionGroup[];
}

export interface Condition {
  id: string;
  field: string;
  operator: string;
  value: unknown;
}

export type TransformationTargetPreset = 'single_per_source' | 'multiple_per_source';

export interface TransformationTargetPresetDef {
  label: string;
  description: string;
  max_instances_per_source: number;
  action_visibility: TransformationActionVisibility;
}

export const TARGET_PRESET_META: Record<TransformationTargetPreset, TransformationTargetPresetDef> = {
  single_per_source: {
    label: 'Single per Source',
    description: 'Only one target record can be created from each source record',
    max_instances_per_source: 1,
    action_visibility: 'when_not_created',
  },
  multiple_per_source: {
    label: 'Multiple per Source',
    description: 'Multiple target records can be created from the same source record',
    max_instances_per_source: 0,
    action_visibility: 'always',
  },
};

export const ACTION_VISIBILITY_META: Record<TransformationActionVisibility, { label: string; description: string }> = {
  always:           { label: 'Always visible',      description: 'Button always shown on the source record form' },
  when_not_created: { label: 'Until first created', description: 'Button hidden once at least one instance exists' },
  when_created:     { label: 'After first created', description: 'Button only shown once at least one instance exists' },
  never:            { label: 'Never visible',        description: 'Button never shown (automated triggers only)' },
};

export const INHERIT_MODE_META: Record<TransformationInheritMode, { label: string; description: string }> = {
  source:     { label: 'Copy from source', description: 'Value is copied from the mapped source field' },
  user_input: { label: 'User input',       description: 'User must provide this value at execution time' },
  default:    { label: 'Default value',    description: 'A fixed default value is used' },
};

export const TRIGGER_META: Record<TransformationTrigger, { label: string; description: string }> = {
  manual:           { label: 'Manual (Button)',   description: 'User clicks an action button on the record form' },
  on_create:        { label: 'On Create',         description: 'Fires automatically when a new record is created' },
  on_status_change: { label: 'On Status Change',  description: 'Fires when the record status changes to a specific value' },
};

export const EXECUTION_MODE_META: Record<TransformationExecutionMode, { label: string; description: string }> = {
  create_only:      { label: 'Create Only',      description: 'Always creates new target records' },
  create_or_update: { label: 'Create or Update', description: 'Creates new records or updates existing ones if found' },
  create_or_delete: { label: 'Create or Delete', description: 'Creates records, or deletes them if conditions no longer match' },
};

export const CREATION_MODE_META: Record<TransformationCreationMode, { label: string; description: string; color: string; bg: string }> = {
  always:   { label: 'Always',   description: 'Created automatically when the rule fires',  color: '#059669', bg: '#d1fae5' },
  optional: { label: 'Optional', description: 'User chooses at execution time',             color: '#2563eb', bg: '#dbeafe' },
  never:    { label: 'Never',    description: 'Skip this target entity entirely',           color: '#6b7280', bg: '#f3f4f6' },
};

export const SOURCE_ENTITY_META: Record<TransformationSourceEntity, { label: string; singularLabel: string }> = {
  lead:        { label: 'Leads',         singularLabel: 'Lead' },
  opportunity: { label: 'Opportunities', singularLabel: 'Opportunity' },
  contact:     { label: 'Contacts',      singularLabel: 'Contact' },
  account:     { label: 'Accounts',      singularLabel: 'Account' },
};

export const TARGET_ENTITY_META: Record<TransformationTargetEntity, { label: string; singularLabel: string }> = {
  lead:        { label: 'Leads',         singularLabel: 'Lead' },
  opportunity: { label: 'Opportunities', singularLabel: 'Opportunity' },
  contact:     { label: 'Contacts',      singularLabel: 'Contact' },
  account:     { label: 'Accounts',      singularLabel: 'Account' },
  ticket:      { label: 'Tickets',       singularLabel: 'Ticket' },
};

export const SOURCE_ENTITY_OPTIONS: TransformationSourceEntity[] = ['lead', 'opportunity', 'contact', 'account'];
export const TARGET_ENTITY_OPTIONS: TransformationTargetEntity[] = ['account', 'contact', 'opportunity', 'lead', 'ticket'];

export const FIELD_SUGGESTIONS: Record<TransformationSourceEntity | TransformationTargetEntity, string[]> = {
  lead: [
    'firstname', 'lastname', 'emailaddress1', 'telephone1', 'mobilephone',
    'companyname', 'jobtitle', 'subject', 'description',
    'websiteurl', 'industrycode', 'leadsourcecode',
    'address1_line1', 'address1_city', 'address1_stateorprovince', 'address1_postalcode', 'address1_country',
    'estimatedvalue', 'estimatedclosedate',
  ],
  opportunity: [
    'name', 'description', 'estimatedvalue', 'estimatedclosedate',
    'closeprobability', 'leadsourcecode', 'statuscode',
    'parentaccountid', 'parentcontactid', 'productid',
  ],
  contact: [
    'firstname', 'lastname', 'emailaddress1', 'telephone1', 'mobilephone',
    'jobtitle', 'department', 'parentaccountid',
    'address1_line1', 'address1_city', 'address1_stateorprovince', 'address1_postalcode', 'address1_country',
    'description',
  ],
  account: [
    'name', 'telephone1', 'fax', 'websiteurl', 'industrycode',
    'address1_line1', 'address1_city', 'address1_stateorprovince', 'address1_postalcode', 'address1_country',
    'description', 'accountnumber',
  ],
  ticket: [
    'title', 'description', 'prioritycode', 'statuscode', 'customerid', 'contactid',
  ],
};
