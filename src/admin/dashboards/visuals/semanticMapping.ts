// Cross-entity cross-filtering: resolve how a selection made on one entity reaches
// another entity through relationship (lookup) chains. A selection is made on
// (sourceEntity, fieldId) — e.g. crm_account.industry_id, or crm_product.id. To
// filter a DIFFERENT target visual by that selection we find a relationship path
// from the target entity to the source entity, then constrain the source field on
// the far end. The path is resolved against the SAME bidirectional relationship
// graph the global semantic-filter designer uses (forward + reverse lookups →
// covers many-to-many bridge tables), so cross-filtering is fully bidirectional:
// clicking Product filters Leads AND clicking a Lead value filters Products, via
// whatever path exists. Paths are emitted as metadata ids (lookup-field ids +
// target-field id) and resolved SERVER-SIDE into a nested EXISTS by
// dashboard_build_semantic_predicate — never as raw joins from the client.
// No path → null → the visual is "not affected" and left unchanged (spec §5).

import type { RelationshipStep } from '../types/dashboard';
import { findEntityPath, resolveFieldByName } from '../services/relationshipService';
import { loadColumnMeta } from './labelResolver';
import { fetchEntities } from '../../../services/entityService';

export interface RelHop { fk: string; entity: string }   // fk column → physical target table
export type RelPath = RelHop[];                            // [] = same entity (direct field)

/** A cross-filter selection resolved to a server-side semantic path (steps + leaf field). */
export interface CrossSemanticPath { steps: RelationshipStep[]; targetFieldId: string }

const MAX_HOPS = 2;
/** Max relationship hops a runtime click cross-filter will traverse. */
const CROSS_FILTER_MAX_HOPS = 3;

// entity name (logical or physical) → entity_definition_id, and id → physical name.
let idIndex: Promise<{ toId: Map<string, string>; toPhysical: Map<string, string> }> | null = null;
async function indexes() {
  if (!idIndex) {
    idIndex = fetchEntities().then((ents) => {
      const toId = new Map<string, string>();
      const toPhysical = new Map<string, string>();
      for (const e of ents) {
        toId.set(e.logical_name, e.entity_definition_id);
        toId.set(e.physical_table_name, e.entity_definition_id);
        toPhysical.set(e.entity_definition_id, e.physical_table_name);
      }
      return { toId, toPhysical };
    });
  }
  return idIndex;
}

export function clearSemanticCache(): void { idIndex = null; pathCache.clear(); crossPathCache.clear(); }

const pathCache = new Map<string, RelPath | null>();
const keyFor = (src: string, target: string, field: string) => `${src}|${target}|${field}`;

/**
 * Resolve the relationship path from `targetEntity` back to `sourceEntity` so that
 * a selection on `sourceEntity.field` can filter `targetEntity`.
 *   • same entity            → [] (caller applies a direct filter on `field`)
 *   • reachable via lookups  → ordered hops (target-first)
 *   • unreachable            → null (visual not affected)
 */
export async function resolveRelPath(
  sourceEntity: string, targetEntity: string, field: string,
): Promise<RelPath | null> {
  const k = keyFor(sourceEntity, targetEntity, field);
  if (pathCache.has(k)) return pathCache.get(k)!;

  const { toId } = await indexes();
  const srcId = toId.get(sourceEntity);
  const tgtId = toId.get(targetEntity);
  if (!srcId || !tgtId) { pathCache.set(k, null); return null; }
  if (srcId === tgtId) { pathCache.set(k, []); return []; }

  // BFS over lookup edges from the target entity toward the source entity.
  type Node = { entity: string; entityId: string; path: RelPath };
  const start = await loadColumnMeta(targetEntity);
  if (!start) { pathCache.set(k, null); return null; }
  const queue: Node[] = [{ entity: targetEntity, entityId: start.entityId, path: [] }];
  const visited = new Set<string>([start.entityId]);

  while (queue.length) {
    const node = queue.shift()!;
    if (node.path.length >= MAX_HOPS) continue;
    const meta = await loadColumnMeta(node.entity);
    if (!meta) continue;
    for (const cm of meta.byColumn.values()) {
      if (!cm.lookupTable) continue;
      const neighbor = await loadColumnMeta(cm.lookupTable);
      if (!neighbor) continue;
      const hopPath = [...node.path, { fk: cm.physical, entity: cm.lookupTable }];
      if (neighbor.entityId === srcId) { pathCache.set(k, hopPath); return hopPath; }
      if (!visited.has(neighbor.entityId)) {
        visited.add(neighbor.entityId);
        queue.push({ entity: cm.lookupTable, entityId: neighbor.entityId, path: hopPath });
      }
    }
  }
  pathCache.set(k, null);
  return null;
}

// ── Bidirectional cross-filter resolution (preferred) ─────────────────────────
const crossPathCache = new Map<string, CrossSemanticPath | null>();

/**
 * Resolve a click selection on (sourceEntity, sourceField) into a server-side
 * semantic-filter path that constrains the `targetEntity` visual. Returns:
 *   • null when source === target (caller applies a direct same-entity filter),
 *   • null when the target cannot reach the source within CROSS_FILTER_MAX_HOPS
 *     (the visual is "not affected" — left unchanged),
 *   • else { steps, targetFieldId } — steps walk target→…→source over the
 *     bidirectional relationship graph; targetFieldId is the source field's
 *     metadata id (the leaf the server compares). The leaf condition (eq/in +
 *     value) is supplied separately by the caller as `filters`.
 */
export async function resolveCrossSemanticPath(
  sourceEntity: string, targetEntity: string, sourceField: string,
): Promise<CrossSemanticPath | null> {
  const k = keyFor(sourceEntity, targetEntity, sourceField);
  if (crossPathCache.has(k)) return crossPathCache.get(k)!;

  const { toId } = await indexes();
  const srcId = toId.get(sourceEntity);
  const tgtId = toId.get(targetEntity);
  if (!srcId || !tgtId || srcId === tgtId) { crossPathCache.set(k, null); return null; }

  // Path from the queried (target/base) entity → the selection's source entity.
  const steps = await findEntityPath(tgtId, srcId, CROSS_FILTER_MAX_HOPS);
  if (!steps || !steps.length) { crossPathCache.set(k, null); return null; }

  const targetFieldId = await resolveFieldByName(srcId, sourceField);
  if (!targetFieldId) { crossPathCache.set(k, null); return null; }

  const resolved: CrossSemanticPath = { steps, targetFieldId };
  if (import.meta.env?.DEV) {
    console.debug('[DashboardFilter] Relationship path found', { sourceEntity, targetEntity, sourceField, hops: steps.length });
  }
  crossPathCache.set(k, resolved);
  return resolved;
}
