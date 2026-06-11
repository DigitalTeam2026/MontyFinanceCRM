import { supabase } from '../lib/supabase';
import type { CrmDocument } from '../types/documentLocation';

const FILE_SERVER_URL = (import.meta.env.VITE_FILE_SERVER_URL as string | undefined) ?? 'http://localhost:4000';

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
 * Upload a file for a record: the file server writes it to <root>/<recordId>/<fileName>,
 * then we register the returned path in crm_document.
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
  const { relativePath, absolutePath, byteSize } = await res.json();

  const { data, error } = await supabase
    .from('crm_document')
    .insert({
      entity_logical_name: entityLogicalName,
      record_id: recordId,
      file_name: file.name,
      relative_path: relativePath,
      absolute_path: absolutePath ?? null,
      content_type: file.type || null,
      byte_size: byteSize ?? file.size,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CrmDocument;
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

/** Delete the stored file and its registry row. */
export async function deleteDocument(doc: CrmDocument): Promise<void> {
  const token = await authToken();
  const params = new URLSearchParams({
    entity: doc.entity_logical_name,
    recordId: doc.record_id,
    file: doc.file_name,
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
