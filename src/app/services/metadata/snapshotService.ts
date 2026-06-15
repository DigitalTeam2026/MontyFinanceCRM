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
  invalidateAllMetadataCaches();
  return latest.version;
}

export { clearSnapshot };
