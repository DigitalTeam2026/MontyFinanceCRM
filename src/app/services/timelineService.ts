import { supabase } from '../../lib/supabase';
import type {
  TimelineNote,
  TimelineAppointment,
  TimelineEmail,
  TimelineAttachment,
  TimelineEntry,
} from '../../types/timeline';
import { dispatchAutomationForEvent } from './automation/dispatch';

export async function fetchTimelineEntries(
  entityName: string,
  recordId: string,
): Promise<TimelineEntry[]> {
  const [notes, appointments, emails, attachments] = await Promise.all([
    supabase
      .from('timeline_note')
      .select('*')
      .eq('regarding_entity_name', entityName)
      .eq('regarding_record_id', recordId)
      .order('created_at', { ascending: false }),
    supabase
      .from('timeline_appointment')
      .select('*')
      .eq('regarding_entity_name', entityName)
      .eq('regarding_record_id', recordId)
      .order('created_at', { ascending: false }),
    supabase
      .from('timeline_email')
      .select('*')
      .eq('regarding_entity_name', entityName)
      .eq('regarding_record_id', recordId)
      .order('created_at', { ascending: false }),
    supabase
      .from('timeline_attachment')
      .select('*')
      .eq('regarding_entity_name', entityName)
      .eq('regarding_record_id', recordId)
      .order('created_at', { ascending: false }),
  ]);

  const entries: TimelineEntry[] = [];

  for (const n of notes.data ?? []) {
    entries.push({ kind: 'note', data: n as TimelineNote, sortDate: n.created_at });
  }
  for (const a of appointments.data ?? []) {
    entries.push({ kind: 'appointment', data: a as TimelineAppointment, sortDate: a.created_at });
  }
  for (const e of emails.data ?? []) {
    entries.push({ kind: 'email', data: e as TimelineEmail, sortDate: e.created_at });
  }
  for (const a of attachments.data ?? []) {
    entries.push({ kind: 'attachment', data: a as TimelineAttachment, sortDate: a.created_at });
  }

  entries.sort((a, b) => (a.sortDate < b.sortDate ? 1 : -1));
  return entries;
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function createNote(
  entityName: string,
  recordId: string,
  title: string,
  body: string,
  userId: string,
): Promise<TimelineNote> {
  const { data, error } = await supabase
    .from('timeline_note')
    .insert({ regarding_entity_name: entityName, regarding_record_id: recordId, title, body, owner_id: userId, created_by: userId, modified_by: userId })
    .select()
    .single();
  if (error) throw error;
  // Fire Power Automation for note-create (e.g. "when a Note is created on an
  // Opportunity"). The note's own columns — incl. regarding_entity_name /
  // regarding_record_id / body — are the trigger record. Fire-and-forget: never
  // let an automation hiccup break note creation.
  void dispatchAutomationForEvent('note', 'create', (data as TimelineNote).note_id, data as Record<string, unknown>, null, userId);
  return data as TimelineNote;
}

export async function updateNote(
  noteId: string,
  title: string,
  body: string,
  userId: string,
): Promise<TimelineNote> {
  const { data, error } = await supabase
    .from('timeline_note')
    .update({ title, body, modified_by: userId, modified_at: new Date().toISOString() })
    .eq('note_id', noteId)
    .select()
    .single();
  if (error) throw error;
  return data as TimelineNote;
}

export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await supabase.from('timeline_note').delete().eq('note_id', noteId);
  if (error) throw error;
}

export async function togglePinNote(noteId: string, isPinned: boolean): Promise<TimelineNote> {
  const { data, error } = await supabase
    .from('timeline_note')
    .update({ is_pinned: isPinned })
    .eq('note_id', noteId)
    .select()
    .single();
  if (error) throw error;
  return data as TimelineNote;
}

// ── Appointments ──────────────────────────────────────────────────────────────

export async function createAppointment(
  entityName: string,
  recordId: string,
  fields: Omit<TimelineAppointment, 'appointment_id' | 'regarding_entity_name' | 'regarding_record_id' | 'created_at' | 'modified_at'>,
  userId: string,
): Promise<TimelineAppointment> {
  const { data, error } = await supabase
    .from('timeline_appointment')
    .insert({ ...fields, regarding_entity_name: entityName, regarding_record_id: recordId, owner_id: userId, created_by: userId, modified_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data as TimelineAppointment;
}

export async function updateAppointment(
  appointmentId: string,
  fields: Partial<Pick<TimelineAppointment, 'subject' | 'description' | 'start_time' | 'end_time' | 'location' | 'status'>>,
  userId: string,
): Promise<TimelineAppointment> {
  const { data, error } = await supabase
    .from('timeline_appointment')
    .update({ ...fields, modified_by: userId, modified_at: new Date().toISOString() })
    .eq('appointment_id', appointmentId)
    .select()
    .single();
  if (error) throw error;
  return data as TimelineAppointment;
}

export async function deleteAppointment(appointmentId: string): Promise<void> {
  const { error } = await supabase.from('timeline_appointment').delete().eq('appointment_id', appointmentId);
  if (error) throw error;
}

// ── Emails ────────────────────────────────────────────────────────────────────

export async function createEmail(
  entityName: string,
  recordId: string,
  fields: Omit<TimelineEmail, 'email_id' | 'regarding_entity_name' | 'regarding_record_id' | 'created_at' | 'modified_at'>,
  userId: string,
): Promise<TimelineEmail> {
  const { data, error } = await supabase
    .from('timeline_email')
    .insert({ ...fields, regarding_entity_name: entityName, regarding_record_id: recordId, owner_id: userId, created_by: userId, modified_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data as TimelineEmail;
}

export async function updateEmail(
  emailId: string,
  fields: Partial<Pick<TimelineEmail, 'subject' | 'body' | 'from_address' | 'to_addresses' | 'direction' | 'status' | 'sent_on'>>,
  userId: string,
): Promise<TimelineEmail> {
  const { data, error } = await supabase
    .from('timeline_email')
    .update({ ...fields, modified_by: userId, modified_at: new Date().toISOString() })
    .eq('email_id', emailId)
    .select()
    .single();
  if (error) throw error;
  return data as TimelineEmail;
}

export async function deleteEmail(emailId: string): Promise<void> {
  const { error } = await supabase.from('timeline_email').delete().eq('email_id', emailId);
  if (error) throw error;
}

// ── Attachments ───────────────────────────────────────────────────────────────

export async function createAttachment(
  entityName: string,
  recordId: string,
  fields: Omit<TimelineAttachment, 'attachment_id' | 'regarding_entity_name' | 'regarding_record_id' | 'created_at'>,
  userId: string,
): Promise<TimelineAttachment> {
  const { data, error } = await supabase
    .from('timeline_attachment')
    .insert({ ...fields, regarding_entity_name: entityName, regarding_record_id: recordId, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data as TimelineAttachment;
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  const { error } = await supabase.from('timeline_attachment').delete().eq('attachment_id', attachmentId);
  if (error) throw error;
}

// ── Cross-record copy (Lead → Opportunity qualify) ──────────────────────────────

/**
 * Copies every timeline activity (notes, appointments, emails, attachments) from
 * one record onto another as brand-new, independent rows. Used when a Lead is
 * qualified so the resulting Opportunity carries its own copy of the lead's
 * timeline. Original authorship (owner_id / created_by) is preserved. Attachments
 * reuse the same stored file (file_url / storage_path) — nothing is re-uploaded.
 * Returns the total number of activities copied.
 */
export async function copyTimelineEntries(
  fromEntityName: string,
  fromRecordId: string,
  toEntityName: string,
  toRecordId: string,
): Promise<number> {
  const regarding = { regarding_entity_name: toEntityName, regarding_record_id: toRecordId };
  let copied = 0;

  const copyTable = async (table: string, columns: string): Promise<void> => {
    const { data, error: readError } = await supabase
      .from(table)
      .select(columns)
      .eq('regarding_entity_name', fromEntityName)
      .eq('regarding_record_id', fromRecordId);
    if (readError) throw readError;
    if (!data || data.length === 0) return;
    const rows = data.map((row) => ({ ...regarding, ...(row as Record<string, unknown>) }));
    const { error: insertError } = await supabase.from(table).insert(rows);
    if (insertError) throw insertError;
    copied += rows.length;
  };

  await copyTable('timeline_note', 'title, body, is_pinned, owner_id, created_by, modified_by');
  await copyTable('timeline_appointment', 'subject, description, start_time, end_time, location, status, owner_id, created_by, modified_by');
  await copyTable('timeline_email', 'subject, body, from_address, to_addresses, direction, status, sent_on, owner_id, created_by, modified_by');
  await copyTable('timeline_attachment', 'file_name, file_url, file_type, file_size_bytes, storage_path, owner_id, uploaded_by, created_by');

  return copied;
}
