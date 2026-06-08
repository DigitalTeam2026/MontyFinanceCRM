export type GenericFieldType = 'text' | 'number' | 'optionset' | 'date' | 'boolean';

export interface GenericFieldSchema {
  key: string;
  label: string;
  type: GenericFieldType;
  options?: string[];
}

export type GenericConditionOperator =
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains' | 'begins_with' | 'ends_with'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'between'
  | 'is_empty' | 'is_not_empty'
  | 'in' | 'not_in'
  | 'before' | 'after' | 'on';

export type GenericLogicalOperator = 'AND' | 'OR';

export interface GenericCondition {
  id: string;
  field: string;
  operator: GenericConditionOperator;
  value: string | string[] | null;
  value2?: string | null;
}

export interface GenericConditionsBlock {
  logicalOperator: GenericLogicalOperator;
  conditions: GenericCondition[];
}

export type GenericActionType =
  | 'setRequired'
  | 'setVisibility'
  | 'setValue'
  | 'lock'
  | 'showError'
  | 'setDefault'
  | 'recommend';

export interface GenericAction {
  id: string;
  type: GenericActionType;
  field?: string;
  value?: string | boolean;
  message?: string;
  level?: 'info' | 'warning' | 'error';
  title?: string;
  description?: string;
}

export interface GenericRule {
  id: string;
  name: string;
  description?: string;
  scope: 'all_forms' | 'specific_form';
  targetFormId?: string;
  isActive: boolean;
  runOrder: number;
  conditions: GenericConditionsBlock;
  actions: GenericAction[];
  elseActions?: GenericAction[];
}

export type GenericRecord = Record<string, unknown>;

export interface GenericFieldState {
  isRequired: boolean;
  isHidden: boolean;
  isReadonly: boolean;
  forcedValue: unknown;
  defaultValue: unknown;
  message: { text: string; level: 'info' | 'warning' | 'error'; blocksSave: boolean } | null;
}

export interface GenericRuleState {
  fields: Record<string, GenericFieldState>;
  recommendations: { title: string; description: string }[];
  blockSave: boolean;
}

export const OPERATORS_BY_TYPE: Record<GenericFieldType, GenericConditionOperator[]> = {
  text:      ['equals', 'not_equals', 'contains', 'not_contains', 'begins_with', 'ends_with', 'is_empty', 'is_not_empty'],
  number:    ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty'],
  optionset: ['equals', 'not_equals', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  date:      ['on', 'before', 'after', 'between', 'is_empty', 'is_not_empty'],
  boolean:   ['equals', 'is_empty', 'is_not_empty'],
};

export const OPERATOR_LABELS: Record<GenericConditionOperator, string> = {
  equals:       'Equals',
  not_equals:   'Not Equals',
  contains:     'Contains',
  not_contains: 'Does Not Contain',
  begins_with:  'Begins With',
  ends_with:    'Ends With',
  gt:           'Greater Than',
  gte:          'Greater Than or Equal',
  lt:           'Less Than',
  lte:          'Less Than or Equal',
  between:      'Between',
  is_empty:     'Is Empty',
  is_not_empty: 'Is Not Empty',
  in:           'In',
  not_in:       'Not In',
  before:       'Before',
  after:        'After',
  on:           'On',
};

export const NO_VALUE_OPERATORS = new Set<GenericConditionOperator>(['is_empty', 'is_not_empty']);
export const DUAL_VALUE_OPERATORS = new Set<GenericConditionOperator>(['between']);
export const MULTI_VALUE_OPERATORS = new Set<GenericConditionOperator>(['in', 'not_in']);

export const ACTION_META: Record<GenericActionType, { label: string; hasField: boolean; hasValue: boolean; group: string; color: string }> = {
  setRequired:    { label: 'Set Required',    hasField: true,  hasValue: true,  group: 'Validation', color: 'text-red-600 bg-red-50' },
  setVisibility:  { label: 'Set Visibility',  hasField: true,  hasValue: true,  group: 'Visibility', color: 'text-slate-600 bg-slate-100' },
  setValue:       { label: 'Set Value',       hasField: true,  hasValue: true,  group: 'Data',       color: 'text-blue-600 bg-blue-50' },
  lock:           { label: 'Lock Field',      hasField: true,  hasValue: true,  group: 'Lock',       color: 'text-amber-700 bg-amber-50' },
  showError:      { label: 'Show Message',    hasField: false, hasValue: false, group: 'Notify',     color: 'text-orange-600 bg-orange-50' },
  setDefault:     { label: 'Set Default',     hasField: true,  hasValue: true,  group: 'Data',       color: 'text-teal-600 bg-teal-50' },
  recommend:      { label: 'Recommendation',  hasField: false, hasValue: false, group: 'Notify',     color: 'text-cyan-600 bg-cyan-50' },
};

function evaluateCondition(cond: GenericCondition, record: GenericRecord): boolean {
  const raw = record[cond.field];

  if (cond.operator === 'is_empty')     return raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0);
  if (cond.operator === 'is_not_empty') return raw != null && raw !== '' && !(Array.isArray(raw) && raw.length === 0);

  if (cond.operator === 'in' || cond.operator === 'not_in') {
    const allowed = Array.isArray(cond.value) ? cond.value as string[] : [String(cond.value ?? '')];
    if (Array.isArray(raw)) {
      const has = allowed.some((a) => (raw as unknown[]).map(String).includes(a));
      return cond.operator === 'in' ? has : !has;
    }
    const s = raw == null ? '' : String(raw);
    return cond.operator === 'in' ? allowed.includes(s) : !allowed.includes(s);
  }

  const val = raw == null ? '' : String(raw);
  const cmp = cond.value == null ? '' : String(cond.value);

  switch (cond.operator) {
    case 'equals':       return val === cmp;
    case 'not_equals':   return val !== cmp;
    case 'contains':     return val.toLowerCase().includes(cmp.toLowerCase());
    case 'not_contains': return !val.toLowerCase().includes(cmp.toLowerCase());
    case 'begins_with':  return val.toLowerCase().startsWith(cmp.toLowerCase());
    case 'ends_with':    return val.toLowerCase().endsWith(cmp.toLowerCase());
    case 'gt':           return Number(val) > Number(cmp);
    case 'gte':          return Number(val) >= Number(cmp);
    case 'lt':           return Number(val) < Number(cmp);
    case 'lte':          return Number(val) <= Number(cmp);
    case 'on':           return val === cmp;
    case 'before':       return val < cmp;
    case 'after':        return val > cmp;
    case 'between': {
      const n = Number(val);
      const lo = Number(cmp);
      const hi = Number(cond.value2 ?? cmp);
      return n >= lo && n <= hi;
    }
    default: return true;
  }
}

function evaluateConditions(block: GenericConditionsBlock, record: GenericRecord): boolean {
  if (block.conditions.length === 0) return true;
  const results = block.conditions.map((c) => evaluateCondition(c, record));
  return block.logicalOperator === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

function defaultFieldState(): GenericFieldState {
  return { isRequired: false, isHidden: false, isReadonly: false, forcedValue: undefined, defaultValue: undefined, message: null };
}

function applyActions(actions: GenericAction[], state: GenericRuleState): void {
  for (const action of actions) {
    switch (action.type) {
      case 'showError': {
        const level = action.level ?? 'info';
        const blocksSave = level === 'error';
        const key = action.field ?? `__msg_${action.id}`;
        if (!state.fields[key]) state.fields[key] = defaultFieldState();
        state.fields[key].message = { text: action.message ?? '', level, blocksSave };
        if (blocksSave) state.blockSave = true;
        break;
      }
      case 'recommend': {
        state.recommendations.push({ title: action.title ?? 'Recommendation', description: action.description ?? '' });
        break;
      }
      default: {
        if (!action.field) break;
        if (!state.fields[action.field]) state.fields[action.field] = defaultFieldState();
        const fs = state.fields[action.field];
        if (action.type === 'setRequired')   fs.isRequired  = action.value !== false && action.value !== 'false';
        if (action.type === 'setVisibility') fs.isHidden    = action.value === false || action.value === 'false' || action.value === 'hidden';
        if (action.type === 'lock')          fs.isReadonly  = action.value !== false && action.value !== 'false';
        if (action.type === 'setValue')      fs.forcedValue = action.value ?? null;
        if (action.type === 'setDefault')    fs.defaultValue = action.value ?? null;
        break;
      }
    }
  }
}

/** Pure function — no side effects. Returns applied rule state for given record values. */
export function evaluateGenericRules(
  rules: GenericRule[],
  record: GenericRecord,
  activeFormId?: string | null,
): GenericRuleState {
  const state: GenericRuleState = { fields: {}, recommendations: [], blockSave: false };
  const sorted = [...rules].sort((a, b) => (a.runOrder ?? 0) - (b.runOrder ?? 0));

  for (const rule of sorted) {
    if (!rule.isActive) continue;
    if (rule.scope === 'specific_form' && rule.targetFormId !== activeFormId) continue;

    const met = evaluateConditions(rule.conditions, record);
    if (met) {
      applyActions(rule.actions, state);
    } else if (rule.elseActions?.length) {
      applyActions(rule.elseActions, state);
    }
  }

  return state;
}

/** Apply forced/default values from rule state to a record copy. Returns null if unchanged. */
export function applyGenericRuleStateToRecord(state: GenericRuleState, record: GenericRecord): GenericRecord | null {
  let changed = false;
  const next = { ...record };

  for (const [field, fs] of Object.entries(state.fields)) {
    if (field.startsWith('__msg_')) continue;
    if (fs.forcedValue !== undefined) {
      if (next[field] !== fs.forcedValue) { next[field] = fs.forcedValue; changed = true; }
    } else if (fs.defaultValue !== undefined) {
      if (next[field] == null || next[field] === '') { next[field] = fs.defaultValue; changed = true; }
    }
  }

  return changed ? next : null;
}

export function getGenericRuleMessages(state: GenericRuleState) {
  const seen = new Set<string>();
  const out: { text: string; level: 'info' | 'warning' | 'error'; blocksSave: boolean }[] = [];
  for (const fs of Object.values(state.fields)) {
    if (!fs.message) continue;
    const key = `${fs.message.level}::${fs.message.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fs.message);
  }
  return out;
}

let _idCtr = 0;
export function genId(): string { return `g_${Date.now()}_${_idCtr++}`; }
