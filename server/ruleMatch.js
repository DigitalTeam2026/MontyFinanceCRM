// server/ruleMatch.js
// CommonJS port of src/app/services/automation/ruleMatch.ts — used by the worker
// for loop-protected CHAINING (when an update_field action changes a record, the
// worker re-evaluates rules and enqueues follow-up jobs). Detection for user
// saves still happens client-side; this mirror exists only because the worker
// runs in Node/CJS and cannot import the TS module. Keep the two in sync.

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  const asBool = (v) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "true" || s === "yes" || s === "1") return true;
      if (s === "false" || s === "no" || s === "0") return false;
    }
    return null;
  };
  const ab = asBool(a);
  const bb = asBool(b);
  if (ab !== null && bb !== null) return ab === bb;
  return String(a) === String(b);
}

function isEmpty(v) {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

function conditionHolds(cond, after) {
  const actual = after ? after[cond.field] : undefined;
  switch (cond.operator) {
    case "equals": return valuesEqual(actual, cond.value);
    case "not_equals": return !valuesEqual(actual, cond.value);
    case "is_empty": return isEmpty(actual);
    case "is_not_empty": return !isEmpty(actual);
    default: return false;
  }
}

function triggerMatches(operator, field, triggerValue, before, after) {
  if (!field) return true;
  const oldV = before ? before[field] : null;
  const newV = after ? after[field] : undefined;
  switch (operator) {
    case "changed": return !valuesEqual(oldV, newV);
    case "equals": return valuesEqual(newV, triggerValue);
    case "changes_to": return !valuesEqual(oldV, triggerValue) && valuesEqual(newV, triggerValue);
    case "is_any_of": {
      const set = Array.isArray(triggerValue) ? triggerValue : [triggerValue];
      return set.some((v) => valuesEqual(newV, v)) && !set.some((v) => valuesEqual(oldV, v));
    }
    case "changes_from_to": {
      const ft = triggerValue || {};
      const fromOk = ft.from === undefined || valuesEqual(oldV, ft.from);
      return fromOk && valuesEqual(newV, ft.to) && !valuesEqual(oldV, newV);
    }
    default: return false;
  }
}

function ruleMatches(rule, event, before, after) {
  if (rule.trigger_event !== "both" && rule.trigger_event !== event) return false;
  if (!triggerMatches(rule.operator, rule.field_logical_name, rule.trigger_value, before, after)) {
    return false;
  }
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  return conditions.every((c) => conditionHolds(c, after));
}

module.exports = { valuesEqual, isEmpty, conditionHolds, triggerMatches, ruleMatches };
