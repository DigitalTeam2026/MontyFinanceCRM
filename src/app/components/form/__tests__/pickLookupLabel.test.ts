import { describe, it, expect } from 'vitest';
import { pickLookupLabel } from '../FormField';

/**
 * Guarantees a lookup always renders TEXT, never a raw GUID, as long as any
 * name-like column on the referenced row has a value.
 */
describe('pickLookupLabel', () => {
  it('uses the configured label column when present', () => {
    expect(pickLookupLabel({ full_name: 'Jane Doe', contact_id: 'x' }, 'full_name')).toBe('Jane Doe');
  });

  it('falls back to a name-like column when the primary label is empty', () => {
    // full_name (a generated column) is null, but first/last names exist.
    const row = { full_name: null, first_name: 'Jane', last_name: 'Doe' };
    expect(pickLookupLabel(row, 'full_name')).toBe('Jane');
  });

  it('never returns a UUID as the label (would just be another opaque id)', () => {
    const row = { full_name: '', contact_id: '39deb877-2ce9-440a-a4bd-a87bfbf4e5ce' };
    expect(pickLookupLabel(row, 'full_name')).toBe('');
  });

  it('returns empty string when the row has no usable text', () => {
    expect(pickLookupLabel({ full_name: null, some_id: 42 }, 'full_name')).toBe('');
  });

  it('trims whitespace-only values to empty', () => {
    expect(pickLookupLabel({ name: '   ' }, 'name')).toBe('');
  });

  it('resolves account_name for account rows', () => {
    expect(pickLookupLabel({ account_name: 'Acme Corp' }, 'account_name')).toBe('Acme Corp');
  });
});
