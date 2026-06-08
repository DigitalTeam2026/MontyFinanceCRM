import { supabase } from '../lib/supabase';
import type {
  RelationshipDefinition,
  RelationshipDefinitionWithEntities,
  RelationshipFormData,
} from '../types/relationship';

export async function fetchRelationships(): Promise<RelationshipDefinitionWithEntities[]> {
  const { data, error } = await supabase
    .from('relationship_definition')
    .select(`
      *,
      source_entity:entity_definition!source_entity_id(display_name, logical_name),
      target_entity:entity_definition!target_entity_id(display_name, logical_name),
      lookup_field:field_definition!source_lookup_field_id(display_name, physical_column_name)
    `)
    .order('display_name', { ascending: true });

  if (error) throw error;

  return (data as unknown[]).map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const src = r.source_entity as { display_name: string; logical_name: string } | null;
    const tgt = r.target_entity as { display_name: string; logical_name: string } | null;
    const fld = r.lookup_field as { display_name: string; physical_column_name: string } | null;
    return {
      ...(r as unknown as RelationshipDefinition),
      source_entity_display_name: src?.display_name ?? '',
      target_entity_display_name: tgt?.display_name ?? '',
      source_entity_name: src?.logical_name ?? undefined,
      target_entity_name: tgt?.logical_name ?? undefined,
      lookup_field_display_name: fld?.display_name ?? undefined,
      lookup_field_physical_column: fld?.physical_column_name ?? undefined,
    } as RelationshipDefinitionWithEntities;
  });
}

export async function fetchRelationshipsForEntity(
  entityId: string
): Promise<RelationshipDefinitionWithEntities[]> {
  const { data, error } = await supabase
    .from('relationship_definition')
    .select(`
      *,
      source_entity:entity_definition!source_entity_id(display_name, logical_name, physical_table_name),
      target_entity:entity_definition!target_entity_id(display_name, logical_name, physical_table_name),
      lookup_field:field_definition!source_lookup_field_id(display_name, physical_column_name)
    `)
    .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`)
    .eq('is_active', true)
    .order('display_name', { ascending: true });

  if (error) throw error;

  return (data as unknown[]).map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const src = r.source_entity as { display_name: string; logical_name: string; physical_table_name: string } | null;
    const tgt = r.target_entity as { display_name: string; logical_name: string; physical_table_name: string } | null;
    const fld = r.lookup_field as { display_name: string; physical_column_name: string } | null;
    return {
      ...(r as unknown as RelationshipDefinition),
      source_entity_display_name: src?.display_name ?? '',
      target_entity_display_name: tgt?.display_name ?? '',
      source_entity_name: src?.logical_name ?? undefined,
      target_entity_name: tgt?.logical_name ?? undefined,
      target_entity_table_name: tgt?.physical_table_name ?? undefined,
      lookup_field_display_name: fld?.display_name ?? undefined,
      lookup_field_physical_column: fld?.physical_column_name ?? undefined,
    } as RelationshipDefinitionWithEntities;
  });
}

export async function fetchRelationshipsBetween(
  sourceEntityId: string,
  targetEntityId: string
): Promise<RelationshipDefinition[]> {
  const { data, error } = await supabase
    .from('relationship_definition')
    .select('*')
    .eq('source_entity_id', sourceEntityId)
    .eq('target_entity_id', targetEntityId)
    .eq('is_active', true)
    .order('display_name', { ascending: true });

  if (error) throw error;
  return data as RelationshipDefinition[];
}

export async function createRelationship(
  form: RelationshipFormData
): Promise<RelationshipDefinition> {
  const { data, error } = await supabase
    .from('relationship_definition')
    .insert({ ...form, is_system: false })
    .select()
    .single();

  if (error) throw error;
  return data as RelationshipDefinition;
}

export async function updateRelationship(
  id: string,
  form: Partial<RelationshipFormData>
): Promise<RelationshipDefinition> {
  const { data, error } = await supabase
    .from('relationship_definition')
    .update({ ...form, modified_at: new Date().toISOString() })
    .eq('relationship_definition_id', id)
    .select()
    .single();

  if (error) throw error;
  return data as RelationshipDefinition;
}

/**
 * Creates the N:1 (lookup side) and 1:N (reverse side) relationship pair
 * automatically when a lookup field is added to an entity.
 *
 * sourceEntityId  = entity that owns the lookup field (referencing/child)
 * targetEntityId  = entity the lookup points to (referenced/parent)
 * lookupFieldId   = the newly-created lookup field definition id
 * sourceDisplayName / targetDisplayName = human-readable entity names
 * fieldDisplayName = display name of the lookup field (used to name the relationship)
 */
export async function createLookupRelationshipPair(params: {
  sourceEntityId: string;
  targetEntityId: string;
  lookupFieldId: string;
  sourceLogicalName: string;
  targetLogicalName: string;
  sourceDisplayName: string;
  targetDisplayName: string;
  fieldLogicalName: string;
  fieldDisplayName: string;
}): Promise<{ n1: RelationshipDefinition; oneN: RelationshipDefinition }> {
  const {
    sourceEntityId, targetEntityId, lookupFieldId,
    sourceLogicalName, targetLogicalName,
    sourceDisplayName, targetDisplayName,
    fieldLogicalName,
  } = params;

  const baseName = `${sourceLogicalName}_${fieldLogicalName}`;

  // N:1 — source (child) → target (parent), stored on source via the lookup field
  const { data: n1Data, error: n1Error } = await supabase
    .from('relationship_definition')
    .insert({
      name: baseName,
      display_name: `${sourceDisplayName} → ${targetDisplayName}`,
      reverse_display_name: `${targetDisplayName} → ${sourceDisplayName}s`,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      relationship_type: 'N:1',
      relationship_storage_type: 'lookup',
      source_lookup_field_id: lookupFieldId,
      junction_table: null,
      junction_source_fk: null,
      junction_target_fk: null,
      is_active: true,
      is_system: false,
    })
    .select()
    .single();
  if (n1Error) throw n1Error;

  // 1:N — target (parent) → source (child), reverse side, same FK field
  const reverseName = `${targetLogicalName}_${sourceLogicalName}s`;
  const { data: oneNData, error: oneNError } = await supabase
    .from('relationship_definition')
    .insert({
      name: reverseName,
      display_name: `${targetDisplayName} → ${sourceDisplayName}s`,
      reverse_display_name: `${sourceDisplayName} → ${targetDisplayName}`,
      source_entity_id: targetEntityId,
      target_entity_id: sourceEntityId,
      relationship_type: '1:N',
      relationship_storage_type: 'lookup',
      source_lookup_field_id: lookupFieldId,
      junction_table: null,
      junction_source_fk: null,
      junction_target_fk: null,
      is_active: true,
      is_system: false,
    })
    .select()
    .single();
  if (oneNError) throw oneNError;

  return { n1: n1Data as RelationshipDefinition, oneN: oneNData as RelationshipDefinition };
}

export async function deleteRelationship(id: string): Promise<void> {
  const { data: rel, error: fetchError } = await supabase
    .from('relationship_definition')
    .select('is_system')
    .eq('relationship_definition_id', id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (rel?.is_system) throw new Error('System relationships cannot be deleted.');

  const { error } = await supabase
    .from('relationship_definition')
    .delete()
    .eq('relationship_definition_id', id)
    .eq('is_system', false);

  if (error) throw error;
}
