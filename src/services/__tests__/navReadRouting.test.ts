import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Verifies the snapshot read-routing contract for a representative Sales loader:
 * - when the published snapshot is hydrated, it reads from the snapshot
 * - when it is NOT hydrated, it falls back to the live Supabase query
 * This is the correctness keystone — drafts must never leak to Sales.
 */

// A controllable fake of the in-memory snapshot store.
let fakeTables: Record<string, unknown[]> | null = null;
vi.mock('../../app/services/metadata/metadataStore', () => ({
  getTable: (t: string) => (fakeTables === null ? null : (fakeTables[t] ?? [])),
}));

// A fake Supabase that records whether the live query was used.
const liveCalls: string[] = [];
vi.mock('../../lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const rows =
      table === 'nav_area' ? [{ nav_area_id: 'LIVE-area', sort_order: 0, deleted_at: null }] :
      table === 'nav_group' ? [{ nav_group_id: 'LIVE-group', sort_order: 0 }] :
      [{ nav_item_id: 'LIVE-item', sort_order: 0 }];
    const builder: Record<string, unknown> = {
      select: () => builder,
      is: () => builder,
      eq: () => builder,
      order: () => Promise.resolve({ data: rows, error: null }),
    };
    return builder;
  };
  return {
    supabase: {
      from: (table: string) => { liveCalls.push(table); return makeBuilder(table); },
    },
  };
});

import { fetchFullNavTree } from '../navigationService';

beforeEach(() => {
  fakeTables = null;
  liveCalls.length = 0;
});

describe('navigationService.fetchFullNavTree read-routing', () => {
  it('reads from the published snapshot when hydrated (no live query)', async () => {
    fakeTables = {
      nav_area: [{ nav_area_id: 'SNAP-area', sort_order: 1, deleted_at: null }],
      nav_group: [{ nav_group_id: 'SNAP-group', sort_order: 1 }],
      nav_item: [{ nav_item_id: 'SNAP-item', sort_order: 1 }],
    };
    const tree = await fetchFullNavTree();
    expect(tree.areas[0].nav_area_id).toBe('SNAP-area');
    expect(tree.items[0].nav_item_id).toBe('SNAP-item');
    expect(liveCalls).toHaveLength(0); // never touched live tables
  });

  it('hides snapshot rows that are soft-deleted', async () => {
    fakeTables = {
      nav_area: [
        { nav_area_id: 'a-live', sort_order: 1, deleted_at: null },
        { nav_area_id: 'a-deleted', sort_order: 2, deleted_at: '2026-01-01' },
      ],
      nav_group: [],
      nav_item: [],
    };
    const tree = await fetchFullNavTree();
    expect(tree.areas.map((a) => a.nav_area_id)).toEqual(['a-live']);
  });

  it('falls back to the live query when no snapshot is hydrated (Admin Studio / pre-publish)', async () => {
    fakeTables = null;
    const tree = await fetchFullNavTree();
    expect(tree.areas[0].nav_area_id).toBe('LIVE-area');
    expect(liveCalls).toContain('nav_area');
  });
});
