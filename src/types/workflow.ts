export type WorkflowTriggerType =
  | 'on_create'
  | 'on_update'
  | 'on_delete'
  | 'on_status_change'
  | 'scheduled'
  | 'manual';

export type WorkflowStepType =
  | 'update_record'
  | 'assign_record'
  | 'send_notification'
  | 'create_record'
  | 'delete_record'
  | 'variable'
  | 'condition'
  | 'wait'
  | 'webhook';

// Power-Automate-style variable action. One step type covers all operations.
export interface VariableConfig {
  operation: 'initialize' | 'set' | 'increment' | 'append';
  var_name: string;
  /** Only for `initialize`. */
  var_type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Literal or token string (supports {{field}} and {{var.name}}). */
  value?: string;
}

// A single row-match clause used by the `match` targeting mode. The value is
// either a literal (static) or pulled from a field on the trigger record.
export interface MatchCondition {
  id: string;
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'in' | 'is_null' | 'is_not_null';
  value_source?: 'static' | 'trigger_field';
  value?: string;
}

// Shared targeting for record-mutating steps:
//   trigger → the record that fired the workflow
//   lookup  → the record a lookup field on the trigger record points to
//   match   → any rows in a freely-chosen table that match the conditions
export interface RecordTarget {
  target_mode?: 'trigger' | 'lookup' | 'match';
  /** Logical name of a lookup field on the trigger entity (lookup mode). */
  target_lookup_field?: string;
  /** Physical table of the related/target entity, captured when picked. */
  target_entity_table?: string;
  /** Primary-key column of the related/target entity. */
  target_pk_column?: string;
  /** Row-match clauses for `match` mode (ALL must hold; at least one required). */
  match_conditions?: MatchCondition[];
}

export interface WorkflowTriggerConditions {
  watch_fields?: string[];
  status_from?: string;
  status_to?: string;
  filter_conditions?: WorkflowFilterCondition[];
  schedule_cron?: string;
  /** Power-Automate-style change types a record-change trigger listens to. */
  change_types?: ('create' | 'update' | 'delete')[];
}

export interface WorkflowFilterCondition {
  id: string;
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'in' | 'not_in' | 'is_null' | 'is_not_null';
  // For `in` / `not_in` this holds a comma-separated list of values.
  value?: string;
}

export interface WorkflowDefinition {
  workflow_id: string;
  entity_definition_id: string | null;
  name: string;
  description: string | null;
  trigger_type: WorkflowTriggerType;
  trigger_conditions: WorkflowTriggerConditions;
  run_as: string;
  is_active: boolean;
  is_system: boolean;
  is_deletable: boolean;
  deleted_at: string | null;
  last_triggered_at: string | null;
  run_count: number;
  created_by: string | null;
  created_at: string;
  modified_at: string;
  /** Engine v2: the whole nested flow ({ enabled, trigger, steps }). Null = legacy flat steps. */
  definition?: Record<string, unknown> | null;
}

export interface WorkflowStep {
  workflow_step_id: string;
  workflow_id: string;
  step_type: WorkflowStepType;
  name: string;
  label: string | null;
  description: string | null;
  step_order: number;
  config_json: WorkflowStepConfig;
  next_step_id: string | null;
  next_step_on_false: string | null;
  position_x: number;
  position_y: number;
}

export type WorkflowStepConfig =
  | UpdateRecordConfig
  | AssignRecordConfig
  | SendNotificationConfig
  | CreateRecordConfig
  | DeleteRecordConfig
  | VariableConfig
  | ConditionConfig
  | WaitConfig
  | WebhookConfig
  | Record<string, unknown>;

export interface UpdateRecordConfig extends RecordTarget {
  field_updates: FieldUpdate[];
}

export type DeleteRecordConfig = RecordTarget;

export interface FieldUpdate {
  id: string;
  field_logical_name: string;
  field_display_name: string;
  value_type: 'static' | 'field_ref' | 'formula';
  value: string;
}

export interface AssignRecordConfig {
  assign_to: 'user' | 'team' | 'field_value';
  user_id?: string;
  team_id?: string;
  field_ref?: string;
  ownership_field?: string;
}

export interface SendNotificationConfig {
  channel: 'in_app' | 'email';
  recipients: NotificationRecipient[];
  subject?: string;
  body: string;
  body_includes_record_link?: boolean;
}

export interface NotificationRecipient {
  id: string;
  type: 'owner' | 'creator' | 'specific_user' | 'field_ref';
  user_id?: string;
  field_ref?: string;
  label: string;
}

export interface CreateRecordConfig {
  target_entity_logical_name: string;
  target_entity_display_name: string;
  field_mappings: FieldMapping[];
}

export interface FieldMapping {
  id: string;
  target_field: string;
  target_field_display_name: string;
  source_type: 'static' | 'field_ref' | 'current_user';
  source_value: string;
}

export interface ConditionConfig {
  conditions: ConditionBranch[];
}

export interface ConditionBranch {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export interface WaitConfig {
  wait_type: 'duration' | 'until_field';
  duration_value?: number;
  duration_unit?: 'minutes' | 'hours' | 'days';
  field_ref?: string;
}

export interface WebhookConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers: WebhookHeader[];
  body_template?: string;
}

export interface WebhookHeader {
  id: string;
  key: string;
  value: string;
}

export const TRIGGER_META: Record<
  WorkflowTriggerType,
  { label: string; desc: string; icon: string; color: string }
> = {
  on_create:        { label: 'Record Created',    desc: 'Triggers when a new record is created',        icon: 'PlusCircle',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  on_update:        { label: 'Record Updated',    desc: 'Triggers when a record field changes',         icon: 'Pencil',      color: 'bg-blue-50 text-blue-700 border-blue-200' },
  on_delete:        { label: 'Record Deleted',    desc: 'Triggers when a record is deleted',            icon: 'Trash2',      color: 'bg-red-50 text-red-700 border-red-200' },
  on_status_change: { label: 'Status Changed',    desc: 'Triggers on a specific status transition',    icon: 'RefreshCw',   color: 'bg-amber-50 text-amber-700 border-amber-200' },
  scheduled:        { label: 'Scheduled',         desc: 'Runs on a recurring schedule',                 icon: 'Clock',       color: 'bg-slate-50 text-slate-700 border-slate-200' },
  manual:           { label: 'Manual Trigger',    desc: 'Run on demand by a user',                      icon: 'Play',        color: 'bg-violet-50 text-violet-700 border-violet-200' },
};

export const STEP_META: Record<
  WorkflowStepType,
  { label: string; desc: string; color: string; bg: string; group: string }
> = {
  update_record:     { label: 'Update Record',       desc: 'Set field values on the record',          color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',      group: 'Data' },
  assign_record:     { label: 'Assign Record',       desc: 'Change owner or team assignment',         color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',      group: 'Data' },
  send_notification: { label: 'Send Notification',   desc: 'Notify users in-app or by email',         color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    group: 'Notify' },
  create_record:     { label: 'Create Record',       desc: 'Create a new related record',             color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', group: 'Data' },
  delete_record:     { label: 'Delete Record',        desc: 'Delete the trigger or a related record',  color: 'text-red-700',     bg: 'bg-red-50 border-red-200',        group: 'Data' },
  variable:          { label: 'Variable',             desc: 'Initialize, set, increment or append',    color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',  group: 'Logic' },
  condition:         { label: 'Condition (Branch)',  desc: 'Split flow based on a condition',         color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200',  group: 'Logic' },
  wait:              { label: 'Wait / Delay',        desc: 'Pause workflow for a duration',           color: 'text-slate-700',   bg: 'bg-slate-50 border-slate-300',    group: 'Logic' },
  webhook:           { label: 'Call Webhook',        desc: 'Send HTTP request to external service',   color: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200',      group: 'Integration' },
};
