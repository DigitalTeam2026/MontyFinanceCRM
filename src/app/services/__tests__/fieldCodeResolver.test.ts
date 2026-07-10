import { describe, it, expect } from 'vitest';
import { resolveFieldCode, type EntityFieldCodeMeta } from '../fieldCodeResolver';

// The choice-resolution path is pure (no DB) — statecode/statusreason go through
// displayResolver/supabase and are covered by integration behavior, not here.
function metaWith(choices: Record<string, string>): EntityFieldCodeMeta {
  return {
    entityDefinitionId: 'ent-1',
    byName: new Map([['forecast_category', { choices }]]),
  };
}

describe('resolveFieldCode (choice path)', () => {
  const choices = { '1': 'Pipeline', '2': 'Best Case', '3': 'Committed' };

  it('maps a single choice code to its label', async () => {
    const meta = metaWith(choices);
    expect(await resolveFieldCode(meta, 'forecast_category', '1')).toBe('Pipeline');
    expect(await resolveFieldCode(meta, 'forecast_category', '3')).toBe('Committed');
  });

  it('maps a multi-choice JSON array to joined labels', async () => {
    const meta = metaWith(choices);
    expect(await resolveFieldCode(meta, 'forecast_category', '["1","2"]')).toBe('Pipeline, Best Case');
  });

  it('maps a native array value to joined labels', async () => {
    const meta = metaWith(choices);
    expect(await resolveFieldCode(meta, 'forecast_category', ['2', '3'])).toBe('Best Case, Committed');
  });

  it('returns null for an unknown code (caller falls back to raw)', async () => {
    const meta = metaWith(choices);
    expect(await resolveFieldCode(meta, 'forecast_category', '99')).toBeNull();
  });

  it('returns null for a field that is not a code field', async () => {
    const meta = metaWith(choices);
    expect(await resolveFieldCode(meta, 'some_text_field', 'hello')).toBeNull();
  });

  it('returns null for empty/nullish values', async () => {
    const meta = metaWith(choices);
    expect(await resolveFieldCode(meta, 'forecast_category', '')).toBeNull();
    expect(await resolveFieldCode(meta, 'forecast_category', null)).toBeNull();
  });
});
