// Runtime cross-filter plumbing for date slicers (and future slicers). A slicer
// broadcasts a SlicerEmit; every other visual asks `filtersFor(visual)` for the
// merged runtime filters that apply to it. Scope decides reach (dashboard / page
// / selected); the entity must match so the date column actually exists on the
// target's table (the query engine would otherwise raise "column not found").

import { useState, useCallback } from 'react';
import type { DashboardVisual, VisualFilter, ApplyFilterTo } from '../types/dashboard';

export interface SlicerEmit {
  visualId: string;
  pageId: string;
  entity: string;            // slicer's entity — filters only apply to same-entity visuals
  filters: VisualFilter[];   // [] = cleared / inactive
  scope: ApplyFilterTo;
  targets: string[];         // target visual ids when scope === 'selected'
}

/** Construct the emit for a slicer visual from its current filters. */
export function buildSlicerEmit(visual: DashboardVisual, filters: VisualFilter[]): SlicerEmit {
  const ds = visual.data_config.dateSlicer ?? {};
  const scope = (ds.filterScope ?? ds.applyTo ?? 'dashboard') as ApplyFilterTo;
  return {
    visualId: visual.dashboard_visual_id,
    pageId: visual.dashboard_page_id,
    entity: visual.query_config.entity ?? '',
    filters,
    scope,
    targets: ds.connectedVisuals ?? [],
  };
}

export function useSlicerFilters() {
  const [emits, setEmits] = useState<Record<string, SlicerEmit>>({});

  const setEmit = useCallback((e: SlicerEmit) => {
    setEmits((prev) => {
      // Skip no-op updates so we don't thrash dependent queries.
      const cur = prev[e.visualId];
      if (cur && JSON.stringify(cur) === JSON.stringify(e)) return prev;
      return { ...prev, [e.visualId]: e };
    });
  }, []);

  const filtersFor = useCallback((visual: DashboardVisual): VisualFilter[] => {
    const out: VisualFilter[] = [];
    for (const e of Object.values(emits)) {
      if (!e.filters.length) continue;
      if (e.visualId === visual.dashboard_visual_id) continue;          // never filter the slicer itself
      if (e.scope === 'page' && e.pageId !== visual.dashboard_page_id) continue;
      if (e.scope === 'selected' && !e.targets.includes(visual.dashboard_visual_id)) continue;
      // The date column lives on the slicer's entity; only apply to matching entities.
      if (e.entity && visual.query_config.entity && e.entity !== visual.query_config.entity) continue;
      out.push(...e.filters);
    }
    return out;
  }, [emits]);

  return { filtersFor, setEmit };
}
