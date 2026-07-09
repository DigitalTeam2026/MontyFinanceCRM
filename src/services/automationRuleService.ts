import { supabase } from '../lib/supabase';
import type {
  AutomationRule,
  AutomationRuleAction,
  AutomationActionType,
  AutomationActionConfig,
  AutomationJob,
  AutomationJobActionLog,
  AutomationRunHistoryRow,
} from '../types/automationRule';

// ── Rules ──────────────────────────────────────────────────────────────────

export async function fetchAllRules(): Promise<AutomationRule[]> {
  const { data, error } = await supabase
    .from('automation_rule')
    .select('*')
    .order('modified_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AutomationRule[];
}

export async function fetchRuleById(ruleId: string): Promise<AutomationRule> {
  const { data, error } = await supabase
    .from('automation_rule')
    .select('*')
    .eq('automation_rule_id', ruleId)
    .single();
  if (error) throw error;
  const actions = await fetchActions(ruleId);
  return { ...(data as AutomationRule), actions };
}

export async function createRule(payload: {
  name: string;
  table_logical_name: string;
  trigger_event?: AutomationRule['trigger_event'];
  field_logical_name?: string | null;
  operator?: AutomationRule['operator'];
  trigger_value?: unknown;
  description?: string | null;
  created_by?: string | null;
}): Promise<AutomationRule> {
  const { data, error } = await supabase
    .from('automation_rule')
    .insert({
      name: payload.name,
      table_logical_name: payload.table_logical_name,
      trigger_event: payload.trigger_event ?? 'update',
      field_logical_name: payload.field_logical_name ?? null,
      operator: payload.operator ?? 'changes_to',
      trigger_value: payload.trigger_value ?? null,
      description: payload.description ?? null,
      conditions: [],
      enabled: false,
      is_published: false,
      created_by: payload.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AutomationRule;
}

export async function updateRule(
  ruleId: string,
  updates: Partial<Pick<AutomationRule,
    'name' | 'description' | 'table_logical_name' | 'trigger_event' | 'field_logical_name' |
    'operator' | 'trigger_value' | 'conditions' | 'enabled' | 'is_published' | 'batch_window_seconds'>>,
): Promise<AutomationRule> {
  const { data, error } = await supabase
    .from('automation_rule')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('automation_rule_id', ruleId)
    .select()
    .single();
  if (error) throw error;
  return data as AutomationRule;
}

export async function setRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('automation_rule')
    .update({ enabled, modified_at: new Date().toISOString() })
    .eq('automation_rule_id', ruleId);
  if (error) throw error;
}

export async function deleteRule(ruleId: string): Promise<void> {
  // Hard delete; automation_rule_action + jobs cascade via FK.
  const { error } = await supabase
    .from('automation_rule')
    .delete()
    .eq('automation_rule_id', ruleId);
  if (error) throw error;
}

// ── Actions ────────────────────────────────────────────────────────────────

export async function fetchActions(ruleId: string): Promise<AutomationRuleAction[]> {
  const { data, error } = await supabase
    .from('automation_rule_action')
    .select('*')
    .eq('rule_id', ruleId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AutomationRuleAction[];
}

export async function createAction(
  ruleId: string,
  actionType: AutomationActionType,
  config: AutomationActionConfig,
  sortOrder: number,
): Promise<AutomationRuleAction> {
  const { data, error } = await supabase
    .from('automation_rule_action')
    .insert({ rule_id: ruleId, action_type: actionType, config, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw error;
  return data as AutomationRuleAction;
}

export async function updateAction(
  actionId: string,
  updates: Partial<Pick<AutomationRuleAction, 'config' | 'sort_order' | 'action_type'>>,
): Promise<void> {
  const { error } = await supabase
    .from('automation_rule_action')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('automation_rule_action_id', actionId);
  if (error) throw error;
}

export async function deleteAction(actionId: string): Promise<void> {
  const { error } = await supabase
    .from('automation_rule_action')
    .delete()
    .eq('automation_rule_action_id', actionId);
  if (error) throw error;
}

// ── Field choices (for the trigger-value picker) ─────────────────────────────

export interface ChoiceOption { value: string; label: string }

/**
 * Resolve the selectable options for a Choice/option-set field, from either an
 * inline `config_json.choices` list or a named `config_json.option_set_name`.
 */
export async function fetchFieldChoices(config: Record<string, unknown> | null): Promise<ChoiceOption[]> {
  if (!config) return [];
  const inline = config.choices as Array<{ value: unknown; label?: string; display_label?: string }> | undefined;
  if (Array.isArray(inline) && inline.length) {
    return inline.map((c) => ({ value: String(c.value), label: String(c.label ?? c.display_label ?? c.value) }));
  }
  const name = (config.option_set_name ?? config.optionSetName) as string | undefined;
  if (!name) return [];
  const { data: os } = await supabase
    .from('option_set')
    .select('option_set_id')
    .eq('name', name)
    .maybeSingle();
  if (!os) return [];
  const { data: vals } = await supabase
    .from('option_set_value')
    .select('value, display_label')
    .eq('option_set_id', (os as { option_set_id: string }).option_set_id)
    .eq('is_active', true)
    .order('display_order');
  return ((vals ?? []) as Array<{ value: unknown; display_label: string }>).map((v) => ({
    value: String(v.value),
    label: v.display_label,
  }));
}

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const u = data?.user as { user_id?: string; id?: string } | null;
    return u?.user_id ?? u?.id ?? null;
  } catch {
    return null;
  }
}

// ── Run history ──────────────────────────────────────────────────────────────

export async function fetchRunHistory(ruleId: string, limit = 50): Promise<AutomationRunHistoryRow[]> {
  const { data: jobs, error } = await supabase
    .from('automation_job')
    .select('*')
    .eq('rule_id', ruleId)
    .order('queued_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const jobRows = (jobs ?? []) as AutomationJob[];
  if (jobRows.length === 0) return [];

  const jobIds = jobRows.map((j) => j.automation_job_id);
  const { data: logs, error: logErr } = await supabase
    .from('automation_job_action_log')
    .select('*')
    .in('job_id', jobIds);
  if (logErr) throw logErr;
  const logRows = (logs ?? []) as AutomationJobActionLog[];

  const byJob = new Map<string, AutomationJobActionLog[]>();
  for (const l of logRows) {
    const arr = byJob.get(l.job_id) ?? [];
    arr.push(l);
    byJob.set(l.job_id, arr);
  }
  return jobRows.map((j) => ({
    ...j,
    action_logs: (byJob.get(j.automation_job_id) ?? []).sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    ),
  }));
}
