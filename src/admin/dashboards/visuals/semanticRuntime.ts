// Runtime distribution for GLOBAL semantic filters. A slicer broadcasts a
// semantic selection (entity-agnostic leaf conditions, e.g. a date gte/lte
// range, keyed by semantic filter id). Every visual then asks resolveForVisual()
// for how that selection applies to ITS base entity:
//   • direct mapping → a plain VisualFilter on the visual's own physical column,
//   • path mapping   → a SemanticQueryFilter (lookup-field ids) the query engine
//                      resolves server-side into a nested EXISTS,
//   • no mapping      → the visual is "not affected" (left unchanged; surfaced in
//                      the designer so a filter never silently mis-targets).
// One selection → many entity-specific translations. No mega-join: each visual
// keeps its own independent, RLS-scoped query.

import { useState, useEffect, useCallback } from 'react';
import type {
  DashboardDefinition, DashboardVisual, VisualFilter, SemanticQueryFilter,
  RelationshipPath, DashboardFilterMapping,
} from '../types/dashboard';
import { fetchEntitiesCached, fetchFieldsCached } from '../services/relationshipService';

interface Selection {
  filters: VisualFilter[];
  pageId: string;
  /**
   * Runtime entity narrowing (timeline_card "Entities" chips). When set to a
   * non-empty list of entity_definition_ids, the selection only filters visuals
   * whose base entity is in the list. null / undefined / [] = apply to every
   * mapped entity (no narrowing).
   */
  entityIds?: string[] | null;
}

export interface ResolvedSemantics {
  runtimeFilters: VisualFilter[];        // merge into runtimeFilters
  semanticFilters: SemanticQueryFilter[]; // merge into query_config.semanticFilters
  affectedBy: string[];                  // semantic filter ids that filter this visual
  notAffectedBy: string[];               // active semantic filter ids with no mapping
}

const EMPTY: ResolvedSemantics = { runtimeFilters: [], semanticFilters: [], affectedBy: [], notAffectedBy: [] };

const hasSteps = (p: unknown): p is RelationshipPath =>
  !!p && Array.isArray((p as RelationshipPath).steps) && (p as RelationshipPath).steps.length > 0
  && !!(p as RelationshipPath).targetFieldId;

/** Active mappings for one semantic filter (priority-sorted, highest first). */
export function activeMappingsFor(
  def: DashboardDefinition | null, semanticFilterId: string | undefined,
): DashboardFilterMapping[] {
  if (!def || !semanticFilterId) return [];
  return (def.filterMappings ?? [])
    .filter((m) => m.semantic_filter_id === semanticFilterId && m.is_active)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Resolve the bounds source for a date semantic filter — the (entity, physical
 * date column) a slicer queries MIN/MAX against to render its timeline domain.
 * Spec §4 default = "primary mapping only": the highest-priority active DIRECT
 * (no relationship path) mapping. `config.boundsMappingId` pins a specific
 * mapping. Path-only mappings yield no bounds (slider hidden; presets/inputs
 * still work). Returns physical names resolved from field/entity metadata.
 */
export async function resolveDateBoundsSource(
  def: DashboardDefinition | null, semanticFilterId: string | undefined,
): Promise<{ entity: string; field: string } | null> {
  if (!def || !semanticFilterId) return null;
  const sf = def.semanticFilters?.find((s) => s.dashboard_semantic_filter_id === semanticFilterId);
  const pinned = sf?.config?.boundsMappingId as string | undefined;
  const direct = activeMappingsFor(def, semanticFilterId)
    .filter((m) => m.target_entity_id && m.target_field_id && !hasSteps(m.relationship_path));
  const mapping = (pinned && direct.find((m) => m.dashboard_filter_mapping_id === pinned)) || direct[0];
  if (!mapping) return null;
  try {
    const ents = await fetchEntitiesCached();
    const ent = ents.find((e) => e.entity_definition_id === mapping.target_entity_id);
    if (!ent) return null;
    const fields = await fetchFieldsCached(mapping.target_entity_id as string);
    const f = fields.find((x) => x.field_definition_id === mapping.target_field_id);
    if (!f) return null;
    return { entity: ent.logical_name, field: f.physical_column_name };
  } catch {
    return null;
  }
}

/** The active mapping for a visual's entity (highest priority, active). */
export function mappingForEntity(
  def: DashboardDefinition | null, semanticFilterId: string, entityId: string | undefined,
): DashboardFilterMapping | undefined {
  if (!def || !entityId) return undefined;
  return (def.filterMappings ?? [])
    .filter((m) => m.semantic_filter_id === semanticFilterId && m.is_active && m.target_entity_id === entityId)
    .sort((a, b) => b.priority - a.priority)[0];
}

export function useDashboardSemanticFilters(def: DashboardDefinition | null) {
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [entityIdByName, setEntityIdByName] = useState<Record<string, string>>({});
  const [physById, setPhysById] = useState<Record<string, string>>({});

  // Entity name → id, and direct-mapping field id → physical column (for sync resolve).
  const mappingsKey = JSON.stringify((def?.filterMappings ?? []).map((m) => [m.target_entity_id, m.target_field_id, m.relationship_path]));
  useEffect(() => {
    let alive = true;
    (async () => {
      const ents = await fetchEntitiesCached();
      const idx: Record<string, string> = {};
      for (const e of ents) { idx[e.logical_name] = e.entity_definition_id; idx[e.physical_table_name] = e.entity_definition_id; }

      const mappings = def?.filterMappings ?? [];
      const directEntityIds = new Set(
        mappings.filter((m) => !hasSteps(m.relationship_path) && m.target_entity_id).map((m) => m.target_entity_id as string),
      );
      const directFieldIds = new Set(
        mappings.filter((m) => !hasSteps(m.relationship_path) && m.target_field_id).map((m) => m.target_field_id as string),
      );
      const phys: Record<string, string> = {};
      for (const eid of directEntityIds) {
        try {
          const fields = await fetchFieldsCached(eid);
          for (const f of fields) if (directFieldIds.has(f.field_definition_id)) phys[f.field_definition_id] = f.physical_column_name;
        } catch { /* entity fields unavailable → mapping resolves as not-affected */ }
      }
      if (alive) { setEntityIdByName(idx); setPhysById(phys); }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def?.dashboard?.dashboard_id, mappingsKey]);

  /** A slicer broadcasts (or clears) the selection for one semantic filter. */
  const setSelection = useCallback((
    semanticFilterId: string, filters: VisualFilter[], pageId: string, entityIds?: string[] | null,
  ) => {
    const norm = entityIds && entityIds.length ? entityIds : null;
    setSelections((prev) => {
      const cur = prev[semanticFilterId];
      if (!filters.length) {
        if (!cur) return prev;
        const { [semanticFilterId]: _drop, ...rest } = prev; void _drop;
        return rest;
      }
      if (cur && cur.pageId === pageId
        && JSON.stringify(cur.filters) === JSON.stringify(filters)
        && JSON.stringify(cur.entityIds ?? null) === JSON.stringify(norm)) return prev;
      return { ...prev, [semanticFilterId]: { filters, pageId, entityIds: norm } };
    });
  }, []);

  const clearAll = useCallback(() => setSelections({}), []);

  // `entityOverride` resolves the selection against an entity OTHER than the
  // visual's own query_config.entity — needed by multi-entity visuals (the
  // funnel_stage card has a null base entity but a distinct entity per stage),
  // so each stage can be filtered through its own mapped date column / path.
  const resolveForVisual = useCallback((visual: DashboardVisual, entityOverride?: string): ResolvedSemantics => {
    if (!def || !Object.keys(selections).length) return EMPTY;
    const runtimeFilters: VisualFilter[] = [];
    const semanticFilters: SemanticQueryFilter[] = [];
    const affectedBy: string[] = [];
    const notAffectedBy: string[] = [];
    const entityId = entityIdByName[(entityOverride ?? visual.query_config.entity) ?? ''];

    for (const [sfId, sel] of Object.entries(selections)) {
      const sf = def.semanticFilters?.find((s) => s.dashboard_semantic_filter_id === sfId);
      if (!sf) continue;
      if (visual.data_config.dateSlicer?.semanticFilterId === sfId) continue; // don't filter the driving slicer

      const binding = def.visualBindings?.find((b) => b.visual_id === visual.dashboard_visual_id && b.semantic_filter_id === sfId);
      if (binding && (binding.behavior === 'ignore' || !binding.is_enabled)) { notAffectedBy.push(sfId); continue; }

      // Scope: dashboard → everywhere; page → same page as the slicer; selected → needs a binding.
      if (sf.scope === 'page' && sel.pageId && visual.dashboard_page_id !== sel.pageId) continue;
      if (sf.scope === 'selected' && !binding) continue;
      if (!entityId) { notAffectedBy.push(sfId); continue; }
      // Runtime entity narrowing (timeline_card "Entities" chips): the viewer has
      // restricted this selection to a subset of mapped entities — visuals on any
      // other entity are left unfiltered.
      if (sel.entityIds && sel.entityIds.length && !sel.entityIds.includes(entityId)) {
        notAffectedBy.push(sfId); continue;
      }

      const override = binding?.relationship_path_override;
      const mapping = mappingForEntity(def, sfId, entityId);
      const path = hasSteps(override) ? override : (hasSteps(mapping?.relationship_path) ? mapping!.relationship_path as RelationshipPath : null);

      if (path) {
        semanticFilters.push({
          path: { steps: path.steps, targetFieldId: path.targetFieldId },
          filters: sel.filters,
          joinMode: mapping?.join_mode,
          nullBehavior: mapping?.null_behavior,
        });
        affectedBy.push(sfId);
      } else if (mapping?.target_field_id) {
        const col = physById[mapping.target_field_id];
        if (!col) { notAffectedBy.push(sfId); continue; }
        for (const lf of sel.filters) runtimeFilters.push({ ...lf, field: col });
        affectedBy.push(sfId);
      } else {
        notAffectedBy.push(sfId);
      }
    }
    return { runtimeFilters, semanticFilters, affectedBy, notAffectedBy };
  }, [def, selections, entityIdByName, physById]);

  return { selections, setSelection, clearAll, resolveForVisual, entityIdByName };
}
