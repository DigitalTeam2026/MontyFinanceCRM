import type { BusinessRule, RuleCondition, RuleConditionGroup, RuleAction } from '../../types/businessRule';
import type { RecordData } from './recordService';

export interface ProcessRuleContext {
  processFlowId:    string | null;
  processFlowName:  string | null;
  currentStageId:   string | null;
  currentStageName: string | null;
  stageCategory:    string | null;
}

export interface FieldRuleState {
  isHidden: boolean;
  isReadonly: boolean;
  isRequired: boolean;
  forcedValue: unknown | undefined;
  defaultValue: unknown | undefined;
  clearValue: boolean;
  message: { text: string; level: 'info' | 'warning' | 'error'; blocksSave: boolean } | null;
  filteredOptions: string[] | null;
}

export interface Recommendation {
  title: string;
  description: string;
}

export interface FormRuleState {
  fields: Record<string, FieldRuleState>;
  recommendations: Recommendation[];
  blockSave: boolean;
}

function resolveProcessLhs(
  field: string | undefined,
  processFlowId: string | null | undefined,
  ctx: ProcessRuleContext,
): string | null {
  switch (field) {
    case 'process_flow':   return ctx.processFlowId;
    case 'stage_category': return ctx.stageCategory;
    case 'current_stage':
      if (processFlowId && ctx.processFlowId !== processFlowId) return null;
      return ctx.currentStageId;
    default: return null;
  }
}

function evaluateCondition(cond: RuleCondition, values: RecordData, context?: ProcessRuleContext): boolean {
  if (cond.source === 'process_flow') {
    if (!context) return false;
    const lhs = resolveProcessLhs(cond.process_flow_field, cond.process_flow_id, context);
    if (lhs === null) return false;
    const rhs = String(cond.value ?? '');
    if (cond.operator === 'eq')  return lhs === rhs;
    if (cond.operator === 'neq') return lhs !== rhs;
    return false;
  }

  const raw = values[cond.field_logical_name];

  switch (cond.operator) {
    case 'is_null':      return raw == null || raw === '';
    case 'is_not_null':  return raw != null && raw !== '';
    default: break;
  }

  if (cond.operator === 'in' || cond.operator === 'not_in') {
    const condValues = Array.isArray(cond.value) ? cond.value as string[] : [String(cond.value ?? '')];
    if (Array.isArray(raw)) {
      const rawArr = raw as unknown[];
      const hasMatch = condValues.some((cv) => rawArr.map(String).includes(cv));
      return cond.operator === 'in' ? hasMatch : !hasMatch;
    }
    const strRaw = raw == null ? '' : String(raw);
    return cond.operator === 'in' ? condValues.includes(strRaw) : !condValues.includes(strRaw);
  }

  const val = raw == null ? '' : String(raw);
  const cmpVal = cond.value == null ? '' : String(cond.value);

  switch (cond.operator) {
    case 'eq':           return val === cmpVal;
    case 'neq':          return val !== cmpVal;
    case 'contains':     return val.toLowerCase().includes(cmpVal.toLowerCase());
    case 'not_contains': return !val.toLowerCase().includes(cmpVal.toLowerCase());
    case 'begins_with':  return val.toLowerCase().startsWith(cmpVal.toLowerCase());
    case 'ends_with':    return val.toLowerCase().endsWith(cmpVal.toLowerCase());
    case 'gt':           return Number(val) > Number(cmpVal);
    case 'gte':          return Number(val) >= Number(cmpVal);
    case 'lt':           return Number(val) < Number(cmpVal);
    case 'lte':          return Number(val) <= Number(cmpVal);
    case 'between': {
      const n = Number(val);
      const lo = Number(cmpVal);
      const hi = Number(cond.value2 ?? cmpVal);
      return n >= lo && n <= hi;
    }
    default: return true;
  }
}

function evaluateGroup(group: RuleConditionGroup, values: RecordData, context?: ProcessRuleContext): boolean {
  const condResults = group.conditions.map((c) => evaluateCondition(c, values, context));
  const groupResults = group.groups.map((g) => evaluateGroup(g, values, context));
  const all = [...condResults, ...groupResults];

  if (all.length === 0) return true;
  return group.operator === 'AND' ? all.every(Boolean) : all.some(Boolean);
}

function defaultFieldState(): FieldRuleState {
  return {
    isHidden: false,
    isReadonly: false,
    isRequired: false,
    forcedValue: undefined,
    defaultValue: undefined,
    clearValue: false,
    message: null,
    filteredOptions: null,
  };
}

function evaluateExpression(expr: string, values: RecordData): unknown {
  try {
    const substituted = expr.replace(/\{(\w+)\}/g, (_, fieldName) => {
      const v = values[fieldName];
      if (v == null) return '0';
      const n = Number(v);
      return isNaN(n) ? JSON.stringify(String(v)) : String(n);
    });
    const result = Function('"use strict"; return (' + substituted + ')')();
    return result;
  } catch {
    return null;
  }
}

function resolveActionValue(action: RuleAction, currentValues: RecordData): unknown {
  if (action.value_source === 'field' && action.value_field) {
    return currentValues[action.value_field] ?? null;
  }
  if (action.value_source === 'expression' && action.value_expression) {
    return evaluateExpression(action.value_expression, currentValues);
  }
  return action.value ?? null;
}

// Resolve the display-friendly value for a field. For lookup fields the raw
// value is a UUID — prefer the resolved label from lookupLabels when available.
function resolveFieldValue(
  fieldName: string,
  currentValues: RecordData,
  lookupLabels: Record<string, string>,
): string {
  if (lookupLabels[fieldName] != null) return lookupLabels[fieldName];
  return String(currentValues[fieldName] ?? '');
}

function resolveNewActionValue(
  action: RuleAction,
  currentValues: RecordData,
  lookupLabels: Record<string, string>,
): unknown {
  if (action.value_type === 'field') {
    // Multiple fields: concatenate using separator (default space)
    if (action.value_fields && action.value_fields.length > 0) {
      const sep = action.value_fields_separator ?? ' ';
      return action.value_fields
        .map((f) => resolveFieldValue(f, currentValues, lookupLabels))
        .filter(Boolean)
        .join(sep);
    }
    // Single field (legacy)
    if (action.value_field) {
      return resolveFieldValue(action.value_field, currentValues, lookupLabels);
    }
  }
  // formula tokens: concatenate resolved values, using display names for lookups
  if (action.action_type === 'advanced_formula_value' && action.formula_tokens?.length) {
    return action.formula_tokens.map((t) => {
      if (t.type === 'field')    return t.field ? resolveFieldValue(t.field, currentValues, lookupLabels) : '';
      if (t.type === 'text')     return t.value ?? '';
      if (t.type === 'operator') return t.operator ?? '';
      if (t.type === 'date_offset') {
        const d = new Date();
        d.setDate(d.getDate() + (t.offset_days ?? 0));
        return d.toISOString().split('T')[0];
      }
      return '';
    }).join('');
  }
  return action.value ?? null;
}

function applyActions(
  actions: RuleAction[],
  state: FormRuleState,
  currentValues: RecordData,
  lookupLabels: Record<string, string>,
) {
  for (const action of actions) {
    const field = action.target_field;

    // ── New action types ───────────────────────────────────────────────────
    if (action.action_type === 'set_visibility') {
      if (!field) continue;
      if (!state.fields[field]) state.fields[field] = defaultFieldState();
      state.fields[field].isHidden = action.value === false || action.value === 'false';
      continue;
    }

    if (action.action_type === 'lock_unlock') {
      if (!field) continue;
      if (!state.fields[field]) state.fields[field] = defaultFieldState();
      state.fields[field].isReadonly = action.value === true || action.value === 'true';
      continue;
    }

    if (action.action_type === 'set_business_required') {
      if (!field) continue;
      if (!state.fields[field]) state.fields[field] = defaultFieldState();
      const lvl = action.required_level ?? 'none';
      state.fields[field].isRequired = lvl === 'required';
      continue;
    }

    if (action.action_type === 'set_field_value') {
      if (!field) continue;
      if (!state.fields[field]) state.fields[field] = defaultFieldState();
      state.fields[field].forcedValue = resolveNewActionValue(action, currentValues, lookupLabels);
      state.fields[field].clearValue = false;
      continue;
    }

    if (action.action_type === 'set_default_value') {
      if (!field) continue;
      if (!state.fields[field]) state.fields[field] = defaultFieldState();
      state.fields[field].defaultValue = resolveNewActionValue(action, currentValues, lookupLabels);
      continue;
    }

    if (action.action_type === 'clear_field_value') {
      if (!field) continue;
      if (!state.fields[field]) state.fields[field] = defaultFieldState();
      state.fields[field].clearValue = true;
      state.fields[field].forcedValue = undefined;
      continue;
    }

    if (action.action_type === 'show_error_message') {
      const text = action.message ?? '';
      const blocksSave = action.block_save !== false;
      const targetKey = field ?? `__msg_${action.id}`;
      if (!state.fields[targetKey]) state.fields[targetKey] = defaultFieldState();
      state.fields[targetKey].message = { text, level: 'error', blocksSave };
      if (blocksSave) state.blockSave = true;
      continue;
    }

    if (action.action_type === 'advanced_formula_value') {
      if (!field) continue;
      if (!state.fields[field]) state.fields[field] = defaultFieldState();
      state.fields[field].forcedValue = resolveNewActionValue(action, currentValues, lookupLabels);
      state.fields[field].clearValue = false;
      continue;
    }

    if (action.action_type === 'add_recommendation') {
      state.recommendations.push({
        title: action.recommendation_title ?? 'Recommendation',
        description: action.recommendation_message ?? action.recommendation_description ?? '',
      });
      continue;
    }

    // ── Legacy action types ────────────────────────────────────────────────
    if (action.action_type === 'show_message') {
      const text = action.message_text ?? '';
      const level = action.message_level ?? 'info';
      const blocksSave = level === 'error' && (action.blocks_save !== false);
      const targetKey = field ?? `__msg_${action.id}`;
      if (!state.fields[targetKey]) state.fields[targetKey] = defaultFieldState();
      state.fields[targetKey].message = { text, level, blocksSave };
      if (blocksSave) state.blockSave = true;
      continue;
    }

    if (!field) continue;
    if (!state.fields[field]) state.fields[field] = defaultFieldState();

    switch (action.action_type) {
      case 'hide_field':
        state.fields[field].isHidden = true;
        break;
      case 'show_field':
        state.fields[field].isHidden = false;
        break;
      case 'lock_field':
        state.fields[field].isReadonly = true;
        break;
      case 'unlock_field':
        state.fields[field].isReadonly = false;
        break;
      case 'require_field':
        state.fields[field].isRequired = true;
        break;
      case 'unrequire_field':
        state.fields[field].isRequired = false;
        break;
      case 'set_value':
        state.fields[field].forcedValue = resolveActionValue(action, currentValues);
        state.fields[field].clearValue = false;
        break;
      case 'clear_value':
        state.fields[field].clearValue = true;
        state.fields[field].forcedValue = undefined;
        break;
      case 'set_field_options': {
        const raw = String(action.value ?? '');
        const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
        state.fields[field].filteredOptions = allowed.length > 0 ? allowed : null;
        break;
      }
    }
  }
}

export function evaluateRules(
  rules: BusinessRule[],
  values: RecordData,
  activeFormId?: string | null,
  context?: ProcessRuleContext,
  lookupLabels?: Record<string, string>,
): FormRuleState {
  const labels = lookupLabels ?? {};
  const state: FormRuleState = {
    fields: {},
    recommendations: [],
    blockSave: false,
  };

  const sorted = [...rules].sort((a, b) => (a.run_order ?? 0) - (b.run_order ?? 0));

  for (const rule of sorted) {
    if (!rule.is_active) continue;

    if (rule.scope === 'specific_form') {
      if (!rule.target_form_id || rule.target_form_id !== activeFormId) continue;
    } else if (rule.scope === 'specific_bpf') {
      if (!rule.target_process_flow_id || rule.target_process_flow_id !== context?.processFlowId) continue;
    } else if (rule.scope === 'specific_bpf_stage') {
      if (!rule.target_process_flow_id || rule.target_process_flow_id !== context?.processFlowId) continue;
      if (!rule.target_process_stage_id || rule.target_process_stage_id !== context?.currentStageId) continue;
    }

    const trigger = rule.trigger_json;
    const actions = rule.action_json;

    const conditionMet = trigger.condition_group
      ? evaluateGroup(trigger.condition_group, values, context)
      : true;

    if (conditionMet) {
      applyActions(actions.if_actions ?? [], state, values, labels);
    } else {
      applyActions(actions.else_actions ?? [], state, values, labels);
    }
  }

  return state;
}

export function applyRuleStateToValues(
  ruleState: FormRuleState,
  currentValues: RecordData,
): RecordData | null {
  let changed = false;
  const next = { ...currentValues };

  for (const [field, fs] of Object.entries(ruleState.fields)) {
    if (field.startsWith('__msg_')) continue;

    if (fs.clearValue) {
      if (next[field] !== null && next[field] !== undefined) {
        next[field] = null;
        changed = true;
      }
    } else if (fs.forcedValue !== undefined) {
      if (next[field] !== fs.forcedValue) {
        next[field] = fs.forcedValue;
        changed = true;
      }
    } else if (fs.defaultValue !== undefined) {
      if (next[field] == null || next[field] === '') {
        next[field] = fs.defaultValue;
        changed = true;
      }
    }
  }

  return changed ? next : null;
}

export function getRuleMessages(
  ruleState: FormRuleState,
): { text: string; level: 'info' | 'warning' | 'error'; blocksSave: boolean }[] {
  const seen = new Set<string>();
  const out: { text: string; level: 'info' | 'warning' | 'error'; blocksSave: boolean }[] = [];

  for (const fs of Object.values(ruleState.fields)) {
    if (!fs.message) continue;
    const key = `${fs.message.level}::${fs.message.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fs.message);
  }

  return out;
}

export type { RecordData };
