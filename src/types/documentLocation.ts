export interface DocumentLocationConfig {
  entity_logical_name: string;
  entity_display_name: string;
  root_location: string;
  is_active: boolean;
  created_at?: string;
  modified_at?: string;
}

export interface CrmDocument {
  document_id: string;
  entity_logical_name: string;
  record_id: string;
  file_name: string;
  relative_path: string;
  absolute_path: string | null;
  content_type: string | null;
  byte_size: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}
