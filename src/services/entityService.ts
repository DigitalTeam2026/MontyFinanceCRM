import { supabase } from '../lib/supabase';
import type { EntityDefinition, EntityFormData } from '../types/entity';

export async function fetchEntities(): Promise<EntityDefinition[]> {
  const { data, error } = await supabase
    .from('entity_definition')
    .select('*')
    .is('deleted_at', null)
    .order('display_name', { ascending: true });

  if (error) throw error;
  return data as EntityDefinition[];
}

export async function createEntity(form: EntityFormData): Promise<EntityDefinition> {
  const { data, error } = await supabase
    .from('entity_definition')
    .insert({ ...form, is_custom: true })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error(`An entity with the logical name "${form.logical_name}" already exists.`);
    throw error;
  }
  // Ensure System Administrator always gets full access to any newly created entity.
  // The DB trigger handles this automatically; this call is a safety-net for edge cases.
  supabase.rpc('sync_system_admin_privileges').then(() => {}).catch(() => {});
  return data as EntityDefinition;
}

export async function updateEntity(
  id: string,
  form: Partial<EntityFormData>
): Promise<EntityDefinition> {
  const { data, error } = await supabase
    .from('entity_definition')
    .update({ ...form, modified_at: new Date().toISOString() })
    .eq('entity_definition_id', id)
    .select()
    .single();

  if (error) throw error;
  return data as EntityDefinition;
}

export async function softDeleteEntity(id: string): Promise<void> {
  const { data: entity, error: fetchError } = await supabase
    .from('entity_definition')
    .select('is_custom')
    .eq('entity_definition_id', id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!entity?.is_custom) throw new Error('System entities cannot be deleted.');

  const { error } = await supabase
    .from('entity_definition')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('entity_definition_id', id)
    .eq('is_custom', true);

  if (error) throw error;
}
