export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type TriggerEvent = 'created' | 'updated' | 'deleted' | 'manual';
export type AuthType = 'none' | 'api_key' | 'bearer' | 'basic' | 'custom_header';

/** One field mapped into the JSON request body. */
export interface BodyFieldMapping {
  id: string;                              // client-side UUID for React key

  /** Dot-notation path in the output JSON, e.g. "customer.email" */
  json_key: string;

  value_type: 'field' | 'static';

  // ── CRM field ──────────────────────────────────────────────────────────────
  field_definition_id?: string;
  field_physical_column?: string;          // physical column in the entity table
  field_display_name?: string;
  field_type_name?: string;                // 'text', 'lookup', 'email', …

  // ── Lookup resolution ──────────────────────────────────────────────────────
  is_lookup?: boolean;
  lookup_value_type?: 'id' | 'primary_name' | 'field';
  lookup_field_physical_column?: string;   // which column in the related entity
  lookup_field_display_name?: string;
  lookup_entity_id?: string;
  lookup_entity_physical_table?: string;
  lookup_entity_pk?: string;               // e.g. "account_id"
  lookup_entity_primary_field?: string;    // e.g. "account_name"

  // ── Static value ──────────────────────────────────────────────────────────
  static_value?: string;

  is_required?: boolean;
}

export interface BodyConfig {
  fields: BodyFieldMapping[];
  exclude_null_fields: boolean;
}

export interface ApiIntegration {
  api_integration_id: string;
  name: string;
  description: string | null;
  entity_id: string;
  http_method: HttpMethod;
  endpoint_url: string;
  is_active: boolean;
  trigger_event: TriggerEvent;
  auth_type: AuthType;
  /** Never returned in list/detail queries – only read by the edge function */
  auth_secret?: string | null;
  auth_key_name: string | null;
  auth_username: string | null;
  body_config: BodyConfig;
  created_at: string;
  modified_at: string;
  created_by: string | null;
  is_deleted: boolean;
  // Joined from entity_definition
  entity?: {
    logical_name: string;
    display_name: string;
    physical_table_name: string;
    primary_field_name: string;
  };
}

export interface ApiIntegrationHeader {
  api_integration_header_id: string;
  api_integration_id: string;
  header_key: string;
  header_value: string;
  is_secret: boolean;
  sort_order: number;
}

export interface ApiIntegrationLog {
  api_integration_log_id: string;
  api_integration_id: string;
  record_id: string | null;
  triggered_by: string | null;
  triggered_at: string;
  trigger_event: string | null;
  request_url: string | null;
  request_method: string | null;
  request_headers_json: Record<string, string> | null;
  request_body_json: unknown;
  response_status: number | null;
  response_body: string | null;
  is_success: boolean;
  error_message: string | null;
  duration_ms: number | null;
}

// ── Form state types ──────────────────────────────────────────────────────────

export interface ApiIntegrationHeaderForm {
  /** Client-side UUID */
  id: string;
  header_key: string;
  header_value: string;
  is_secret: boolean;
}

export interface ApiIntegrationFormData {
  name: string;
  description: string;
  entity_id: string;
  http_method: HttpMethod;
  endpoint_url: string;
  is_active: boolean;
  trigger_event: TriggerEvent;
  auth_type: AuthType;
  /** Empty string means "unchanged" when editing. */
  auth_secret: string;
  auth_key_name: string;
  auth_username: string;
  body_config: BodyConfig;
  headers: ApiIntegrationHeaderForm[];
}

// ── Used in body builder panels ───────────────────────────────────────────────

export interface EntityFieldInfo {
  field_definition_id: string;
  logical_name: string;
  display_name: string;
  physical_column_name: string;
  is_required: boolean;
  field_type: { name: string } | null;
  lookup_entity: {
    entity_definition_id: string;
    logical_name: string;
    physical_table_name: string;
    primary_field_name: string;
  } | null;
}

export interface LookupEntityField {
  field_definition_id: string;
  display_name: string;
  physical_column_name: string;
  field_type: { name: string } | null;
}

// ── Test execution result ─────────────────────────────────────────────────────

export interface TestExecutionResult {
  ok: boolean;
  status_code: number;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
  };
  response_body: string;
  duration_ms: number;
  error: string | null;
}
