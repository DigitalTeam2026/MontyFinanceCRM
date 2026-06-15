import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable fake supabase.
const rpcImpl: { fn: () => { data: unknown; error: { message: string } | null } } = {
  fn: () => ({ data: null, error: null }),
};
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve(rpcImpl.fn()),
    from: () => ({
      select: () => ({
        order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { customization_version: 7 }, error: null }) }) }),
        is: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

import { publishAll, getLatestVersion, PublishError } from '../publicationService';

beforeEach(() => {
  rpcImpl.fn = () => ({ data: { version: 8, change_count: 3, component_summary: {}, previous_version: 7, warnings: [] }, error: null });
});

describe('publicationService.publishAll error mapping', () => {
  it('returns the result on success', async () => {
    const res = await publishAll(7);
    expect(res.version).toBe(8);
    expect(res.change_count).toBe(3);
  });

  it('maps version_conflict to a typed PublishError', async () => {
    rpcImpl.fn = () => ({ data: null, error: { message: 'version_conflict: latest is 9 but caller based on 7' } });
    await expect(publishAll(7)).rejects.toMatchObject({ kind: 'version_conflict' });
  });

  it('maps not_authorized (42501) to a typed PublishError', async () => {
    rpcImpl.fn = () => ({ data: null, error: { message: 'not_authorized: publish_customizations privilege required (42501)' } });
    await expect(publishAll(7)).rejects.toMatchObject({ kind: 'not_authorized' });
  });

  it('maps validation_failed and parses the issues JSON', async () => {
    const issues = [{ component_type: 'forms', message: 'bad field', severity: 'error' }];
    rpcImpl.fn = () => ({ data: null, error: { message: `validation_failed: ${JSON.stringify(issues)}` } });
    try {
      await publishAll(7);
      throw new Error('should have thrown');
    } catch (e) {
      const pe = e as PublishError;
      expect(pe.kind).toBe('validation_failed');
      expect(pe.issues?.[0].component_type).toBe('forms');
    }
  });

  it('getLatestVersion reads the max published version', async () => {
    expect(await getLatestVersion()).toBe(7);
  });
});
