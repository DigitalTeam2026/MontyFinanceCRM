import { supabase } from '../lib/supabase';
import type {
  DataPolicy,
  DataPolicyFormData,
  PolicyCondition,
  PolicyConditionDraft,
  PolicyEnforcement,
  PolicyEnforcementDraft,
} from '../types/dataPolicy';

// ─── Policies ─────────────────────────────────────────────────────────────────

export async function fetchDataPolicies(): Promise<DataPolicy[]> {
  const { data, error } = await supabase
    .from('data_policy')
    .select('*')
    .is('deleted_at', null)
    .order('is_system', { ascending: false })
    .order('policy_category')
    .order('name');
  if (error) throw error;
  return (data ?? []) as DataPolicy[];
}

export async function fetchDataPolicyWithDetails(policyId: string): Promise<DataPolicy> {
  const [{ data: policy, error: pErr }, { data: conditions, error: cErr }, { data: enforcements, error: eErr }] =
    await Promise.all([
      supabase.from('data_policy').select('*').eq('data_policy_id', policyId).is('deleted_at', null).single(),
      supabase.from('data_policy_condition').select('*').eq('data_policy_id', policyId).order('display_order'),
      supabase.from('data_policy_enforcement').select('*').eq('data_policy_id', policyId).order('display_order'),
    ]);
  if (pErr) throw pErr;
  if (cErr) throw cErr;
  if (eErr) throw eErr;
  return {
    ...(policy as DataPolicy),
    conditions: (conditions ?? []) as PolicyCondition[],
    enforcements: (enforcements ?? []) as PolicyEnforcement[],
  };
}

export async function createDataPolicy(payload: DataPolicyFormData): Promise<DataPolicy> {
  const { data, error } = await supabase
    .from('data_policy')
    .insert({ ...payload, is_system: false })
    .select()
    .single();
  if (error) throw error;
  return data as DataPolicy;
}

export async function updateDataPolicy(policyId: string, updates: Partial<DataPolicyFormData>): Promise<DataPolicy> {
  const { data, error } = await supabase
    .from('data_policy')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('data_policy_id', policyId)
    .select()
    .single();
  if (error) throw error;
  return data as DataPolicy;
}

export async function softDeleteDataPolicy(policyId: string): Promise<void> {
  const { error } = await supabase
    .from('data_policy')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('data_policy_id', policyId)
    .eq('is_system', false);
  if (error) throw error;
}

export async function cloneDataPolicy(policy: DataPolicy): Promise<DataPolicy> {
  const { data_policy_id, created_at, modified_at, deleted_at, is_system, conditions, enforcements, ...rest } = policy;
  const { data, error } = await supabase
    .from('data_policy')
    .insert({ ...rest, name: `${rest.name} (Copy)`, is_system: false })
    .select()
    .single();
  if (error) throw error;
  const newPolicy = data as DataPolicy;

  if (conditions && conditions.length > 0) {
    await supabase.from('data_policy_condition').insert(
      conditions.map(({ condition_id: _id, data_policy_id: _pid, created_at: _c, ...c }) => ({
        ...c, data_policy_id: newPolicy.data_policy_id,
      }))
    );
  }
  if (enforcements && enforcements.length > 0) {
    await supabase.from('data_policy_enforcement').insert(
      enforcements.map(({ enforcement_id: _id, data_policy_id: _pid, created_at: _c, ...e }) => ({
        ...e, data_policy_id: newPolicy.data_policy_id,
      }))
    );
  }
  return newPolicy;
}

// ─── Conditions (bulk replace) ────────────────────────────────────────────────

export async function replaceConditions(policyId: string, drafts: Omit<PolicyConditionDraft, '_tempId'>[]): Promise<PolicyCondition[]> {
  await supabase.from('data_policy_condition').delete().eq('data_policy_id', policyId);
  if (drafts.length === 0) return [];
  const { data, error } = await supabase
    .from('data_policy_condition')
    .insert(drafts.map((d) => ({ ...d, data_policy_id: policyId })))
    .select();
  if (error) throw error;
  return (data ?? []) as PolicyCondition[];
}

// ─── Enforcements (bulk replace) ─────────────────────────────────────────────

export async function replaceEnforcements(policyId: string, drafts: Omit<PolicyEnforcementDraft, '_tempId'>[]): Promise<PolicyEnforcement[]> {
  await supabase.from('data_policy_enforcement').delete().eq('data_policy_id', policyId);
  if (drafts.length === 0) return [];
  const { data, error } = await supabase
    .from('data_policy_enforcement')
    .insert(drafts.map((d) => ({ ...d, data_policy_id: policyId })))
    .select();
  if (error) throw error;
  return (data ?? []) as PolicyEnforcement[];
}
