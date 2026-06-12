/**
 * Generalised entity conversion engine.
 *
 * Handles any source→target entity conversion backed by
 * entity_conversion_rule + entity_conversion_field_mapping tables.
 * Currently used for Prospect→Lead; the same engine can power future
 * conversions (e.g. Lead→Contact, Inquiry→Opportunity) without duplication.
 *
 * The actual database transaction (Lead creation + Prospect update) is
 * delegated to the convert_prospect_to_lead RPC to guarantee atomicity.
 * This module owns the preview / validation layer that runs before the RPC.
 */

import { supabase } from '../../lib/supabase';
import type { RecordData } from './recordService';
import type {
  EntityConversionRule,
  EntityConversionFieldMapping,
} from '../../types/entityConversion';

export type { ConversionMappingType, EntityConversionRule, EntityConversionFieldMapping } from '../../types/entityConversion';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConversionPreview {
  rule: EntityConversionRule;
  mappings: EntityConversionFieldMapping[];
  /** Fields that will be set on the target record (keyed by target_field) */
  targetValues: RecordData;
  /** Required source fields that are empty – blocks conversion when non-empty */
  missingRequired: { sourceField: string; targetField: string }[];
  /** The source record values as loaded from the DB */
  sourceValues: RecordData;
}

export interface ConversionResult {
  success: boolean;
  prospectId: string;
  leadId: string;
  leadName: string;
  ruleId: string;
}

// ─── Rule fetching ────────────────────────────────────────────────────────────

/** Returns the default active conversion rule for a given source→target pair. */
export async function fetchDefaultConversionRule(
  sourceEntity: string,
  targetEntity: string,
): Promise<EntityConversionRule | null> {
  const { data: defaultRule } = await supabase
    .from('entity_conversion_rule')
    .select('*')
    .eq('source_entity', sourceEntity)
    .eq('target_entity', targetEntity)
    .eq('is_active', true)
    .is('deleted_at', null)
    .eq('is_default', true)
    .maybeSingle();

  if (defaultRule) return defaultRule as EntityConversionRule;

  // Fallback: any active rule for this pair
  const { data: fallback } = await supabase
    .from('entity_conversion_rule')
    .select('*')
    .eq('source_entity', sourceEntity)
    .eq('target_entity', targetEntity)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  return (fallback as EntityConversionRule | null) ?? null;
}

/** Fetches all field mappings for a given rule, ordered by display_order. */
export async function fetchConversionMappings(
  ruleId: string,
): Promise<EntityConversionFieldMapping[]> {
  const { data } = await supabase
    .from('entity_conversion_field_mapping')
    .select('*')
    .eq('entity_conversion_rule_id', ruleId)
    .order('display_order');

  return (data ?? []) as EntityConversionFieldMapping[];
}

// ─── Mapping engine ───────────────────────────────────────────────────────────

/**
 * Resolves a single source field value according to the mapping type.
 * Supports:
 *   direct       – copies the raw value unchanged
 *   default_value – ignores source; uses default_value from mapping config
 *   lookup       – copies the UUID/key directly (lookup_match_field extension ready)
 *   boolean      – normalises truthy strings → 'true'/'false'
 *   number       – strips non-numeric characters, coerces to numeric string
 *   currency     – same as number
 *   date         – passes through ISO strings unchanged
 *   choice       – passes through choice codes unchanged
 */
function resolveFieldValue(
  mapping: EntityConversionFieldMapping,
  sourceValues: RecordData,
): string | null {
  if (mapping.mapping_type === 'default_value') {
    return mapping.default_value ?? null;
  }

  const raw = sourceValues[mapping.source_field];

  if (raw === null || raw === undefined) return null;

  switch (mapping.mapping_type) {
    case 'boolean': {
      if (typeof raw === 'boolean') return raw ? 'true' : 'false';
      const s = String(raw).toLowerCase();
      if (s === '1' || s === 'yes' || s === 'true') return 'true';
      if (s === '0' || s === 'no'  || s === 'false') return 'false';
      return null;
    }
    case 'number':
    case 'currency': {
      const n = parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
      return isNaN(n) ? null : String(n);
    }
    default:
      return String(raw);
  }
}

// ─── Preview builder ──────────────────────────────────────────────────────────

/**
 * Builds a ConversionPreview without touching the database (read-only).
 * Used by ConvertProspectModal to show the user what will be created.
 */
export async function buildConversionPreview(
  sourceEntity: string,
  targetEntity: string,
  sourceValues: RecordData,
): Promise<ConversionPreview | null> {
  const rule = await fetchDefaultConversionRule(sourceEntity, targetEntity);
  if (!rule) return null;

  const mappings = await fetchConversionMappings(rule.entity_conversion_rule_id);

  const targetValues: RecordData = {};
  const missingRequired: { sourceField: string; targetField: string }[] = [];

  for (const mapping of mappings) {
    const resolved = resolveFieldValue(mapping, sourceValues);

    if (mapping.is_required && (resolved === null || resolved.trim() === '')) {
      missingRequired.push({
        sourceField: mapping.source_field,
        targetField: mapping.target_field,
      });
    }

    if (resolved !== null && resolved.trim() !== '') {
      targetValues[mapping.target_field] = resolved;
    }
  }

  return { rule, mappings, targetValues, missingRequired, sourceValues };
}

// ─── Execution ────────────────────────────────────────────────────────────────

/**
 * Executes the conversion via the atomic backend RPC.
 * The browser sends only { prospectId, userId } – the backend builds and
 * validates the Lead payload itself.
 */
export async function executeProspectToLeadConversion(
  prospectId: string,
  userId: string,
): Promise<ConversionResult> {
  const { data, error } = await supabase.rpc('convert_prospect_to_lead', {
    p_prospect_id: prospectId,
    p_user_id:     userId,
  });

  if (error) {
    const msg = error.message ?? 'Conversion failed. Please try again.';
    if (msg.includes('CONVERTED_RECORD_READONLY')) {
      throw new Error('This Prospect has already been converted and cannot be modified.');
    }
    if (msg.includes('already been converted')) {
      throw new Error('This Prospect has already been converted to a Lead.');
    }
    if (msg.includes('Only Active')) {
      throw new Error('Only Active prospects can be converted to a Lead.');
    }
    throw new Error(msg);
  }

  const result = data as ConversionResult;
  if (!result?.success) {
    throw new Error('Conversion did not return a success response. Please try again.');
  }

  return result;
}
