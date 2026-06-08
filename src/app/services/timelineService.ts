import { supabase } from '../../lib/supabase';
import type {
  TimelineNote,
  TimelineAppointment,
  TimelineEmail,
  TimelineAttachment,
  TimelineEntry,
} from '../../types/timeline';

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
