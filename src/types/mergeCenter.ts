export type MergeCandidateStatus = 'pending' | 'in_review' | 'merged' | 'not_duplicate' | 'skipped';
export type MergeCandidateSource = 'detection_job' | 'manual';
export type MergeChangeType = 'field_merged' | 'record_retired' | 'relation_reparented';
export type FieldSelectionSource = 'master' | 'loser' | 'manual';

export interface MatchField {
  field: string;
  score: number;
}

export interface MergeCandidate {
  merge_candidate_id: string;
  entity_logical_name: string;
  record_a_id: string;
  record_b_id: string;
  record_a_label: string;
  record_b_label: string;
  similarity_score: number | null;
  match_fields: MatchField[];
  source: MergeCandidateSource;
  source_job_id: string | null;
  status: MergeCandidateStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  modified_at: string;
  decision?: MergeDecision | null;
}

export interface FieldSelection {
  source: FieldSelectionSource;
  manual_value?: string;
}

export interface MergeDecision {
  merge_decision_id: string;
  merge_candidate_id: string;
  master_record_id: string;
  loser_record_id: string;
  field_selections: Record<string, FieldSelection>;
  reparent_relations: string[];
  notes: string | null;
  executed: boolean;
  executed_at: string | null;
  executed_by: string | null;
  created_at: string;
  modified_at: string;
}

export interface MergeAuditEntry {
  audit_id: string;
  merge_decision_id: string;
  entity_logical_name: string;
  master_record_id: string;
  loser_record_id: string;
  change_type: MergeChangeType;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  source_record: FieldSelectionSource | null;
  relation_name: string | null;
  child_record_id: string | null;
  performed_by: string | null;
  created_at: string;
}

// ─── Metadata ──────────────────────────────────────────────────────────────

export const CANDIDATE_STATUS_META: Record<MergeCandidateStatus, {
  label: string; color: string; bg: string; border: string;
}> = {
  pending:      { label: 'Pending',      color: '#6b7280', bg: 'bg-gray-100',   border: 'border-gray-200' },
  in_review:    { label: 'In Review',    color: '#2563eb', bg: 'bg-blue-50',    border: 'border-blue-200' },
  merged:       { label: 'Merged',       color: '#059669', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  not_duplicate:{ label: 'Not Duplicate',color: '#9ca3af', bg: 'bg-gray-50',    border: 'border-gray-200' },
  skipped:      { label: 'Skipped',      color: '#9ca3af', bg: 'bg-gray-50',    border: 'border-gray-200' },
};

export const KNOWN_ENTITIES_MERGE = [
  { logical_name: 'account',     display_name: 'Account' },
  { logical_name: 'contact',     display_name: 'Contact' },
  { logical_name: 'lead',        display_name: 'Lead' },
  { logical_name: 'opportunity', display_name: 'Opportunity' },
  { logical_name: 'case',        display_name: 'Case' },
];

export const COMMON_RELATIONS: Record<string, string[]> = {
  account:     ['contacts', 'opportunities', 'cases', 'activities', 'notes'],
  contact:     ['opportunities', 'cases', 'activities', 'notes'],
  lead:        ['activities', 'notes'],
  opportunity: ['contacts', 'activities', 'notes', 'quotes'],
  case:        ['contacts', 'activities', 'notes'],
};
