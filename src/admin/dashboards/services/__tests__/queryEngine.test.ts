import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The dashboard query RPCs are DEFENSIVE: a filter/relation that does not apply to
 * a card comes back as ok:true + no_relation (empty rows → "No data"), and only a
 * genuine backend fault comes back as ok:false (the only case the engine throws).
 * These lock that contract plus the "never send a blank-valued filter" rule, so a
 * Lead card filtered by Industry (no relation) can never red-flag the dashboard.
 */

// Controllable RPC mock: each call shifts the next queued response.
const rpc = vi.fn();
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  },
  isAuthError: () => false,
}));

import { runAggregate, runRecordQuery, clearQueryCache } from '../queryEngine';

beforeEach(() => {
  rpc.mockReset();
  clearQueryCache();
});

describe('runAggregate — defensive envelope', () => {
  it('Account filtered by Industry (direct relation) returns rows', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, rows: [{ k: 'Retail', v: 10 }], rowCount: 1 }, error: null });
    const res = await runAggregate({ entity: 'crm_account', groupBy: [{ field: 'industry_id', alias: 'k' }], aggregations: [{ field: '*', fn: 'count', alias: 'v' }] });
    expect(res.rows).toHaveLength(1);
    expect(res.rowCount).toBe(1);
  });

  it('Lead filtered by Industry with no relation → no_relation → empty, no throw', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, rows: [], rowCount: 0, no_relation: true, message: 'No relationship path' }, error: null });
    const res = await runAggregate({ entity: 'crm_lead', aggregations: [{ field: '*', fn: 'count', alias: 'v' }] });
    expect(res.rows).toEqual([]);
    expect(res.rowCount).toBe(0);
  });

  it('invalid groupBy column → safe empty (no_relation), not a throw', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, rows: [], rowCount: 0, no_relation: true }, error: null });
    const res = await runAggregate({ entity: 'crm_lead', groupBy: [{ field: 'industry_id', alias: 'k' }], aggregations: [{ field: '*', fn: 'count', alias: 'v' }] });
    expect(res.rows).toEqual([]);
  });

  it('a real backend fault (ok:false) throws with the message + code', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, rows: [], rowCount: 0, error: 'deadlock detected', code: '40P01' }, error: null });
    await expect(runAggregate({ entity: 'crm_lead', aggregations: [{ field: '*', fn: 'count', alias: 'v' }] }))
      .rejects.toThrow('deadlock detected');
  });

  it('a transport error (network/401) still throws', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('Failed to fetch') });
    await expect(runAggregate({ entity: 'crm_lead', aggregations: [{ field: '*', fn: 'count', alias: 'v' }] }))
      .rejects.toThrow('Failed to fetch');
  });

  it('no entity → empty result without calling the RPC', async () => {
    const res = await runAggregate({ entity: '' });
    expect(res).toEqual({ rows: [], rowCount: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('runAggregate — blank-filter sanitisation (spec §7)', () => {
  const sentConfig = () => (rpc.mock.calls[0][1] as { p_config: { filters?: unknown[]; semanticFilters?: unknown[] } }).p_config;

  it('drops a filter whose value is null/undefined/empty', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, rows: [], rowCount: 0 }, error: null });
    await runAggregate({
      entity: 'crm_lead',
      filters: [
        { field: 'status', op: 'eq', value: 'open' },
        { field: 'source_id', op: 'eq', value: null },
        { field: 'note', op: 'eq', value: '' },
        { field: 'owner', op: 'eq', value: undefined },
      ],
      aggregations: [{ field: '*', fn: 'count', alias: 'v' }],
    });
    expect(sentConfig().filters).toEqual([{ field: 'status', op: 'eq', value: 'open' }]);
  });

  it('keeps value-less ops (is_empty) and list ops (in) including empty lists', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, rows: [], rowCount: 0 }, error: null });
    await runAggregate({
      entity: 'crm_lead',
      filters: [
        { field: 'note', op: 'is_empty' },
        { field: 'stage', op: 'in', value: [] },
        { field: 'stage', op: 'in', value: ['a', 'b'] },
      ],
      aggregations: [{ field: '*', fn: 'count', alias: 'v' }],
    });
    expect(sentConfig().filters).toHaveLength(3);
  });

  it('drops a semantic filter that has no usable leaf condition', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, rows: [], rowCount: 0 }, error: null });
    await runAggregate({
      entity: 'crm_lead',
      semanticFilters: [
        { path: { steps: [{ lookupFieldId: 'f1', direction: 'forward' }], targetFieldId: 't1' }, filters: [{ field: 'x', op: 'eq', value: null }] },
        { path: { steps: [{ lookupFieldId: 'f2', direction: 'forward' }], targetFieldId: 't2' }, filters: [{ field: 'x', op: 'eq', value: 'v' }] },
      ],
      aggregations: [{ field: '*', fn: 'count', alias: 'v' }],
    });
    expect(sentConfig().semanticFilters).toHaveLength(1);
  });
});

describe('runRecordQuery — defensive envelope', () => {
  it('no_relation → empty rows + total 0, no throw', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, rows: [], total: 0, no_relation: true }, error: null });
    const res = await runRecordQuery({ entity: 'crm_lead', columns: ['name'] });
    expect(res).toEqual({ rows: [], total: 0 });
  });

  it('ok:false throws', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, rows: [], total: 0, error: 'boom', code: 'XX000' }, error: null });
    await expect(runRecordQuery({ entity: 'crm_lead', columns: ['name'] })).rejects.toThrow('boom');
  });
});
