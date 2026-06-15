import { describe, it, expect, beforeEach } from 'vitest';
import {
  hydrateSnapshot,
  clearSnapshot,
  isSnapshotHydrated,
  getSnapshotVersion,
  getTable,
} from '../metadataStore';

describe('metadataStore (snapshot read-routing keystone)', () => {
  beforeEach(() => clearSnapshot());

  it('returns null for every table when not hydrated (caller falls back to live)', () => {
    expect(isSnapshotHydrated()).toBe(false);
    expect(getTable('form_definition')).toBeNull();
    expect(getSnapshotVersion()).toBeNull();
  });

  it('returns rows once hydrated', () => {
    hydrateSnapshot({ form_definition: [{ form_id: 'f1' }] }, 5);
    expect(isSnapshotHydrated()).toBe(true);
    expect(getSnapshotVersion()).toBe(5);
    expect(getTable('form_definition')).toEqual([{ form_id: 'f1' }]);
  });

  it('returns an EMPTY array (not null) for a hydrated-but-absent table, so the caller does NOT leak drafts via live fallback', () => {
    hydrateSnapshot({ form_definition: [{ form_id: 'f1' }] }, 5);
    expect(getTable('view_column')).toEqual([]);
    expect(getTable('view_column')).not.toBeNull();
  });

  it('clearSnapshot reverts to live-fallback mode', () => {
    hydrateSnapshot({ nav_item: [{ nav_item_id: 'n1' }] }, 2);
    clearSnapshot();
    expect(isSnapshotHydrated()).toBe(false);
    expect(getTable('nav_item')).toBeNull();
  });
});
