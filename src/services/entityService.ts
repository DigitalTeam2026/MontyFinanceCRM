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

/**
 * Creates the physical PostgreSQL table AND the entity_definition metadata in one
 * atomic server-side operation. Use this for all new custom entity creation.
 * Falls back to createEntity (metadata-only) only when explicitly requested.
 */
export async function createEntityWithTable(form: EntityFormData): Promise<EntityDefinition> {
  const { data, error } = await supabase.rpc('create_crm_entity', {
    p_logical_name:        form.logical_name,
    p_display_name:        form.display_name,
    p_display_name_plural: form.display_name_plural,
    p_physical_table_name: form.physical_table_name,
    p_primary_field_name:  form.primary_field_name,
    p_description:         form.description ?? null,
    p_icon_name:           form.icon_name ?? null,
    p_ownership_type:      form.ownership_type,
    p_enable_activities:   form.enable_activities,
    p_enable_notes:        form.enable_notes,
    p_enable_audit:        form.enable_audit,
    p_allow_timeline:      form.allow_timeline,
    p_is_active:           form.is_active,
  });

  if (error) {
    // PostgrestError is not instanceof Error — convert so callers see the real message
    throw new Error(error.message ?? 'create_crm_entity RPC failed');
  }

  const result = data as { ok: boolean; entity?: Record<string, unknown>; error?: string } | null;
  if (!result?.ok) throw new Error(result?.error ?? 'Failed to create entity');

  supabase.rpc('sync_system_admin_privileges').then(() => {}, () => {});
  return result.entity as unknown as EntityDefinition;
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
  supabase.rpc('sync_system_admin_privileges').then(() => {}, () => {});
  return data as EntityDefinition;
}

/** Checks whether the physical table for a custom entity exists in the database. */
export async function checkEntityTableHealth(entityId: string): Promise<{
  tableExists: boolean;
  tableName: string;
  isCustom: boolean;
}> {
  const { data, error } = await supabase.rpc('entity_table_health', { p_entity_id: entityId });
  if (error) throw error;
  const result = data as {
    ok: boolean;
    table_exists: boolean;
    table_name: string;
    is_custom: boolean;
    error?: string;
  } | null;
  if (!result?.ok) throw new Error(result?.error ?? 'Health check failed');
  return {
    tableExists: result.table_exists,
    tableName: result.table_name,
    isCustom: result.is_custom,
  };
}

/** Creates the missing physical table for a custom entity whose metadata already exists. */
export async function repairEntityTable(entityId: string): Promise<string> {
  const { data, error } = await supabase.rpc('repair_crm_entity_table', { p_entity_id: entityId });
  if (error) throw error;
  const result = data as {
    ok: boolean;
    message: string;
    already_existed: boolean;
    error?: string;
  } | null;
  if (!result?.ok) throw new Error(result?.error ?? 'Repair failed');
  return result.message;
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
