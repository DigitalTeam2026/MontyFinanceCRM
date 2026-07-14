import { supabase } from '../../lib/supabase';
import { getTable } from './metadata/metadataStore';
import { ENTITY_DEFINITION_ID, ENTITY_LOGICAL_NAME } from '../types';
import type { ListRow } from './listService';

/**
 * Row highlighting is driven ENTIRELY by each entity's real Status Reason
 * option set (`status_reason_definition`) — never by hardcoded rules. The
 * reasons, their labels, and their colors are exactly the ones an admin has
 * configured for that entity, so the legend and row accents always reflect the
 * data that actually exists in the entity.
 *
 * `status_reason_definition` ships in the published metadata snapshot (full row
 * via to_jsonb), so `color` is available synchronously in the Sales app; we
 * fall back to a live query when the snapshot is not hydrated (e.g. Admin).
 */

export interface ReasonHighlight {
  /** Raw stored code, e.g. "3". */
  value: string;
  /** Human label, e.g. "Won". */
  label: string;
  /** Hex color from the reason definition, e.g. "#10B981". */
  color: string;
  sortOrder: number;
}

/** Fallback when a reason row has no color configured. */
const DEFAULT_REASON_COLOR = '#6B7280';

interface RawReason {
  reason_value: string | number;
  display_label: string;
  color: string | null;
  sort_order: number | null;
  entity_definition_id: string;
}

async function resolveEntityDefId(entity: string): Promise<string | null> {
  const known = ENTITY_DEFINITION_ID[entity];
  if (known) return known;
  const logical = ENTITY_LOGICAL_NAME[entity] ?? entity;
  const snap = getTable<{ entity_definition_id: string; logical_name: string }>('entity_definition');
  if (snap !== null) {
    return snap.find((e) => e.logical_name === logical)?.entity_definition_id ?? null;
  }
  const { data } = await supabase
    .from('entity_definition')
    .select('entity_definition_id')
    .eq('logical_name', logical)
    .maybeSingle();
  return (data as { entity_definition_id: string } | null)?.entity_definition_id ?? null;
}

/**
 * Load the Status Reason highlights for an entity, ordered by sort_order.
 * Returns [] when the entity has no reasons configured (→ no legend, no accents).
 */
export async function loadReasonHighlights(entity: string): Promise<ReasonHighlight[]> {
  const entityDefId = await resolveEntityDefId(entity);
  if (!entityDefId) return [];

  let rows: RawReason[];
  const snap = getTable<RawReason>('status_reason_definition');
  if (snap !== null) {
    rows = snap.filter((r) => r.entity_definition_id === entityDefId);
  } else {
    // No is_active filter: an inactive reason still needs a color for existing
    // rows that carry it, and the legend should mirror every reason that exists.
    const { data } = await supabase
      .from('status_reason_definition')
      .select('reason_value, display_label, color, sort_order, entity_definition_id')
      .eq('entity_definition_id', entityDefId);
    rows = (data ?? []) as RawReason[];
  }

  return rows
    .map((r) => ({
      value: String(r.reason_value),
      label: r.display_label,
      color: r.color || DEFAULT_REASON_COLOR,
      sortOrder: r.sort_order ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Match a row to its Status Reason highlight. The list grid resolves
 * `status_reason` to its label before render (applyStatusLabels), so we match
 * on label first and fall back to the raw code for any unresolved path.
 */
export function evaluateReasonHighlight(
  reasons: ReasonHighlight[],
  row: ListRow,
): ReasonHighlight | null {
  const raw = row.status_reason;
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const s = String(raw);
  return reasons.find((r) => r.label === s) ?? reasons.find((r) => r.value === s) ?? null;
}
