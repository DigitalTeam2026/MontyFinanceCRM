import { useCallback, useEffect, useState } from 'react';
import { getPendingSummary, type PendingSummary } from './publicationService';

/**
 * Poll the pending (unpublished) change summary so the header badge and the
 * publish dialog stay current as admins save drafts across modules.
 */
export function usePendingChanges(pollMs = 20_000): {
  summary: PendingSummary | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [summary, setSummary] = useState<PendingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await getPendingSummary();
      setSummary(s);
    } catch {
      // Table may not exist yet (migration not applied) — treat as no pending.
      setSummary({ total: 0, byComponent: {}, groups: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, pollMs);
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, pollMs]);

  return { summary, loading, refresh };
}
