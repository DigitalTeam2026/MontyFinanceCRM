import { supabase } from '../lib/supabase';
import type {
  ApiIntegration,
  ApiIntegrationFormData,
  ApiIntegrationHeader,
  ApiIntegrationLog,
  EntityFieldInfo,
  LookupEntityField,
  TestExecutionResult,
} from '../types/apiIntegration';

// auth_secret is intentionally excluded from every SELECT — it must only be
// read by the execute-api-integration edge function via service_role.
const INTEGRATION_COLS = `
  api_integration_id, name, description, entity_id, http_method, endpoint_url,
  is_active, trigger_event, auth_type, auth_key_name, auth_username,
  body_config, created_at, modified_at, created_by, is_deleted,
  entity:entity_definition(logical_name, display_name, physical_table_name, primary_field_name)
`;

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
