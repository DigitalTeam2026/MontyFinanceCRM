import type {
  RuleTrigger,
  RuleActionSet,
  RuleConditionGroup,
  RuleCondition,
  RuleAction,
  ConditionOperator,
} from '../../types/businessRule';
import type { FieldDefinition, ChoiceOption } from '../../types/field';

export interface ParsedRule {
  name: string;
  description: string;
  scope: 'all_forms';
  trigger: RuleTrigger;
  actions: RuleActionSet;
  warnings: string[];
}

export interface ParseError {
  message: string;
  suggestions: string[];
}

type FieldMap = Map<string, FieldDefinition>;

let idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${idCounter++}`;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[_\-\s]+/g, ' ').trim();
}

function findField(text: string, fieldMap: FieldMap): FieldDefinition | null {
  const norm = normalize(text);
  for (const [, fd] of fieldMap) {
    if (normalize(fd.display_name) === norm) return fd;
    if (normalize(fd.logical_name) === norm) return fd;
  }
  for (const [, fd] of fieldMap) {
    if (normalize(fd.display_name).includes(norm)) return fd;
    if (norm.includes(normalize(fd.display_name))) return fd;
  }
  return null;
}

function getFieldTypeName(fd: FieldDefinition): string {
  return fd.field_type?.name ?? 'text';
}

function getChoiceOptions(fd: FieldDefinition): ChoiceOption[] {
  const cfg = fd.config_json as { choices?: ChoiceOption[] } | null;
  return cfg?.choices ?? [];
}

function findChoiceValue(fd: FieldDefinition, userLabel: string): string | null {
  const choices = getChoiceOptions(fd);
  const norm = normalize(userLabel);
  for (const c of choices) {
    if (normalize(c.label) === norm) return c.value;
  }
  for (const c of choices) {
    if (normalize(c.label).includes(norm) || norm.includes(normalize(c.label))) return c.value;
  }
  return null;
}

interface ExtractedCondition {
  field: FieldDefinition;
  operator: ConditionOperator;
  value: string | null;
  rawValue: string;
}

interface ExtractedAction {
  type: RuleAction['action_type'];
  field?: FieldDefinition;
  fieldName?: string;
  value?: string | boolean;
  requiredLevel?: 'required' | 'recommended' | 'none';
  message?: string;
  sectionOrTab?: string;
}

const OPERATOR_PATTERNS: [RegExp, ConditionOperator][] = [
  [/\bis not empty\b/i, 'is_not_null'],
  [/\bis not null\b/i, 'is_not_null'],
  [/\bis empty\b/i, 'is_null'],
  [/\bis null\b/i, 'is_null'],
  [/\bdoes not equal\b/i, 'neq'],
  [/\bis not equal(?:\s+to)?\b/i, 'neq'],
  [/\bnot equals?\b/i, 'neq'],
  [/\b!=\b/, 'neq'],
  [/\bdoes not contain\b/i, 'not_contains'],
  [/\bcontains\b/i, 'contains'],
  [/\bstarts with\b/i, 'begins_with'],
  [/\bbegins with\b/i, 'begins_with'],
  [/\bends with\b/i, 'ends_with'],
  [/\bgreater than or equal\b/i, 'gte'],
  [/\bgreater than\b/i, 'gt'],
  [/\bless than or equal\b/i, 'lte'],
  [/\bless than\b/i, 'lt'],
  [/\b>=\b/, 'gte'],
  [/\b<=\b/, 'lte'],
  [/\b>\b/, 'gt'],
  [/\b<\b/, 'lt'],
  [/\bequals?\b/i, 'eq'],
  [/\bis\b/i, 'eq'],
  [/\b=\b/, 'eq'],
];

const ACTION_PATTERNS: { pattern: RegExp; type: ExtractedAction['type']; extract: (m: RegExpMatchArray) => Partial<ExtractedAction> }[] = [
  {
    pattern: /\bshow\s+(?:the\s+)?(?:field\s+)?(?:notification|message|error|warning)\s+["""]?(.+?)["""]?\s*$/i,
    type: 'show_error_message',
    extract: (m) => ({ message: m[1].replace(/["""]/g, '').trim() }),
  },
  {
    pattern: /\bclear\s+(?:the\s+)?(?:notification|message|error|warning)/i,
    type: 'show_error_message',
    extract: () => ({ message: '' }),
  },
  {
    pattern: /\bshow\s+(?:the\s+)?(?:section|tab)\s+["""]?(.+?)["""]?\s*$/i,
    type: 'set_visibility',
    extract: (m) => ({ sectionOrTab: m[1].trim(), value: true }),
  },
  {
    pattern: /\bhide\s+(?:the\s+)?(?:section|tab)\s+["""]?(.+?)["""]?\s*$/i,
    type: 'set_visibility',
    extract: (m) => ({ sectionOrTab: m[1].trim(), value: false }),
  },
  {
    pattern: /\bshow\s+(?:the\s+)?(?:field\s+)?["""]?(.+?)["""]?\s*(?:column|field)?\s*$/i,
    type: 'set_visibility',
    extract: (m) => ({ fieldName: m[1].replace(/\s*(?:column|field)\s*$/i, '').trim(), value: true }),
  },
  {
    pattern: /\bhide\s+(?:the\s+)?(?:field\s+)?["""]?(.+?)["""]?\s*(?:column|field)?\s*$/i,
    type: 'set_visibility',
    extract: (m) => ({ fieldName: m[1].replace(/\s*(?:column|field)\s*$/i, '').trim(), value: false }),
  },
  {
    pattern: /\bmake\s+(?:the\s+)?(?:field\s+)?["""]?(.+?)["""]?\s*(?:column|field)?\s+(?:mandatory|required|business\s+required)/i,
    type: 'set_business_required',
    extract: (m) => ({ fieldName: m[1].replace(/\s*(?:column|field)\s*$/i, '').trim(), requiredLevel: 'required' }),
  },
  {
    pattern: /\bmake\s+(?:the\s+)?(?:field\s+)?["""]?(.+?)["""]?\s*(?:column|field)?\s+(?:optional|not\s+mandatory|not\s+required)/i,
    type: 'set_business_required',
    extract: (m) => ({ fieldName: m[1].replace(/\s*(?:column|field)\s*$/i, '').trim(), requiredLevel: 'none' }),
  },
  {
    pattern: /\bset\s+(?:the\s+)?(?:field\s+)?["""]?(.+?)["""]?\s*(?:column|field)?\s+(?:as\s+)?(?:mandatory|required|business\s+required)/i,
    type: 'set_business_required',
    extract: (m) => ({ fieldName: m[1].replace(/\s*(?:column|field)\s*$/i, '').trim(), requiredLevel: 'required' }),
  },
  {
    pattern: /\block\s+(?:the\s+)?(?:field\s+)?["""]?(.+?)["""]?\s*(?:column|field)?\s*$/i,
    type: 'lock_unlock',
    extract: (m) => ({ fieldName: m[1].replace(/\s*(?:column|field)\s*$/i, '').trim(), value: true }),
  },
  {
    pattern: /\bunlock\s+(?:the\s+)?(?:field\s+)?["""]?(.+?)["""]?\s*(?:column|field)?\s*$/i,
    type: 'lock_unlock',
    extract: (m) => ({ fieldName: m[1].replace(/\s*(?:column|field)\s*$/i, '').trim(), value: false }),
  },
  {
    pattern: /\bset\s+(?:the\s+)?(?:field\s+)?["""]?(.+?)["""]?\s*(?:column|field)?\s+(?:to|=)\s+["""]?(.+?)["""]?\s*$/i,
    type: 'set_field_value',
    extract: (m) => ({
      fieldName: m[1].replace(/\s*(?:column|field)\s*$/i, '').trim(),
      value: m[2].replace(/["""]/g, '').trim(),
    }),
  },
  {
    pattern: /\bclear\s+(?:the\s+)?(?:field\s+)?["""]?(.+?)["""]?\s*(?:column|field|value)?\s*$/i,
    type: 'clear_field_value',
    extract: (m) => ({ fieldName: m[1].replace(/\s*(?:column|field|value)\s*$/i, '').trim() }),
  },
];

function splitClauses(text: string): string[] {
  return text
    .split(/(?:,\s*and\b|,\s*|\band\b)/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseConditionPart(text: string, fieldMap: FieldMap): ExtractedCondition | null {
  const trimmed = text.replace(/^\s*(?:if|when|where)\s+/i, '').trim();

  for (const [pat, op] of OPERATOR_PATTERNS) {
    const match = trimmed.match(pat);
    if (!match) continue;

    const splitIdx = trimmed.search(pat);
    if (splitIdx < 0) continue;

    const fieldPart = trimmed.slice(0, splitIdx).trim();
    const valuePart = trimmed.slice(splitIdx + match[0].length).trim()
      .replace(/^["'""\s]+|["'""\s]+$/g, '');

    const field = findField(fieldPart, fieldMap);
    if (!field) continue;

    return { field, operator: op, value: valuePart || null, rawValue: valuePart };
  }

  return null;
}

function parseActionPart(text: string, fieldMap: FieldMap): ExtractedAction | null {
  const trimmed = text.trim();

  for (const ap of ACTION_PATTERNS) {
    const m = trimmed.match(ap.pattern);
    if (!m) continue;
    const extracted = ap.extract(m);
    const action: ExtractedAction = { type: ap.type, ...extracted };

    if (action.fieldName) {
      const fd = findField(action.fieldName, fieldMap);
      if (fd) action.field = fd;
    }

    return action;
  }

  return null;
}

function buildConditionGroup(conditions: ExtractedCondition[], warnings: string[]): RuleConditionGroup {
  const builtConditions: RuleCondition[] = [];

  for (const c of conditions) {
    const typeName = getFieldTypeName(c.field);
    let resolvedValue: string | null = c.value;

    if (typeName === 'choice' && c.value && c.operator !== 'is_null' && c.operator !== 'is_not_null') {
      const choiceVal = findChoiceValue(c.field, c.value);
      if (choiceVal !== null) {
        resolvedValue = choiceVal;
      } else {
        warnings.push(`Could not find option "${c.rawValue}" in ${c.field.display_name} choices. Using raw text.`);
      }
    }

    builtConditions.push({
      id: genId('c'),
      field_logical_name: c.field.logical_name,
      field_display_name: c.field.display_name,
      field_type_name: typeName,
      operator: c.operator,
      value: resolvedValue,
      source: 'entity',
    });
  }

  return {
    id: genId('g'),
    operator: 'AND',
    conditions: builtConditions,
    groups: [],
  };
}

function buildAction(ea: ExtractedAction, fieldMap: FieldMap, warnings: string[]): RuleAction | null {
  const base: Partial<RuleAction> = { id: genId('a'), action_type: ea.type };

  if (ea.field) {
    base.target_field = ea.field.logical_name;
    base.target_field_display_name = ea.field.display_name;
  } else if (ea.fieldName) {
    const fd = findField(ea.fieldName, fieldMap);
    if (fd) {
      base.target_field = fd.logical_name;
      base.target_field_display_name = fd.display_name;
    } else {
      warnings.push(`Field "${ea.fieldName}" not found in entity.`);
      base.target_field = ea.fieldName.toLowerCase().replace(/\s+/g, '_');
      base.target_field_display_name = ea.fieldName;
    }
  }

  switch (ea.type) {
    case 'set_visibility':
      base.value = ea.value as boolean;
      break;
    case 'lock_unlock':
      base.value = ea.value as boolean;
      break;
    case 'set_business_required':
      base.required_level = ea.requiredLevel ?? 'required';
      break;
    case 'set_field_value':
      base.value_type = 'static';
      base.value = String(ea.value ?? '');
      break;
    case 'clear_field_value':
      break;
    case 'show_error_message':
      base.message = ea.message ?? '';
      base.block_save = true;
      break;
    default:
      break;
  }

  return base as RuleAction;
}

function generateRuleName(conditions: ExtractedCondition[], ifActions: ExtractedAction[]): string {
  const parts: string[] = [];

  const actionDescriptions = ifActions.slice(0, 2).map((a) => {
    const target = a.field?.display_name ?? a.fieldName ?? 'field';
    switch (a.type) {
      case 'set_visibility': return a.value === true ? `Show ${target}` : `Hide ${target}`;
      case 'lock_unlock': return a.value === true ? `Lock ${target}` : `Unlock ${target}`;
      case 'set_business_required': return a.requiredLevel === 'required' ? `Require ${target}` : `Optional ${target}`;
      case 'set_field_value': return `Set ${target}`;
      case 'clear_field_value': return `Clear ${target}`;
      case 'show_error_message': return 'Show Notification';
      default: return `Update ${target}`;
    }
  });

  parts.push(actionDescriptions.join(' & '));

  if (conditions.length > 0) {
    const c = conditions[0];
    const condDesc = `When ${c.field.display_name} ${c.operator === 'eq' ? 'Is' : c.operator === 'neq' ? 'Is Not' : c.operator === 'is_null' ? 'Is Empty' : c.operator === 'is_not_null' ? 'Is Not Empty' : 'Matches'} ${c.rawValue ?? ''}`.trim();
    parts.push(condDesc);
  }

  return parts.join(' ');
}

export function parseRulePrompt(
  prompt: string,
  fields: FieldDefinition[],
): ParsedRule | ParseError {
  idCounter = 0;

  const fieldMap: FieldMap = new Map();
  for (const f of fields) {
    if (!f.is_active) continue;
    fieldMap.set(f.logical_name, f);
  }

  const warnings: string[] = [];

  const ifElseParts = prompt.split(/\belse\b/i);
  const ifBlock = ifElseParts[0] ?? '';
  const elseBlock = ifElseParts.slice(1).join(' ');

  const conditionMatch = ifBlock.match(/^(?:if|when|where)\s+(.+?)(?:,?\s*(?:then|,)\s+(.+))/i);

  let conditionText = '';
  let ifActionText = '';

  if (conditionMatch) {
    conditionText = conditionMatch[1].trim();
    ifActionText = conditionMatch[2]?.trim() ?? '';
  } else {
    const simpleMatch = ifBlock.match(/^(?:if|when|where)\s+(.+)/i);
    if (simpleMatch) {
      const fullCondText = simpleMatch[1];
      for (const ap of ACTION_PATTERNS) {
        const am = fullCondText.match(ap.pattern);
        if (am) {
          const actionStart = fullCondText.indexOf(am[0]);
          conditionText = fullCondText.slice(0, actionStart).replace(/,\s*$/, '').trim();
          ifActionText = fullCondText.slice(actionStart).trim();
          break;
        }
      }
      if (!conditionText) {
        conditionText = fullCondText;
      }
    } else {
      return {
        message: 'Could not understand the rule. Please start with "If [condition], then [actions]".',
        suggestions: [
          'If Lead Source equals Event, show Event column and make it mandatory.',
          'If Account is empty, show notification "Account is required".',
          'If Status equals Won, lock Estimated Revenue.',
        ],
      };
    }
  }

  const conditions: ExtractedCondition[] = [];
  const condParts = conditionText.split(/\s+and\s+/i);
  for (const cp of condParts) {
    const parsed = parseConditionPart(cp.trim(), fieldMap);
    if (parsed) {
      conditions.push(parsed);
    }
  }

  if (conditions.length === 0) {
    return {
      message: `Could not identify the condition field. Make sure the field name exists in the entity.`,
      suggestions: [
        'Available fields: ' + Array.from(fieldMap.values()).slice(0, 10).map((f) => f.display_name).join(', '),
      ],
    };
  }

  const ifActionClauses = splitClauses(ifActionText);
  const ifActions: ExtractedAction[] = [];
  for (const clause of ifActionClauses) {
    const action = parseActionPart(clause, fieldMap);
    if (action) ifActions.push(action);
  }

  if (ifActions.length === 0) {
    return {
      message: 'Could not identify the actions to perform. Please specify what should happen.',
      suggestions: [
        'Supported actions: show/hide field, make mandatory/optional, lock/unlock, set value, clear value, show notification.',
      ],
    };
  }

  const elseActions: ExtractedAction[] = [];
  if (elseBlock.trim()) {
    const elseActionClauses = splitClauses(elseBlock.trim());
    for (const clause of elseActionClauses) {
      const action = parseActionPart(clause, fieldMap);
      if (action) elseActions.push(action);
    }
  }

  const watchFields = [...new Set(conditions.map((c) => c.field.logical_name))];

  const conditionGroup = buildConditionGroup(conditions, warnings);

  const builtIfActions: RuleAction[] = [];
  for (const ea of ifActions) {
    const built = buildAction(ea, fieldMap, warnings);
    if (built) builtIfActions.push(built);
  }

  const builtElseActions: RuleAction[] = [];
  for (const ea of elseActions) {
    const built = buildAction(ea, fieldMap, warnings);
    if (built) builtElseActions.push(built);
  }

  const trigger: RuleTrigger = {
    trigger_on: 'onChange',
    watch_fields: watchFields,
    condition_group: conditionGroup,
  };

  const actions: RuleActionSet = {
    if_actions: builtIfActions,
    else_actions: builtElseActions,
  };

  const name = generateRuleName(conditions, ifActions);

  return {
    name,
    description: `AI-generated rule: ${prompt.slice(0, 200)}`,
    scope: 'all_forms',
    trigger,
    actions,
    warnings,
  };
}

export function isParseError(result: ParsedRule | ParseError): result is ParseError {
  return 'message' in result && !('trigger' in result);
}
