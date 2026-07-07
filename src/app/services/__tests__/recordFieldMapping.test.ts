import { describe, it, expect } from 'vitest';
import {
  translateToLogical,
  translateToPhysical,
  mergeFieldMapping,
  filterToExistingColumns,
  type FieldMapping,
} from '../recordService';

/**
 * These cover the metadata-driven load/save translation that lets ANY field placed
 * on a form load and save without per-field code. The failure the fix targets:
 * a newly-added field whose value silently fails to load (stays under its physical
 * key) or save (dropped because it has no logical→physical mapping).
 */

const mapping: FieldMapping = {
  // A custom field just added through the builder + a well-known lookup (owner).
  logicalToPhysical: { annualrevenue: 'annual_revenue', ownerid: 'owner_id' },
  physicalToLogical: { annual_revenue: 'annualrevenue', owner_id: 'ownerid' },
};

describe('translateToLogical (load: physical row → form-bindable values)', () => {
  it('exposes each mapped physical column under BOTH its logical and physical key', () => {
    const row = { annual_revenue: 1000, owner_id: 'u-1', name: 'Acme' };
    const out = translateToLogical(row, mapping);
    // Form controls key by logical name…
    expect(out.annualrevenue).toBe(1000);
    expect(out.ownerid).toBe('u-1');
    // …while the physical keys survive for the physical-fallback binding.
    expect(out.annual_revenue).toBe(1000);
    expect(out.owner_id).toBe('u-1');
  });

  it('carries over unmapped physical columns unchanged (no data lost)', () => {
    const row = { name: 'Acme', custom_unmapped: 7 };
    const out = translateToLogical(row, mapping);
    expect(out.name).toBe('Acme');
    expect(out.custom_unmapped).toBe(7);
  });
});

describe('translateToPhysical (save: form values → writable payload)', () => {
  it('translates a logical-named value to its physical column', () => {
    const out = translateToPhysical({ annualrevenue: 2000 }, mapping, 'account');
    expect(out).toEqual({ annual_revenue: 2000 });
  });

  it('honors an owner picked on the form (ownerid → owner_id)', () => {
    const out = translateToPhysical({ ownerid: 'u-2' }, mapping, 'account');
    expect(out.owner_id).toBe('u-2');
  });

  it('when both logical and stale physical keys are present, the logical (edited) value wins', () => {
    // Loaded record left owner_id in state; the user then changed ownerid.
    const out = translateToPhysical({ owner_id: 'old', ownerid: 'new' }, mapping, 'account');
    expect(out.owner_id).toBe('new');
  });

  it('passes through a value already keyed by a known physical column', () => {
    const out = translateToPhysical({ annual_revenue: 3000 }, mapping, 'account');
    expect(out).toEqual({ annual_revenue: 3000 });
  });

  it('drops a value keyed by an UNMAPPED logical name (the silent-drop this fix surfaces)', () => {
    const out = translateToPhysical({ not_a_field: 'x' }, mapping, 'account');
    expect(out).toEqual({});
  });

  it('never writes a DB-managed/generated column (e.g. account_number)', () => {
    const m: FieldMapping = {
      logicalToPhysical: { accountnumber: 'account_number' },
      physicalToLogical: { account_number: 'accountnumber' },
    };
    const out = translateToPhysical({ accountnumber: 'A-1' }, m, 'account');
    expect(out).toEqual({});
  });
});

describe('mergeFieldMapping (authoritative form map wins over stale cache)', () => {
  it('adds a field the cached mapping is missing so a just-added field still saves', () => {
    const cached: FieldMapping = { logicalToPhysical: {}, physicalToLogical: {} };
    const formMap: FieldMapping = {
      logicalToPhysical: { newfield: 'new_field' },
      physicalToLogical: { new_field: 'newfield' },
    };
    const merged = mergeFieldMapping(cached, formMap);
    expect(translateToPhysical({ newfield: 9 }, merged, 'account')).toEqual({ new_field: 9 });
  });

  it('is a no-op (returns base) when override is null/undefined', () => {
    expect(mergeFieldMapping(mapping, null)).toBe(mapping);
    expect(mergeFieldMapping(mapping, undefined)).toBe(mapping);
  });

  it('override entries win over the base on key collision', () => {
    const base: FieldMapping = {
      logicalToPhysical: { f: 'old_col' },
      physicalToLogical: { old_col: 'f' },
    };
    const override: FieldMapping = {
      logicalToPhysical: { f: 'new_col' },
      physicalToLogical: { new_col: 'f' },
    };
    expect(mergeFieldMapping(base, override).logicalToPhysical.f).toBe('new_col');
  });
});

describe('filterToExistingColumns (drift guard)', () => {
  it('keeps only keys that are real columns', () => {
    const cols = new Set(['a', 'b']);
    expect(filterToExistingColumns({ a: 1, b: 2, c: 3 }, cols)).toEqual({ a: 1, b: 2 });
  });

  it('empty column set disables filtering (safe fallback, keeps all)', () => {
    expect(filterToExistingColumns({ a: 1 }, new Set())).toEqual({ a: 1 });
  });
});
