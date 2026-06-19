// Mapping-status taxonomy for the global semantic-filter designer (spec §5).
// For every dashboard entity we resolve HOW it reaches a semantic filter's target
// and surface a single status so an admin never has to map each entity by hand:
//
//   direct          — the entity holds the target field itself (no hops)
//   auto_mapped     — a relationship path was discovered automatically
//   manual          — an administrator hand-picked / overrode the mapping
//   ambiguous       — several equally-good paths exist; needs a human choice
//   no_relationship — no path within the configured depth limit
//   invalid         — a saved mapping points at metadata that no longer resolves
//   unauthorized    — the user cannot read an entity along the path
//
// Validation is best-effort (advisory UX): the query engine re-validates every id
// server-side and RLS governs the data, so a wrong status can never leak rows.

import type {
  DashboardDefinition, DashboardSemanticFilter, DashboardFilterMapping,
  MappingStatus, PathCandidate, RelationshipPath, SemanticDiscoveryConfig,
} from '../types/dashboard';
import type { EntityDefinition } from '../../../types/entity';
import { resolveFieldById, readableEntityIds } from '../services/relationshipService';

export interface EntityMappingState {
  entityId: string;
  entityName: string;
  status: MappingStatus;
  mapping: DashboardFilterMapping | null;
  candidates: PathCandidate[];   // discovered alternatives (for ambiguity / override)
  candidateLabels: string[];     // human label per candidate (aligned to candidates)
  pathLabel: string;             // human description of the active path
  detail?: string;               // extra context (e.g. invalid reason)
}

const hasSteps = (p: unknown): p is RelationshipPath =>
  !!p && Array.isArray((p as RelationshipPath).steps) && (p as RelationshipPath).steps.length > 0;

export function discoveryOf(sf: DashboardSemanticFilter | null | undefined): SemanticDiscoveryConfig {
  return ((sf?.config?.discovery as SemanticDiscoveryConfig) ?? {});
}

/** Active-or-inactive mapping for (filter, entity); newest priority wins for display. */
function mappingFor(def: DashboardDefinition, sfId: string, entityId: string): DashboardFilterMapping | null {
  return (def.filterMappings ?? [])
    .filter((m) => m.semantic_filter_id === sfId && m.target_entity_id === entityId)
    .sort((a, b) => b.priority - a.priority)[0] ?? null;
}

/**
 * Resolve the mapping status for every dashboard entity under one semantic filter.
 * Returns a map keyed by entity_definition_id.
 */
export async function computeMappingStates(
  def: DashboardDefinition,
  sf: DashboardSemanticFilter,
  dashboardEntities: EntityDefinition[],
): Promise<Record<string, EntityMappingState>> {
  const disc = discoveryOf(sf);
  const readable = await readableEntityIds();
  const out: Record<string, EntityMappingState> = {};

  for (const ent of dashboardEntities) {
    const entityId = ent.entity_definition_id;
    const mapping = mappingFor(def, sf.dashboard_semantic_filter_id, entityId);
    const candidates = disc.candidates?.[entityId] ?? [];
    const origin = disc.origin?.[entityId];

    let status: MappingStatus;
    let pathLabel = '';
    let detail: string | undefined;

    if (mapping && (mapping.target_field_id || hasSteps(mapping.relationship_path))) {
      // Validate the saved mapping's leaf + reachable entities.
      const leaf = await resolveFieldById(mapping.target_field_id);
      const path = hasSteps(mapping.relationship_path) ? (mapping.relationship_path as RelationshipPath) : null;

      if (!leaf) {
        status = 'invalid';
        detail = 'Target field no longer exists';
      } else if (!readable.has(entityId) || !readable.has(leaf.entityId)) {
        status = 'unauthorized';
        detail = 'You cannot read every entity in this path';
      } else {
        // Validate each step's lookup field resolves to a readable owner/target.
        let bad = false;
        let unauthorizedStep = false;
        if (path) {
          for (const s of path.steps) {
            const sf2 = await resolveFieldById(s.lookupFieldId);
            if (!sf2) { bad = true; detail = 'A relationship step no longer exists'; break; }
            if (!readable.has(sf2.entityId) || !readable.has(sf2.field.lookup_entity_id ?? '')) {
              unauthorizedStep = true;
            }
          }
        }
        if (bad) {
          status = 'invalid';
        } else if (unauthorizedStep) {
          status = 'unauthorized';
          detail = 'You cannot read every entity in this path';
        } else if (!path) {
          status = 'direct';
          pathLabel = leaf.field.display_name;
        } else {
          status = origin === 'manual' ? 'manual' : 'auto_mapped';
          pathLabel = await describePath(path);
        }
      }
    } else if (candidates.length > 1) {
      status = 'ambiguous';
      pathLabel = `${candidates.length} possible paths`;
    } else if (candidates.length === 1) {
      // A single candidate that isn't saved yet — treat as auto-mappable preview.
      status = candidates[0].hops === 0 ? 'direct' : 'auto_mapped';
      pathLabel = await describeCandidate(candidates[0]);
    } else {
      status = 'no_relationship';
    }

    const candidateLabels: string[] = [];
    for (const c of candidates) candidateLabels.push(await describeCandidate(c));

    out[entityId] = { entityId, entityName: ent.display_name, status, mapping, candidates, candidateLabels, pathLabel, detail };
  }
  return out;
}

/** "Lead → Account → Industry"-style label for a saved path. */
export async function describePath(path: RelationshipPath): Promise<string> {
  const names: string[] = [];
  for (const s of path.steps) {
    const f = await resolveFieldById(s.lookupFieldId);
    names.push(f?.field.display_name ?? '?');
  }
  const leaf = await resolveFieldById(path.targetFieldId);
  if (leaf) names.push(leaf.field.display_name);
  return names.length ? names.join(' → ') : 'Direct';
}

export async function describeCandidate(c: PathCandidate): Promise<string> {
  if (!c.steps.length) {
    const leaf = await resolveFieldById(c.targetFieldId);
    return leaf?.field.display_name ?? 'Direct';
  }
  return describePath({ sourceEntityId: '', steps: c.steps, targetFieldId: c.targetFieldId });
}

// ── Display metadata for status chips ──────────────────────────────────────────
export const STATUS_META: Record<MappingStatus, { label: string; tone: 'emerald' | 'blue' | 'violet' | 'amber' | 'slate' | 'red' }> = {
  direct:          { label: 'Direct',          tone: 'emerald' },
  auto_mapped:     { label: 'Auto-mapped',     tone: 'blue' },
  manual:          { label: 'Manually mapped', tone: 'violet' },
  ambiguous:       { label: 'Ambiguous',       tone: 'amber' },
  no_relationship: { label: 'No relationship', tone: 'slate' },
  invalid:         { label: 'Invalid',         tone: 'red' },
  unauthorized:    { label: 'Unauthorized',    tone: 'red' },
};
