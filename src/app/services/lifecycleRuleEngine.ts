import { supabase } from '../../lib/supabase';
import type { DigitalRule, DigitalRuleAction, VisibilityCondition, DialogType, FormAccessLevel } from '../../types/digitalRule';

export interface LifecycleCommand {
  rule: DigitalRule;
  label: string;
  icon: string;
  style: string;
  dialogType: DialogType | null;
  dialogConfig: Record<string, unknown>;
  actions: DigitalRuleAction[];
}

let rulesCache: DigitalRule[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000;

export async function fetchLifecycleRules(entityLogicalName: string): Promise<DigitalRule[]> {
  const now = Date.now();
  if (!rulesCache || now - cacheTimestamp > CACHE_TTL) {
    const { data, error } = await supabase
      .from('digital_rule')
      .select('*, digital_rule_condition(*), digital_rule_action(*)')
      .eq('is_active', true)
      .eq('category', 'lifecycle')
      .is('deleted_at', null)
      .order('priority');
    if (error) throw error;
    rulesCache = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      conditions: r.digital_rule_condition,
      actions: ((r.digital_rule_action as DigitalRuleAction[]) ?? []).sort(
        (a: DigitalRuleAction, b: DigitalRuleAction) => a.display_order - b.display_order
      ),
    })) as DigitalRule[];
    cacheTimestamp = now;
  }
  return rulesCache.filter((r) => r.entity_logical_name === entityLogicalName);
}

export function invalidateLifecycleCache(): void {
  rulesCache = null;
  cacheTimestamp = 0;
}

export function evaluateVisibility(
  rule: DigitalRule,
  recordValues: Record<string, unknown>
): boolean {
  const conditions = rule.visible_when ?? [];
  if (conditions.length === 0) return true;

  return conditions.every((cond: VisibilityCondition) => {
    const fieldVal = String(recordValues[cond.field] ?? recordValues[`${cond.field}`] ?? '');

    switch (cond.operator) {
      case 'equals':
        return fieldVal === String(cond.value);
      case 'not_equals':
        return fieldVal !== String(cond.value);
      case 'in': {
        const list = Array.isArray(cond.value) ? cond.value.map(String) : String(cond.value).split(',');
        return list.includes(fieldVal);
      }
      case 'not_in': {
        const list = Array.isArray(cond.value) ? cond.value.map(String) : String(cond.value).split(',');
        return !list.includes(fieldVal);
      }
      default:
        return true;
    }
  });
}

export function getVisibleCommands(
  rules: DigitalRule[],
  recordValues: Record<string, unknown>
): LifecycleCommand[] {
  const commands: LifecycleCommand[] = [];

  for (const rule of rules) {
    if (!evaluateVisibility(rule, recordValues)) continue;
    if (!rule.command_label) continue;

    commands.push({
      rule,
      label: rule.command_label,
      icon: rule.command_icon ?? 'Zap',
      style: rule.command_style ?? 'blue',
      dialogType: rule.dialog_type,
      dialogConfig: rule.dialog_config ?? {},
      actions: rule.actions ?? [],
    });
  }

  return commands;
}

export function findRuleForTrigger(
  rules: DigitalRule[],
  triggerEvent: string,
  recordValues: Record<string, unknown>
): DigitalRule | null {
  for (const rule of rules) {
    if (rule.trigger_event !== triggerEvent) continue;
    if (!evaluateVisibility(rule, recordValues)) continue;
    return rule;
  }
  return null;
}

let creationRulesCache: DigitalRule[] | null = null;
let creationCacheTimestamp = 0;

export async function fetchCreationControlRules(): Promise<DigitalRule[]> {
  const now = Date.now();
  if (creationRulesCache && now - creationCacheTimestamp < CACHE_TTL) {
    return creationRulesCache;
  }
  const { data, error } = await supabase
    .from('digital_rule')
    .select('*, digital_rule_condition(*), digital_rule_action(*)')
    .eq('is_active', true)
    .eq('trigger_event', 'before_create')
    .is('deleted_at', null)
    .order('priority');
  if (error) throw error;
  creationRulesCache = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    conditions: r.digital_rule_condition,
    actions: ((r.digital_rule_action as DigitalRuleAction[]) ?? []).sort(
      (a: DigitalRuleAction, b: DigitalRuleAction) => a.display_order - b.display_order
    ),
  })) as DigitalRule[];
  creationCacheTimestamp = now;
  return creationRulesCache;
}

export function isCreationBlocked(
  rules: DigitalRule[],
  entityLogicalName: string,
): { blocked: boolean; message: string | null } {
  for (const rule of rules) {
    if (rule.entity_logical_name !== entityLogicalName) continue;
    const blockAction = rule.actions?.find((a) => a.action_type === 'block_create');
    if (blockAction) {
      return { blocked: true, message: blockAction.message ?? 'Manual creation is not allowed for this entity.' };
    }
  }
  return { blocked: false, message: null };
}

export function getSetStatusAction(rule: DigitalRule): DigitalRuleAction | null {
  return rule.actions?.find((a) => a.action_type === 'set_status') ?? null;
}

export function getClearFieldsAction(rule: DigitalRule): DigitalRuleAction | null {
  return rule.actions?.find((a) => a.action_type === 'clear_fields') ?? null;
}

// ── Form Access Rules (on_form_load) ─────────────────────────────────────────

let formAccessCache: DigitalRule[] | null = null;
let formAccessCacheTimestamp = 0;

export async function fetchFormAccessRules(entityLogicalName: string): Promise<DigitalRule[]> {
  const now = Date.now();
  if (!formAccessCache || now - formAccessCacheTimestamp > CACHE_TTL) {
    const { data, error } = await supabase
      .from('digital_rule')
      .select('*, digital_rule_condition(*), digital_rule_action(*)')
      .eq('is_active', true)
      .eq('trigger_event', 'on_form_load')
      .is('deleted_at', null)
      .order('priority');
    if (error) throw error;
    formAccessCache = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      conditions: r.digital_rule_condition,
      actions: ((r.digital_rule_action as DigitalRuleAction[]) ?? []).sort(
        (a: DigitalRuleAction, b: DigitalRuleAction) => a.display_order - b.display_order
      ),
    })) as DigitalRule[];
    formAccessCacheTimestamp = now;
  }
  return formAccessCache.filter((r) => r.entity_logical_name === entityLogicalName);
}

export function invalidateFormAccessCache(): void {
  formAccessCache = null;
  formAccessCacheTimestamp = 0;
}

/**
 * Evaluates on_form_load rules for the current record values.
 * Returns the first matching rule's set_form_access level, or null if no rule matches.
 * null means no rule restricts access → form stays editable.
 */
export function evaluateFormAccess(
  rules: DigitalRule[],
  recordValues: Record<string, unknown>
): { level: FormAccessLevel; message: string | null } | null {
  for (const rule of rules) {
    if (!evaluateVisibility(rule, recordValues)) continue;
    const action = rule.actions?.find((a) => a.action_type === 'set_form_access');
    if (action) {
      return {
        level: (action.field_value as FormAccessLevel) ?? 'read_only',
        message: action.message ?? null,
      };
    }
  }
  return null;
}
