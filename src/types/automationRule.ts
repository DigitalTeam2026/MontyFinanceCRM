// Power Automation — shared types for the automation-rules engine.

export type AutomationTriggerEvent = 'create' | 'update' | 'both';

export type AutomationOperator =
  | 'changes_to'       // fire only on transition INTO the value (before != v, after == v)
  | 'equals'           // fire whenever after == v (create, or any update landing on v)
  | 'changes_from_to'  // before == from AND after == to
  | 'is_any_of'        // after is one of a set of values (on transition into the set)
  | 'changed';         // fire whenever the field's value changed at all

export type AutomationActionType = 'send_email' | 'update_field' | 'generate_document' | 'list_rows';

/** Extra AND-group filter evaluated against the post-save record. */
export interface AutomationCondition {
  field: string;                 // logical field name
  operator: 'equals' | 'not_equals' | 'is_empty' | 'is_not_empty';
  value?: unknown;
}

export interface AutomationRule {
  automation_rule_id: string;
  name: string;
  description: string | null;
  table_logical_name: string;
  trigger_event: AutomationTriggerEvent;
  field_logical_name: string | null;
  operator: AutomationOperator;
  trigger_value: unknown;        // shape depends on operator (see engine)
  conditions: AutomationCondition[];
  batch_window_seconds: number | null;
  enabled: boolean;
  is_published: boolean;
  run_as: string;
  error_count: number;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
  modified_at: string;
  actions?: AutomationRuleAction[];
}

// ── Per-action config shapes (validated server-side by the action registry) ──

export interface SendEmailConfig {
  to_static: string[];           // static recipient addresses (legacy)
  to_fields: string[];           // logical fields on the record holding an email/user (legacy)
  to?: string;                   // static + {{token}} address string (split on ; ,)
  cc?: string;                   // static + {{token}} cc string
  subject: string;               // template with {{tokens}}
  body: string;                  // template with {{tokens}} (HTML-escaped by default)
  attach_document?: boolean;     // attach a generate_document output from this rule
  email_account_id?: string | null; // sender mailbox to send AS ([] = use the default account)
}

/** A configured sender mailbox the send_email action can send AS. */
export interface AutomationEmailAccount {
  account_id: string;
  name: string;                  // label shown in the flow picker
  from_address: string;          // mailbox UPN we send AS (the "on behalf" address)
  provider: string;              // 'graph'
  tenant_id: string | null;
  client_id: string | null;
  client_secret: string | null;
  is_default: boolean;
  enabled: boolean;
  created_at: string;
  modified_at: string;
}

export type ListRowsOperator =
  | 'equals' | 'not_equals' | 'contains' | 'is_any_of' | 'is_empty' | 'is_not_empty';

export interface ListRowsFilter {
  field: string;                 // logical field on the source table
  operator: ListRowsOperator;
  value?: unknown;               // static value or a {{token}} string
}

export interface ListRowsConfig {
  step_name: string;             // referenced as {{steps.<step_name>.*}}
  source_table: string;          // logical table name to query
  filters: ListRowsFilter[];     // AND group
  columns: string[];             // logical columns to return ([] = all)
  sort?: { field: string; dir: 'asc' | 'desc' };
  limit?: number;                // default 100, server hard-cap
}

export interface UpdateFieldConfig {
  target: 'record' | 'related';
  related_lookup_field?: string; // when target === 'related', the lookup to follow
  field: string;                 // logical field to set
  value: unknown;                // static value or a {{token}} string
}

export interface GenerateDocumentConfig {
  view_id?: string;              // saved view/query to export
  format: 'xlsx' | 'csv';
  filename: string;              // template
}

export type AutomationActionConfig =
  | SendEmailConfig
  | UpdateFieldConfig
  | GenerateDocumentConfig
  | ListRowsConfig
  | Record<string, unknown>;

/** When an action runs relative to the actions before it ("Configure run after"). */
export type AutomationRunAfter = 'success' | 'failure' | 'always';

export interface AutomationRuleAction {
  automation_rule_action_id: string;
  rule_id: string;
  sort_order: number;
  action_type: AutomationActionType;
  config: AutomationActionConfig;
  run_after: AutomationRunAfter; // 'success' = run only if nothing before failed (default)
  created_at: string;
  modified_at: string;
}

export type AutomationJobStatus =
  | 'pending' | 'running' | 'succeeded' | 'failed' | 'dead' | 'skipped';

export interface AutomationJob {
  automation_job_id: string;
  rule_id: string | null;
  record_table: string;
  record_id: string | null;
  trigger_event: string | null;
  change_snapshot: {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    changed_fields?: string[];
  };
  status: AutomationJobStatus;
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  depth: number;
  error: string | null;
  next_attempt_at: string;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_by: string | null;
}

export interface AutomationJobActionLog {
  automation_job_action_log_id: string;
  job_id: string;
  action_id: string | null;
  action_type: string | null;
  sort_order: number | null;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  error: string | null;
  output: Record<string, unknown> | null;
  started_at: string | null;
  finished_at: string | null;
}

/** A run-history row: a job joined to its action logs (built client-side). */
export interface AutomationRunHistoryRow extends AutomationJob {
  action_logs: AutomationJobActionLog[];
}
