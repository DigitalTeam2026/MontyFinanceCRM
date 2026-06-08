import { supabase } from '../lib/supabase';
import type {
  DigitalRule,
  DigitalRuleCondition,
  DigitalRuleAction,
  DigitalRuleExecutionLog,
  ConditionDraft,
  ActionDraft,
  TriggerEvent,
  RuleCategory,
} from '../types/digitalRule';

// ─── Rules ───────────────────────────────────────────────────────────────────

export async function fetchDigitalRules(): Promise<DigitalRule[]> {
  const { data, error } = await supabase
    .from('digital_rule')
    .select('*')
    .is('deleted_at', null)
    .order('priority')
    .order('name');
  if (error) throw error;
  return (data ?? []) as DigitalRule[];
}

export async function fetchDigitalRuleWithDetails(ruleId: string): Promise<DigitalRule> {
  const [{ data: rule, error: rErr }, { data: conditions, error: cErr }, { data: actions, error: aErr }] =
    await Promise.all([
      supabase.from('digital_rule').select('*').eq('digital_rule_id', ruleId).is('deleted_at', null).single(),
      supabase.from('digital_rule_condition').select('*').eq('digital_rule_id', ruleId).order('display_order'),
      supabase.from('digital_rule_action').select('*').eq('digital_rule_id', ruleId).order('display_order'),
    ]);
  if (rErr) throw rErr;
  if (cErr) throw cErr;
  if (aErr) throw aErr;
  return {
    ...(rule as DigitalRule),
    conditions: (conditions ?? []) as DigitalRuleCondition[],
    actions: (actions ?? []) as DigitalRuleAction[],
  };
}

export interface DigitalRuleFormData {
  name: string;
  description: string;
  entity_logical_name: string;
  trigger_event: TriggerEvent;
  is_active: boolean;
  priority: number;
  category?: RuleCategory;
}

export async function createDigitalRule(payload: DigitalRuleFormData): Promise<DigitalRule> {
  const { data, error } = await supabase
    .from('digital_rule')
    .insert({ ...payload, is_system: false })
    .select()
    .single();
  if (error) throw error;
  return data as DigitalRule;
}

export async function updateDigitalRule(ruleId: string, updates: Partial<DigitalRuleFormData>): Promise<DigitalRule> {
  const { data, error } = await supabase
    .from('digital_rule')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('digital_rule_id', ruleId)
    .select()
    .single();
  if (error) throw error;
  return data as DigitalRule;
}

export async function softDeleteDigitalRule(ruleId: string): Promise<void> {
  const { error } = await supabase
    .from('digital_rule')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('digital_rule_id', ruleId)
    .eq('is_system', false);
  if (error) throw error;
}

export async function cloneDigitalRule(rule: DigitalRule): Promise<DigitalRule> {
  const { digital_rule_id: _id, created_at: _c, modified_at: _m, deleted_at: _d, is_system: _s, created_by: _cb, conditions, actions, ...rest } = rule;
  const { data, error } = await supabase
    .from('digital_rule')
    .insert({ ...rest, name: `${rest.name} (Copy)`, is_system: false })
    .select()
    .single();
  if (error) throw error;
  const newRule = data as DigitalRule;

  if (conditions && conditions.length > 0) {
    await supabase.from('digital_rule_condition').insert(
      conditions.map(({ digital_rule_condition_id: _cid, digital_rule_id: _rid, ...c }) => ({
        ...c, digital_rule_id: newRule.digital_rule_id,
      }))
    );
  }
  if (actions && actions.length > 0) {
    await supabase.from('digital_rule_action').insert(
      actions.map(({ digital_rule_action_id: _aid, digital_rule_id: _rid, ...a }) => ({
        ...a, digital_rule_id: newRule.digital_rule_id,
      }))
    );
  }
  return newRule;
}

// ─── Conditions (bulk replace) ───────────────────────────────────────────────

export async function replaceConditions(ruleId: string, drafts: Omit<ConditionDraft, '_tempId'>[]): Promise<DigitalRuleCondition[]> {
  await supabase.from('digital_rule_condition').delete().eq('digital_rule_id', ruleId);
  if (drafts.length === 0) return [];
  const { data, error } = await supabase
    .from('digital_rule_condition')
    .insert(drafts.map((d) => ({ ...d, digital_rule_id: ruleId })))
    .select();
  if (error) throw error;
  return (data ?? []) as DigitalRuleCondition[];
}

// ─── Actions (bulk replace) ──────────────────────────────────────────────────

export async function replaceActions(ruleId: string, drafts: Omit<ActionDraft, '_tempId'>[]): Promise<DigitalRuleAction[]> {
  await supabase.from('digital_rule_action').delete().eq('digital_rule_id', ruleId);
  if (drafts.length === 0) return [];
  const { data, error } = await supabase
    .from('digital_rule_action')
    .insert(drafts.map((d) => ({ ...d, digital_rule_id: ruleId })))
    .select();
  if (error) throw error;
  return (data ?? []) as DigitalRuleAction[];
}

// ─── Execution Logs ──────────────────────────────────────────────────────────

export async function fetchExecutionLogs(filters?: { entity?: string; ruleId?: string }): Promise<DigitalRuleExecutionLog[]> {
  let q = supabase
    .from('digital_rule_execution_log')
    .select('*')
    .order('executed_at', { ascending: false })
    .limit(200);
  if (filters?.entity) q = q.eq('entity_logical_name', filters.entity);
  if (filters?.ruleId) q = q.eq('digital_rule_id', filters.ruleId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DigitalRuleExecutionLog[];
}
