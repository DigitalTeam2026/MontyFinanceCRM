import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, FileText, Download, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import {
  uploadDocument,
  listDocuments,
  downloadDocument,
  deleteDocument,
} from '../../services/documentService';
import type { CrmDocument } from '../../types/documentLocation';

interface DocumentUploaderProps {
  /** Entity logical name, e.g. 'lead'. Must match a configured Document Location. */
  entityLogicalName: string;
  /** The parent record's id. Files land in <root>/<recordId>/. */
  recordId: string;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentUploader({ entityLogicalName, recordId }: DocumentUploaderProps) {
  const { showSuccess, showError } = useToast();
  const [docs, setDocs] = useState<CrmDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await listDocuments(entityLogicalName, recordId));
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [entityLogicalName, recordId]);

  useEffect(() => { load(); }, [load]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadDocument(entityLogicalName, recordId, file);
      }
      await load();
      showSuccess(files.length > 1 ? `${files.length} files uploaded` : 'File uploaded');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDownload = async (doc: CrmDocument) => {
    setBusyId(doc.document_id);
    try {
      await downloadDocument(doc);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (doc: CrmDocument) => {
    setBusyId(doc.document_id);
    try {
      await deleteDocument(doc);
      setDocs((prev) => prev.filter((d) => d.document_id !== doc.document_id));
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">Documents</span>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 size={16} className="animate-spin text-gray-400" />
        </div>
      ) : docs.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {docs.map((doc) => (
            <li key={doc.document_id} className="flex items-center gap-3 py-2">
              <FileText size={15} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{doc.file_name}</p>
                <p className="text-[11px] text-gray-400 font-mono truncate">{doc.relative_path}{doc.byte_size ? ` · ${formatSize(doc.byte_size)}` : ''}</p>
              </div>
              <button
                onClick={() => handleDownload(doc)}
                disabled={busyId === doc.document_id}
                title="Download"
                className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-40"
              >
                <Download size={14} />
              </button>
              <button
                onClick={() => handleDelete(doc)}
                disabled={busyId === doc.document_id}
                title="Delete"
                className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
