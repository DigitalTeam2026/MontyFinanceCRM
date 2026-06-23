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

const DEFAULT_TRIGGER: RuleTrigger = {
  trigger_on: 'onChange',
  watch_fields: [],
  condition_group: null,
};
const DEFAULT_ACTIONS: RuleActionSet = { if_actions: [], else_actions: [] };

/**
 * Build an in-memory draft rule that is NOT persisted to the database. The
 * editor opens on this draft; the row is only inserted when the user clicks
 * Save (a draft is identified by an empty business_rule_id). This is what
 * lets "New rule → change my mind → close" leave nothing behind.
 */
export function buildDraftRule(entityId: string, name: string): BusinessRule {
  return {
    business_rule_id: '',
    entity_definition_id: entityId,
    name,
    description: null,
    trigger_json: DEFAULT_TRIGGER,
    action_json: DEFAULT_ACTIONS,
    scope: 'all_forms',
    target_form_id: null,
    target_process_flow_id: null,
    target_process_stage_id: null,
    run_order: 0,
    is_active: true,
    is_system: false,
    is_deletable: true,
    deleted_at: null,
    created_by: null,
    created_at: '',
    modified_at: '',
  };
}

export async function createRule(payload: {
  entity_definition_id: string;
  name: string;
  description?: string | null;
  scope?: RuleScope;
  run_order?: number;
  is_active?: boolean;
  target_form_id?: string | null;
  target_process_flow_id?: string | null;
  target_process_stage_id?: string | null;
  trigger_json?: RuleTrigger;
  action_json?: RuleActionSet;
}): Promise<BusinessRule> {
  const { data, error } = await supabase
    .from('business_rule')
    .insert({
      entity_definition_id: payload.entity_definition_id,
      name: payload.name,
      description: payload.description ?? null,
      trigger_json: payload.trigger_json ?? DEFAULT_TRIGGER,
      action_json: payload.action_json ?? DEFAULT_ACTIONS,
      is_active: payload.is_active ?? true,
      scope: payload.scope ?? 'all_forms',
      run_order: payload.run_order ?? 0,
      target_form_id: payload.target_form_id ?? null,
      target_process_flow_id: payload.target_process_flow_id ?? null,
      target_process_stage_id: payload.target_process_stage_id ?? null,
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
