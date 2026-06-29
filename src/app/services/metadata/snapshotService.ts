/**
 * Sales-side loader for the published customization snapshot.
 *
 * Reads the latest row from `published_metadata_snapshot` (and the version
 * registry) created by the publish migration's RPCs. Hydrates the in-memory
 * metadataStore that every metadata loader reads from.
 */
import { supabase } from '../../../lib/supabase';
import { hydrateSnapshot, clearSnapshot, getSnapshotVersion } from './metadataStore';
import { invalidateAllMetadataCaches } from './cacheBus';

export interface LatestSnapshot {
  version: number;
  snapshot: Record<string, unknown[]>;
}

// Per-tab cache of the last published snapshot. Lets a reload paint instantly
// from the previously-fetched config instead of blocking on a fresh full
// download; the provider revalidates the version in the background and only
// re-downloads when an admin has published a newer version.
const SNAPSHOT_CACHE_KEY = 'mf.published_snapshot.v1';

function readSnapshotCache(): LatestSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LatestSnapshot;
    if (typeof parsed?.version !== 'number' || !parsed.snapshot) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshotCache(snap: LatestSnapshot): void {
  try {
    sessionStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snap));
  } catch {
    // Storage full or unavailable (private mode) — caching is best-effort.
  }
}

/**
 * Synchronously hydrate the in-memory store from the per-tab cache, if present.
 * Returns the cached version (so the app can paint immediately) or null when no
 * cache exists and a blocking fetch is required.
 */
export function hydrateFromCache(): number | null {
  const cached = readSnapshotCache();
  if (!cached) return null;
  hydrateSnapshot(cached.snapshot, cached.version);
  return cached.version;
}

/** Fetch the latest published snapshot, or null if none exists yet. */
export async function fetchLatestPublishedSnapshot(): Promise<LatestSnapshot | null> {
  const { data, error } = await supabase
    .from('published_metadata_snapshot')
    .select('customization_version, snapshot')
    .order('customization_version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    version: data.customization_version as number,
    snapshot: (data.snapshot ?? {}) as Record<string, unknown[]>,
  };
}

/** Fetch just the latest published version number (cheap version-poll). */
export async function fetchLatestPublishedVersion(): Promise<number | null> {
  const { data, error } = await supabase
    .from('customization_publication')
    .select('customization_version')
    .eq('publication_status', 'published')
    .order('customization_version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    // 'rolled_back' publications are also live configs; fall back to any max.
    const { data: any2 } = await supabase
      .from('customization_publication')
      .select('customization_version')
      .order('customization_version', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (any2?.customization_version as number | undefined) ?? null;
  }
  return data.customization_version as number;
}

/**
 * Load (or reload) the published snapshot into the store and clear all stale
 * metadata caches. Returns the loaded version (or null if nothing published).
 * Safe to call repeatedly; only does work when the version actually changed.
 */
export async function refreshPublishedSnapshot(force = false): Promise<number | null> {
  const latest = await fetchLatestPublishedSnapshot();
  if (!latest) {
    // Nothing published yet → loaders fall back to live tables.
    clearSnapshot();
    return null;
  }
  if (!force && getSnapshotVersion() === latest.version) return latest.version;

  hydrateSnapshot(latest.snapshot, latest.version);
  writeSnapshotCache(latest);
  invalidateAllMetadataCaches();
  return latest.version;
}

export { clearSnapshot };
