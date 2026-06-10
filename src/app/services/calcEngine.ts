import type {
  CalculationConfig,
  CalcConditionGroup,
  CalcConditionRow,
  CalcExpression,
  CalcOperand,
  CalcOperator,
  CalcResultType,
  CalcFormula,
} from '../../types/field';

/*
  Shared calculation engine.

  This mirrors the server-side PL/pgSQL evaluator (see the api/calc migration)
  so the live form preview matches the value the database trigger stores. The
  database is the source of truth; this is used for instant feedback while
  editing a record and for validating a definition before it is saved.

  Form values are keyed by LOGICAL field name (that is how the record form
  stores them), so this engine reads `row.field`. The DB evaluator reads the
  physical column. The two are kept in sync because the builder records both.
*/

// ── Field-type groupings ────────────────────────────────────────────────────
const NUMERIC_TYPES = new Set(['number', 'integer', 'whole_number', 'decimal', 'currency', 'calculated']);
const DATE_TYPES = new Set(['date', 'datetime']);
const BOOL_TYPES = new Set(['boolean', 'two_options', 'twooptions', 'yesno']);

export function isNumericType(t: string): boolean { return NUMERIC_TYPES.has(t); }
export function isDateType(t: string): boolean { return DATE_TYPES.has(t); }
export function isBoolType(t: string): boolean { return BOOL_TYPES.has(t); }

/** Operators valid for a given source field type. */
export function operatorsForType(t: string): CalcOperator[] {
  if (NUMERIC_TYPES.has(t) || DATE_TYPES.has(t)) {
    return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'];
  }
  if (BOOL_TYPES.has(t)) return ['eq', 'neq'];
  // text / choice / lookup
  return ['eq', 'neq', 'contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'];
}

export const OPERATOR_LABELS: Record<CalcOperator, string> = {
  eq: 'equals',
  neq: 'does not equal',
  gt: 'is greater than',
  gte: 'is greater than or equal to',
  lt: 'is less than',
  lte: 'is less than or equal to',
  contains: 'contains',
  starts_with: 'starts with',
  ends_with: 'ends with',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
};

export const ARITH_LABELS: Record<string, string> = { '+': 'Add', '-': 'Subtract', '*': 'Multiply', '/': 'Divide' };
export const ARITH_SYMBOLS: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

export function operatorNeedsValue(op: CalcOperator): boolean {
  return op !== 'is_empty' && op !== 'is_not_empty';
}

// ── Coercion helpers ──────────────────────────────────────────────────────────
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,$\s]/g, ''));
  return Number.isNaN(n) ? null : n;
}
function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (['true', '1', 'yes'].includes(s)) return true;
  if (['false', '0', 'no'].includes(s)) return false;
  return null;
}
function toTime(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const t = new Date(String(v)).getTime();
  return Number.isNaN(t) ? null : t;
}
function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

// ── Condition evaluation ────────────────────────────────────────────────────
function evalCondition(row: CalcConditionRow, values: Record<string, unknown>): boolean {
  const raw = values[row.field];
  if (row.operator === 'is_empty') return isEmpty(raw);
  if (row.operator === 'is_not_empty') return !isEmpty(raw);

  if (NUMERIC_TYPES.has(row.fieldType) || DATE_TYPES.has(row.fieldType)) {
    const conv = DATE_TYPES.has(row.fieldType) ? toTime : toNum;
    const a = conv(raw);
    const b = conv(row.value);
    if (a === null || b === null) return row.operator === 'neq';
    switch (row.operator) {
      case 'eq': return a === b;
      case 'neq': return a !== b;
      case 'gt': return a > b;
      case 'gte': return a >= b;
      case 'lt': return a < b;
      case 'lte': return a <= b;
      default: return false;
    }
  }

  if (BOOL_TYPES.has(row.fieldType)) {
    const a = toBool(raw); const b = toBool(row.value);
    return row.operator === 'neq' ? a !== b : a === b;
  }

  // text / choice / lookup
  const a = isEmpty(raw) ? '' : String(raw).toLowerCase();
  const b = (row.value ?? '').toLowerCase();
  switch (row.operator) {
    case 'eq': return a === b;
    case 'neq': return a !== b;
    case 'contains': return a.includes(b);
    case 'starts_with': return a.startsWith(b);
    case 'ends_with': return a.endsWith(b);
    default: return false;
  }
}

function evalGroup(group: CalcConditionGroup, values: Record<string, unknown>): boolean {
  if (!group.rows.length) return true;
  const results = group.rows.map((r) => evalCondition(r, values));
  return group.logic === 'or' ? results.some(Boolean) : results.every(Boolean);
}

// ── Expression evaluation ─────────────────────────────────────────────────────
function operandValue(op: CalcOperand, values: Record<string, unknown>): unknown {
  return op.kind === 'field' ? values[op.field] : op.value;
}

function evalExpression(
  expr: CalcExpression,
  values: Record<string, unknown>,
  resultType: CalcResultType
): number | string | boolean | null {
  if (!expr.operands.length) return null;

  if (resultType === 'number' || resultType === 'currency') {
    let acc = toNum(operandValue(expr.operands[0], values)) ?? 0;
    for (let i = 1; i < expr.operands.length; i++) {
      const op = expr.operators[i - 1] ?? '+';
      const v = toNum(operandValue(expr.operands[i], values)) ?? 0;
      if (op === '+') acc += v;
      else if (op === '-') acc -= v;
      else if (op === '*') acc *= v;
      else if (op === '/') { if (v === 0) return null; acc /= v; }
    }
    return acc;
  }

  const v = operandValue(expr.operands[0], values);
  if (resultType === 'boolean') return toBool(v);
  if (resultType === 'date') { return isEmpty(v) ? null : String(v); }
  return isEmpty(v) ? null : String(v); // text / choice
}

// ── Public: evaluate a full calculation definition ─────────────────────────────
export function evaluateCalculation(
  config: CalculationConfig,
  values: Record<string, unknown>
): number | string | boolean | null {
  for (const branch of config.branches) {
    const match = branch.isDefault || evalGroup(branch.condition, values);
    if (match) return evalExpression(branch.result, values, config.resultType);
  }
  return null;
}

// ── Legacy numeric token formula (backward compatibility) ──────────────────────
export function evaluateLegacyFormula(
  formula: CalcFormula,
  values: Record<string, unknown>
): number | null {
  const { tokens } = formula;
  if (!tokens.length) return null;
  let result: number | null = null;
  let pendingOp: string | null = null;
  for (const token of tokens) {
    if (token.type === 'operator') { pendingOp = token.op; continue; }
    let val: number;
    if (token.type === 'field') {
      const raw = values[token.fieldName];
      val = raw != null && raw !== '' ? Number(raw) : 0;
      if (Number.isNaN(val)) val = 0;
    } else { val = token.value; }
    if (result === null) { result = val; continue; }
    if (pendingOp === '+') result += val;
    else if (pendingOp === '-') result -= val;
    else if (pendingOp === '*') result *= val;
    else if (pendingOp === '/') result = val !== 0 ? result / val : null;
    pendingOp = null;
  }
  return result;
}

/** Read whichever definition is present (v2 calculation preferred, legacy formula fallback). */
export function evaluateFieldCalc(
  configJson: Record<string, unknown> | null | undefined,
  values: Record<string, unknown>
): { value: number | string | boolean | null; resultType: CalcResultType } {
  const calc = configJson?.calculation as CalculationConfig | undefined;
  if (calc && Array.isArray(calc.branches)) {
    return { value: evaluateCalculation(calc, values), resultType: calc.resultType };
  }
  const legacy = configJson?.formula as CalcFormula | undefined;
  if (legacy && Array.isArray(legacy.tokens)) {
    return { value: evaluateLegacyFormula(legacy, values), resultType: 'number' };
  }
  return { value: null, resultType: 'text' };
}

// ── Display formatting ─────────────────────────────────────────────────────────
export function formatCalcValue(value: number | string | boolean | null, resultType: CalcResultType): string {
  if (value === null || value === undefined) return '—';
  switch (resultType) {
    case 'number':
      return Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 });
    case 'currency':
      return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'date': {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
    }
    default:
      return String(value);
  }
}

// ── Validation ──────────────────────────────────────────────────────────────────

/** All field logical-names referenced by conditions and expressions in a config. */
export function referencedFields(config: CalculationConfig): string[] {
  const out = new Set<string>();
  for (const b of config.branches) {
    if (!b.isDefault) for (const r of b.condition.rows) if (r.field) out.add(r.field);
    for (const op of b.result.operands) if (op.kind === 'field' && op.field) out.add(op.field);
  }
  return [...out];
}

/**
 * Detect a circular reference: does `self` (with the fields it references) end up
 * depending on itself through the dependency graph of other calculated fields?
 */
export function hasCircularReference(
  selfLogical: string,
  selfRefs: string[],
  otherCalcDeps: Record<string, string[]>
): boolean {
  if (selfRefs.includes(selfLogical)) return true;
  const deps = { ...otherCalcDeps, [selfLogical]: selfRefs };
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dfs = (node: string): boolean => {
    if (node === selfLogical && visiting.size > 0) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const dep of deps[node] ?? []) {
      if (dep === selfLogical) return true;
      if (deps[dep] && dfs(dep)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  for (const dep of selfRefs) {
    if (dep === selfLogical) return true;
    if (deps[dep] && dfs(dep)) return true;
  }
  return false;
}

export interface CalcValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCalculation(
  config: CalculationConfig,
  opts: { selfLogical?: string; otherCalcDeps?: Record<string, string[]> } = {}
): CalcValidationResult {
  const errors: string[] = [];
  const numeric = config.resultType === 'number' || config.resultType === 'currency';

  if (!config.branches.length) errors.push('Add at least one IF/THEN branch or a default result.');

  const defaults = config.branches.filter((b) => b.isDefault);
  if (defaults.length > 1) errors.push('Only one ELSE (default) branch is allowed.');

  config.branches.forEach((b, i) => {
    const label = b.isDefault ? 'ELSE' : i === 0 ? 'IF' : `branch ${i + 1}`;

    if (!b.isDefault) {
      if (!b.condition.rows.length) errors.push(`${label}: add at least one condition.`);
      b.condition.rows.forEach((r, ri) => {
        if (!r.field) errors.push(`${label} condition ${ri + 1}: choose a field.`);
        else if (!operatorsForType(r.fieldType).includes(r.operator))
          errors.push(`${label} condition ${ri + 1}: "${OPERATOR_LABELS[r.operator]}" is not valid for ${r.displayName}.`);
        if (operatorNeedsValue(r.operator) && (r.value ?? '') === '')
          errors.push(`${label} condition ${ri + 1}: enter a comparison value.`);
        if (operatorNeedsValue(r.operator) && (NUMERIC_TYPES.has(r.fieldType)) && r.value !== '' && toNum(r.value) === null)
          errors.push(`${label} condition ${ri + 1}: value must be a number.`);
      });
    }

    // Result expression
    if (!b.result.operands.length) {
      errors.push(`${label}: set a result value.`);
    } else {
      b.result.operands.forEach((op, oi) => {
        if (op.kind === 'field' && !op.field) errors.push(`${label} result part ${oi + 1}: choose a field.`);
        if (op.kind === 'value' && (op.value ?? '') === '') errors.push(`${label} result part ${oi + 1}: enter a value.`);
        if (op.kind === 'value' && numeric && op.value !== '' && toNum(op.value) === null)
          errors.push(`${label} result: "${op.value}" is not a number.`);
        if (op.kind === 'field' && numeric && !NUMERIC_TYPES.has(op.fieldType))
          errors.push(`${label} result: ${op.displayName} is not a numeric field.`);
      });
      if (!numeric && b.result.operands.length > 1)
        errors.push(`${label}: arithmetic is only supported for Number/Currency results. Use a single value.`);
    }
  });

  // Circular reference
  if (opts.selfLogical) {
    const refs = referencedFields(config);
    if (hasCircularReference(opts.selfLogical, refs, opts.otherCalcDeps ?? {}))
      errors.push('Circular reference detected — this calculation depends on itself.');
  }

  return { valid: errors.length === 0, errors };
}

/** Human-readable one-line summary of a calculation, for the field editor. */
export function summarizeCalculation(config: CalculationConfig): string {
  const exprStr = (e: CalcExpression): string =>
    e.operands
      .map((op, i) => {
        const part = op.kind === 'field' ? op.displayName : `"${op.value}"`;
        return i === 0 ? part : `${ARITH_SYMBOLS[e.operators[i - 1] ?? '+']} ${part}`;
      })
      .join(' ');
  const parts = config.branches.map((b) => {
    if (b.isDefault) return `ELSE → ${exprStr(b.result)}`;
    const cond = b.condition.rows
      .map((r) => `${r.displayName} ${OPERATOR_LABELS[r.operator]}${operatorNeedsValue(r.operator) ? ` ${r.value}` : ''}`)
      .join(` ${b.condition.logic.toUpperCase()} `);
    return `IF ${cond} → ${exprStr(b.result)}`;
  });
  return parts.join('  •  ');
}
