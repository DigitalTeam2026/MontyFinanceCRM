// Runtime interactive cross-filtering — the Power BI–style "click a value, every
// connected visual filters" engine. Sibling to useSlicerFilters (which handles
// date slicers). A visual emits a SelectionEmit on click; the store applies the
// modifier rules (plain / ctrl / shift) and exposes, per target visual:
//   • filtersFor(v)         — same-entity query filters
//   • semanticFiltersFor(v) — cross-entity filters via bidirectional relationship
//                             paths (forward + reverse + bridge), server EXISTS (§5)
//   • highlightFor(v)       — raw values to emphasise (selected) / dim (rest)
// Selections are temporary and session-scoped (cleared on unmount); they persist
// across page switches because the store lives above the page in the viewer.

import { useState, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
import type {
  DashboardVisual, VisualFilter, SemanticQueryFilter, InteractionMode,
} from '../types/dashboard';
import { resolveCrossSemanticPath, type CrossSemanticPath } from './semanticMapping';

export interface RawValue { raw: unknown; label: string }

export interface SelectionEmit {
  sourceVisualId: string;
  entity: string;             // source visual's entity (query_config.entity)
  fieldId: string;            // physical column the value belongs to
  value: RawValue;
  modifiers: { ctrl: boolean; shift: boolean; meta: boolean };
  /** Full ordered value list of the source visual — enables shift-range selection. */
  ordered?: RawValue[];
}

export interface Selection {
  /** Stable key — one selection per (source visual, field). */
  semanticFilterId: string;
  entity: string;
  fieldId: string;
  op: 'in' | 'not_in';
  values: RawValue[];
  sourceVisualId: string;
}

// Stable selection key — one selection per (source visual, entity, field). Entity
// is part of the key so a multi-entity source (e.g. a funnel-stage card whose
// stages break down the SAME physical column on DIFFERENT entities) never collides.
const selId = (sourceVisualId: string, entity: string, fieldId: string) => `${sourceVisualId}:${entity}:${fieldId}`;
const rawKey = (v: unknown) => String(v);

/** The physical field a visual displays / emits when clicked. */
export function primaryFieldOf(v: DashboardVisual): string | undefined {
  if (v.visual_type === 'kpi') return v.data_config.breakdownField;
  if (v.visual_type === 'table' || v.visual_type === 'record_list') return v.query_config.columns?.[0];
  return v.query_config.groupBy?.[0]?.field;
}

/** Interaction mode from source→target — explicit override else type default. */
export function interactionMode(source: DashboardVisual | undefined, targetId: string): InteractionMode {
  const explicit = source?.interaction_config?.targets?.[targetId];
  if (explicit) return explicit;
  if (source?.visual_type === 'button') return 'none';
  return 'filter';
}

// ── modifier reducer (spec §1/§2/§3) ────────────────────────────────────────────
function reduceSelections(prev: Selection[], emit: SelectionEmit): Selection[] {
  const id = selId(emit.sourceVisualId, emit.entity, emit.fieldId);
  const existing = prev.find((s) => s.semanticFilterId === id);

  // Plain click → toggle. Clicking the value that is already the sole active
  // selection clears everything (restores the unfiltered dashboard); any other
  // plain click collapses all temporary selections down to just this value.
  if (!emit.modifiers.ctrl && !emit.modifiers.meta && !emit.modifiers.shift) {
    const isSoleSelection =
      prev.length === 1 &&
      !!existing &&
      existing.values.length === 1 &&
      rawKey(existing.values[0].raw) === rawKey(emit.value.raw);
    if (isSoleSelection) return [];                          // second click → unselect + drop filter
    return [{ semanticFilterId: id, entity: emit.entity, fieldId: emit.fieldId, op: 'in', sourceVisualId: emit.sourceVisualId, values: [emit.value] }];
  }

  // Shift click → contiguous range within the source's ordered values.
  if (emit.modifiers.shift && emit.ordered?.length) {
    const order = emit.ordered;
    const idxOf = (raw: unknown) => order.findIndex((o) => rawKey(o.raw) === rawKey(raw));
    const curIdx = idxOf(emit.value.raw);
    const anchorRaw = existing?.values[existing.values.length - 1]?.raw;
    const anchorIdx = anchorRaw != null ? idxOf(anchorRaw) : curIdx;
    if (curIdx < 0) return prev;
    const [lo, hi] = anchorIdx <= curIdx ? [anchorIdx, curIdx] : [curIdx, anchorIdx];
    const range = order.slice(lo, hi + 1);
    const next: Selection = { semanticFilterId: id, entity: emit.entity, fieldId: emit.fieldId, op: 'in', sourceVisualId: emit.sourceVisualId, values: range };
    return existing ? prev.map((s) => (s.semanticFilterId === id ? next : s)) : [...prev, next];
  }

  // Ctrl/Cmd click → toggle this value within its field; other fields untouched.
  if (existing) {
    const has = existing.values.some((v) => rawKey(v.raw) === rawKey(emit.value.raw));
    const values = has
      ? existing.values.filter((v) => rawKey(v.raw) !== rawKey(emit.value.raw))
      : [...existing.values, emit.value];
    if (!values.length) return prev.filter((s) => s.semanticFilterId !== id);   // last value removed → drop
    return prev.map((s) => (s.semanticFilterId === id ? { ...s, values } : s));
  }
  return [...prev, { semanticFilterId: id, entity: emit.entity, fieldId: emit.fieldId, op: 'in', sourceVisualId: emit.sourceVisualId, values: [emit.value] }];
}

function toFilter(sel: Selection): VisualFilter {
  const raws = sel.values.map((v) => v.raw);
  return raws.length === 1
    ? { field: sel.fieldId, op: 'eq', value: raws[0] }
    : { field: sel.fieldId, op: 'in', value: raws };
}

export interface CrossFilterApi {
  selections: Selection[];
  hasSelections: boolean;
  apply: (emit: SelectionEmit) => void;
  filtersFor: (visual: DashboardVisual) => VisualFilter[];
  /**
   * Cross-entity cross-filters resolved through the bidirectional relationship
   * graph (forward + reverse + bridge), emitted as server-side semantic-filter
   * paths. Replaces the legacy forward-only `relatedFiltersFor`.
   */
  semanticFiltersFor: (visual: DashboardVisual) => SemanticQueryFilter[];
  /**
   * Same-entity + cross-entity cross-filters for an ARBITRARY entity. Multi-entity
   * visuals (the funnel stage card) call this per stage; `asVisualId` is the host
   * visual id so its own selections are excluded (source highlights, never filters
   * itself). Single-entity visuals use filtersFor / semanticFiltersFor instead.
   */
  crossFilterForEntity: (entity: string, asVisualId: string) => { filters: VisualFilter[]; semanticFilters: SemanticQueryFilter[] };
  highlightFor: (visual: DashboardVisual) => Set<string>;
  /** Selected raw values for an explicit (entity, field) pair — used by multi-field
   *  visuals (e.g. funnel stage cards) whose stages each break down a different field. */
  highlightForField: (entity: string, fieldId: string | undefined, asVisualId: string) => Set<string>;
  removeValue: (semanticFilterId: string, raw: unknown) => void;
  clearVisual: (visualId: string) => void;
  clearAll: () => void;
}

export function useCrossFilter(visuals: DashboardVisual[]): CrossFilterApi {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const pathCache = useRef(new Map<string, CrossSemanticPath | null>());   // `src|tgt|field` → path | null(=not affected)
  const visualsRef = useRef(visuals);
  visualsRef.current = visuals;

  const sourceById = useMemo(
    () => new Map(visuals.map((v) => [v.dashboard_visual_id, v])),
    [visuals],
  );

  const apply = useCallback((emit: SelectionEmit) => {
    if (import.meta.env?.DEV) {
      console.debug('[DashboardFilter] Widget clicked', { source: emit.sourceVisualId, entity: emit.entity, field: emit.fieldId, value: emit.value.raw });
    }
    setSelections((prev) => reduceSelections(prev, emit));
  }, []);

  // Resolve cross-entity relationship paths needed by the active selections,
  // through the bidirectional graph (forward + reverse + bridge). A null result
  // is cached too, so an unreachable target is asked about only once.
  useEffect(() => {
    let alive = true;
    (async () => {
      // Every entity any visual renders — INCLUDING funnel-stage entities, whose
      // card-level query_config.entity is null. Without enumerating these, a
      // multi-entity card (the funnel) could never resolve a cross-entity path for
      // its individual stages and would stay disconnected from the engine.
      const targets = new Set<string>();
      for (const v of visualsRef.current) {
        if (v.query_config.entity) targets.add(v.query_config.entity);
        if (v.visual_type === 'funnel_stage') {
          for (const s of v.data_config?.stages ?? []) if (s.entity) targets.add(s.entity);
        }
      }
      let changed = false;
      for (const sel of selections) {
        for (const tgt of targets) {
          if (tgt === sel.entity) continue;                    // same entity → handled synchronously
          const k = `${sel.entity}|${tgt}|${sel.fieldId}`;
          if (pathCache.current.has(k)) continue;
          pathCache.current.set(k, null);                      // mark resolving (avoid duplicate work)
          try { pathCache.current.set(k, await resolveCrossSemanticPath(sel.entity, tgt, sel.fieldId)); }
          catch { pathCache.current.set(k, null); }
          changed = true;
        }
      }
      if (alive && changed) force();
    })();
    return () => { alive = false; };
  }, [selections]);

  // Same-entity direct filters for an ARBITRARY target entity. `asVisualId`
  // excludes the calling visual's own selections (a source highlights, never
  // self-filters). Parameterising by entity (not visual.query_config.entity) lets
  // a multi-entity card — the funnel — resolve filters per stage.
  const filtersForEntity = useCallback((entity: string, asVisualId: string): VisualFilter[] => {
    const out: VisualFilter[] = [];
    if (!entity) return out;
    for (const sel of selections) {
      if (sel.sourceVisualId === asVisualId) continue;
      if (sel.entity !== entity) continue;                                // cross-entity → semanticFiltersForEntity
      if (interactionMode(sourceById.get(sel.sourceVisualId), asVisualId) !== 'filter') continue;
      out.push(toFilter(sel));
    }
    return out;
  }, [selections, sourceById]);

  // Cross-entity filters for an arbitrary target entity, as server-side semantic
  // paths (forward + reverse + bridge). Null/pending path → target not affected.
  const semanticFiltersForEntity = useCallback((entity: string, asVisualId: string): SemanticQueryFilter[] => {
    const out: SemanticQueryFilter[] = [];
    if (!entity) return out;
    for (const sel of selections) {
      if (sel.sourceVisualId === asVisualId) continue;
      if (sel.entity === entity) continue;                                // same entity → filtersForEntity
      if (interactionMode(sourceById.get(sel.sourceVisualId), asVisualId) !== 'filter') continue;
      const path = pathCache.current.get(`${sel.entity}|${entity}|${sel.fieldId}`);
      if (!path || !path.steps.length) continue;                          // null/pending → not affected
      // Leaf condition is entity-agnostic (server compares path.targetFieldId);
      // `field` is set for type-correctness only and ignored server-side.
      out.push({ path: { steps: path.steps, targetFieldId: path.targetFieldId }, filters: [toFilter(sel)] });
    }
    return out;
  }, [selections, sourceById]);

  const filtersFor = useCallback((visual: DashboardVisual): VisualFilter[] =>
    filtersForEntity(visual.query_config.entity ?? '', visual.dashboard_visual_id),
  [filtersForEntity]);

  const semanticFiltersFor = useCallback((visual: DashboardVisual): SemanticQueryFilter[] =>
    semanticFiltersForEntity(visual.query_config.entity ?? '', visual.dashboard_visual_id),
  [semanticFiltersForEntity]);

  // Combined per-entity resolver for multi-entity visuals (the funnel stage card
  // resolves both buckets for each stage's own entity).
  const crossFilterForEntity = useCallback((entity: string, asVisualId: string) => ({
    filters: filtersForEntity(entity, asVisualId),
    semanticFilters: semanticFiltersForEntity(entity, asVisualId),
  }), [filtersForEntity, semanticFiltersForEntity]);

  const highlightForField = useCallback((entity: string, fieldId: string | undefined, asVisualId: string): Set<string> => {
    const set = new Set<string>();
    if (!fieldId) return set;
    for (const sel of selections) {
      if (sel.entity !== entity || sel.fieldId !== fieldId) continue;
      const isSource = sel.sourceVisualId === asVisualId;
      const mode = interactionMode(sourceById.get(sel.sourceVisualId), asVisualId);
      if (isSource || mode === 'filter' || mode === 'highlight') sel.values.forEach((v) => set.add(rawKey(v.raw)));
    }
    return set;
  }, [selections, sourceById]);

  const highlightFor = useCallback((visual: DashboardVisual): Set<string> =>
    highlightForField(visual.query_config.entity ?? '', primaryFieldOf(visual), visual.dashboard_visual_id),
  [highlightForField]);

  const removeValue = useCallback((id: string, raw: unknown) => {
    setSelections((prev) => prev.flatMap((s) => {
      if (s.semanticFilterId !== id) return [s];
      const values = s.values.filter((v) => rawKey(v.raw) !== rawKey(raw));
      return values.length ? [{ ...s, values }] : [];
    }));
  }, []);

  const clearVisual = useCallback((visualId: string) => {
    setSelections((prev) => prev.filter((s) => s.sourceVisualId !== visualId));
  }, []);

  const clearAll = useCallback(() => setSelections([]), []);

  return {
    selections, hasSelections: selections.length > 0, apply,
    filtersFor, semanticFiltersFor, crossFilterForEntity, highlightFor, highlightForField, removeValue, clearVisual, clearAll,
  };
}
