import { describe, it, expect } from 'vitest';
import {
  evaluateCalculation,
  validateCalculation,
  referencedFields,
  hasCircularReference,
} from '../calcEngine';
import type { CalculationConfig, CalcBranch } from '../../../types/field';

// These tests exercise the client-side calc engine, which mirrors the server-side
// PL/pgSQL evaluator (supabase/migrations/20260610000003 + 20260710200000). They
// guard the fix for the calc engine (which previously never installed because its
// migration referenced non-existent `anon`/`authenticated` roles) and cover the
// acceptance cases in the spec: arithmetic, text, IF, date diff, dependency
// detection, circular-reference prevention, and type-mismatch validation.

const elseBranch = (result: CalcBranch['result']): CalcBranch => ({
  id: 'else', isDefault: true, condition: { logic: 'and', rows: [] }, result,
});

const numberField = (field: string) =>
  ({ kind: 'field', field, column: field, fieldType: 'number', displayName: field } as const);

describe('evaluateCalculation — arithmetic', () => {
  it('multiplies then subtracts left-to-right: quantity * unit_price - discount', () => {
    const config: CalculationConfig = {
      version: 2, resultType: 'number',
      branches: [elseBranch({
        operands: [numberField('quantity'), numberField('unit_price'), { kind: 'value', value: '3' }],
        operators: ['*', '-'],
      })],
    };
    expect(evaluateCalculation(config, { quantity: 10, unit_price: 5 })).toBe(47);
  });

  it('returns null on divide-by-zero rather than Infinity', () => {
    const config: CalculationConfig = {
      version: 2, resultType: 'number',
      branches: [elseBranch({ operands: [numberField('a'), numberField('b')], operators: ['/'] })],
    };
    expect(evaluateCalculation(config, { a: 10, b: 0 })).toBeNull();
  });
});

describe('evaluateCalculation — text', () => {
  it('passes a single text field through', () => {
    const config: CalculationConfig = {
      version: 2, resultType: 'text',
      branches: [elseBranch({
        operands: [{ kind: 'field', field: 'first_name', column: 'first_name', fieldType: 'text', displayName: 'First' }],
        operators: [],
      })],
    };
    expect(evaluateCalculation(config, { first_name: 'Ada' })).toBe('Ada');
  });
});

describe('evaluateCalculation — IF / THEN / ELSE', () => {
  const config: CalculationConfig = {
    version: 2, resultType: 'number',
    branches: [
      { id: 'if', isDefault: false,
        condition: { logic: 'and', rows: [{ id: 'r', field: 'revenue', column: 'revenue', fieldType: 'number', displayName: 'Revenue', operator: 'gt', value: '10000' }] },
        result: { operands: [{ kind: 'value', value: '100' }], operators: [] } },
      elseBranch({ operands: [{ kind: 'value', value: '50' }], operators: [] }),
    ],
  };
  it('takes the THEN branch when the condition matches', () => {
    expect(evaluateCalculation(config, { revenue: 20000 })).toBe(100);
  });
  it('falls through to ELSE when it does not', () => {
    expect(evaluateCalculation(config, { revenue: 5000 })).toBe(50);
  });
});

describe('evaluateCalculation — date functions', () => {
  it('DiffInDays(a, b) returns whole days between two dates', () => {
    const config: CalculationConfig = {
      version: 2, resultType: 'number',
      branches: [elseBranch({
        operands: [{ kind: 'function', fn: 'DiffInDays', args: [
          { kind: 'field', field: 'start', column: 'start', fieldType: 'date', displayName: 'Start' },
          { kind: 'field', field: 'end', column: 'end', fieldType: 'date', displayName: 'End' },
        ] }],
        operators: [],
      })],
    };
    expect(evaluateCalculation(config, { start: '2026-07-01', end: '2026-07-11' })).toBe(10);
  });
});

describe('dependency tracking', () => {
  it('referencedFields collects condition + operand + nested function fields', () => {
    const config: CalculationConfig = {
      version: 2, resultType: 'number',
      branches: [
        { id: 'if', isDefault: false,
          condition: { logic: 'and', rows: [{ id: 'r', field: 'revenue', column: 'revenue', fieldType: 'number', displayName: 'Revenue', operator: 'gt', value: '0' }] },
          result: { operands: [numberField('cost'), { kind: 'function', fn: 'DiffInDays', args: [
            { kind: 'field', field: 'start', column: 'start', fieldType: 'date', displayName: 'Start' },
            { kind: 'function', fn: 'Today', args: [] },
          ] }], operators: ['-'] } },
      ],
    };
    expect(referencedFields(config).sort()).toEqual(['cost', 'revenue', 'start']);
  });

  it('detects a direct self-reference', () => {
    expect(hasCircularReference('total', ['total'], {})).toBe(true);
  });

  it('detects an indirect loop through another calculated field', () => {
    // self -> a -> self
    expect(hasCircularReference('self', ['a'], { a: ['self'] })).toBe(true);
  });

  it('allows a non-circular chain', () => {
    expect(hasCircularReference('self', ['a'], { a: ['b'], b: [] })).toBe(false);
  });
});

describe('validateCalculation — friendly errors', () => {
  it('flags an unknown/empty field reference', () => {
    const config: CalculationConfig = {
      version: 2, resultType: 'number',
      branches: [elseBranch({ operands: [{ kind: 'field', field: '', column: '', fieldType: 'number', displayName: '' }], operators: [] })],
    };
    const r = validateCalculation(config);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/choose a field/i);
  });

  it('flags a type mismatch: a text field where a number is required', () => {
    const config: CalculationConfig = {
      version: 2, resultType: 'number',
      branches: [elseBranch({
        operands: [{ kind: 'field', field: 'name', column: 'name', fieldType: 'text', displayName: 'Name' }],
        operators: [],
      })],
    };
    const r = validateCalculation(config);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/not a number/i);
  });

  it('rejects a circular reference at validation time', () => {
    const config: CalculationConfig = {
      version: 2, resultType: 'number',
      branches: [elseBranch({ operands: [numberField('self_calc')], operators: [] })],
    };
    const r = validateCalculation(config, { selfLogical: 'self_calc', otherCalcDeps: {} });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/circular/i);
  });
});
