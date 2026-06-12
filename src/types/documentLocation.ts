export type StorageType = 'local' | 'nas' | 's3' | 'sharepoint';

export const STORAGE_TYPES: { value: StorageType; label: string }[] = [
  { value: 'local', label: 'Local folder' },
  { value: 'nas', label: 'NAS / network share' },
  { value: 's3', label: 'S3 bucket' },
  { value: 'sharepoint', label: 'SharePoint library' },
];

export interface DocumentLocationConfig {
  entity_logical_name: string;
  entity_display_name: string;
  root_location: string;
  storage_type: StorageType;
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
  storage_type: StorageType;
  content_type: string | null;
  byte_size: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

/** Credential payloads stored in Supabase Vault (never read back into the browser). */
export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

export interface SharePointCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  driveId: string;
}

export type StorageCredentials = S3Credentials | SharePointCredentials;
