import { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, StickyNote, Calendar, Mail, Paperclip, Plus, ChevronDown, ChevronUp, Trash2, CreditCard as Edit2, Pin, PinOff, Send, Inbox, CheckCircle2, XCircle, RefreshCw, Loader2, AlertCircle, X, Check, Upload, Share2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { TimelineEntry, TimelineNote, TimelineAppointment, TimelineEmail, TimelineAttachment } from '../../../types/timeline';
import {
  fetchTimelineEntries,
  createNote, updateNote, deleteNote, togglePinNote,
  createAppointment, updateAppointment, deleteAppointment,
  createEmail, updateEmail, deleteEmail,
  createAttachment, deleteAttachment,
} from '../../services/timelineService';
import { usePermissions } from '../../context/PermissionContext';
import { isRecordAccessible } from '../../services/permissionService';
import ShareRecordModal from '../ShareRecordModal';

type ActivityFilter = 'all' | 'note' | 'appointment' | 'email' | 'attachment';

interface TimelinePanelProps {
  entityName: string;
  recordId: string;
  userId: string;
  readonly?: boolean;
}

export default function TimelinePanel({ entityName, recordId, userId, readonly = false }: TimelinePanelProps) {
  const { permissions } = usePermissions();
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [composing, setComposing] = useState<'note' | 'appointment' | 'email' | null>(null);
  const [shareTarget, setShareTarget] = useState<{ entityName: string; recordId: string; label: string } | null>(null);

  // Per-activity privilege helpers
  const notePriv       = permissions.isSystemAdmin ? null : permissions.entityPrivileges['note'];
  const apptPriv       = permissions.isSystemAdmin ? null : permissions.entityPrivileges['appointment'];
  const emailPriv      = permissions.isSystemAdmin ? null : permissions.entityPrivileges['email'];
  const attachPriv     = permissions.isSystemAdmin ? null : permissions.entityPrivileges['attachment'];

  const canPriv = (priv: typeof notePriv, action: 'can_create' | 'can_read' | 'can_write' | 'can_delete', ownerId?: string | null) => {
    if (permissions.isSystemAdmin) return true;
    if (!priv || !priv[action]) return false;
    if (action === 'can_create') return true;
    const levelKey = action === 'can_read' ? 'read_access_level' : action === 'can_write' ? 'write_access_level' : 'delete_access_level';
    return isRecordAccessible(priv[levelKey], ownerId ?? null, permissions.accessContext);
  };

  const canSharePriv = (priv: typeof notePriv, ownerId?: string | null) => {
    if (permissions.isSystemAdmin) return true;
    if (!priv || !priv.can_share) return false;
    return isRecordAccessible(priv.share_access_level, ownerId ?? null, permissions.accessContext);
  };

  const canCreateNote    = canPriv(notePriv,   'can_create');
  const canCreateAppt    = canPriv(apptPriv,   'can_create');
  const canCreateEmail   = canPriv(emailPriv,  'can_create');
  const canCreateAttach  = canPriv(attachPriv, 'can_create');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTimelineEntries(entityName, recordId);
      setEntries(data);
    } catch {
      setError('Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [entityName, recordId]);

  useEffect(() => { load(); }, [load]);

  const visibleEntries = entries.filter((e) => {
    if (e.kind === 'note'        && !canPriv(notePriv,   'can_read')) return false;
    if (e.kind === 'appointment' && !canPriv(apptPriv,   'can_read')) return false;
    if (e.kind === 'email'       && !canPriv(emailPriv,  'can_read')) return false;
    if (e.kind === 'attachment'  && !canPriv(attachPriv, 'can_read')) return false;
    return true;
  });
  const filtered = filter === 'all' ? visibleEntries : visibleEntries.filter((e) => e.kind === filter);

  const pinnedNotes = visibleEntries.filter((e): e is Extract<TimelineEntry, { kind: 'note' }> => e.kind === 'note' && e.data.is_pinned);

  const handleNoteCreated = (note: TimelineNote) => {
    setEntries((prev) => [{ kind: 'note', data: note, sortDate: note.created_at }, ...prev]);
    setComposing(null);
  };

  const handleAppointmentCreated = (appt: TimelineAppointment) => {
    setEntries((prev) => [{ kind: 'appointment', data: appt, sortDate: appt.created_at }, ...prev]);
    setComposing(null);
  };

  const handleEmailCreated = (email: TimelineEmail) => {
    setEntries((prev) => [{ kind: 'email', data: email, sortDate: email.created_at }, ...prev]);
    setComposing(null);
  };

  const handleAttachmentCreated = (attachment: TimelineAttachment) => {
    setEntries((prev) => [{ kind: 'attachment', data: attachment, sortDate: attachment.created_at }, ...prev]);
  };

  const handleNoteUpdated = (note: TimelineNote) => {
    setEntries((prev) => prev.map((e) => e.kind === 'note' && e.data.note_id === note.note_id ? { ...e, data: note } : e));
  };

  const handleAppointmentUpdated = (appt: TimelineAppointment) => {
    setEntries((prev) => prev.map((e) => e.kind === 'appointment' && e.data.appointment_id === appt.appointment_id ? { ...e, data: appt } : e));
  };

  const handleEmailUpdated = (email: TimelineEmail) => {
    setEntries((prev) => prev.map((e) => e.kind === 'email' && e.data.email_id === email.email_id ? { ...e, data: email } : e));
  };

  const handleDelete = (kind: TimelineEntry['kind'], id: string) => {
    setEntries((prev) => prev.filter((e) => {
      if (e.kind !== kind) return true;
      if (kind === 'note') return (e as Extract<TimelineEntry, { kind: 'note' }>).data.note_id !== id;
      if (kind === 'appointment') return (e as Extract<TimelineEntry, { kind: 'appointment' }>).data.appointment_id !== id;
      if (kind === 'email') return (e as Extract<TimelineEntry, { kind: 'email' }>).data.email_id !== id;
      if (kind === 'attachment') return (e as Extract<TimelineEntry, { kind: 'attachment' }>).data.attachment_id !== id;
      return true;
    }));
  };

  const canReadNote    = canPriv(notePriv,   'can_read');
  const canReadAppt    = canPriv(apptPriv,   'can_read');
  const canReadEmail   = canPriv(emailPriv,  'can_read');
  const canReadAttach  = canPriv(attachPriv, 'can_read');

  const FILTERS: { id: ActivityFilter; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'All', icon: <Clock size={12} /> },
    ...(canReadNote    ? [{ id: 'note'        as ActivityFilter, label: 'Notes',        icon: <StickyNote size={12} /> }] : []),
    ...(canReadAppt    ? [{ id: 'appointment' as ActivityFilter, label: 'Appointments', icon: <Calendar size={12} /> }]   : []),
    ...(canReadEmail   ? [{ id: 'email'       as ActivityFilter, label: 'Emails',       icon: <Mail size={12} /> }]       : []),
    ...(canReadAttach  ? [{ id: 'attachment'  as ActivityFilter, label: 'Attachments',  icon: <Paperclip size={12} /> }]  : []),
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Timeline</span>
          <span className="text-xs text-slate-400 font-medium bg-slate-100 px-1.5 py-0.5 rounded-full">{visibleEntries.length}</span>
        </div>
        {!readonly && (canCreateNote || canCreateAppt || canCreateEmail || canCreateAttach) && (
          <div className="flex items-center gap-1">
            {canCreateNote  && <QuickAddButton icon={<StickyNote size={13} />} label="Note" onClick={() => setComposing('note')} />}
            {canCreateAppt  && <QuickAddButton icon={<Calendar size={13} />} label="Appointment" onClick={() => setComposing('appointment')} />}
            {canCreateEmail && <QuickAddButton icon={<Mail size={13} />} label="Email" onClick={() => setComposing('email')} />}
            {canCreateAttach && (
              <AttachmentUploadButton
                entityName={entityName}
                recordId={recordId}
                userId={userId}
                onCreated={handleAttachmentCreated}
              />
            )}
          </div>
        )}
      </div>

      {/* Pinned notes */}
      {pinnedNotes.length > 0 && (
        <div className="border-b border-amber-100 bg-amber-50/50 px-4 py-2.5 space-y-1.5">
          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1">
            <Pin size={9} /> Pinned Notes
          </p>
          {pinnedNotes.map((e) => (
            <div key={e.data.note_id} className="text-xs text-amber-800 bg-amber-100/70 rounded-lg px-3 py-2">
              <span className="font-semibold">{e.data.title}</span>
              {e.data.body && <span className="ml-1.5 text-amber-700">{e.data.body.slice(0, 120)}{e.data.body.length > 120 ? '…' : ''}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Compose forms */}
      {composing === 'note' && (
        <NoteComposer
          entityName={entityName}
          recordId={recordId}
          userId={userId}
          onCreated={handleNoteCreated}
          onCancel={() => setComposing(null)}
        />
      )}
      {composing === 'appointment' && (
        <AppointmentComposer
          entityName={entityName}
          recordId={recordId}
          userId={userId}
          onCreated={handleAppointmentCreated}
          onCancel={() => setComposing(null)}
        />
      )}
      {composing === 'email' && (
        <EmailComposer
          entityName={entityName}
          recordId={recordId}
          userId={userId}
          onCreated={handleEmailCreated}
          onCancel={() => setComposing(null)}
        />
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors whitespace-nowrap ${
              filter === f.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {f.icon}{f.label}
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="Refresh timeline"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Entries */}
      <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 px-4 py-6 text-red-500 text-sm">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
            <Clock size={28} className="text-slate-200" />
            <p className="text-sm">No activities yet</p>
            {!readonly && <p className="text-xs">Use the buttons above to add a note, appointment, or email</p>}
          </div>
        )}

        {!loading && !error && filtered.map((entry) => {
          if (entry.kind === 'note') {
            const ownerId = entry.data.owner_id ?? null;
            const canWrite  = !readonly && canPriv(notePriv, 'can_write',  ownerId);
            const canDelete = !readonly && canPriv(notePriv, 'can_delete', ownerId);
            const canShare  = !readonly && canSharePriv(notePriv, ownerId);
            return (
              <NoteEntry
                key={entry.data.note_id}
                note={entry.data}
                userId={userId}
                canWrite={canWrite}
                canDelete={canDelete}
                canShare={canShare}
                onUpdated={handleNoteUpdated}
                onDeleted={() => handleDelete('note', entry.data.note_id)}
                onShare={() => setShareTarget({ entityName: 'note', recordId: entry.data.note_id, label: entry.data.title })}
              />
            );
          }
          if (entry.kind === 'appointment') {
            const ownerId = entry.data.owner_id ?? null;
            const canWrite  = !readonly && canPriv(apptPriv, 'can_write',  ownerId);
            const canDelete = !readonly && canPriv(apptPriv, 'can_delete', ownerId);
            const canShare  = !readonly && canSharePriv(apptPriv, ownerId);
            return (
              <AppointmentEntry
                key={entry.data.appointment_id}
                appt={entry.data}
                userId={userId}
                canWrite={canWrite}
                canDelete={canDelete}
                canShare={canShare}
                onUpdated={handleAppointmentUpdated}
                onDeleted={() => handleDelete('appointment', entry.data.appointment_id)}
                onShare={() => setShareTarget({ entityName: 'appointment', recordId: entry.data.appointment_id, label: entry.data.subject })}
              />
            );
          }
          if (entry.kind === 'email') {
            const ownerId = entry.data.owner_id ?? null;
            const canWrite  = !readonly && canPriv(emailPriv, 'can_write',  ownerId);
            const canDelete = !readonly && canPriv(emailPriv, 'can_delete', ownerId);
            const canShare  = !readonly && canSharePriv(emailPriv, ownerId);
            return (
              <EmailEntry
                key={entry.data.email_id}
                email={entry.data}
                canWrite={canWrite}
                canDelete={canDelete}
                canShare={canShare}
                onUpdated={handleEmailUpdated}
                onDeleted={() => handleDelete('email', entry.data.email_id)}
                onShare={() => setShareTarget({ entityName: 'email', recordId: entry.data.email_id, label: entry.data.subject })}
              />
            );
          }
          if (entry.kind === 'attachment') {
            const ownerId = entry.data.owner_id ?? null;
            const canDelete = !readonly && canPriv(attachPriv, 'can_delete', ownerId);
            const canShare  = !readonly && canSharePriv(attachPriv, ownerId);
            return (
              <AttachmentEntry
                key={entry.data.attachment_id}
                attachment={entry.data}
                canDelete={canDelete}
                canShare={canShare}
                onDeleted={() => handleDelete('attachment', entry.data.attachment_id)}
                onShare={() => setShareTarget({ entityName: 'attachment', recordId: entry.data.attachment_id, label: entry.data.file_name })}
              />
            );
          }
          return null;
        })}
      </div>
      {shareTarget && (
        <ShareRecordModal
          entity={shareTarget.entityName}
          recordId={shareTarget.recordId}
          recordLabel={shareTarget.label}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}

// ── Quick Add Button ──────────────────────────────────────────────────────────

function QuickAddButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`Add ${label}`}
      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors"
    >
      <Plus size={10} />{icon}{label}
    </button>
  );
}

// ── Attachment Upload Button ──────────────────────────────────────────────────

function AttachmentUploadButton({
  entityName, recordId, userId, onCreated,
}: {
  entityName: string;
  recordId: string;
  userId: string;
  onCreated: (a: TimelineAttachment) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? '';
      const path = `timeline/${entityName}/${recordId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
      const result = await createAttachment(entityName, recordId, {
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: ext || null,
        file_size_bytes: file.size,
        storage_path: path,
        uploaded_by: userId,
        created_by: userId,
      }, userId);
      onCreated(result);
    } catch {
      // silently fail — user can retry
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Attach file"
        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors disabled:opacity-50"
      >
        {uploading ? <Loader2 size={10} className="animate-spin" /> : <><Plus size={10} /><Paperclip size={12} /></>}
        Attach
      </button>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function EntryWrapper({ children, icon, date, onDelete, canDelete, onShare, canShare }: {
  children: React.ReactNode;
  icon: React.ReactNode;
  date: string;
  onDelete?: () => void;
  canDelete?: boolean;
  onShare?: () => void;
  canShare?: boolean;
}) {
  return (
    <div className="flex gap-3 px-4 py-3.5 group hover:bg-slate-50/50 transition-colors">
      <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-slate-100 text-slate-500 group-hover:bg-slate-200 transition-colors">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        {children}
        <p className="text-[10px] text-slate-400 mt-1">{formatRelativeDate(date)}</p>
      </div>
      <div className="flex items-start gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-all">
        {canShare && onShare && (
          <button
            onClick={onShare}
            className="p-1 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
            title="Share"
          >
            <Share2 size={12} />
          </button>
        )}
        {canDelete && onDelete && (
          <button
            onClick={onDelete}
            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Note Composer ─────────────────────────────────────────────────────────────

function NoteComposer({ entityName, recordId, userId, onCreated, onCancel }: {
  entityName: string; recordId: string; userId: string;
  onCreated: (n: TimelineNote) => void; onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const note = await createNote(entityName, recordId, title.trim(), body.trim(), userId);
      onCreated(note);
    } catch { setSaving(false); }
  };

  return (
    <div className="border-b border-blue-100 bg-blue-50/40 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <StickyNote size={13} className="text-amber-500" />
        <span className="text-xs font-semibold text-slate-700">New Note</span>
        <button onClick={onCancel} className="ml-auto text-slate-400 hover:text-slate-600"><X size={14} /></button>
      </div>
      <input
        autoFocus
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      />
      <textarea
        placeholder="Add details…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 rounded-lg">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Save Note
        </button>
      </div>
    </div>
  );
}

// ── Appointment Composer ──────────────────────────────────────────────────────

function AppointmentComposer({ entityName, recordId, userId, onCreated, onCancel }: {
  entityName: string; recordId: string; userId: string;
  onCreated: (a: TimelineAppointment) => void; onCancel: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!subject.trim()) return;
    setSaving(true);
    try {
      const appt = await createAppointment(entityName, recordId, {
        subject: subject.trim(),
        description: description.trim(),
        start_time: startTime || null,
        end_time: endTime || null,
        location: location.trim() || null,
        status: 'scheduled',
        owner_id: userId,
        created_by: userId,
        modified_by: userId,
      }, userId);
      onCreated(appt);
    } catch { setSaving(false); }
  };

  return (
    <div className="border-b border-green-100 bg-green-50/40 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Calendar size={13} className="text-green-600" />
        <span className="text-xs font-semibold text-slate-700">New Appointment</span>
        <button onClick={onCancel} className="ml-auto text-slate-400 hover:text-slate-600"><X size={14} /></button>
      </div>
      <input
        autoFocus
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="text-[10px] text-slate-500 font-medium block mb-0.5">Start</label>
          <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 font-medium block mb-0.5">End</label>
          <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
        </div>
      </div>
      <input
        placeholder="Location (optional)"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      />
      <textarea
        placeholder="Description…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 rounded-lg">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving || !subject.trim()}
          className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Save Appointment
        </button>
      </div>
    </div>
  );
}

// ── Email Composer ────────────────────────────────────────────────────────────

function EmailComposer({ entityName, recordId, userId, onCreated, onCancel }: {
  entityName: string; recordId: string; userId: string;
  onCreated: (e: TimelineEmail) => void; onCancel: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [toAddresses, setToAddresses] = useState('');
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('outbound');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!subject.trim()) return;
    setSaving(true);
    try {
      const email = await createEmail(entityName, recordId, {
        subject: subject.trim(),
        body: body.trim(),
        from_address: fromAddress.trim() || null,
        to_addresses: toAddresses.trim() || null,
        direction,
        status: 'sent',
        sent_on: new Date().toISOString(),
        owner_id: userId,
        created_by: userId,
        modified_by: userId,
      }, userId);
      onCreated(email);
    } catch { setSaving(false); }
  };

  return (
    <div className="border-b border-sky-100 bg-sky-50/40 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Mail size={13} className="text-sky-600" />
        <span className="text-xs font-semibold text-slate-700">New Email</span>
        <div className="ml-4 flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          <button onClick={() => setDirection('outbound')}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${direction === 'outbound' ? 'bg-white shadow-sm text-sky-700' : 'text-slate-500'}`}>
            Outbound
          </button>
          <button onClick={() => setDirection('inbound')}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${direction === 'inbound' ? 'bg-white shadow-sm text-sky-700' : 'text-slate-500'}`}>
            Inbound
          </button>
        </div>
        <button onClick={onCancel} className="ml-auto text-slate-400 hover:text-slate-600"><X size={14} /></button>
      </div>
      <input
        autoFocus
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg mb-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input placeholder="From" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
        <input placeholder="To" value={toAddresses} onChange={(e) => setToAddresses(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
      </div>
      <textarea
        placeholder="Email body…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 rounded-lg">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving || !subject.trim()}
          className="px-3 py-1.5 text-xs font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 flex items-center gap-1"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          Save Email
        </button>
      </div>
    </div>
  );
}

// ── Note Entry ────────────────────────────────────────────────────────────────

function NoteEntry({ note, userId, canWrite, canDelete, canShare, onUpdated, onDeleted, onShare }: {
  note: TimelineNote; userId: string; canWrite: boolean; canDelete: boolean; canShare: boolean;
  onUpdated: (n: TimelineNote) => void; onDeleted: () => void; onShare: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateNote(note.note_id, title.trim(), body.trim(), userId);
      onUpdated(updated);
      setEditing(false);
    } finally { setSaving(false); }
  };

  const handlePin = async () => {
    const updated = await togglePinNote(note.note_id, !note.is_pinned);
    onUpdated(updated);
  };

  const handleDelete = async () => {
    await deleteNote(note.note_id);
    onDeleted();
  };

  const BODY_LIMIT = 160;
  const needsTruncate = note.body && note.body.length > BODY_LIMIT;

  return (
    <EntryWrapper icon={<StickyNote size={13} />} date={note.created_at} canDelete={canDelete} onDelete={handleDelete} canShare={canShare} onShare={onShare}>
      {editing ? (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full px-2 py-1 text-sm font-semibold border border-blue-300 rounded-lg mb-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
            className="w-full px-2 py-1 text-sm border border-blue-300 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white mb-1.5" />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-lg flex items-center gap-1">
              {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
            </button>
            <button onClick={() => { setEditing(false); setTitle(note.title); setBody(note.body); }}
              className="text-[11px] text-slate-500 hover:text-slate-700 px-2.5 py-1 rounded-lg">Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <p className="text-sm font-semibold text-slate-800 flex-1 leading-snug">{note.title}</p>
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {canWrite && (
                <>
                  <button onClick={handlePin} title={note.is_pinned ? 'Unpin' : 'Pin'}
                    className={`p-1 rounded transition-colors ${note.is_pinned ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}>
                    {note.is_pinned ? <Pin size={11} /> : <PinOff size={11} />}
                  </button>
                  <button onClick={() => setEditing(true)} className="p-1 text-slate-300 hover:text-blue-500 rounded transition-colors">
                    <Edit2 size={11} />
                  </button>
                </>
              )}
            </div>
          </div>
          {note.body && (
            <p className="text-sm text-slate-600 mt-0.5 leading-relaxed">
              {needsTruncate && !expanded ? note.body.slice(0, BODY_LIMIT) + '…' : note.body}
              {needsTruncate && (
                <button onClick={() => setExpanded(!expanded)}
                  className="ml-1 text-[11px] text-blue-500 hover:text-blue-700 font-medium">
                  {expanded ? 'less' : 'more'}
                </button>
              )}
            </p>
          )}
        </>
      )}
    </EntryWrapper>
  );
}

// ── Appointment Entry ─────────────────────────────────────────────────────────

const APPT_STATUS_STYLES: Record<TimelineAppointment['status'], { color: string; icon: React.ReactNode; label: string }> = {
  scheduled: { color: 'text-green-600 bg-green-50', icon: <Calendar size={10} />, label: 'Scheduled' },
  completed: { color: 'text-blue-600 bg-blue-50', icon: <CheckCircle2 size={10} />, label: 'Completed' },
  cancelled: { color: 'text-slate-400 bg-slate-50', icon: <XCircle size={10} />, label: 'Cancelled' },
};

function AppointmentEntry({ appt, userId, canWrite, canDelete, canShare, onUpdated, onDeleted, onShare }: {
  appt: TimelineAppointment; userId: string; canWrite: boolean; canDelete: boolean; canShare: boolean;
  onUpdated: (a: TimelineAppointment) => void; onDeleted: () => void; onShare: () => void;
}) {
  const statusInfo = APPT_STATUS_STYLES[appt.status];

  const markStatus = async (status: TimelineAppointment['status']) => {
    const updated = await updateAppointment(appt.appointment_id, { status }, userId);
    onUpdated(updated);
  };

  return (
    <EntryWrapper icon={<Calendar size={13} />} date={appt.created_at} canDelete={canDelete} onDelete={() => deleteAppointment(appt.appointment_id).then(onDeleted)} canShare={canShare} onShare={onShare}>
      <div className="flex items-start gap-2">
        <p className="text-sm font-semibold text-slate-800 flex-1">{appt.subject}</p>
        <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${statusInfo.color}`}>
          {statusInfo.icon}{statusInfo.label}
        </span>
      </div>
      {appt.start_time && (
        <p className="text-xs text-slate-500 mt-0.5">
          {formatDateTime(appt.start_time)}{appt.end_time ? ` – ${formatDateTime(appt.end_time)}` : ''}
          {appt.location ? <span className="ml-2 text-slate-400">@ {appt.location}</span> : null}
        </p>
      )}
      {appt.description && <p className="text-sm text-slate-600 mt-0.5">{appt.description}</p>}
      {canWrite && appt.status === 'scheduled' && (
        <div className="flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => markStatus('completed')}
            className="text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 size={9} /> Complete
          </button>
          <button onClick={() => markStatus('cancelled')}
            className="text-[10px] font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <XCircle size={9} /> Cancel
          </button>
        </div>
      )}
    </EntryWrapper>
  );
}

// ── Email Entry ───────────────────────────────────────────────────────────────

function EmailEntry({ email, canWrite: _canWrite, canDelete, canShare, onUpdated: _onUpdated, onDeleted, onShare }: {
  email: TimelineEmail; canWrite: boolean; canDelete: boolean; canShare: boolean;
  onUpdated: (e: TimelineEmail) => void; onDeleted: () => void; onShare: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isInbound = email.direction === 'inbound';
  const BODY_LIMIT = 200;
  const needsTruncate = email.body && email.body.length > BODY_LIMIT;

  return (
    <EntryWrapper
      icon={isInbound ? <Inbox size={13} /> : <Send size={13} />}
      date={email.created_at}
      canDelete={canDelete}
      onDelete={() => deleteEmail(email.email_id).then(onDeleted)}
      canShare={canShare}
      onShare={onShare}
    >
      <div className="flex items-start gap-2">
        <p className="text-sm font-semibold text-slate-800 flex-1">{email.subject}</p>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${isInbound ? 'text-teal-600 bg-teal-50' : 'text-sky-600 bg-sky-50'}`}>
          {isInbound ? 'Inbound' : 'Outbound'}
        </span>
      </div>
      {(email.from_address || email.to_addresses) && (
        <p className="text-xs text-slate-400 mt-0.5">
          {email.from_address && <span>From: {email.from_address}</span>}
          {email.to_addresses && <span className="ml-2">To: {email.to_addresses}</span>}
        </p>
      )}
      {email.body && (
        <p className="text-sm text-slate-600 mt-0.5 leading-relaxed">
          {needsTruncate && !expanded ? email.body.slice(0, BODY_LIMIT) + '…' : email.body}
          {needsTruncate && (
            <button onClick={() => setExpanded(!expanded)} className="ml-1 text-[11px] text-blue-500 hover:text-blue-700 font-medium">
              {expanded ? 'less' : 'more'}
            </button>
          )}
        </p>
      )}
    </EntryWrapper>
  );
}

// ── Attachment Entry ──────────────────────────────────────────────────────────

const ICON_BY_EXT: Record<string, React.ReactNode> = {
  pdf: <span className="text-[9px] font-bold text-red-600">PDF</span>,
  doc: <span className="text-[9px] font-bold text-blue-600">DOC</span>,
  docx: <span className="text-[9px] font-bold text-blue-600">DOC</span>,
  xls: <span className="text-[9px] font-bold text-green-600">XLS</span>,
  xlsx: <span className="text-[9px] font-bold text-green-600">XLS</span>,
  png: <span className="text-[9px] font-bold text-purple-600">IMG</span>,
  jpg: <span className="text-[9px] font-bold text-purple-600">IMG</span>,
  jpeg: <span className="text-[9px] font-bold text-purple-600">IMG</span>,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentEntry({ attachment, canDelete, canShare, onDeleted, onShare }: {
  attachment: TimelineAttachment; canDelete: boolean; canShare: boolean; onDeleted: () => void; onShare: () => void;
}) {
  const ext = (attachment.file_type ?? '').toLowerCase();
  const icon = ICON_BY_EXT[ext] ?? <Paperclip size={11} />;

  return (
    <EntryWrapper icon={<Paperclip size={13} />} date={attachment.created_at} canDelete={canDelete} onDelete={() => deleteAttachment(attachment.attachment_id).then(onDeleted)} canShare={canShare} onShare={onShare}>
      <a
        href={attachment.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 rounded-xl transition-colors group/link"
      >
        <span className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 rounded-lg shrink-0">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-700 group-hover/link:text-blue-700 truncate max-w-[220px]">{attachment.file_name}</p>
          {attachment.file_size_bytes != null && (
            <p className="text-[10px] text-slate-400">{formatBytes(attachment.file_size_bytes)}</p>
          )}
        </div>
      </a>
    </EntryWrapper>
  );
}
