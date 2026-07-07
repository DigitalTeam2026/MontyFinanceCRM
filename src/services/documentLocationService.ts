import { supabase } from '../lib/supabase';
import type { DocumentLocationConfig, StorageCredentials } from '../types/documentLocation';
import { FILE_SERVER_URL } from './fileServerUrl';

/** List all per-entity document location configs (admin view). */
export async function fetchDocumentLocations(): Promise<DocumentLocationConfig[]> {
  const { data, error } = await supabase
    .from('document_location_config')
    .select('*')
    .order('entity_display_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DocumentLocationConfig[];
}

/** Whether an entity has an active Document Location configured (i.e. storage is set up). */
export async function entityHasActiveDocumentLocation(entityLogicalName: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('document_location_config')
    .select('is_active')
    .eq('entity_logical_name', entityLogicalName)
    .maybeSingle();
  if (error) return false;
  return data?.is_active === true;
}

/**
 * Whether the Documents tab should appear for an entity. Driven by the
 * entity_definition.documents_enabled toggle (Admin Studio). Falls back to
 * "has an active Document Location" when the column doesn't exist yet
 * (pre-migration), so the tab keeps working during rollout.
 */
export async function entityDocumentsTabEnabled(entityLogicalName: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('entity_definition')
    .select('documents_enabled')
    .eq('logical_name', entityLogicalName)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return entityHasActiveDocumentLocation(entityLogicalName);
  if (data && typeof data.documents_enabled === 'boolean') return data.documents_enabled;
  return entityHasActiveDocumentLocation(entityLogicalName);
}

/** Create or update the storage config for an entity (admin only, enforced by RLS). */
export async function upsertDocumentLocation(
  config: Pick<DocumentLocationConfig, 'entity_logical_name' | 'entity_display_name' | 'root_location' | 'storage_type' | 'is_active'>
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

/**
 * Save S3 / SharePoint credentials for an entity to Supabase Vault (admin only).
 * The payload is written encrypted; it can never be read back into the browser.
 */
export async function setStorageSecret(entityLogicalName: string, payload: StorageCredentials): Promise<void> {
  const { error } = await supabase.rpc('set_storage_secret', { p_entity: entityLogicalName, p_payload: payload });
  if (error) throw error;
}

/** Whether an entity has credentials saved in Vault (boolean only — never the value). */
export async function hasStorageSecret(entityLogicalName: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_storage_secret', { p_entity: entityLogicalName });
  if (error) throw error;
  return data === true;
}

/** Remove an entity's stored credentials. */
export async function deleteStorageSecret(entityLogicalName: string): Promise<void> {
  const { error } = await supabase.rpc('delete_storage_secret', { p_entity: entityLogicalName });
  if (error) throw error;
}

/** Ask the file server to verify it can reach the entity's saved storage location. */
export async function testStorageConnection(entityLogicalName: string): Promise<{ ok: boolean; message: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('You must be signed in.');
  const params = new URLSearchParams({ entity: entityLogicalName });
  let res: Response;
  try {
    res = await fetch(`${FILE_SERVER_URL}/test-connection?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, message: `File server unreachable at ${FILE_SERVER_URL}. Is it running?` };
  }
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.ok !== false, message: body.message ?? (res.ok ? 'Reachable.' : `Failed (${res.status}).`) };
}
