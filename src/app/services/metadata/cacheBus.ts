/**
 * Central metadata cache invalidation.
 *
 * After a new customization version is published, the Sales app must drop every
 * cached piece of metadata so the next reads rebuild from the fresh snapshot.
 * This module is the single place that knows about all of them — call
 * `invalidateAllMetadataCaches()` and every loader cache across the app is reset.
 */
import { clearDisplayCaches } from '../displayResolver';
import { invalidateProcessFlowCache } from '../processFlowEngine';
import { invalidateLifecycleCache, invalidateFormAccessCache } from '../lifecycleRuleEngine';
import { resetMetadataCaches as resetRecordServiceCaches } from '../recordService';
import { resetListMetadataCaches } from '../listService';
import { resetGridOptionSetCache } from '../gridResolver';
import { invalidateCurrencyCache } from '../currencyService';

export function invalidateAllMetadataCaches(): void {
  // Each guarded so one failure never blocks the rest.
  const ops: Array<() => void> = [
    clearDisplayCaches,
    () => invalidateProcessFlowCache(),
    invalidateLifecycleCache,
    invalidateFormAccessCache,
    resetRecordServiceCaches,
    resetListMetadataCaches,
    resetGridOptionSetCache,
    invalidateCurrencyCache,
  ];
  for (const op of ops) {
    try { op(); } catch { /* best-effort cache clear */ }
  }
}
