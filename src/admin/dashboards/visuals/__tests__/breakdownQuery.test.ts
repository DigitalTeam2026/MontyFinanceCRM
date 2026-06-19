import { describe, it, expect } from 'vitest';
import { assembleBreakdown, type ClassifiedRow } from '../breakdownQuery';

/**
 * Locks the lookup/breakdown counting policy: a grouped card's headline total is
 * SUM(valid grouped rows), never the base entity count. Null/unassigned values are
 * excluded by default; broken lookup references (orphans) are excluded too; one
 * card can opt back in with showEmptyValues. Percentages derive from this total,
 * so a card's rows always sum to 100%.
 */

const valid = (raw: string, label: string, value: number): ClassifiedRow => ({ kind: 'valid', raw, label, value });
const empty = (value: number): ClassifiedRow => ({ kind: 'empty', raw: null, label: '—', value });
const orphan = (raw: string, value: number): ClassifiedRow => ({ kind: 'orphan', raw, label: raw, value });

const base = { additive: true, showEmptyValues: false, emptyLabel: '—' as const };

describe('assembleBreakdown — default (showEmptyValues = false)', () => {
  it('all-null lookup → total 0 / no rows (Source card)', () => {
    const r = assembleBreakdown({ ...base, rows: [empty(8)], baseTotal: 8, nonEmptyTotal: 0 });
    expect(r.total).toBe(0);
    expect(r.breakdown).toEqual([]);
  });

  it('mixed null + valid → total counts only real values (Industry: 8 base → 4)', () => {
    const rows = [valid('agri', 'Agriculture', 2), valid('edu', 'Education', 1), valid('auto', 'Automotive', 1), empty(4)];
    const r = assembleBreakdown({ ...base, rows, baseTotal: 8, nonEmptyTotal: 4 });
    expect(r.total).toBe(4);
    expect(r.breakdown.map((b) => b.label)).toEqual(['Agriculture', 'Education', 'Automotive']);
    expect(r.breakdown.some((b) => b.label === '—')).toBe(false);
  });

  it('mixed null + valid → Campaign: 8 base → 6', () => {
    const rows = [valid('pg', 'PG_POS Campaign', 3), valid('cc', 'Credit Card-Campaign', 3), empty(2)];
    const r = assembleBreakdown({ ...base, rows, baseTotal: 8, nonEmptyTotal: 6 });
    expect(r.total).toBe(6);
    expect(r.breakdown).toHaveLength(2);
  });

  it('all-valid lookup → total stays the base count (Product card)', () => {
    const rows = [valid('p1', 'Product A', 5), valid('p2', 'Product B', 3)];
    const r = assembleBreakdown({ ...base, rows, baseTotal: 8, nonEmptyTotal: 8 });
    expect(r.total).toBe(8);
    expect(r.breakdown).toHaveLength(2);
  });

  it('broken lookup reference (orphan) → excluded from rows AND total', () => {
    // is_not_empty counts the orphan's records (id is non-null); they're subtracted.
    const rows = [valid('a', 'Account A', 3), orphan('deleted-guid', 2), empty(1)];
    const r = assembleBreakdown({ ...base, rows, baseTotal: 6, nonEmptyTotal: 5 });
    expect(r.total).toBe(3);                       // 5 non-empty − 2 orphan
    expect(r.breakdown.map((b) => b.label)).toEqual(['Account A']);
  });

  it('orphan is NOT subtracted for non-additive measures (avg)', () => {
    const rows = [valid('a', 'A', 30), orphan('x', 99)];
    const r = assembleBreakdown({ ...base, additive: false, rows, baseTotal: 40, nonEmptyTotal: 35 });
    expect(r.total).toBe(35);                       // headline kept; only rows drop the orphan
    expect(r.breakdown.map((b) => b.label)).toEqual(['A']);
  });

  it('valid rows are clickable (selectable) for cross-filtering', () => {
    const rows = [valid('agri', 'Agriculture', 2), empty(4)];
    const r = assembleBreakdown({ ...base, rows, baseTotal: 6, nonEmptyTotal: 2 });
    expect(r.breakdown[0]).toMatchObject({ raw: 'agri', selectable: true });
  });

  it('percentages derive from the valid total (rows sum to 100%)', () => {
    const rows = [valid('a', 'A', 3), valid('b', 'B', 3), empty(2)];
    const { total, breakdown } = assembleBreakdown({ ...base, rows, baseTotal: 8, nonEmptyTotal: 6 });
    const pct = breakdown.map((b) => (b.value / total) * 100);
    expect(pct).toEqual([50, 50]);
    expect(pct.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('whitelist keeps only the listed resolved labels', () => {
    const rows = [valid('a', 'A', 3), valid('b', 'B', 3)];
    const r = assembleBreakdown({ ...base, rows, baseTotal: 6, nonEmptyTotal: 6, breakdownValues: ['A'] });
    expect(r.breakdown.map((b) => b.label)).toEqual(['A']);
  });
});

describe('assembleBreakdown — showEmptyValues = true', () => {
  it('counts and shows the unassigned group (Industry: total back to 8)', () => {
    const rows = [valid('agri', 'Agriculture', 2), valid('edu', 'Education', 1), valid('auto', 'Automotive', 1), empty(4)];
    const r = assembleBreakdown({ ...base, showEmptyValues: true, rows, baseTotal: 8, nonEmptyTotal: 4 });
    expect(r.total).toBe(8);
    expect(r.breakdown.map((b) => b.label)).toEqual(['Agriculture', 'Education', 'Automotive', '—']);
  });

  it('all-null lookup shows the single "—" row totalling the base count', () => {
    const r = assembleBreakdown({ ...base, showEmptyValues: true, rows: [empty(8)], baseTotal: 8, nonEmptyTotal: 0 });
    expect(r.total).toBe(8);
    expect(r.breakdown).toEqual([{ id: '__empty__', label: '—', value: 8, raw: null, selectable: false }]);
  });

  it('shows orphan + unassigned rows (inert) and counts them in the base total', () => {
    const rows = [valid('a', 'Account A', 3), orphan('deleted-guid', 2), empty(1)];
    const r = assembleBreakdown({ ...base, showEmptyValues: true, rows, baseTotal: 6, nonEmptyTotal: 5 });
    expect(r.total).toBe(6);
    expect(r.breakdown.map((b) => b.label)).toEqual(['Account A', 'deleted-guid', '—']);
    expect(r.breakdown.every((b) => (b.label === 'Account A') === !!b.selectable)).toBe(true);
  });
});

describe('assembleBreakdown — OR base logic fallback', () => {
  it('falls back to the base total when the non-empty guard cannot be applied', () => {
    const rows = [valid('a', 'A', 3), empty(2)];
    const r = assembleBreakdown({ ...base, rows, baseTotal: 5, nonEmptyTotal: null });
    expect(r.total).toBe(5);                         // can't safely AND the guard under OR
    expect(r.breakdown.map((b) => b.label)).toEqual(['A']);
  });
});
