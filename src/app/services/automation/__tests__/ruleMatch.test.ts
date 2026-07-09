import { describe, it, expect } from 'vitest';
import {
  ruleMatches, triggerMatches, valuesEqual, computeChangedFields, conditionHolds,
} from '../ruleMatch';
import { validateActionConfig, validateRuleTokens } from '../actionValidation';
import type { AutomationRule, AutomationRuleAction, AutomationActionType } from '../../../../types/automationRule';

const act = (action_type: AutomationActionType, config: Record<string, unknown>, i = 0): AutomationRuleAction => ({
  automation_rule_action_id: `a${i}`, rule_id: 'r', sort_order: i, action_type,
  config, created_at: '', modified_at: '',
});

type TriggerParts = Pick<AutomationRule, 'trigger_event' | 'field_logical_name' | 'operator' | 'trigger_value' | 'conditions'>;
const rule = (p: Partial<TriggerParts>): TriggerParts => ({
  trigger_event: 'update',
  field_logical_name: 'start_approval',
  operator: 'changes_to',
  trigger_value: true,
  conditions: [],
  ...p,
});

describe('valuesEqual — cross-type coercion', () => {
  it('treats boolean true and "true"/1 as equal', () => {
    expect(valuesEqual(true, 'true')).toBe(true);
    expect(valuesEqual(true, 1)).toBe(true);
    expect(valuesEqual(false, 'no')).toBe(true);
  });
  it('compares choice numbers vs strings', () => {
    expect(valuesEqual(3, '3')).toBe(true);
    expect(valuesEqual(2, 3)).toBe(false);
  });
  it('handles null/undefined', () => {
    expect(valuesEqual(null, undefined)).toBe(true);
    expect(valuesEqual(null, false)).toBe(false);
  });
});

describe('changes_to — transition semantics', () => {
  it('fires only on transition INTO the value (false -> true)', () => {
    expect(triggerMatches('changes_to', 'start_approval', true, { start_approval: false }, { start_approval: true })).toBe(true);
  });
  it('does NOT fire when the value already matched (true -> true)', () => {
    expect(triggerMatches('changes_to', 'start_approval', true, { start_approval: true }, { start_approval: true })).toBe(false);
  });
  it('does NOT fire on an unrelated save while value stays true', () => {
    expect(triggerMatches('changes_to', 'start_approval', true, { start_approval: true, name: 'a' }, { start_approval: true, name: 'b' })).toBe(false);
  });
  it('does NOT fire on transition to a different value', () => {
    expect(triggerMatches('changes_to', 'stage', 'won', { stage: 'new' }, { stage: 'lost' })).toBe(false);
  });
});

describe('create vs update / null handling', () => {
  it('treats create (before = null) as old = null, so null -> true is a transition', () => {
    expect(ruleMatches(rule({ trigger_event: 'both' }), 'create', null, { start_approval: true })).toBe(true);
  });
  it('an update rule does not fire on a create event', () => {
    expect(ruleMatches(rule({ trigger_event: 'update' }), 'create', null, { start_approval: true })).toBe(false);
  });
  it('a create rule does not fire on an update event', () => {
    expect(ruleMatches(rule({ trigger_event: 'create' }), 'update', { start_approval: false }, { start_approval: true })).toBe(false);
  });
  it('create where the field never becomes the value does not fire', () => {
    expect(ruleMatches(rule({ trigger_event: 'create' }), 'create', null, { start_approval: false })).toBe(false);
  });
});

describe('equals vs changes_to', () => {
  it('equals fires whenever after equals value (no transition needed)', () => {
    expect(triggerMatches('equals', 'stage', 'won', { stage: 'won' }, { stage: 'won' })).toBe(true);
  });
  it('changes_to would NOT fire in that same already-equal case', () => {
    expect(triggerMatches('changes_to', 'stage', 'won', { stage: 'won' }, { stage: 'won' })).toBe(false);
  });
});

describe('is_any_of and changes_from_to', () => {
  it('is_any_of fires on transition into the set', () => {
    expect(triggerMatches('is_any_of', 'stage', ['won', 'lost'], { stage: 'new' }, { stage: 'won' })).toBe(true);
  });
  it('is_any_of does not fire when moving within the set', () => {
    expect(triggerMatches('is_any_of', 'stage', ['won', 'lost'], { stage: 'won' }, { stage: 'lost' })).toBe(false);
  });
  it('changes_from_to requires both endpoints', () => {
    expect(triggerMatches('changes_from_to', 'stage', { from: 'new', to: 'won' }, { stage: 'new' }, { stage: 'won' })).toBe(true);
    expect(triggerMatches('changes_from_to', 'stage', { from: 'new', to: 'won' }, { stage: 'open' }, { stage: 'won' })).toBe(false);
  });
});

describe('changed operator', () => {
  it('fires on any change of the field', () => {
    expect(triggerMatches('changed', 'amount', null, { amount: 10 }, { amount: 20 })).toBe(true);
    expect(triggerMatches('changed', 'amount', null, { amount: 10 }, { amount: 10 })).toBe(false);
  });
});

describe('AND conditions gate the whole rule', () => {
  it('blocks the match when a condition fails', () => {
    const r = rule({ conditions: [{ field: 'region', operator: 'equals', value: 'EU' }] });
    expect(ruleMatches(r, 'update', { start_approval: false }, { start_approval: true, region: 'US' })).toBe(false);
    expect(ruleMatches(r, 'update', { start_approval: false }, { start_approval: true, region: 'EU' })).toBe(true);
  });
  it('is_not_empty / is_empty conditions', () => {
    expect(conditionHolds({ field: 'owner', operator: 'is_not_empty' }, { owner: 'u1' })).toBe(true);
    expect(conditionHolds({ field: 'owner', operator: 'is_empty' }, { owner: '' })).toBe(true);
  });
});

describe('computeChangedFields', () => {
  it('reports only fields whose value changed', () => {
    expect(computeChangedFields({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b']);
  });
  it('treats create (before null) as all fields new', () => {
    expect(computeChangedFields(null, { a: 1 })).toEqual(['a']);
  });
});

describe('action config validation', () => {
  it('rejects a send_email with no recipients / subject / body', () => {
    const errs = validateActionConfig('send_email', { to_static: [], to_fields: [], subject: '', body: '' });
    expect(errs.length).toBeGreaterThan(0);
  });
  it('accepts a valid send_email', () => {
    const errs = validateActionConfig('send_email', {
      to_static: ['sales@company.com'], to_fields: [], subject: 'Hi', body: '<p>x</p>',
    });
    expect(errs).toEqual([]);
  });
  it('flags an invalid static address', () => {
    const errs = validateActionConfig('send_email', {
      to_static: ['not-an-email'], to_fields: [], subject: 'Hi', body: 'x',
    });
    expect(errs.some((e) => e.includes('Invalid email'))).toBe(true);
  });
});

describe('cross-action step/token validation', () => {
  it('accepts a list_rows step referenced by a later send_email', () => {
    const actions = [
      act('list_rows', { step_name: 'recipients', source_table: 'email_recipients', columns: ['email'] }, 0),
      act('send_email', { to: "{{steps.recipients.join(email, ';')}}", subject: 's', body: 'b' }, 1),
    ];
    expect(validateRuleTokens(actions)).toEqual([]);
  });
  it('rejects a forward reference (step defined after the reference)', () => {
    const actions = [
      act('send_email', { to: '{{steps.recipients.count}}', subject: 's', body: 'b' }, 0),
      act('list_rows', { step_name: 'recipients', source_table: 'email_recipients', columns: ['email'] }, 1),
    ];
    expect(validateRuleTokens(actions).some((p) => /not defined by an earlier/.test(p))).toBe(true);
  });
  it('rejects a join on a column the step does not return', () => {
    const actions = [
      act('list_rows', { step_name: 'r', source_table: 't', columns: ['email'] }, 0),
      act('send_email', { to: "{{steps.r.join(phone, ';')}}", subject: 's', body: 'b' }, 1),
    ];
    expect(validateRuleTokens(actions).some((p) => /does not return column "phone"/.test(p))).toBe(true);
  });
  it('rejects an empty join separator', () => {
    const actions = [
      act('list_rows', { step_name: 'r', source_table: 't', columns: ['email'] }, 0),
      act('send_email', { to: "{{steps.r.join(email, '')}}", subject: 's', body: 'b' }, 1),
    ];
    expect(validateRuleTokens(actions).some((p) => /separator.*non-empty/.test(p))).toBe(true);
  });
});
