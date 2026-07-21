import { supabase } from '../lib/supabase';
import type { CrmDocument } from '../types/documentLocation';

import { FILE_SERVER_URL } from './fileServerUrl';

async function authToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('You must be signed in to manage documents.');
  return token;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error ?? `Request failed (${res.status}).`;
  } catch {
    return `Request failed (${res.status}).`;
  }
}

/**
 * Upload a file for a record: the file server writes it under a per-day folder
 * (<root>/YYYY/MM/DD/<recordId>/<fileName>) and returns the stored relative_path,
 * which we register in crm_document. Reads/renames/deletes use that stored path,
 * so files filed on any day resolve correctly.
 */
export async function uploadDocument(
  entityLogicalName: string,
  recordId: string,
  file: File
): Promise<CrmDocument> {
  const token = await authToken();
  const res = await fetch(`${FILE_SERVER_URL}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-entity': entityLogicalName,
      'x-record-id': recordId,
      'x-file-name': encodeURIComponent(file.name),
    },
    body: file,
  });
  if (!res.ok) throw new Error(await readError(res));
  const { relativePath, absolutePath, byteSize, storageType } = await res.json();

  const { data, error } = await supabase
    .from('crm_document')
    .insert({
      entity_logical_name: entityLogicalName,
      record_id: recordId,
      file_name: file.name,
      relative_path: relativePath,
      absolute_path: absolutePath ?? null,
      storage_type: storageType ?? 'local',
      content_type: file.type || null,
      byte_size: byteSize ?? file.size,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CrmDocument;
}

export interface ProvisionResult {
  relativePath: string;
  absolutePath: string | null;
  created: boolean;
  storageType: string;
}

/**
 * Ensure today's storage folder for a record exists (<root>/YYYY/MM/DD/<recordId>/)
 * right after the record is created. Best-effort: returns the relative path so
 * callers can seed document_path (a hint — later uploads land in their own day
 * folder). Throws if no Document Location is configured for the entity.
 */
export async function provisionRecordStorage(
  entityLogicalName: string,
  recordId: string
): Promise<ProvisionResult> {
  const token = await authToken();
  const res = await fetch(`${FILE_SERVER_URL}/provision`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity: entityLogicalName, recordId }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as ProvisionResult;
}

export interface BatchProvisionItem {
  recordId: string;
  /** ISO timestamp of the record's creation — the day folder to (re)build under. */
  on?: string | null;
}

export interface BatchProvisionResult {
  recordId: string;
  ok: boolean;
  created?: boolean;
  relativePath?: string;
  error?: string;
}

/** Max records per /provision/batch call — must match PROVISION_BATCH_MAX on the file server. */
export const PROVISION_BATCH_SIZE = 200;

/**
 * Ensure folders exist for many records of one entity in a single round trip.
 * Used by the Document Location "Repair folders" sweep. Idempotent: a record
 * that already has a folder comes back with created:false. Per-record failures
 * are reported in the results array rather than throwing, so one inaccessible
 * record doesn't abort the run; only a transport/config failure throws.
 */
export async function provisionRecordStorageBatch(
  entityLogicalName: string,
  records: BatchProvisionItem[]
): Promise<BatchProvisionResult[]> {
  if (records.length === 0) return [];
  const token = await authToken();
  const res = await fetch(`${FILE_SERVER_URL}/provision/batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity: entityLogicalName, records }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = await res.json();
  return (body?.results ?? []) as BatchProvisionResult[];
}

/** Resolve a set of user ids to display names (for "Uploaded by"). */
export async function fetchUserDisplayMap(ids: (string | null)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (unique.length === 0) return {};
  const { data, error } = await supabase.rpc('fn_get_user_display_map', { p_user_ids: unique });
  if (error) return {};
  const map: Record<string, string> = {};
  for (const u of (data ?? []) as { user_id: string; display_name: string }[]) {
    map[u.user_id] = u.display_name;
  }
  return map;
}

/** List documents registered for a record. */
export async function listDocuments(entityLogicalName: string, recordId: string): Promise<CrmDocument[]> {
  const { data, error } = await supabase
    .from('crm_document')
    .select('*')
    .eq('entity_logical_name', entityLogicalName)
    .eq('record_id', recordId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CrmDocument[];
}

/** Fetch a document's bytes and trigger a browser download. */
export async function downloadDocument(doc: CrmDocument): Promise<void> {
  const token = await authToken();
  const params = new URLSearchParams({
    entity: doc.entity_logical_name,
    recordId: doc.record_id,
    file: doc.file_name,
    relativePath: doc.relative_path,
  });
  const res = await fetch(`${FILE_SERVER_URL}/download?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.file_name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Rename the stored file in place and update its registry row. */
export async function renameDocument(doc: CrmDocument, newName: string): Promise<CrmDocument> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('File name cannot be empty.');
  if (trimmed === doc.file_name) return doc;

  const token = await authToken();
  const params = new URLSearchParams({
    entity: doc.entity_logical_name,
    recordId: doc.record_id,
    file: doc.file_name,
    relativePath: doc.relative_path,
  });
  const res = await fetch(`${FILE_SERVER_URL}/file?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-new-file-name': encodeURIComponent(trimmed),
    },
  });
  if (!res.ok) throw new Error(await readError(res));
  const { relativePath, absolutePath } = await res.json();

  const { data, error } = await supabase
    .from('crm_document')
    .update({
      file_name: trimmed,
      relative_path: relativePath,
      absolute_path: absolutePath ?? null,
    })
    .eq('document_id', doc.document_id)
    .select()
    .single();

  if (error) {
    // The file was renamed on disk but the registry update failed (e.g. RLS) —
    // undo the disk rename so storage and the database never drift apart.
    try {
      const undo = new URLSearchParams({
        entity: doc.entity_logical_name,
        recordId: doc.record_id,
        file: trimmed,
        relativePath,
      });
      await fetch(`${FILE_SERVER_URL}/file?${undo.toString()}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'x-new-file-name': encodeURIComponent(doc.file_name) },
      });
    } catch { /* best effort — leave disk as-is if the undo also fails */ }
    throw new Error(`Couldn't update the document record (${error.message}). The file name was reverted.`);
  }
  return data as CrmDocument;
}

/** Delete the stored file and its registry row. */
export async function deleteDocument(doc: CrmDocument): Promise<void> {
  const token = await authToken();
  const params = new URLSearchParams({
    entity: doc.entity_logical_name,
    recordId: doc.record_id,
    file: doc.file_name,
    relativePath: doc.relative_path,
  });
  const res = await fetch(`${FILE_SERVER_URL}/file?${params.toString()}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await readError(res));

  const { error } = await supabase
    .from('crm_document')
    .delete()
    .eq('document_id', doc.document_id);
  if (error) throw error;
}
