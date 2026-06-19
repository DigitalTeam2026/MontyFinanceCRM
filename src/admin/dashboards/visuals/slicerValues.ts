// Builds the per-entity "sources" a lookup/choice slicer sends to
// dashboard_distinct_values so it can show only the values ACTUALLY referenced by
// accessible records across the dashboard's mapped entities (spec §6/§7).
//
// For each entity the slicer's semantic filter is mapped to, we describe how that
// entity reaches the target field (direct column or relationship path) AND fold
// in every OTHER active semantic selection (Date, Country, Status, Owner, …),
// translated to that same entity — so the available values stay contextual. The
// slicer's OWN current selection is deliberately excluded (a slicer never
// collapses its own options to the value just picked).

import type {
  DashboardDefinition, DashboardSemanticFilter, VisualFilter, RelationshipPath,
} from '../types/dashboard';
import type { DistinctSource } from '../services/queryEngine';
import { fetchEntitiesCached, resolveFieldById } from '../services/relationshipService';
import { activeMappingsFor, mappingForEntity } from './semanticRuntime';

export interface SlicerSelection { filters: VisualFilter[]; pageId: string }

const hasSteps = (p: unknown): p is RelationshipPath =>
  !!p && Array.isArray((p as RelationshipPath).steps) && (p as RelationshipPath).steps.length > 0
  && !!(p as RelationshipPath).targetFieldId;

/**
 * Resolve the physical column for a direct-mapping leaf field id (cached via the
 * relationship-service field index). null when unresolved/unauthorized.
 */
async function physicalOf(fieldId: string | null | undefined): Promise<string | null> {
  const r = await resolveFieldById(fieldId);
  return r?.field.physical_column_name ?? null;
}

/**
 * Build the distinct-values RPC sources for one lookup/choice semantic filter.
 * @param selections current semantic selections keyed by semantic_filter_id.
 * @param slicerPageId the page the slicer lives on (for page-scoped other filters).
 */
export async function buildSlicerSources(
  def: DashboardDefinition,
  sf: DashboardSemanticFilter,
  selections: Record<string, SlicerSelection>,
  slicerPageId: string,
): Promise<DistinctSource[]> {
  const sfId = sf.dashboard_semantic_filter_id;
  const mappings = activeMappingsFor(def, sfId);
  if (!mappings.length) return [];

  const ents = await fetchEntitiesCached();
  const nameOf = (entityId: string | null) =>
    ents.find((e) => e.entity_definition_id === entityId)?.logical_name ?? null;

  const sources: DistinctSource[] = [];

  for (const m of mappings) {
    const entityId = m.target_entity_id;
    const entityName = nameOf(entityId);
    if (!entityId || !entityName) continue;

    const src: DistinctSource = { entity: entityName };
    if (hasSteps(m.relationship_path)) {
      const p = m.relationship_path as RelationshipPath;
      src.path = { steps: p.steps, targetFieldId: p.targetFieldId };
    } else if (m.target_field_id) {
      const col = await physicalOf(m.target_field_id);
      if (!col) continue;                 // unresolved leaf → skip this source
      src.field = col;
    } else {
      continue;
    }

    // Fold in every OTHER active selection, translated to THIS entity.
    const otherFilters: VisualFilter[] = [];
    const otherSemantic: DistinctSource['semanticFilters'] = [];
    for (const [otherId, sel] of Object.entries(selections)) {
      if (otherId === sfId || !sel.filters.length) continue;
      const osf = def.semanticFilters?.find((s) => s.dashboard_semantic_filter_id === otherId);
      if (!osf) continue;
      if (osf.scope === 'page' && sel.pageId && sel.pageId !== slicerPageId) continue;
      if (osf.scope === 'selected') continue; // per-visual scope doesn't apply to a slicer's value set

      const om = mappingForEntity(def, otherId, entityId);
      if (!om) continue;
      if (hasSteps(om.relationship_path)) {
        const op = om.relationship_path as RelationshipPath;
        otherSemantic.push({ path: { steps: op.steps, targetFieldId: op.targetFieldId }, filters: sel.filters });
      } else if (om.target_field_id) {
        const col = await physicalOf(om.target_field_id);
        if (!col) continue;
        for (const lf of sel.filters) otherFilters.push({ ...lf, field: col });
      }
    }
    if (otherFilters.length) src.filters = otherFilters;
    if (otherSemantic.length) src.semanticFilters = otherSemantic;
    sources.push(src);
  }
  return sources;
}
