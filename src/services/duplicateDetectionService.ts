import { supabase } from '../lib/supabase';
import type {
  DuplicateDetectionRule,
  DuplicateDetectionRuleFormData,
  DuplicateJob,
} from '../types/duplicateDetection';

// ─── Rules ────────────────────────────────────────────────────────────────────

export async function fetchDuplicateRules(): Promise<DuplicateDetectionRule[]> {
  const { data, error } = await supabase
    .from('duplicate_detection_rule')
    .select('*')
    .is('deleted_at', null)
    .order('entity_logical_name')
    .order('name');
  if (error) throw error;
  return (data ?? []) as DuplicateDetectionRule[];
}

export async function fetchDuplicateRulesByEntity(entityLogicalName: string): Promise<DuplicateDetectionRule[]> {
  const { data, error } = await supabase
    .from('duplicate_detection_rule')
    .select('*')
    .eq('entity_logical_name', entityLogicalName)
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return (data ?? []) as DuplicateDetectionRule[];
}

export async function createDuplicateRule(payload: DuplicateDetectionRuleFormData): Promise<DuplicateDetectionRule> {
  const { data, error } = await supabase
    .from('duplicate_detection_rule')
    .insert({ ...payload, is_system: false })
    .select()
    .single();
  if (error) throw error;
  return data as DuplicateDetectionRule;
}

export async function updateDuplicateRule(
  ruleId: string,
  updates: Partial<DuplicateDetectionRuleFormData>
): Promise<DuplicateDetectionRule> {
  const { data, error } = await supabase
    .from('duplicate_detection_rule')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('duplicate_rule_id', ruleId)
    .select()
    .single();
  if (error) throw error;
  return data as DuplicateDetectionRule;
}

export async function toggleDuplicateRule(ruleId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('duplicate_detection_rule')
    .update({ is_active: isActive, modified_at: new Date().toISOString() })
    .eq('duplicate_rule_id', ruleId);
  if (error) throw error;
}

export async function softDeleteDuplicateRule(ruleId: string): Promise<void> {
  const { error } = await supabase
    .from('duplicate_detection_rule')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('duplicate_rule_id', ruleId)
    .eq('is_system', false);
  if (error) throw error;
}

export async function cloneDuplicateRule(rule: DuplicateDetectionRule): Promise<DuplicateDetectionRule> {
  const { duplicate_rule_id, created_at, modified_at, deleted_at, is_system, ...rest } = rule;
  const { data, error } = await supabase
    .from('duplicate_detection_rule')
    .insert({ ...rest, name: `${rest.name} (Copy)`, is_system: false })
    .select()
    .single();
  if (error) throw error;
  return data as DuplicateDetectionRule;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function fetchDuplicateJobs(): Promise<DuplicateJob[]> {
  const { data, error } = await supabase
    .from('duplicate_job')
    .select('*, rule:duplicate_detection_rule(name, entity_logical_name)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as DuplicateJob[];
}

export async function createDuplicateJob(
  ruleId: string,
  entityLogicalName: string,
  triggeredBy: string
): Promise<DuplicateJob> {
  const { data, error } = await supabase
    .from('duplicate_job')
    .insert({
      duplicate_rule_id: ruleId,
      entity_logical_name: entityLogicalName,
      triggered_by: triggeredBy,
      status: 'pending',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as DuplicateJob;
}

async function writeAuditLog(
  recordId: string,
  action: string,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('audit_log').insert({
    entity_name: 'duplicate_job',
    record_id: recordId,
    action,
    changed_by: user?.id ?? null,
    changed_at: new Date().toISOString(),
    old_values: oldValues,
    new_values: newValues,
  });
}

export async function stopDuplicateJob(jobId: string): Promise<void> {
  const { data: before } = await supabase
    .from('duplicate_job')
    .select('status, error_message, completed_at')
    .eq('duplicate_job_id', jobId)
    .maybeSingle();

  const { error } = await supabase
    .from('duplicate_job')
    .update({
      status: 'failed',
      error_message: 'Stopped by user',
      completed_at: new Date().toISOString(),
    })
    .eq('duplicate_job_id', jobId)
    .in('status', ['pending', 'running']);
  if (error) throw error;

  await writeAuditLog(
    jobId,
    'stop',
    before ? { status: before.status, error_message: before.error_message, completed_at: before.completed_at } : null,
    { status: 'failed', error_message: 'Stopped by user', completed_at: new Date().toISOString() }
  );
}

export async function deleteDuplicateJob(jobId: string): Promise<void> {
  const { data: before } = await supabase
    .from('duplicate_job')
    .select('status, entity_logical_name, duplicate_rule_id, records_scanned, duplicates_found')
    .eq('duplicate_job_id', jobId)
    .maybeSingle();

  const { error } = await supabase
    .from('duplicate_job')
    .delete()
    .eq('duplicate_job_id', jobId);
  if (error) throw error;

  await writeAuditLog(
    jobId,
    'delete',
    before ?? null,
    null
  );
}
