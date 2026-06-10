export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type TriggerEvent = 'created' | 'updated' | 'deleted' | 'manual';
export type AuthType = 'none' | 'api_key' | 'bearer' | 'basic' | 'custom_header';

/** Whether the integration sends data out of the CRM or receives data into it. */
export type IntegrationDirection = 'outgoing' | 'incoming';

/** What an incoming call does to the resolved CRM record. */
export type InboundOperation = 'create' | 'update' | 'upsert';

/** How a lookup value is sent out (outgoing) — the "Value to Send" option. */
export type LookupValueType = 'id' | 'primary_name' | 'field';

/** How an incoming lookup value is matched back to a related record. */
export type LookupMatchBy = 'id' | 'primary_name' | 'field';

/** How the incoming value is compared against the match column. */
export type LookupMatchType = 'exact' | 'case_insensitive_exact';

/** What to do when no related record matches the incoming value. */
export type LookupNotFoundBehavior = 'reject' | 'set_null' | 'create';

/** What to do when more than one related record matches (only "reject" today). */
export type LookupMultipleMatchBehavior = 'reject';

// ── Outgoing request-body mapping ───────────────────────────────────────────────

/** One node mapped into the outgoing JSON request body. */
export interface BodyFieldMapping {
  id: string;                              // client-side UUID for React key

  /** Dot-notation path in the output JSON, e.g. "customer.email" */
  json_key: string;

  /**
   * - field  : value pulled from a CRM field on the record
   * - static : a fixed string value
   * - raw    : a literal JSON value (object/array/number/etc.) typed by the admin
   */
  value_type: 'field' | 'static' | 'raw';

  // ── CRM field ──────────────────────────────────────────────────────────────
  field_definition_id?: string;
  field_physical_column?: string;          // physical column in the entity table
  field_display_name?: string;
  field_type_name?: string;                // 'text', 'lookup', 'email', …

  // ── Lookup resolution (Value to Send) ───────────────────────────────────────
  is_lookup?: boolean;
  lookup_value_type?: LookupValueType;
  lookup_field_physical_column?: string;   // which column in the related entity
  lookup_field_display_name?: string;
  lookup_entity_id?: string;
  lookup_entity_physical_table?: string;
  lookup_entity_pk?: string;               // e.g. "account_id"
  lookup_entity_primary_field?: string;    // e.g. "account_name"

  // ── Static / raw value ──────────────────────────────────────────────────────
  static_value?: string;                   // static text, or raw JSON when value_type === 'raw'

  is_required?: boolean;
}

export interface BodyConfig {
  fields: BodyFieldMapping[];
  exclude_null_fields: boolean;
}

// ── Incoming property → CRM field mapping ───────────────────────────────────────

export interface InboundFieldMapping {
  id: string;                              // client-side UUID for React key

  /** Dot-notation path read from the incoming JSON body, e.g. "customer.email" */
  json_path: string;

  // Target CRM field
  field_definition_id?: string;
  target_physical_column?: string;
  target_display_name?: string;
  target_field_type?: string;

  is_required?: boolean;

  // Lookup resolution — how to turn an incoming value into a related record FK
  is_lookup?: boolean;
  lookup_match_by?: LookupMatchBy;
  lookup_match_field_physical_column?: string; // when lookup_match_by === 'field'
  lookup_match_field_display_name?: string;
  lookup_entity_id?: string;
  lookup_entity_physical_table?: string;
  lookup_entity_pk?: string;
  lookup_entity_primary_field?: string;
  lookup_entity_display_name?: string;         // related entity label, used in error messages
  /** Comparison strategy for primary_name / field matching. Default: case-insensitive exact. */
  lookup_match_type?: LookupMatchType;
  /** Behaviour when no related record matches. Default: reject. */
  lookup_not_found_behavior?: LookupNotFoundBehavior;
  /** Behaviour when multiple related records match. Always reject (ambiguous). */
  lookup_multiple_match_behavior?: LookupMultipleMatchBehavior;
}

export interface InboundConfig {
  fields: InboundFieldMapping[];
  /** Physical column used to locate an existing record for update / upsert. */
  match_field: string | null;
}

// ── Main entity ─────────────────────────────────────────────────────────────────

export interface ApiIntegration {
  api_integration_id: string;
  name: string;
  description: string | null;
  direction: IntegrationDirection;
  operation: InboundOperation;
  entity_id: string;
  http_method: HttpMethod;
  endpoint_url: string;
  /** Backend-generated unique key for the incoming endpoint (not a secret). */
  endpoint_key: string;
  is_active: boolean;
  trigger_event: TriggerEvent;
  auth_type: AuthType;
  /** Never returned in list/detail queries – only read by the edge function */
  auth_secret?: string | null;
  auth_key_name: string | null;
  auth_username: string | null;
  body_config: BodyConfig;
  inbound_config: InboundConfig;
  last_request_at: string | null;
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
  direction?: string | null;
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
  direction: IntegrationDirection;
  operation: InboundOperation;
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
  inbound_config: InboundConfig;
  headers: ApiIntegrationHeaderForm[];
}

// ── Used in body builder panels ───────────────────────────────────────────────

export interface EntityFieldInfo {
  field_definition_id: string;
  logical_name: string;
  display_name: string;
  physical_column_name: string;
  is_required: boolean;
  is_system?: boolean;
  field_type: { name: string } | null;
  lookup_entity: {
    entity_definition_id: string;
    logical_name: string;
    display_name: string;
    physical_table_name: string;
    primary_field_name: string;
  } | null;
}

/** Result of a "Test Mapping" lookup resolution preview (admin tooling). */
export interface LookupResolutionTestResult {
  status: 'found' | 'not_found' | 'ambiguous' | 'error';
  matches: { id: string; label: string }[];
  message?: string;
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
