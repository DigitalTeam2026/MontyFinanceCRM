import { supabase } from '../lib/supabase';
import type { BusinessRule, RuleTrigger, RuleActionSet, RuleScope } from '../types/businessRule';

export async function fetchRulesForEntity(entityId: string): Promise<BusinessRule[]> {
  const { data, error } = await supabase
    .from('business_rule')
    .select('*')
    .eq('entity_definition_id', entityId)
    .is('deleted_at', null)
    .order('run_order')
    .order('name');
  if (error) throw error;
  return data as BusinessRule[];
}

export async function fetchRuleById(ruleId: string): Promise<BusinessRule> {
  const { data, error } = await supabase
    .from('business_rule')
    .select('*')
    .eq('business_rule_id', ruleId)
    .single();
  if (error) throw error;
  return data as BusinessRule;
}

export async function createRule(payload: {
  entity_definition_id: string;
  name: string;
  description?: string | null;
  scope?: RuleScope;
  run_order?: number;
}): Promise<BusinessRule> {
  const defaultTrigger: RuleTrigger = {
    trigger_on: 'onChange',
    watch_fields: [],
    condition_group: null,
  };
  const defaultActions: RuleActionSet = { if_actions: [], else_actions: [] };

  const { data, error } = await supabase
    .from('business_rule')
    .insert({
      ...payload,
      trigger_json: defaultTrigger,
      action_json: defaultActions,
      is_active: true,
      scope: payload.scope ?? 'all_forms',
      run_order: payload.run_order ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data as BusinessRule;
}

export async function saveRule(
  ruleId: string,
  updates: {
    name?: string;
    description?: string | null;
    scope?: RuleScope;
    target_form_id?: string | null;
    target_process_flow_id?: string | null;
    target_process_stage_id?: string | null;
    run_order?: number;
    is_active?: boolean;
    trigger_json?: RuleTrigger;
    action_json?: RuleActionSet;
  }
): Promise<BusinessRule> {
  const { data, error } = await supabase
    .from('business_rule')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('business_rule_id', ruleId)
    .select()
    .single();
  if (error) throw error;
  return data as BusinessRule;
}

export async function toggleRuleActive(ruleId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('business_rule')
    .update({ is_active: isActive, modified_at: new Date().toISOString() })
    .eq('business_rule_id', ruleId);
  if (error) throw error;
}

export async function cloneRule(ruleId: string, newName: string): Promise<BusinessRule> {
  const { data: source, error: fetchErr } = await supabase
    .from('business_rule')
    .select('*')
    .eq('business_rule_id', ruleId)
    .single();
  if (fetchErr) throw fetchErr;

  const {
    business_rule_id: _id,
    created_at: _ca,
    modified_at: _ma,
    deleted_at: _da,
    created_by: _cb,
    ...rest
  } = source as BusinessRule & { business_rule_id: string; created_at: string; modified_at: string; deleted_at: string | null; created_by: string | null };

  const { data, error } = await supabase
    .from('business_rule')
    .insert({
      ...rest,
      name: newName,
      is_system: false,
      is_deletable: true,
      is_active: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as BusinessRule;
}

export async function softDeleteRule(ruleId: string): Promise<void> {
  const { error } = await supabase
    .from('business_rule')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('business_rule_id', ruleId);
  if (error) throw error;
}
