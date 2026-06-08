export type TimelineActivityType = 'note' | 'appointment' | 'email' | 'attachment' | 'system';

export interface TimelineNote {
  note_id: string;
  regarding_entity_name: string;
  regarding_record_id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  owner_id: string | null;
  created_by: string | null;
  modified_by: string | null;
  created_at: string;
  modified_at: string;
}

export interface TimelineAppointment {
  appointment_id: string;
  regarding_entity_name: string;
  regarding_record_id: string;
  subject: string;
  description: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  owner_id: string | null;
  created_by: string | null;
  modified_by: string | null;
  created_at: string;
  modified_at: string;
}

export interface TimelineEmail {
  email_id: string;
  regarding_entity_name: string;
  regarding_record_id: string;
  subject: string;
  body: string;
  from_address: string | null;
  to_addresses: string | null;
  direction: 'inbound' | 'outbound';
  status: 'draft' | 'sent' | 'received';
  sent_on: string | null;
  owner_id: string | null;
  created_by: string | null;
  modified_by: string | null;
  created_at: string;
  modified_at: string;
}

export interface TimelineAttachment {
  attachment_id: string;
  regarding_entity_name: string;
  regarding_record_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size_bytes: number | null;
  storage_path: string | null;
  owner_id: string | null;
  uploaded_by: string | null;
  created_by: string | null;
  created_at: string;
}

export type TimelineEntry =
  | { kind: 'note';        data: TimelineNote;        sortDate: string }
  | { kind: 'appointment'; data: TimelineAppointment; sortDate: string }
  | { kind: 'email';       data: TimelineEmail;       sortDate: string }
  | { kind: 'attachment';  data: TimelineAttachment;  sortDate: string }
  | { kind: 'system';      action: string; userId: string | null; sortDate: string };
