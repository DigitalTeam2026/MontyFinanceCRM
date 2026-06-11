import { supabase } from '../lib/supabase';
import type { DocumentLocationConfig } from '../types/documentLocation';

/** List all per-entity document location configs (admin view). */
export async function fetchDocumentLocations(): Promise<DocumentLocationConfig[]> {
  const { data, error } = await supabase
    .from('document_location_config')
    .select('*')
    .order('entity_display_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DocumentLocationConfig[];
}

/** Create or update the root location for an entity (admin only, enforced by RLS). */
export async function upsertDocumentLocation(
  config: Pick<DocumentLocationConfig, 'entity_logical_name' | 'entity_display_name' | 'root_location' | 'is_active'>
): Promise<DocumentLocationConfig> {
  const { data, error } = await supabase
    .from('document_location_config')
    .upsert(
      { ...config, modified_at: new Date().toISOString() },
      { onConflict: 'entity_logical_name' }
    )
    .select()
    .single();
  if (error) throw error;
  return data as DocumentLocationConfig;
}

/** Remove the document location config for an entity. */
export async function deleteDocumentLocation(entityLogicalName: string): Promise<void> {
  const { error } = await supabase
    .from('document_location_config')
    .delete()
    .eq('entity_logical_name', entityLogicalName);
  if (error) throw error;
}
