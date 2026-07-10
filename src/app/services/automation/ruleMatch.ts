// Pure rule-matching semantics for Power Automation. No I/O — imported by the
// client dispatcher (to decide whether to enqueue a job) and exercised directly
// by unit tests. Keeping this side-effect-free is what makes the "changes to"
// transition logic testable in isolation.

import type {
  AutomationRule,
  AutomationCondition,
  AutomationOperator,
} from '../../../types/automationRule';

export type RecordValues = Record<string, unknown>;

/**
 * Loose value equality across the CRM's field types. A trigger value stored as
 * JSON (e.g. `true`, `1`, `"true"`) must match the record value regardless of
 * whether the column serializes booleans/choices as bool, number, or string.
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;

  // Booleans: treat true/1/"true"/"yes" and false/0/"false"/"no" as equivalent.
  const asBool = (v: unknown): boolean | null => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'true' || s === 'yes' || s === '1') return true;
      if (s === 'false' || s === 'no' || s === '0') return false;
    }
    return null;
  };
  const ab = asBool(a);
  const bb = asBool(b);
  if (ab !== null && bb !== null) return ab === bb;

  // Fall back to string comparison (handles number 3 vs "3", uuid casing kept as-is).
  return String(a) === String(b);
}

function isEmpty(v: unknown): boolean {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Field logical names whose value differs between before and after. */
export function computeChangedFields(
  before: RecordValues | null,
  after: RecordValues,
): string[] {
  const changed: string[] = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  for (const k of keys) {
    if (!valuesEqual(before?.[k], after[k])) changed.push(k);
  }
  return changed;
}

/** Does one extra AND-condition hold against the post-save record? */
export function conditionHolds(cond: AutomationCondition, after: RecordValues): boolean {
  // A related-record condition ("lookup.field") can't be evaluated against the
  // record's own snapshot — the server worker follows the lookup and evaluates it.
  // Treat as passing here so the job still enqueues; the worker is authoritative.
  if (typeof cond.field === 'string' && cond.field.includes('.')) return true;
  const actual = after[cond.field];
  switch (cond.operator) {
    case 'equals':       return valuesEqual(actual, cond.value);
    case 'not_equals':   return !valuesEqual(actual, cond.value);
    case 'is_empty':     return isEmpty(actual);
    case 'is_not_empty': return !isEmpty(actual);
    default:             return false;
  }
}

interface FromToValue { from?: unknown; to?: unknown }

/**
 * Core trigger evaluation. `before` is null for creates (treated as old = null),
 * which is what makes a create satisfy `changes_to` (null -> value is a transition).
 */
export function triggerMatches(
  operator: AutomationOperator,
  field: string | null,
  triggerValue: unknown,
  before: RecordValues | null,
  after: RecordValues,
): boolean {
  // Field-less rule: fires on any create/update (the event gate is applied by the caller).
  if (!field) return operator === 'changed' || operator === 'equals' ? true : true;

  const oldV = before ? before[field] : null;
  const newV = after[field];

  switch (operator) {
    case 'changed':
      return !valuesEqual(oldV, newV);

    case 'equals':
      // Fire whenever the field now equals the value (does not require a transition).
      return valuesEqual(newV, triggerValue);

    case 'changes_to':
      // Transition INTO the value: was something else, now equals it.
      return !valuesEqual(oldV, triggerValue) && valuesEqual(newV, triggerValue);

    case 'is_any_of': {
      const set = Array.isArray(triggerValue) ? triggerValue : [triggerValue];
      const nowIn = set.some((v) => valuesEqual(newV, v));
      const wasIn = set.some((v) => valuesEqual(oldV, v));
      // Transition INTO the set (mirrors changes_to for a set of values).
      return nowIn && !wasIn;
    }

    case 'changes_from_to': {
      const ft = (triggerValue ?? {}) as FromToValue;
      const fromOk = ft.from === undefined || valuesEqual(oldV, ft.from);
      const toOk = valuesEqual(newV, ft.to);
      return fromOk && toOk && !valuesEqual(oldV, newV);
    }

    default:
      return false;
  }
}

/**
 * Full match for a rule against a save event. Returns true only when the trigger
 * event, the trigger operator, AND every extra condition all hold.
 */
export function ruleMatches(
  rule: Pick<AutomationRule, 'trigger_event' | 'field_logical_name' | 'operator' | 'trigger_value' | 'conditions'>,
  event: 'create' | 'update',
  before: RecordValues | null,
  after: RecordValues,
): boolean {
  // Event gate.
  if (rule.trigger_event !== 'both' && rule.trigger_event !== event) return false;

  if (!triggerMatches(rule.operator, rule.field_logical_name, rule.trigger_value, before, after)) {
    return false;
  }

  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  return conditions.every((c) => conditionHolds(c, after));
}
