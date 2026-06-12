// Admin CRUD for entity-conversion rules + field mappings.
// Used by the "Prospect Conversion" admin editor. Mirrors the structure of
// leadQualificationService so the two admin surfaces behave identically.

import { supabase } from '../lib/supabase';
import type {
  EntityConversionRule,
  EntityConversionFieldMapping,
  EntityConversionRuleFormData,
} from '../types/entityConversion';

// ─── Rules ────────────────────────────────────────────────────────────────────

/** Returns all conversion rules for a given source→target pair (newest default first). */
export async function fetchConversionRules(
  sourceEntity: string,
  targetEntity: string,
): Promise<EntityConversionRule[]> {
  const { data, error } = await supabase
    .from('entity_conversion_rule')
    .select('*')
    .eq('source_entity', sourceEntity)
    .eq('target_entity', targetEntity)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('name');
  if (error) throw error;
  return (data ?? []) as EntityConversionRule[];
}

/** Returns the default (or first active) rule for a source→target pair, or null. */
export async function fetchDefaultConversionRuleAdmin(
  sourceEntity: string,
  targetEntity: string,
): Promise<EntityConversionRule | null> {
  const rules = await fetchConversionRules(sourceEntity, targetEntity);
  if (rules.length === 0) return null;
  return rules.find((r) => r.is_default) ?? rules.find((r) => r.is_active) ?? rules[0];
}

export async function fetchConversionRuleWithMappings(ruleId: string): Promise<EntityConversionRule> {
  const { data: rule, error: rErr } = await supabase
    .from('entity_conversion_rule')
    .select('*')
    .eq('entity_conversion_rule_id', ruleId)
    .is('deleted_at', null)
    .single();
  if (rErr) throw rErr;

  const { data: mappings, error: mErr } = await supabase
    .from('entity_conversion_field_mapping')
    .select('*')
    .eq('entity_conversion_rule_id', ruleId)
    .order('display_order');
  if (mErr) throw mErr;

  return {
    ...(rule as EntityConversionRule),
    mappings: (mappings ?? []) as EntityConversionFieldMapping[],
  };
}

export async function updateConversionRule(
  ruleId: string,
  updates: Partial<EntityConversionRuleFormData>,
): Promise<EntityConversionRule> {
  // Only one default rule per source→target pair
  if (updates.is_default) {
    const { data: current } = await supabase
      .from('entity_conversion_rule')
      .select('source_entity, target_entity')
      .eq('entity_conversion_rule_id', ruleId)
      .single();
    if (current) {
      await supabase
        .from('entity_conversion_rule')
        .update({ is_default: false })
        .eq('source_entity', current.source_entity)
        .eq('target_entity', current.target_entity)
        .neq('entity_conversion_rule_id', ruleId)
        .eq('is_default', true);
    }
  }

  const { data, error } = await supabase
    .from('entity_conversion_rule')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('entity_conversion_rule_id', ruleId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Conversion rule not found or update not permitted');
  return data as EntityConversionRule;
}

// ─── Field mappings ─────────────────────────────────────────────────────────

export async function fetchConversionMappingsForRule(
  ruleId: string,
): Promise<EntityConversionFieldMapping[]> {
  const { data, error } = await supabase
    .from('entity_conversion_field_mapping')
    .select('*')
    .eq('entity_conversion_rule_id', ruleId)
    .order('display_order');
  if (error) throw error;
  return (data ?? []) as EntityConversionFieldMapping[];
}

/**
 * Replaces ALL field mappings for a rule (delete-then-insert).
 * Keeps the save logic simple and atomic from the UI's perspective.
 */
export async function replaceConversionMappings(
  ruleId: string,
  mappings: Omit<
    EntityConversionFieldMapping,
    'entity_conversion_field_mapping_id' | 'entity_conversion_rule_id' | 'created_at'
  >[],
): Promise<EntityConversionFieldMapping[]> {
  await supabase
    .from('entity_conversion_field_mapping')
    .delete()
    .eq('entity_conversion_rule_id', ruleId);

  // Drop incomplete rows (no source or target field) before insert
  const valid = mappings.filter((m) => m.source_field && m.target_field);
  if (valid.length === 0) return [];

  const { data, error } = await supabase
    .from('entity_conversion_field_mapping')
    .insert(
      valid.map((m, i) => ({
        ...m,
        entity_conversion_rule_id: ruleId,
        display_order: m.display_order ?? i * 10,
      })),
    )
    .select();
  if (error) throw error;
  return (data ?? []) as EntityConversionFieldMapping[];
}
