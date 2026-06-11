import { supabase } from '../lib/supabase';
import type {
  ApiIntegration,
  ApiIntegrationFormData,
  ApiIntegrationHeader,
  ApiIntegrationLog,
  EntityFieldInfo,
  InboundFieldMapping,
  LookupEntityField,
  LookupResolutionTestResult,
  TestExecutionResult,
} from '../types/apiIntegration';

// auth_secret is intentionally excluded from every SELECT — it must only be
// read by the edge functions via service_role. endpoint_key is NOT a secret
// (it lives in the public incoming URL), so it is safe to return.
const INTEGRATION_COLS = `
  api_integration_id, name, description, direction, operation, entity_id,
  http_method, endpoint_url, endpoint_key, is_active, trigger_event,
  auth_type, auth_key_name, auth_username, body_config, inbound_config,
  last_request_at, created_at, modified_at, created_by, is_deleted,
  entity:entity_definition(logical_name, display_name, physical_table_name, primary_field_name)
`;

/**
 * Build the public incoming-endpoint URL for an integration from its key.
 * Points at the `api-integration-inbound` edge function.
 */
export function buildInboundEndpointUrl(endpointKey: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  return `${base}/functions/v1/api-integration-inbound/${endpointKey}`;
}

/** Rotate the endpoint key — the previous URL stops working immediately. */
export async function regenerateEndpointKey(id: string): Promise<string> {
  const { data, error } = await supabase.rpc(
    'regenerate_api_integration_endpoint_key',
    { p_id: id }
  );
  if (error) throw error;
  return data as string;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function fetchApiIntegrations(): Promise<ApiIntegration[]> {
  const { data, error } = await supabase
    .from('api_integration')
    .select(INTEGRATION_COLS)
    .eq('is_deleted', false)
    .order('name');
  if (error) throw error;
  return data as ApiIntegration[];
}

export async function fetchApiIntegration(id: string): Promise<ApiIntegration> {
  const { data, error } = await supabase
    .from('api_integration')
    .select(INTEGRATION_COLS)
    .eq('api_integration_id', id)
    .single();
  if (error) throw error;
  return data as ApiIntegration;
}

/**
 * Read the stored auth secret for a single integration so the admin editor can
 * reveal it via the "show password" toggle. Excluded from the standard column
 * list (so it is never fetched incidentally); the `api_integration` table is
 * already restricted to system admins by RLS, so this exposes nothing new.
 */
export async function fetchIntegrationSecret(integrationId: string): Promise<string> {
  const { data, error } = await supabase
    .from('api_integration')
    .select('auth_secret')
    .eq('api_integration_id', integrationId)
    .single();
  if (error) throw error;
  return ((data as { auth_secret: string | null } | null)?.auth_secret) ?? '';
}

export async function fetchIntegrationHeaders(
  integrationId: string
): Promise<ApiIntegrationHeader[]> {
  const { data, error } = await supabase
    .from('api_integration_header')
    .select('*')
    .eq('api_integration_id', integrationId)
    .order('sort_order');
  if (error) throw error;
  return data as ApiIntegrationHeader[];
}

export async function createApiIntegration(
  form: ApiIntegrationFormData
): Promise<ApiIntegration> {
  const { headers: formHeaders, auth_secret, ...rest } = form;

  const { data, error } = await supabase
    .from('api_integration')
    .insert({ ...rest, auth_secret: auth_secret || null })
    .select(INTEGRATION_COLS)
    .single();
  if (error) throw error;

  const integration = data as ApiIntegration;
  await _replaceHeaders(integration.api_integration_id, formHeaders);
  return integration;
}

export async function updateApiIntegration(
  id: string,
  form: ApiIntegrationFormData,
  secretChanged: boolean
): Promise<ApiIntegration> {
  const { headers: formHeaders, auth_secret, ...rest } = form;

  const payload: Record<string, unknown> = { ...rest };
  if (secretChanged) payload.auth_secret = auth_secret || null;

  const { data, error } = await supabase
    .from('api_integration')
    .update(payload)
    .eq('api_integration_id', id)
    .select(INTEGRATION_COLS)
    .single();
  if (error) throw error;

  await _replaceHeaders(id, formHeaders);
  return data as ApiIntegration;
}

export async function deleteApiIntegration(id: string): Promise<void> {
  const { error } = await supabase
    .from('api_integration')
    .update({ is_deleted: true })
    .eq('api_integration_id', id);
  if (error) throw error;
}

async function _replaceHeaders(
  integrationId: string,
  headers: ApiIntegrationFormData['headers']
): Promise<void> {
  await supabase
    .from('api_integration_header')
    .delete()
    .eq('api_integration_id', integrationId);

  if (!headers.length) return;

  const rows = headers.map((h, i) => ({
    api_integration_id: integrationId,
    header_key: h.header_key,
    header_value: h.header_value,
    is_secret: h.is_secret,
    sort_order: i,
  }));
  const { error } = await supabase.from('api_integration_header').insert(rows);
  if (error) throw error;
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export async function fetchIntegrationLogs(
  integrationId?: string,
  limit = 100
): Promise<ApiIntegrationLog[]> {
  let q = supabase
    .from('api_integration_log')
    .select('*')
    .order('triggered_at', { ascending: false })
    .limit(limit);

  if (integrationId) q = q.eq('api_integration_id', integrationId);

  const { data, error } = await q;
  if (error) throw error;
  return data as ApiIntegrationLog[];
}

// ── Body builder helpers ──────────────────────────────────────────────────────

export async function fetchEntityFieldsForIntegration(
  entityDefinitionId: string
): Promise<EntityFieldInfo[]> {
  const { data, error } = await supabase
    .from('field_definition')
    .select(`
      field_definition_id,
      logical_name,
      display_name,
      physical_column_name,
      is_required,
      field_type:field_type_id(name),
      lookup_entity:entity_definition!lookup_entity_id(
        entity_definition_id,
        logical_name,
        display_name,
        physical_table_name,
        primary_field_name
      )
    `)
    .eq('entity_definition_id', entityDefinitionId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('sort_order')
    .order('display_name');
  if (error) throw error;
  return data as EntityFieldInfo[];
}

export async function fetchLookupEntityFields(
  lookupEntityDefinitionId: string
): Promise<LookupEntityField[]> {
  const { data, error } = await supabase
    .from('field_definition')
    .select(`
      field_definition_id,
      display_name,
      physical_column_name,
      field_type:field_type_id(name)
    `)
    .eq('entity_definition_id', lookupEntityDefinitionId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('sort_order')
    .order('display_name');
  if (error) throw error;
  return data as LookupEntityField[];
}

// Fetch a handful of records from an entity table for the test-panel picker.
export async function fetchSampleRecords(
  physicalTableName: string,
  pkColumn: string,
  displayColumn: string,
  limit = 10
): Promise<Array<{ id: string; label: string }>> {
  const cols = [pkColumn, displayColumn].filter(Boolean).join(', ');
  const { data } = await supabase
    .from(physicalTableName)
    .select(cols)
    .eq('is_deleted', false)
    .limit(limit);

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r[pkColumn] ?? ''),
    label: String(r[displayColumn] ?? r[pkColumn] ?? 'Unknown'),
  }));
}

// Escape LIKE/ILIKE wildcards so a value is matched literally (case-insensitively).
function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * "Test Mapping" preview — resolve a sample incoming value against the related
 * entity using the same rules the edge function applies, so an admin can confirm
 * the match before saving. Runs client-side (subject to RLS) and is read-only.
 */
export async function testLookupResolution(
  m: InboundFieldMapping,
  sampleValue: string
): Promise<LookupResolutionTestResult> {
  const value = sampleValue.trim();
  if (!value) return { status: 'error', matches: [], message: 'Enter a sample value to test.' };

  const table = m.lookup_entity_physical_table;
  const pk = m.lookup_entity_pk;
  const nameCol = m.lookup_entity_primary_field;
  if (!table || !pk) {
    return { status: 'error', matches: [], message: 'Lookup is not fully configured yet.' };
  }

  const matchBy = m.lookup_match_by ?? 'id';
  const matchCol =
    matchBy === 'id' ? pk
    : matchBy === 'primary_name' ? nameCol
    : m.lookup_match_field_physical_column;
  if (!matchCol) {
    return { status: 'error', matches: [], message: 'Select which field to match on.' };
  }

  const selectCols = [pk, nameCol].filter(Boolean).join(', ');
  const ci = matchBy !== 'id' && m.lookup_match_type === 'case_insensitive_exact';

  const run = (withDeleted: boolean) => {
    let q = supabase.from(table).select(selectCols).limit(3);
    q = ci ? q.ilike(matchCol, escapeLike(value)) : q.eq(matchCol, value);
    if (withDeleted) q = q.eq('is_deleted', false);
    return q;
  };

  let res = await run(true);
  if (res.error) res = await run(false); // some lookup tables have no is_deleted column
  if (res.error) return { status: 'error', matches: [], message: res.error.message };

  const rows = (res.data ?? []) as Record<string, unknown>[];
  const matches = rows.map((r) => ({
    id: String(r[pk] ?? ''),
    label: String((nameCol ? r[nameCol] : undefined) ?? r[pk] ?? '(no name)'),
  }));

  if (matches.length === 0) return { status: 'not_found', matches };
  if (matches.length > 1) return { status: 'ambiguous', matches };
  return { status: 'found', matches };
}

// ── Execution ─────────────────────────────────────────────────────────────────

export async function executeApiIntegration(
  integrationId: string,
  recordId?: string
): Promise<TestExecutionResult> {
  const { data, error } = await supabase.functions.invoke(
    'execute-api-integration',
    {
      body: {
        integration_id: integrationId,
        record_id: recordId ?? null,
        trigger_event: 'manual',
      },
    }
  );
  if (error) throw new Error(error.message ?? 'Edge function call failed');
  return data as TestExecutionResult;
}
