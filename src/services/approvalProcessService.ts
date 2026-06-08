import { supabase } from '../lib/supabase';
import type {
  ApprovalProcess,
  ApprovalProcessFormData,
  ApprovalCondition,
  ApprovalConditionDraft,
  ApprovalStep,
  ApprovalStepDraft,
} from '../types/approvalProcess';

// ─── Processes ────────────────────────────────────────────────────────────────

export async function fetchApprovalProcesses(): Promise<ApprovalProcess[]> {
  const { data, error } = await supabase
    .from('approval_process')
    .select('*')
    .is('deleted_at', null)
    .order('is_system', { ascending: false })
    .order('name');
  if (error) throw error;
  return (data ?? []) as ApprovalProcess[];
}

export async function fetchApprovalProcessWithDetails(processId: string): Promise<ApprovalProcess> {
  const [{ data: proc, error: pErr }, { data: conditions, error: cErr }, { data: steps, error: sErr }] =
    await Promise.all([
      supabase.from('approval_process').select('*').eq('approval_process_id', processId).is('deleted_at', null).single(),
      supabase.from('approval_condition').select('*').eq('approval_process_id', processId).order('display_order'),
      supabase.from('approval_step').select('*').eq('approval_process_id', processId).order('display_order'),
    ]);
  if (pErr) throw pErr;
  if (cErr) throw cErr;
  if (sErr) throw sErr;
  return {
    ...(proc as ApprovalProcess),
    conditions: (conditions ?? []) as ApprovalCondition[],
    steps: (steps ?? []) as ApprovalStep[],
  };
}

export async function createApprovalProcess(payload: ApprovalProcessFormData): Promise<ApprovalProcess> {
  const { data, error } = await supabase
    .from('approval_process')
    .insert({ ...payload, is_system: false })
    .select()
    .single();
  if (error) throw error;
  return data as ApprovalProcess;
}

export async function updateApprovalProcess(processId: string, updates: Partial<ApprovalProcessFormData>): Promise<ApprovalProcess> {
  const { data, error } = await supabase
    .from('approval_process')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('approval_process_id', processId)
    .select()
    .single();
  if (error) throw error;
  return data as ApprovalProcess;
}

export async function softDeleteApprovalProcess(processId: string): Promise<void> {
  const { error } = await supabase
    .from('approval_process')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('approval_process_id', processId)
    .eq('is_system', false);
  if (error) throw error;
}

export async function cloneApprovalProcess(proc: ApprovalProcess): Promise<ApprovalProcess> {
  const { approval_process_id, created_at, modified_at, deleted_at, is_system, conditions, steps, ...rest } = proc;
  const { data, error } = await supabase
    .from('approval_process')
    .insert({ ...rest, name: `${rest.name} (Copy)`, is_system: false })
    .select()
    .single();
  if (error) throw error;
  const newProc = data as ApprovalProcess;

  if (conditions && conditions.length > 0) {
    await supabase.from('approval_condition').insert(
      conditions.map(({ approval_condition_id, approval_process_id: _, created_at: _c, ...c }) => ({
        ...c, approval_process_id: newProc.approval_process_id,
      }))
    );
  }
  if (steps && steps.length > 0) {
    await supabase.from('approval_step').insert(
      steps.map(({ approval_step_id, approval_process_id: _, created_at: _c, modified_at: _m, ...s }) => ({
        ...s, approval_process_id: newProc.approval_process_id,
      }))
    );
  }
  return newProc;
}

// ─── Conditions (bulk replace) ────────────────────────────────────────────────

export async function replaceConditions(processId: string, drafts: Omit<ApprovalConditionDraft, '_tempId'>[]): Promise<ApprovalCondition[]> {
  await supabase.from('approval_condition').delete().eq('approval_process_id', processId);
  if (drafts.length === 0) return [];
  const { data, error } = await supabase
    .from('approval_condition')
    .insert(drafts.map((d) => ({ ...d, approval_process_id: processId })))
    .select();
  if (error) throw error;
  return (data ?? []) as ApprovalCondition[];
}

// ─── Steps (bulk replace) ─────────────────────────────────────────────────────

export async function replaceSteps(processId: string, drafts: Omit<ApprovalStepDraft, '_tempId'>[]): Promise<ApprovalStep[]> {
  await supabase.from('approval_step').delete().eq('approval_process_id', processId);
  if (drafts.length === 0) return [];
  const { data, error } = await supabase
    .from('approval_step')
    .insert(drafts.map((d) => ({ ...d, approval_process_id: processId })))
    .select();
  if (error) throw error;
  return (data ?? []) as ApprovalStep[];
}
