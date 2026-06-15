import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  refreshPublishedSnapshot,
  fetchLatestPublishedVersion,
} from '../services/metadata/snapshotService';
import { getSnapshotVersion } from '../services/metadata/metadataStore';

interface PublishedMetadataValue {
  /** Loaded published customization version (null before first load). */
  version: number | null;
  /** Increments every time the snapshot is (re)hydrated — use as a render key. */
  epoch: number;
  /** Force a re-check now (used after a poll/realtime signal). */
  checkForUpdates: () => Promise<void>;
}

const PublishedMetadataContext = createContext<PublishedMetadataValue>({
  version: null,
  epoch: 0,
  checkForUpdates: async () => {},
});

export function usePublishedMetadata(): PublishedMetadataValue {
  return useContext(PublishedMetadataContext);
}

const POLL_INTERVAL_MS = 60_000;

/**
 * Loads the published customization snapshot for the Sales app and keeps it
 * fresh. On a new publication it re-hydrates the in-memory snapshot, clears all
 * metadata caches, and bumps `epoch` so consumers re-render with the new
 * config — no logout, hard refresh, or manual cache clear required.
 */
export function PublishedMetadataProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState<number | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [ready, setReady] = useState(false);
  const refreshing = useRef(false);
  const onNewVersion = useRef<((v: number) => void) | null>(null);

  const applyRefresh = useCallback(async (force = false) => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const prev = getSnapshotVersion();
      const v = await refreshPublishedSnapshot(force);
      setVersion(v);
      if (v !== null && v !== prev) {
        setEpoch((e) => e + 1);
        if (prev !== null) onNewVersion.current?.(v); // skip the very first load
      }
    } finally {
      refreshing.current = false;
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    const latest = await fetchLatestPublishedVersion();
    if (latest !== null && latest !== getSnapshotVersion()) {
      await applyRefresh(true);
    }
  }, [applyRefresh]);

  // Initial load — block first paint so loaders read the snapshot, not drafts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await applyRefresh(true);
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [applyRefresh]);

  // Realtime: a new publication arrives -> refresh immediately.
  useEffect(() => {
    const channel = supabase
      .channel('customization-publications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'customization_publication' },
        () => { void checkForUpdates(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [checkForUpdates]);

  // Fallback: poll on interval + when the tab regains focus.
  useEffect(() => {
    const id = window.setInterval(() => { void checkForUpdates(); }, POLL_INTERVAL_MS);
    const onFocus = () => { void checkForUpdates(); };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [checkForUpdates]);

  // Let a toast be shown by whoever wires it (optional).
  useEffect(() => {
    onNewVersion.current = (v: number) => {
      window.dispatchEvent(new CustomEvent('customizations-published', { detail: { version: v } }));
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--app-bg)' }}>
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <PublishedMetadataContext.Provider value={{ version, epoch, checkForUpdates }}>
      {children}
    </PublishedMetadataContext.Provider>
  );
}
