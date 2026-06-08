import { supabase } from '../lib/supabase';
import type {
  MergeCandidate,
  MergeDecision,
  MergeAuditEntry,
  MergeCandidateStatus,
  MergeChangeType,
  FieldSelectionSource,
} from '../types/mergeCenter';

// ─── Candidates ───────────────────────────────────────────────────────────────

export async function fetchMergeCandidates(filters?: {
  entity?: string;
  status?: MergeCandidateStatus | '';
}): Promise<MergeCandidate[]> {
  let q = supabase
    .from('merge_candidate')
    .select('*')
    .order('similarity_score', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.entity) q = q.eq('entity_logical_name', filters.entity);
  if (filters?.status) q = q.eq('status', filters.status);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MergeCandidate[];
}

export async function fetchMergeCandidateWithDecision(candidateId: string): Promise<MergeCandidate> {
  const [{ data: candidate, error: cErr }, { data: decision, error: dErr }] = await Promise.all([
    supabase.from('merge_candidate').select('*').eq('merge_candidate_id', candidateId).single(),
    supabase.from('merge_decision').select('*').eq('merge_candidate_id', candidateId).maybeSingle(),
  ]);
  if (cErr) throw cErr;
  if (dErr) throw dErr;
  return { ...(candidate as MergeCandidate), decision: decision as MergeDecision | null };
}

export async function updateCandidateStatus(
  candidateId: string,
  status: MergeCandidateStatus,
  resolvedBy?: string
): Promise<void> {
  const { error } = await supabase
    .from('merge_candidate')
    .update({
      status,
      resolved_by: resolvedBy ?? null,
      resolved_at: ['merged', 'not_duplicate', 'skipped'].includes(status) ? new Date().toISOString() : null,
      modified_at: new Date().toISOString(),
    })
    .eq('merge_candidate_id', candidateId);
  if (error) throw error;
}

export async function createManualCandidate(payload: {
  entity_logical_name: string;
  record_a_id: string;
  record_b_id: string;
  record_a_label: string;
  record_b_label: string;
}): Promise<MergeCandidate> {
  const { data, error } = await supabase
    .from('merge_candidate')
    .insert({ ...payload, source: 'manual', status: 'pending' })
    .select()
    .single();
  if (error) throw error;
  return data as MergeCandidate;
}

// ─── Decisions ────────────────────────────────────────────────────────────────

export async function upsertMergeDecision(payload: {
  merge_candidate_id: string;
  master_record_id: string;
  loser_record_id: string;
  field_selections: Record<string, { source: FieldSelectionSource; manual_value?: string }>;
  reparent_relations: string[];
  notes?: string;
}): Promise<MergeDecision> {
  const { data: existing } = await supabase
    .from('merge_decision')
    .select('merge_decision_id')
    .eq('merge_candidate_id', payload.merge_candidate_id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('merge_decision')
      .update({ ...payload, modified_at: new Date().toISOString() })
      .eq('merge_decision_id', existing.merge_decision_id)
      .select()
      .single();
    if (error) throw error;
    return data as MergeDecision;
  }

  const { data, error } = await supabase
    .from('merge_decision')
    .insert({ ...payload, executed: false })
    .select()
    .single();
  if (error) throw error;
  return data as MergeDecision;
}

export async function executeMerge(
  decisionId: string,
  candidateId: string,
  executedBy: string
): Promise<void> {
  await supabase
    .from('merge_decision')
    .update({ executed: true, executed_at: new Date().toISOString(), executed_by: executedBy })
    .eq('merge_decision_id', decisionId);

  await updateCandidateStatus(candidateId, 'merged', executedBy);
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function fetchMergeAuditLog(filters?: {
  decisionId?: string;
  limit?: number;
}): Promise<MergeAuditEntry[]> {
  let q = supabase
    .from('merge_audit_log')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.decisionId) q = q.eq('merge_decision_id', filters.decisionId);
  if (filters?.limit) q = q.limit(filters.limit);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MergeAuditEntry[];
}

export async function appendAuditEntries(entries: {
  merge_decision_id: string;
  entity_logical_name: string;
  master_record_id: string;
  loser_record_id: string;
  change_type: MergeChangeType;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  source_record?: FieldSelectionSource | null;
  relation_name?: string | null;
  child_record_id?: string | null;
  performed_by?: string | null;
}[]): Promise<void> {
  const { error } = await supabase.from('merge_audit_log').insert(entries);
  if (error) throw error;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function fetchMergeSummaryStats(): Promise<{
  pending: number;
  in_review: number;
  merged: number;
  not_duplicate: number;
  skipped: number;
  total: number;
}> {
  const { data, error } = await supabase
    .from('merge_candidate')
    .select('status');
  if (error) throw error;

  const counts = { pending: 0, in_review: 0, merged: 0, not_duplicate: 0, skipped: 0 };
  (data ?? []).forEach((r: { status: MergeCandidateStatus }) => {
    if (r.status in counts) counts[r.status as keyof typeof counts]++;
  });
  return { ...counts, total: (data ?? []).length };
}
