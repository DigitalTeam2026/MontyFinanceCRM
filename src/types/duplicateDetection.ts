export type DuplicateBehavior = 'warn' | 'block';
export type DuplicateJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface FuzzyMatchField {
  field: string;
  threshold: number;
}

export interface DuplicateDetectionRule {
  duplicate_rule_id: string;
  entity_logical_name: string;
  name: string;
  description: string;
  is_active: boolean;
  is_system: boolean;
  behavior: DuplicateBehavior;
  exact_match_fields: string[];
  fuzzy_match_fields: FuzzyMatchField[];
  run_on_create: boolean;
  run_on_update: boolean;
  run_on_import: boolean;
  run_on_lead_qualify: boolean;
  created_at: string;
  modified_at: string;
  deleted_at: string | null;
}

export interface DuplicateDetectionRuleFormData {
  entity_logical_name: string;
  name: string;
  description: string;
  is_active: boolean;
  behavior: DuplicateBehavior;
  exact_match_fields: string[];
  fuzzy_match_fields: FuzzyMatchField[];
  run_on_create: boolean;
  run_on_update: boolean;
  run_on_import: boolean;
  run_on_lead_qualify: boolean;
}

export interface DuplicateJob {
  duplicate_job_id: string;
  duplicate_rule_id: string | null;
  entity_logical_name: string;
  status: DuplicateJobStatus;
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  records_scanned: number;
  duplicates_found: number;
  result_summary: unknown;
  error_message: string | null;
  created_at: string;
  rule?: DuplicateDetectionRule | null;
}

export const BEHAVIOR_META: Record<DuplicateBehavior, { label: string; color: string; bg: string; description: string }> = {
  warn:  { label: 'Warning',  color: '#d97706', bg: '#fef3c7', description: 'Show a warning but allow the user to proceed' },
  block: { label: 'Block',    color: '#dc2626', bg: '#fee2e2', description: 'Prevent save until the user acknowledges or merges' },
};

export const JOB_STATUS_META: Record<DuplicateJobStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending',   color: '#6b7280', bg: '#f3f4f6' },
  running:   { label: 'Running',   color: '#2563eb', bg: '#dbeafe' },
  completed: { label: 'Completed', color: '#059669', bg: '#d1fae5' },
  failed:    { label: 'Failed',    color: '#dc2626', bg: '#fee2e2' },
};

export const TRIGGER_LABELS: { key: keyof Pick<DuplicateDetectionRule, 'run_on_create' | 'run_on_update' | 'run_on_import' | 'run_on_lead_qualify'>; label: string }[] = [
  { key: 'run_on_create',        label: 'On Create' },
  { key: 'run_on_update',        label: 'On Update' },
  { key: 'run_on_import',        label: 'On Import' },
  { key: 'run_on_lead_qualify',  label: 'Lead Qualify' },
];
