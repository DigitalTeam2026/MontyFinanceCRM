import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, UploadCloud, Search, Download, Pencil, Trash2, Loader2, Check, X, FolderCog,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import ConfirmDialog from '../../admin/components/ConfirmDialog';
import { getInitials } from '../utils/initials';
import {
  uploadDocument,
  listDocuments,
  downloadDocument,
  deleteDocument,
  renameDocument,
  fetchUserDisplayMap,
} from '../../services/documentService';
import { entityHasActiveDocumentLocation } from '../../services/documentLocationService';
import type { CrmDocument } from '../../types/documentLocation';

/**
 * Generic, reusable Documents tab. Works for ANY entity — pass the entity logical
 * name and record id; it resolves storage from the per-entity Document Location
 * config, enforces the entity's read/write privileges, and renders upload /
 * download / rename / delete. No per-entity code.
 */
interface DocumentsTabProps {
  entityType: string; // entity logical name, e.g. 'lead', 'account'
  recordId: string;
}

const MAX_MB = 25;

const FILE_TYPES: Record<string, { label: string; badge: string; color: string }> = {
  pdf:  { label: 'PDF document',  badge: 'PDF', color: 'bg-red-100 text-red-600' },
  doc:  { label: 'Word document', badge: 'DOC', color: 'bg-blue-100 text-blue-600' },
  docx: { label: 'Word document', badge: 'DOC', color: 'bg-blue-100 text-blue-600' },
  xls:  { label: 'Spreadsheet',   badge: 'XLS', color: 'bg-green-100 text-green-600' },
  xlsx: { label: 'Spreadsheet',   badge: 'XLS', color: 'bg-green-100 text-green-600' },
  csv:  { label: 'Spreadsheet',   badge: 'CSV', color: 'bg-green-100 text-green-600' },
  ppt:  { label: 'Presentation',  badge: 'PPT', color: 'bg-orange-100 text-orange-600' },
  pptx: { label: 'Presentation',  badge: 'PPT', color: 'bg-orange-100 text-orange-600' },
  png:  { label: 'Image',         badge: 'IMG', color: 'bg-purple-100 text-purple-600' },
  jpg:  { label: 'Image',         badge: 'IMG', color: 'bg-purple-100 text-purple-600' },
  jpeg: { label: 'Image',         badge: 'IMG', color: 'bg-purple-100 text-purple-600' },
  gif:  { label: 'Image',         badge: 'IMG', color: 'bg-purple-100 text-purple-600' },
  zip:  { label: 'Archive',       badge: 'ZIP', color: 'bg-amber-100 text-amber-600' },
  txt:  { label: 'Text file',     badge: 'TXT', color: 'bg-slate-100 text-slate-600' },
  html: { label: 'Web page',      badge: 'HTM', color: 'bg-sky-100 text-sky-600' },
};

function fileMeta(name: string) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return FILE_TYPES[ext] ?? { label: 'File', badge: ext ? ext.slice(0, 3).toUpperCase() : 'FILE', color: 'bg-slate-100 text-slate-600' };
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DocumentsTab({ entityType, recordId }: DocumentsTabProps) {
  const { showSuccess, showError } = useToast();
  const { getEntityPrivilege, permissions } = usePermissions();
  const priv = getEntityPrivilege(entityType);
  const canRead = priv.can_read;
  const canWrite = priv.can_write;
  const isAdmin = permissions.isSystemAdmin;

  const [docs, setDocs] = useState<CrmDocument[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CrmDocument | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, isConfigured] = await Promise.all([
        listDocuments(entityType, recordId),
        entityHasActiveDocumentLocation(entityType),
      ]);
      setDocs(list);
      setConfigured(isConfigured);
      setNames(await fetchUserDisplayMap(list.map((d) => d.uploaded_by)));
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [entityType, recordId]);

  useEffect(() => { load(); }, [load]);

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const tooBig = arr.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) {
      showError(`"${tooBig.name}" exceeds the ${MAX_MB} MB limit.`);
      return;
    }
    setUploading(true);
    try {
      for (const file of arr) await uploadDocument(entityType, recordId, file);
      await load();
      showSuccess(arr.length > 1 ? `${arr.length} files uploaded` : 'File uploaded');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDownload = async (doc: CrmDocument) => {
    setBusyId(doc.document_id);
    try { await downloadDocument(doc); }
    catch (e: unknown) { showError(e instanceof Error ? e.message : String(e)); }
    finally { setBusyId(null); }
  };

  const startRename = (doc: CrmDocument) => { setEditingId(doc.document_id); setEditName(doc.file_name); };
  const cancelRename = () => { setEditingId(null); setEditName(''); };
  const handleRename = async (doc: CrmDocument) => {
    const next = editName.trim();
    if (!next || next === doc.file_name) return cancelRename();
    setBusyId(doc.document_id);
    try {
      const updated = await renameDocument(doc, next);
      setDocs((prev) => prev.map((d) => (d.document_id === doc.document_id ? updated : d)));
      cancelRename();
      showSuccess('File renamed');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally { setBusyId(null); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.document_id);
    try {
      await deleteDocument(deleteTarget);
      setDocs((prev) => prev.filter((d) => d.document_id !== deleteTarget.document_id));
      setDeleteTarget(null);
      showSuccess('File deleted');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally { setBusyId(null); }
  };

  // Drag & drop (only meaningful when the user can write and storage is configured)
  const dndEnabled = canWrite && configured === true && !uploading;
  const onDragEnter = (e: React.DragEvent) => { if (!dndEnabled) return; e.preventDefault(); dragDepth.current += 1; setDragging(true); };
  const onDragOver = (e: React.DragEvent) => { if (!dndEnabled) return; e.preventDefault(); };
  const onDragLeave = (e: React.DragEvent) => { if (!dndEnabled) return; e.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } };
  const onDrop = (e: React.DragEvent) => { if (!dndEnabled) return; e.preventDefault(); dragDepth.current = 0; setDragging(false); handleFiles(e.dataTransfer.files); };

  if (!canRead) {
    return <div className="py-12 text-center text-sm text-gray-400">You don't have permission to view documents for this record.</div>;
  }

  const filtered = query.trim()
    ? docs.filter((d) => d.file_name.toLowerCase().includes(query.trim().toLowerCase()))
    : docs;

  const fileInput = (
    <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
  );

  const uploadBtn = canWrite && configured === true && (
    <button
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3.5 py-2 transition-colors disabled:opacity-50"
    >
      {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
      {uploading ? 'Uploading…' : 'Upload'}
    </button>
  );

  return (
    <div
      className="border border-gray-200 rounded-xl bg-white relative"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {fileInput}

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-gray-800">Documents</span>
          <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 min-w-[22px] text-center">{docs.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {docs.length > 0 && (
            <div className="relative hidden sm:block">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents…"
                className="text-xs border border-gray-200 rounded-lg pl-8 pr-3 py-2 w-56 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          )}
          {uploadBtn}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : configured === false ? (
        <NotConfigured isAdmin={isAdmin} />
      ) : docs.length === 0 ? (
        <EmptyState canWrite={canWrite} dragging={dragging} onBrowse={() => inputRef.current?.click()} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-5 py-2.5">Name</th>
                <th className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2.5 w-24">Size</th>
                <th className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2.5 w-44">Uploaded by</th>
                <th className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2.5 w-32">Date</th>
                <th className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-5 py-2.5 w-28 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((doc) => {
                const meta = fileMeta(doc.file_name);
                const uploader = doc.uploaded_by ? (names[doc.uploaded_by] ?? '') : '';
                const isEditing = editingId === doc.document_id;
                const rowBusy = busyId === doc.document_id;
                return (
                  <tr key={doc.document_id} className="group hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold ${meta.color}`}>{meta.badge}</span>
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(doc); if (e.key === 'Escape') cancelRename(); }}
                            disabled={rowBusy}
                            className="flex-1 min-w-0 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        ) : (
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{doc.file_name}</p>
                            <p className="text-[11px] text-gray-400">{meta.label}</p>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">{formatSize(doc.byte_size)}</td>
                    <td className="px-3 py-3">
                      {uploader ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">{getInitials(uploader)}</span>
                          <span className="text-xs text-gray-600 truncate">{uploader}</span>
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">{formatDate(doc.uploaded_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={() => handleRename(doc)} disabled={rowBusy} title="Save" className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 disabled:opacity-40">
                              {rowBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            </button>
                            <button onClick={cancelRename} disabled={rowBusy} title="Cancel" className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-40">
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => handleDownload(doc)} disabled={rowBusy} title="Download" className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-40">
                              {rowBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            </button>
                            {canWrite && (
                              <>
                                <button onClick={() => startRename(doc)} disabled={rowBusy} title="Rename" className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40">
                                  <Pencil size={14} />
                                </button>
                                <button onClick={() => setDeleteTarget(doc)} disabled={rowBusy} title="Delete" className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40">
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-xs text-gray-400">No documents match "{query}".</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Drag overlay */}
      {dragging && (
        <div className="absolute inset-0 rounded-xl bg-blue-50/90 border-2 border-dashed border-blue-400 flex flex-col items-center justify-center pointer-events-none z-10">
          <UploadCloud size={28} className="text-blue-500 mb-2" />
          <p className="text-sm font-semibold text-blue-600">Drop files to upload</p>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete document"
          message={`Delete "${deleteTarget.file_name}"? This removes the file from storage and cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ canWrite, dragging, onBrowse }: { canWrite: boolean; dragging: boolean; onBrowse: () => void }) {
  return (
    <div className="p-5">
      <div className={`rounded-xl border-2 border-dashed transition-colors ${dragging ? 'border-blue-400 bg-blue-50/60' : 'border-gray-200'} py-12 flex flex-col items-center justify-center text-center`}>
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
          <UploadCloud size={24} className="text-blue-500" />
        </div>
        <p className="text-sm font-semibold text-gray-700">No documents yet</p>
        {canWrite ? (
          <p className="text-xs text-gray-500 mt-1">
            Drag &amp; drop files here, or{' '}
            <button onClick={onBrowse} className="text-blue-600 font-semibold hover:underline">browse from your computer</button>
          </p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">No files have been uploaded for this record.</p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
          {['PDF', 'DOCX', 'XLSX', 'PPTX', 'PNG / JPG', `Max ${MAX_MB} MB`].map((c) => (
            <span key={c} className="text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded px-2 py-1">{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotConfigured({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="py-14 flex flex-col items-center justify-center text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
        <FolderCog size={24} className="text-amber-500" />
      </div>
      <p className="text-sm font-semibold text-gray-700">Document storage not configured</p>
      {isAdmin ? (
        <p className="text-xs text-gray-500 mt-1 max-w-sm">
          Set a storage root for this entity in <span className="font-semibold text-gray-700">Admin Studio → Document Location</span>, then files can be uploaded here.
        </p>
      ) : (
        <p className="text-xs text-gray-500 mt-1 max-w-sm">
          Documents are enabled for this record, but storage hasn't been set up yet. Please contact an administrator.
        </p>
      )}
    </div>
  );
}
