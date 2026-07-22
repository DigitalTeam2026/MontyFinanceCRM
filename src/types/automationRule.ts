// Power Automation — shared types for the automation-rules engine.

export type AutomationTriggerEvent = 'create' | 'update' | 'both';

/** Flow kind: 'event' fires on a record change; 'schedule' fires on a cadence. */
export type AutomationTriggerType = 'event' | 'schedule';

export type ScheduleFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

/** Recurrence config for a scheduled flow (evaluated in server local time). */
export interface ScheduleConfig {
  frequency: ScheduleFrequency;
  minute?: number;   // 0–59 (hourly: minute of the hour; else minute of the time)
  hour?: number;     // 0–23 (daily/weekly/monthly)
  weekday?: number;  // 0–6, 0=Sun (weekly)
  monthday?: number; // 1–31 (monthly; clamped to month length)
}

export type AutomationOperator =
  | 'changes_to'       // fire only on transition INTO the value (before != v, after == v)
  | 'equals'           // fire whenever after == v (create, or any update landing on v)
  | 'changes_from_to'  // before == from AND after == to
  | 'is_any_of'        // after is one of a set of values (on transition into the set)
  | 'changed';         // fire whenever the field's value changed at all

export type AutomationActionType =
  | 'send_email' | 'update_field' | 'generate_document' | 'list_rows' | 'get_row'
  | 'export_view_email' | 'related_export_email' | 'send_documents_email'
  | 'create_related_record' | 'update_related_record' | 'condition' | 'switch';

/**
 * Which branch of a control-flow step an action lives in (null = top level).
 * A Condition uses 'yes'/'no'; a Switch uses one of its case keys or 'default'.
 * Any non-empty string is valid — the union members are just the well-known ones.
 */
export type AutomationBranch = 'yes' | 'no' | 'default' | (string & {});

/** Extra AND-group filter evaluated against the post-save record. */
export interface AutomationCondition {
  field: string;                 // logical field name
  operator: 'equals' | 'not_equals' | 'is_empty' | 'is_not_empty';
  value?: unknown;
}

/** A named, color-coded folder that groups flows in the Power Automation list. */
export interface AutomationCategory {
  automation_category_id: string;
  name: string;
  color: string;          // hex accent, e.g. '#2563eb'
  sort_order: number;
  created_by: string | null;
  created_at: string;
  modified_at: string;
}

export interface AutomationRule {
  automation_rule_id: string;
  name: string;
  description: string | null;
  category_id: string | null;    // optional grouping — null = Uncategorized
  table_logical_name: string;
  trigger_type: AutomationTriggerType;
  schedule_config: ScheduleConfig | null;
  next_run_at: string | null;
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
  send_to_owner?: boolean;       // also email the owner of the triggering record (owner_id → crm_user.email)
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

/**
 * Get row by ID — read ONE row from a table and publish it as a step. The match
 * value comes from anywhere in the flow (a trigger-record field, an earlier
 * step, or a static value). Reference it later as {{steps.<step_name>.first(<col>)}}.
 */
export interface GetRowConfig {
  step_name: string;             // referenced as {{steps.<step_name>.*}}
  source_table: string;          // logical table to read from
  match_field?: string;          // logical column to match on ('' / omitted = the table's id/primary key)
  match_value: unknown;          // the id/value to look up — static value or a {{token}} string
  columns: string[];             // logical columns to expose ([] = all)
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

/** Export a saved view to Excel/CSV and email it as an attachment (schedule flows). */
export interface ExportViewEmailConfig {
  source_entity?: string;        // logical entity the view belongs to (UI restore; worker derives it from the view)
  view_id: string;               // saved view to run (its columns + filters)
  format: 'xlsx' | 'csv';
  to?: string;                   // static + {{token}} address string (split on ; ,)
  cc?: string;
  to_user_ids?: string[];        // explicit crm_user ids → resolved to emails
  subject?: string;              // template with {{tokens}} (incl. {{export.*}})
  body?: string;                 // HTML template
  filename?: string;             // template (default = view name)
  email_account_id?: string | null;
  skip_if_empty?: boolean;       // don't send when the view returns 0 rows
}

/**
 * A data source in a related-record export, reachable from the trigger record.
 *  - 'record'  the trigger record itself.
 *  - 'parent'  one related record reached by following an N:1 lookup path.
 *  - 'child'   a 1:N list that expands the report into one row per child.
 */
export interface RelatedExportSource {
  id: string;                     // stable id referenced by columns
  label: string;                  // display label, e.g. "Lead (via Originating Lead)"
  entity_logical: string;         // entity at this source
  kind: 'record' | 'parent' | 'child';
  lookup_path?: string[];         // parent: logical lookup field names from the trigger record
  anchor_source_id?: string;      // child: the source the children hang off
  child_entity_logical?: string;  // child: the child entity
  child_fk_physical?: string;     // child: FK physical column on the child pointing to the anchor
  limit?: number;                 // child: max rows
}

export interface RelatedExportColumn {
  source_id: string;              // which source the value comes from
  field: string;                  // logical field on that source's entity
  header?: string;                // optional column header
}

/** Export a report built by walking the trigger record's relationships, then email it. */
export interface RelatedExportEmailConfig {
  report_name?: string;
  sources: RelatedExportSource[]; // includes the implicit 'record' source (id='record')
  columns: RelatedExportColumn[];
  format: 'xlsx' | 'csv';
  to?: string;
  cc?: string;
  to_user_ids?: string[];
  subject?: string;
  body?: string;
  filename?: string;
  email_account_id?: string | null;
  skip_if_empty?: boolean;
}

/** How a document's file name is matched when the action filters attachments. */
export type DocumentNameOperator =
  | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'equals' | 'extension';

/**
 * Send documents by email — attach the files stored against a record (the rows
 * behind its Documents tab) and email them. Either every file, or only the ones
 * whose name matches. The source can be the trigger record or any other record
 * reached by a token (e.g. the Lead behind this Opportunity).
 */
export interface SendDocumentsEmailConfig {
  source: 'record' | 'other' | 'folder'; // 'record' = the record that triggered the flow
  source_entity?: string;            // when source === 'other': the entity holding the documents
  source_record_id?: string;         // when source === 'other': its id — static or a {{token}}

  /**
   * when source === 'folder': a path typed by the author, e.g.
   * `E:\Opportunities\2026\07\17\{{record.raw.opportunity_id}}`. Tokens are
   * resolved at run time. The path MUST resolve inside one of the configured
   * Document Location roots — the worker rejects anything outside them, so a
   * flow can never be pointed at arbitrary server files.
   */
  folder_path?: string;
  include_subfolders?: boolean;      // when source === 'folder': recurse into child folders

  selection: 'all' | 'filter';       // all attachments, or filter by file name
  name_operator?: DocumentNameOperator;
  name_value?: string;               // pattern(s), split on ; or , (any-of); may contain {{tokens}}

  max_files?: number;                // cap on attachments (default 10)
  max_total_mb?: number;             // total attachment budget in MB (default 10)

  to?: string;                       // static + {{token}} address string (split on ; ,)
  cc?: string;
  to_user_ids?: string[];            // explicit crm_user ids → resolved to emails
  send_to_owner?: boolean;           // also email the trigger record's owner
  subject?: string;                  // template ({{documents.*}} tokens available)
  body?: string;                     // HTML template
  email_account_id?: string | null;  // sender mailbox (null = default account)
  skip_if_empty?: boolean;           // no matching files → skip instead of sending
  list_files_in_body?: boolean;      // append a bullet list of the attached file names
}

/** One field assignment when writing to a related table. */
export interface FieldMapping {
  target_field: string;              // logical field on the target (child) entity
  mode: 'field' | 'static' | 'token';
  value: string;                     // 'field' → source logical field; else literal / {{token}}
}

/** How the match/link value is resolved for a related write. */
export type RelatedMatchMode = 'record_id' | 'field' | 'static';

/**
 * Insert a row into any table X, setting a "match" field to link it (e.g.
 * X.opportunity = this opportunity's id). With dedupe on, the action skips when a
 * row with that match already exists (idempotent No→Yes toggles).
 */
export interface CreateRelatedRecordConfig {
  target_entity: string;             // logical name of the target table X
  match_field: string;               // logical field on X used as the link (set on insert)
  match_mode: RelatedMatchMode;      // record_id = the trigger record's id
  match_value?: string;              // when mode 'field' (source logical field) or 'static'
  dedupe: boolean;
  dedupe_match?: string[];           // extra target fields that must also match for a dupe
  mappings: FieldMapping[];
  link_field_physical?: string;      // deprecated (pre-match_field); still honored by the worker
}

/** Update rows of table X where <match_field> = value, setting mapped fields. */
export interface UpdateRelatedRecordConfig {
  target_entity: string;
  match_field: string;               // WHERE this field = the resolved value
  match_mode: RelatedMatchMode;
  match_value?: string;
  match_first?: boolean;             // update only the first match (else all)
  mappings: FieldMapping[];
  link_field_physical?: string;      // deprecated (pre-match_field); still honored by the worker
}

export type AutomationActionConfig =
  | SendEmailConfig
  | UpdateFieldConfig
  | GenerateDocumentConfig
  | ListRowsConfig
  | GetRowConfig
  | ExportViewEmailConfig
  | RelatedExportEmailConfig
  | SendDocumentsEmailConfig
  | CreateRelatedRecordConfig
  | UpdateRelatedRecordConfig
  | ConditionConfig
  | SwitchConfig
  | Record<string, unknown>;

/** When an action runs relative to the actions before it ("Configure run after"). */
export type AutomationRunAfter = 'success' | 'failure' | 'always';

/**
 * Optional per-step "Only run if" gate. Both `left` and `right` are template
 * strings that may contain {{tokens}} (record fields, earlier step outputs); the
 * worker resolves both and compares them as text. Lets one flow branch — e.g.
 * "send to A only if the note author IS the opportunity owner" vs. the opposite
 * step. Null/absent => the step always runs (subject to run_after).
 */
export interface AutomationActionRunCondition {
  left: string;
  operator: 'equals' | 'not_equals' | 'is_empty' | 'is_not_empty';
  right: string;
}

/**
 * Config for a `condition` step. Same comparison shape as the per-step "Only run
 * if" gate, but a Condition is a control-flow node: after it evaluates, the worker
 * runs the child actions in its 'yes' branch (comparison passed) or 'no' branch.
 */
export type ConditionConfig = AutomationActionRunCondition;

/** One case of a Switch step. `key` is the stable branch id its child steps hang
 *  off (parent branch); `value` is the text compared (equals) against the resolved
 *  `on` value. Matching is on the DISPLAY value (label), so `value` holds the label
 *  a user picks (e.g. "Approve"), not the stored code. */
export interface SwitchCase {
  key: string;
  value: string;
}

/**
 * Config for a `switch` step. The worker resolves `on` (a token template) to its
 * display value and runs the first case whose `value` equals it (trimmed,
 * case-insensitive); if none match, the 'default' branch runs. Child steps live in
 * branch = <case.key> or 'default'.
 */
export interface SwitchConfig {
  on: string;
  cases: SwitchCase[];
}

export interface AutomationRuleAction {
  automation_rule_action_id: string;
  rule_id: string;
  sort_order: number;                 // order WITHIN its sibling group (parent + branch)
  action_type: AutomationActionType;
  config: AutomationActionConfig;
  run_after: AutomationRunAfter; // 'success' = run only if nothing before failed (default)
  run_condition?: AutomationActionRunCondition | null; // optional "Only run if" gate
  label?: string | null;              // optional human title shown in the flow builder
  parent_action_id?: string | null;   // the Condition step this action lives under (null = top level)
  branch?: AutomationBranch | null;    // which branch of the parent Condition ('yes'/'no')
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
