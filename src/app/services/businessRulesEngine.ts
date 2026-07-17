import type { BusinessRule, RuleCondition, RuleConditionGroup, RuleAction } from '../../types/businessRule';
import { getRuleConditionBlocks } from '../../types/businessRule';
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

/**
 * Runtime values injected by the host (the form) that rules can resolve at
 * evaluation time but that aren't part of the record itself — e.g. the
 * logged-in user, used by the `current_user` value source to stamp fields like
 * "Approved By" with whoever is filling the form.
 *
 * `current_user` writes the user's id into a lookup field (so it resolves to
 * their name) and their display name into a text field — `fieldTypes` (logical
 * name → field type) lets the engine tell which it's targeting.
 */
export interface RuleRuntime {
  currentUserId?: string | null;
  currentUserName?: string | null;
  fieldTypes?: Record<string, string>;
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

  // Boolean (Yes/No) fields must compare semantically, not by raw string, so the
  // several ways a boolean can be stored (true/false, 'true'/'false', 1/0) all
  // resolve to the same Yes/No. Critically, a boolean eq/neq condition with no
  // value configured is under-specified: comparing String(raw) to '' let an
  // *unset* field spuriously equal a blank condition, which silently fired the
  // THEN branch (e.g. "Card Received = Yes" forcing dependent fields required on
  // a lead whose Card Received was never set). Treat a blank boolean condition as
  // unmet so it can never match by accident.
  if (cond.field_type_name === 'boolean' && (cond.operator === 'eq' || cond.operator === 'neq')) {
    if (cond.value == null || cond.value === '') return false;
    const toBool = (x: unknown): boolean =>
      x === true || x === 'true' || x === 1 || x === '1' || x === 'yes';
    const match = toBool(raw) === toBool(cond.value);
    return cond.operator === 'eq' ? match : !match;
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
  runtime?: RuleRuntime,
): unknown {
  // current_user: stamp the field with the logged-in user. A lookup field gets
  // the user's id (which resolves to their name for display); any other field
  // (text, etc.) gets the display name directly. Null when no user is in context
  // (e.g. the rule preview), so the field is simply left unset.
  if (action.value_type === 'current_user') {
    const isLookup = action.target_field
      ? runtime?.fieldTypes?.[action.target_field] === 'lookup'
      : false;
    if (isLookup) return runtime?.currentUserId ?? null;
    return runtime?.currentUserName ?? runtime?.currentUserId ?? null;
  }
  // current_datetime: stamp the field with the moment the rule runs. A `date`
  // field gets the date only (YYYY-MM-DD); a `datetime` field gets the full ISO
  // timestamp — the same format the datetime form input writes — so it captures
  // the time-of-day (e.g. an "Approved On" field). Used on approval/received
  // timestamp fields alongside a `current_user` stamp on the matching "…By" field.
  if (action.value_type === 'current_datetime') {
    const ft = action.target_field ? runtime?.fieldTypes?.[action.target_field] : undefined;
    const now = new Date();
    return ft === 'date' ? now.toISOString().split('T')[0] : now.toISOString();
  }
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
  runtime?: RuleRuntime,
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
      state.fields[field].forcedValue = resolveNewActionValue(action, currentValues, lookupLabels, runtime);
      state.fields[field].clearValue = false;
      continue;
    }

    if (action.action_type === 'set_default_value') {
      if (!field) continue;
      if (!state.fields[field]) state.fields[field] = defaultFieldState();
      state.fields[field].defaultValue = resolveNewActionValue(action, currentValues, lookupLabels, runtime);
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
      state.fields[field].forcedValue = resolveNewActionValue(action, currentValues, lookupLabels, runtime);
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
  runtime?: RuleRuntime,
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

    // Each condition block is evaluated independently with its own THEN/ELSE
    // actions. Legacy single-condition rules normalize to one block.
    const blocks = getRuleConditionBlocks(rule.trigger_json, rule.action_json);
    for (const block of blocks) {
      const conditionMet = block.condition_group
        ? evaluateGroup(block.condition_group, values, context)
        : true;

      if (conditionMet) {
        applyActions(block.if_actions ?? [], state, values, labels, runtime);
      } else {
        applyActions(block.else_actions ?? [], state, values, labels, runtime);
      }
    }
  }

  return state;
}

/**
 * Fields that govern Business Process Flow stage position. These must NEVER be
 * written by business-rule actions (forced/default/clear values): a BPF stage may
 * only change via explicit, user-initiated stage navigation (Next Stage / Previous /
 * Finish / Qualify). Guarding them here guarantees manual-only stage advancement
 * for every flow — current and future — regardless of how a rule is configured.
 */
export const BPF_STAGE_CONTROL_FIELDS = ['active_process_stage_id', 'bpf_is_finished'] as const;

export function applyRuleStateToValues(
  ruleState: FormRuleState,
  currentValues: RecordData,
  protectedFields?: Iterable<string>,
): RecordData | null {
  let changed = false;
  const next = { ...currentValues };

  const guarded = new Set<string>(BPF_STAGE_CONTROL_FIELDS);
  if (protectedFields) for (const f of protectedFields) { if (f) guarded.add(f); }

  for (const [field, fs] of Object.entries(ruleState.fields)) {
    if (field.startsWith('__msg_')) continue;
    // Never let a business rule advance/move the BPF stage — manual navigation only.
    if (guarded.has(field)) continue;

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
