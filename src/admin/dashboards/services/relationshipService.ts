// Relationship metadata for the GLOBAL semantic-filter designer. Paths are
// expressed as lookup field_definition ids + direction (resolved server-side by
// the query engine — the frontend never emits raw joins). This service walks the
// lookup graph (field_definition.lookup_entity_id) to:
//   • suggest a direct date field per entity (date semantic filters),
//   • suggest a direct/path mapping to reach another entity (lookup filters),
// so an admin can auto-map a semantic filter across every dashboard entity.

import { fetchEntities } from '../../../services/entityService';
import { fetchFieldsForEntity } from '../../../services/fieldService';
import type { EntityDefinition } from '../../../types/entity';
import type { FieldDefinition } from '../../../types/field';
import type { RelationshipStep, PathCandidate, PathDiscoveryResult } from '../types/dashboard';

const DATE_TYPES = new Set(['date', 'datetime']);
const isDate = (f: FieldDefinition) => DATE_TYPES.has(f.field_type?.name ?? '');
const isLookup = (f: FieldDefinition) =>
  (f.field_type?.name === 'lookup') && !!f.lookup_entity_id;

// ── caches ───────────────────────────────────────────────────────────────────
let entitiesP: Promise<EntityDefinition[]> | null = null;
const fieldsP = new Map<string, Promise<FieldDefinition[]>>();

export function clearRelationshipCache(): void {
  entitiesP = null;
  fieldsP.clear();
  graphP = null;
  fieldIndexP = null;
}

/**
 * Resolve a physical column on an entity to its field_definition_id (prefer the
 * active field when a physical column is mapped more than once). Used by runtime
 * cross-filtering to name the leaf field a server-side semantic path compares.
 */
export async function resolveFieldByName(
  entityId: string, physicalCol: string,
): Promise<string | null> {
  let fields: FieldDefinition[];
  try { fields = await fetchFieldsCached(entityId); } catch { return null; }
  const hits = fields.filter((f) => f.physical_column_name === physicalCol);
  const f = hits.find((x) => x.is_active) ?? hits[0];
  return f?.field_definition_id ?? null;
}

// field_definition_id → { field, entityId } across every readable entity. Built
// once from the same per-entity field fetches the graph uses; lets the designer
// validate a saved mapping's leaf/step ids and resolve which entity owns them.
let fieldIndexP: Promise<Map<string, { field: FieldDefinition; entityId: string }>> | null = null;

async function fieldIndex(): Promise<Map<string, { field: FieldDefinition; entityId: string }>> {
  if (fieldIndexP) return fieldIndexP;
  fieldIndexP = (async () => {
    const ents = await fetchEntitiesCached();
    const idx = new Map<string, { field: FieldDefinition; entityId: string }>();
    for (const ent of ents) {
      let fields: FieldDefinition[];
      try { fields = await fetchFieldsCached(ent.entity_definition_id); } catch { continue; }
      for (const f of fields) idx.set(f.field_definition_id, { field: f, entityId: ent.entity_definition_id });
    }
    return idx;
  })();
  return fieldIndexP;
}

/** Resolve a field id to its definition + owning entity (null when unknown/unreadable). */
export async function resolveFieldById(
  fieldId: string | null | undefined,
): Promise<{ field: FieldDefinition; entityId: string } | null> {
  if (!fieldId) return null;
  return (await fieldIndex()).get(fieldId) ?? null;
}

/** entity_definition_ids the current user can read (RLS already filters fetchEntities). */
export async function readableEntityIds(): Promise<Set<string>> {
  const ents = await fetchEntitiesCached();
  return new Set(ents.map((e) => e.entity_definition_id));
}

export function fetchEntitiesCached(): Promise<EntityDefinition[]> {
  if (!entitiesP) entitiesP = fetchEntities();
  return entitiesP;
}

export function fetchFieldsCached(entityId: string): Promise<FieldDefinition[]> {
  let p = fieldsP.get(entityId);
  if (!p) { p = fetchFieldsForEntity(entityId); fieldsP.set(entityId, p); }
  return p;
}

/** Lookup fields on an entity (each encodes one relationship edge → lookup_entity_id). */
export async function lookupFieldsOf(entityId: string): Promise<FieldDefinition[]> {
  return (await fetchFieldsCached(entityId)).filter(isLookup);
}

// ── Relationship graph (forward + reverse edges) ──────────────────────────────
// A forward edge is a lookup field on the owner entity pointing at its target
// (FK on the owner). A reverse edge walks the same lookup backwards: from the
// target entity into the children that reference it. Reverse edges let discovery
// reach a target that only CHILD entities link to. The whole graph is built once
// (every entity's lookup fields) and cached; designer-time only.
export interface GraphEdge {
  lookupFieldId: string;
  direction: 'forward' | 'reverse';
  toEntityId: string;        // entity reached by taking this edge
  isRequired: boolean;       // the underlying lookup field is required
  /** The lookup column is the target's PRIMARY FK (matches `<target>_id`) rather
   *  than a secondary lookup (e.g. account_id, not qualified_account_id). Path
   *  discovery prefers canonical edges so cross-filtering follows the main link. */
  canonical: boolean;
}

let graphP: Promise<Map<string, GraphEdge[]>> | null = null;

export function clearRelationshipGraph(): void { graphP = null; }

async function relationshipGraph(): Promise<Map<string, GraphEdge[]>> {
  if (graphP) return graphP;
  graphP = (async () => {
    const ents = await fetchEntitiesCached();
    const entById = new Map(ents.map((e) => [e.entity_definition_id, e]));
    const adj = new Map<string, GraphEdge[]>();
    const push = (from: string, e: GraphEdge) => {
      const list = adj.get(from); if (list) list.push(e); else adj.set(from, [e]);
    };
    // The lookup column is the target's primary FK when it matches the target's
    // `<name>_id` convention (account_id → account), not a secondary lookup
    // (qualified_account_id, parent_account, …). Used to prefer the main link.
    const isCanonicalFk = (col: string | undefined, targetId: string): boolean => {
      const te = entById.get(targetId);
      if (!te || !col) return false;
      const c = col.toLowerCase();
      return c === `${(te.physical_table_name ?? '').toLowerCase()}_id`
          || c === `${(te.logical_name ?? '').toLowerCase()}_id`;
    };
    for (const ent of ents) {
      let lookups: FieldDefinition[];
      try { lookups = await lookupFieldsOf(ent.entity_definition_id); }
      catch { continue; }               // entity fields unreadable → skip its edges
      for (const lf of lookups) {
        const target = lf.lookup_entity_id;
        if (!target) continue;
        const required = !!lf.is_required;
        const canonical = isCanonicalFk(lf.physical_column_name, target);
        // forward: owner → target
        push(ent.entity_definition_id, {
          lookupFieldId: lf.field_definition_id, direction: 'forward', toEntityId: target, isRequired: required, canonical,
        });
        // reverse: target → owner (walk the same lookup backwards)
        push(target, {
          lookupFieldId: lf.field_definition_id, direction: 'reverse', toEntityId: ent.entity_definition_id, isRequired: required, canonical,
        });
      }
    }
    return adj;
  })();
  return graphP;
}

/**
 * Best direct date field for an entity. Prefers conventional creation/start dates,
 * then any date/datetime field. Returns null when the entity has none.
 */
export async function suggestDateField(entityId: string): Promise<FieldDefinition | null> {
  const fields = (await fetchFieldsCached(entityId)).filter(isDate);
  if (!fields.length) return null;
  const pref = ['createdon', 'created_on', 'created_at', 'startdate', 'start_date', 'modifiedon', 'modified_at'];
  for (const p of pref) {
    const hit = fields.find((f) => f.physical_column_name === p);
    if (hit) return hit;
  }
  return fields[0];
}

export interface LookupMappingSuggestion {
  /** Hops from the base entity to the entity that holds the leaf field ([] = direct). */
  steps: RelationshipStep[];
  /** field_definition_id of the leaf field (a lookup field pointing at the target entity). */
  targetFieldId: string;
  /** Entity that holds the leaf field. */
  leafEntityId: string;
}

/**
 * Find how a base entity can be filtered by `targetEntityId` (e.g. Country).
 *   • base has a lookup → target            → { steps: [], targetFieldId: that lookup } (DIRECT)
 *   • base → … → E where E lookups → target → { steps: hops, targetFieldId: E's lookup } (PATH)
 *   • unreachable within maxHops            → null  (visual "not affected")
 * BFS over forward lookup edges; shortest path wins.
 */
export async function suggestLookupMapping(
  baseEntityId: string, targetEntityId: string, maxHops = 3,
): Promise<LookupMappingSuggestion | null> {
  type Node = { entityId: string; steps: RelationshipStep[] };
  const queue: Node[] = [{ entityId: baseEntityId, steps: [] }];
  const visited = new Set<string>([baseEntityId]);

  while (queue.length) {
    const node = queue.shift()!;
    const lookups = await lookupFieldsOf(node.entityId);

    // Does this entity directly reference the target? → leaf found.
    const direct = lookups.find((f) => f.lookup_entity_id === targetEntityId);
    if (direct) {
      return { steps: node.steps, targetFieldId: direct.field_definition_id, leafEntityId: node.entityId };
    }
    if (node.steps.length >= maxHops) continue;

    for (const lf of lookups) {
      const next = lf.lookup_entity_id!;
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push({
        entityId: next,
        steps: [...node.steps, { lookupFieldId: lf.field_definition_id, direction: 'forward' }],
      });
    }
  }
  return null;
}

// ── Deterministic path discovery (forward + reverse, scored, ambiguity-aware) ──
// Unlike suggestLookupMapping (which returns the single shortest forward path),
// discoverPaths enumerates EVERY valid path from the base entity to an entity
// that holds a forward lookup to the target, up to maxHops, then ranks them by a
// deterministic score so the designer can auto-pick the best — or flag a tie as
// "ambiguous" and let an administrator choose.

const HARD_MAX_HOPS = 5;
const MAX_CANDIDATES = 64;

/** Higher is better. Pure function of the path shape — no randomness, stable ties. */
function scorePath(
  steps: RelationshipStep[], leafRequired: boolean, leafConfigured: boolean,
): number {
  let s = 1000;
  s -= steps.length * 100;                                   // fewer hops win
  s -= steps.filter((x) => x.direction === 'reverse').length * 30; // forward preferred
  if (leafRequired) s += 8;                                  // required relationship
  if (leafConfigured) s += 20;                               // already-configured mapping
  return s;
}

/**
 * Discover how a base entity can be filtered by `targetEntityId`, returning all
 * candidate relationship paths ranked best-first plus an `ambiguous` flag (set
 * when the two best paths tie on score). A path's leaf is always a FORWARD lookup
 * field that points at the target (e.g. account.industry_id); `steps` are the
 * hops to reach the entity that holds it ([] = the base entity holds it → DIRECT).
 *
 * @param configuredLeafFieldIds leaf field ids already used by saved mappings —
 *        nudges discovery toward what the admin previously chose (deterministic).
 */
export async function discoverPaths(
  baseEntityId: string,
  targetEntityId: string,
  maxHops = 3,
  configuredLeafFieldIds?: Set<string>,
): Promise<PathDiscoveryResult> {
  const depth = Math.min(Math.max(Math.trunc(maxHops) || 3, 1), HARD_MAX_HOPS);
  const graph = await relationshipGraph();

  // Leaf detector: does this entity hold a forward lookup to the target? Returns
  // the (best) such lookup field — prefer a required one for stable ties.
  const leafOf = async (entityId: string): Promise<FieldDefinition | null> => {
    const lookups = await lookupFieldsOf(entityId).catch(() => [] as FieldDefinition[]);
    const hits = lookups.filter((f) => f.lookup_entity_id === targetEntityId);
    if (!hits.length) return null;
    return hits.find((f) => f.is_required) ?? hits[0];
  };

  const raw: PathCandidate[] = [];
  const seen = new Set<string>();             // dedupe by step-signature + leaf

  const visit = async (entityId: string, steps: RelationshipStep[], onPath: Set<string>) => {
    if (raw.length >= MAX_CANDIDATES) return;
    const leaf = await leafOf(entityId);
    if (leaf) {
      const sig = steps.map((s) => `${s.lookupFieldId}:${s.direction}`).join('>') + '#' + leaf.field_definition_id;
      if (!seen.has(sig)) {
        seen.add(sig);
        const hasReverse = steps.some((s) => s.direction === 'reverse');
        raw.push({
          steps: [...steps],
          targetFieldId: leaf.field_definition_id,
          leafEntityId: entityId,
          hops: steps.length,
          hasReverse,
          score: scorePath(steps, !!leaf.is_required, !!configuredLeafFieldIds?.has(leaf.field_definition_id)),
        });
      }
    }
    if (steps.length >= depth) return;
    for (const edge of graph.get(entityId) ?? []) {
      if (edge.toEntityId === targetEntityId) continue;   // don't hop INTO the target; the leaf lookup reaches it
      if (onPath.has(edge.toEntityId)) continue;          // no cycles within one path
      onPath.add(edge.toEntityId);
      await visit(edge.toEntityId, [...steps, { lookupFieldId: edge.lookupFieldId, direction: edge.direction }], onPath);
      onPath.delete(edge.toEntityId);
    }
  };

  await visit(baseEntityId, [], new Set([baseEntityId]));

  // Rank: score desc, then fewer hops, then fewer reverse hops, then a stable
  // tiebreak on the step signature so the ordering is fully deterministic.
  raw.sort((a, b) =>
    b.score - a.score ||
    a.hops - b.hops ||
    Number(a.hasReverse) - Number(b.hasReverse) ||
    a.targetFieldId.localeCompare(b.targetFieldId));

  const best = raw[0] ?? null;
  // Ambiguous only when the top two are DIFFERENT paths that tie on score.
  const ambiguous = raw.length >= 2 && raw[0].score === raw[1].score
    && (raw[0].targetFieldId !== raw[1].targetFieldId
        || raw[0].steps.length !== raw[1].steps.length
        || raw[0].steps.some((s, i) => s.lookupFieldId !== raw[1].steps[i]?.lookupFieldId));

  return { candidates: raw, best, ambiguous };
}

// ── Interactive cross-filter path (forward + reverse, reach a SOURCE entity) ──
// discoverPaths reaches an entity that holds a forward LOOKUP to a target. Click
// cross-filtering needs the opposite: a path from the queried (base) entity to the
// SOURCE entity itself, so a value selected on the source entity's own column can
// filter the base. Steps may go forward (parent) OR reverse (child) — the server's
// semantic predicate handles both as nested EXISTS. Returns the best-scored
// shortest path's steps, or null when unreachable / base === source.
const MAX_PATH_VISITS = 6000;   // safety cap against reverse-edge fan-out blow-up

export async function findEntityPath(
  baseEntityId: string, sourceEntityId: string, maxHops = 3,
): Promise<RelationshipStep[] | null> {
  if (!baseEntityId || !sourceEntityId || baseEntityId === sourceEntityId) return null;
  const depth = Math.min(Math.max(Math.trunc(maxHops) || 3, 1), HARD_MAX_HOPS);
  const graph = await relationshipGraph();

  const sig = (steps: RelationshipStep[]) => steps.map((s) => `${s.lookupFieldId}:${s.direction}`).join('>');
  // Which lookup fields are the PRIMARY FK to their target — used to prefer the
  // main link (account_id) over secondary ones (qualified_account_id, …) when two
  // entities are joined by several lookups. Without this the tie-break falls to the
  // field UUID and can traverse a mostly-empty column, silently returning 0 rows.
  const canonMap = new Map<string, boolean>();
  for (const edges of graph.values()) for (const e of edges) if (e.canonical) canonMap.set(e.lookupFieldId, true);
  let best: { steps: RelationshipStep[]; score: number; sig: string } | null = null;
  let visits = 0;

  const consider = (steps: RelationshipStep[], leafRequired: boolean) => {
    const canonBonus = steps.reduce((b, st) => b + (canonMap.get(st.lookupFieldId) ? 60 : 0), 0);
    const score = scorePath(steps, leafRequired, false) + canonBonus;
    const s = sig(steps);
    if (!best || score > best.score || (score === best.score && s < best.sig)) best = { steps, score, sig: s };
  };

  const visit = (entityId: string, steps: RelationshipStep[], onPath: Set<string>) => {
    if (visits++ > MAX_PATH_VISITS) return;
    for (const edge of graph.get(entityId) ?? []) {
      if (onPath.has(edge.toEntityId)) continue;                 // no cycles within one path
      const nextSteps = [...steps, { lookupFieldId: edge.lookupFieldId, direction: edge.direction }];
      if (edge.toEntityId === sourceEntityId) { consider(nextSteps, edge.isRequired); continue; }
      if (nextSteps.length >= depth) continue;
      onPath.add(edge.toEntityId);
      visit(edge.toEntityId, nextSteps, onPath);
      onPath.delete(edge.toEntityId);
    }
  };

  visit(baseEntityId, [], new Set([baseEntityId]));
  // `best` is mutated inside the `consider` closure, which defeats TS control-flow
  // narrowing (it would otherwise collapse to `never` here) — read via a typed alias.
  const winner = best as { steps: RelationshipStep[]; score: number; sig: string } | null;
  return winner ? winner.steps : null;
}

/** Human-readable label for a path, given a step→field lookup resolver. */
export function describeSteps(
  steps: RelationshipStep[], fieldNameById: (id: string) => string | undefined,
): string {
  if (!steps.length) return 'Direct';
  return steps.map((s) => fieldNameById(s.lookupFieldId) ?? '?').join(' → ');
}
