import { useState, useEffect, useCallback } from 'react';
import {
  Save, ArrowLeft, Plus, Trash2, Eye, EyeOff, Play,
  ChevronDown, AlertCircle, CheckCircle2, XCircle,
  Info, Loader2, Settings, Globe, ShieldCheck, ListPlus, Braces, FlaskConical,
  ArrowUpRight, ArrowDownLeft,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type {
  ApiIntegration,
  ApiIntegrationFormData,
  ApiIntegrationHeaderForm,
  BodyConfig,
  InboundConfig,
  EntityFieldInfo,
  LookupEntityField,
  TestExecutionResult,
  ApiIntegrationLog,
  AuthType,
  HttpMethod,
  TriggerEvent,
  IntegrationDirection,
  InboundOperation,
} from '../../types/apiIntegration';
import {
  createApiIntegration,
  updateApiIntegration,
  fetchIntegrationHeaders,
  fetchEntityFieldsForIntegration,
  fetchLookupEntityFields,
  fetchSampleRecords,
  testLookupResolution,
  fetchIntegrationLogs,
  executeApiIntegration,
  regenerateEndpointKey,
  buildInboundEndpointUrl,
} from '../../services/apiIntegrationService';
import { fetchEntities } from '../../services/entityService';
import type { EntityDefinition } from '../../types/entity';
import BodyDesigner from './editor/BodyDesigner';
import InboundMapping from './editor/InboundMapping';
import GeneratedEndpointPanel from './editor/GeneratedEndpointPanel';

interface Props {
  integration?: ApiIntegration;
  onBack: () => void;
  onSaved: (integration: ApiIntegration) => void;
}

const HTTP_METHODS: HttpMethod[] = ['POST', 'GET', 'PUT', 'PATCH', 'DELETE'];
const INBOUND_METHODS: HttpMethod[] = ['POST', 'PUT', 'PATCH'];
const TRIGGER_OPTIONS: { value: TriggerEvent; label: string }[] = [
  { value: 'manual', label: 'Manual only' },
  { value: 'created', label: 'Record Created' },
  { value: 'updated', label: 'Record Updated' },
  { value: 'deleted', label: 'Record Deleted' },
];
const OPERATION_OPTIONS: { value: InboundOperation; label: string }[] = [
  { value: 'create', label: 'Create record' },
  { value: 'update', label: 'Update existing record' },
  { value: 'upsert', label: 'Upsert (update or create)' },
];
const AUTH_OPTIONS: { value: AuthType; label: string }[] = [
  { value: 'none', label: 'No Authentication' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'api_key', label: 'API Key' },
  { value: 'basic', label: 'Basic Authentication' },
  { value: 'custom_header', label: 'Custom Header' },
];
const HAS_BODY: HttpMethod[] = ['POST', 'PUT', 'PATCH'];
const SECRET_PLACEHOLDER = '●●●●●●●●';

type FormErrors = Partial<Record<'name' | 'entity_id' | 'endpoint_url' | 'match_field', string>>;

function emptyForm(): ApiIntegrationFormData {
  return {
    name: '',
    description: '',
    direction: 'outgoing',
    operation: 'create',
    entity_id: '',
    http_method: 'POST',
    endpoint_url: '',
    is_active: true,
    trigger_event: 'manual',
    auth_type: 'none',
    auth_secret: '',
    auth_key_name: '',
    auth_username: '',
    body_config: { fields: [], exclude_null_fields: true },
    inbound_config: { fields: [], match_field: null },
    headers: [],
  };
}

function newHeaderRow(): ApiIntegrationHeaderForm {
  return { id: crypto.randomUUID(), header_key: '', header_value: '', is_secret: false };
}

export default function ApiIntegrationEditor({ integration, onBack, onSaved }: Props) {
  const { showSuccess, showError } = useToast();
  const isEdit = !!integration;

  const [form, setForm] = useState<ApiIntegrationFormData>(emptyForm());
  const [secretChanged, setSecretChanged] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Endpoint key / last request (incoming) — synced from the saved integration
  const [endpointKey, setEndpointKey] = useState<string>(integration?.endpoint_key ?? '');
  const [lastRequestAt, setLastRequestAt] = useState<string | null>(integration?.last_request_at ?? null);
  const [savedId, setSavedId] = useState<string | null>(integration?.api_integration_id ?? null);

  // Entity / field state
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [entityFields, setEntityFields] = useState<EntityFieldInfo[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [lookupCache, setLookupCache] = useState<Record<string, LookupEntityField[]>>({});
  const [lookupLoading, setLookupLoading] = useState<Record<string, boolean>>({});

  // Test / logs state
  const [sampleRecords, setSampleRecords] = useState<{ id: string; label: string }[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestExecutionResult | null>(null);
  const [recentLogs, setRecentLogs] = useState<ApiIntegrationLog[]>([]);

  const [sections, setSections] = useState({
    general: true,
    endpoint: true,
    auth: true,
    headers: false,
    body: true,
    test: false,
  });

  const isIncoming = form.direction === 'incoming';

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchEntities().then(setEntities).catch(() => {});
  }, []);

  useEffect(() => {
    if (!integration) return;
    setSavedId(integration.api_integration_id);
    setEndpointKey(integration.endpoint_key);
    setLastRequestAt(integration.last_request_at);
    fetchIntegrationHeaders(integration.api_integration_id).then((headers) => {
      setForm({
        name: integration.name,
        description: integration.description ?? '',
        direction: integration.direction ?? 'outgoing',
        operation: integration.operation ?? 'create',
        entity_id: integration.entity_id,
        http_method: integration.http_method,
        endpoint_url: integration.endpoint_url,
        is_active: integration.is_active,
        trigger_event: integration.trigger_event,
        auth_type: integration.auth_type,
        auth_secret: '',
        auth_key_name: integration.auth_key_name ?? '',
        auth_username: integration.auth_username ?? '',
        body_config: integration.body_config ?? { fields: [], exclude_null_fields: true },
        inbound_config: integration.inbound_config ?? { fields: [], match_field: null },
        headers: headers.map((h) => ({
          id: crypto.randomUUID(),
          header_key: h.header_key,
          header_value: h.header_value,
          is_secret: h.is_secret,
        })),
      });
    });
    fetchIntegrationLogs(integration.api_integration_id, 5).then(setRecentLogs).catch(() => {});
  }, [integration]);

  useEffect(() => {
    if (form.entity_id) loadEntityFields(form.entity_id);
    else setEntityFields([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.entity_id]);

  async function loadEntityFields(entityId: string) {
    setFieldsLoading(true);
    try {
      setEntityFields(await fetchEntityFieldsForIntegration(entityId));
      loadSampleRecords(entityId);
    } catch {
      setEntityFields([]);
    } finally {
      setFieldsLoading(false);
    }
  }

  async function loadSampleRecords(entityId: string) {
    const entity = entities.find((e) => e.entity_definition_id === entityId);
    if (!entity) return;
    const pk = `${entity.logical_name}_id`;
    const display = entity.primary_field_name ?? pk;
    const records = await fetchSampleRecords(entity.physical_table_name, pk, display);
    setSampleRecords(records);
    setSelectedRecordId(records[0]?.id ?? '');
  }

  async function loadLookupFields(lookupEntityId: string) {
    if (lookupCache[lookupEntityId] || lookupLoading[lookupEntityId]) return;
    setLookupLoading((p) => ({ ...p, [lookupEntityId]: true }));
    try {
      setLookupCache((p) => ({ ...p, [lookupEntityId]: [] })); // placeholder while loading
      const fields = await fetchLookupEntityFields(lookupEntityId);
      setLookupCache((p) => ({ ...p, [lookupEntityId]: fields }));
    } catch {
      setLookupCache((p) => ({ ...p, [lookupEntityId]: [] }));
    } finally {
      setLookupLoading((p) => ({ ...p, [lookupEntityId]: false }));
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const set = useCallback(<K extends keyof ApiIntegrationFormData>(
    key: K, value: ApiIntegrationFormData[K]
  ) => {
    setForm((p) => ({ ...p, [key]: value }));
    setDirty(true);
  }, []);

  function toggleSection(key: keyof typeof sections) {
    setSections((p) => ({ ...p, [key]: !p[key] }));
  }
  function openSection(key: keyof typeof sections) {
    setSections((p) => ({ ...p, [key]: true }));
  }

  // ── Headers ──────────────────────────────────────────────────────────────
  function addHeader() { set('headers', [...form.headers, newHeaderRow()]); }
  function removeHeader(id: string) { set('headers', form.headers.filter((h) => h.id !== id)); }
  function updateHeader(id: string, patch: Partial<ApiIntegrationHeaderForm>) {
    set('headers', form.headers.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!form.name.trim()) e.name = 'Integration name is required.';
    if (!form.entity_id) e.entity_id = 'Select a CRM entity.';
    if (!isIncoming && !form.endpoint_url.trim()) e.endpoint_url = 'Endpoint URL is required.';
    if (isIncoming && form.operation !== 'create' && !form.inbound_config.match_field) {
      e.match_field = 'A match field is required for update / upsert.';
    }
    return e;
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      if (e.name || e.entity_id) openSection('general');
      if (e.endpoint_url) openSection('endpoint');
      if (e.match_field) openSection('body');
      showError('Please fix the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      let saved: ApiIntegration;
      if (isEdit && integration) {
        saved = await updateApiIntegration(integration.api_integration_id, form, secretChanged);
      } else {
        saved = await createApiIntegration(form);
      }
      setDirty(false);
      setSecretChanged(false);
      setSavedId(saved.api_integration_id);
      setEndpointKey(saved.endpoint_key);
      setLastRequestAt(saved.last_request_at);
      showSuccess(`Integration "${saved.name}" saved`);
      onSaved(saved);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!savedId) return;
    try {
      const key = await regenerateEndpointKey(savedId);
      setEndpointKey(key);
      showSuccess('Endpoint URL regenerated. The previous URL no longer works.');
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Could not regenerate endpoint');
    }
  }

  // ── Test (outgoing) ─────────────────────────────────────────────────────────
  async function handleTest() {
    if (!integration) { showError('Save the integration first before testing.'); return; }
    if (dirty) { showError('Save your changes before testing.'); return; }
    setTesting(true);
    setTestResult(null);
    openSection('test');
    try {
      const result = await executeApiIntegration(
        integration.api_integration_id, selectedRecordId || undefined
      );
      setTestResult(result);
      fetchIntegrationLogs(integration.api_integration_id, 5).then(setRecentLogs).catch(() => {});
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const selectedEntity = entities.find((e) => e.entity_definition_id === form.entity_id);
  const showBodyBuilder = !isIncoming && HAS_BODY.includes(form.http_method);
  const inboundUrl = endpointKey ? buildInboundEndpointUrl(endpointKey) : '';

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f3f5f8]">
      {/* ── Sticky action bar ── */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-20 shrink-0">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between px-5 py-2.5 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors shrink-0"
            >
              <ArrowLeft size={13} /> Back
            </button>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-tight truncate">
                {form.name.trim() || (isEdit ? integration!.name : 'New Integration')}
              </p>
              {dirty
                ? <p className="text-[10px] text-amber-500 font-medium flex items-center gap-1 leading-none mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Unsaved changes
                  </p>
                : isEdit && <p className="text-[10px] text-slate-400 leading-none mt-0.5">All changes saved</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isEdit && !isIncoming && (
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 border border-blue-300 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
              >
                {testing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                Test Integration
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save
            </button>
          </div>
        </div>
      </div>

      {/* ── Scrollable body (centered) ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-5 py-5 space-y-3.5">

          {/* ── GENERAL CONFIGURATION ── */}
          <Section title="General Configuration" icon={Settings} open={sections.general} onToggle={() => toggleSection('general')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="field-label">Integration Name *</label>
                <input
                  className={`field-input ${errors.name ? 'border-red-300' : ''}`}
                  placeholder="e.g. Send Lead to Automation"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                />
                <FieldError msg={errors.name} />
              </div>

              <div className="sm:col-span-2">
                <label className="field-label">Description</label>
                <textarea
                  className="field-input resize-none"
                  rows={2}
                  placeholder="Optional description"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>

              {/* Direction */}
              <div className="sm:col-span-2">
                <label className="field-label">Integration Direction</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <DirectionCard
                    active={form.direction === 'outgoing'}
                    icon={ArrowUpRight}
                    title="Outgoing Webhook"
                    desc="A CRM event sends data to an external endpoint."
                    onClick={() => set('direction', 'outgoing' as IntegrationDirection)}
                  />
                  <DirectionCard
                    active={form.direction === 'incoming'}
                    icon={ArrowDownLeft}
                    title="Incoming API"
                    desc="External systems call a generated URL to create or update records."
                    onClick={() => set('direction', 'incoming' as IntegrationDirection)}
                  />
                </div>
              </div>

              <div>
                <label className="field-label">CRM Entity *</label>
                <select
                  className={`field-input ${errors.entity_id ? 'border-red-300' : ''}`}
                  value={form.entity_id}
                  onChange={(e) => {
                    set('entity_id', e.target.value);
                    setEntityFields([]);
                    set('body_config', { fields: [], exclude_null_fields: form.body_config.exclude_null_fields });
                    set('inbound_config', { fields: [], match_field: null });
                  }}
                >
                  <option value="">— Select entity —</option>
                  {entities.map((e) => (
                    <option key={e.entity_definition_id} value={e.entity_definition_id}>{e.display_name}</option>
                  ))}
                </select>
                <FieldError msg={errors.entity_id} />
              </div>

              {isIncoming ? (
                <div>
                  <label className="field-label">Operation</label>
                  <select
                    className="field-input"
                    value={form.operation}
                    onChange={(e) => set('operation', e.target.value as InboundOperation)}
                  >
                    {OPERATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="field-label">Trigger Event</label>
                  <select
                    className="field-input"
                    value={form.trigger_event}
                    onChange={(e) => set('trigger_event', e.target.value as TriggerEvent)}
                  >
                    {TRIGGER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => set('is_active', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                  />
                  <span className="text-sm font-medium text-gray-700">Integration is active</span>
                </label>
              </div>
            </div>

            {!isIncoming && form.trigger_event !== 'manual' && (
              <div className="mt-3 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
                <Info size={13} className="shrink-0 mt-0.5" />
                <span>
                  Automatic triggers require a Supabase Database Webhook configured to call the
                  <code className="bg-blue-100 px-1 rounded mx-1">execute-api-integration</code>
                  edge function. The trigger event is stored here for documentation.
                </span>
              </div>
            )}
          </Section>

          {/* ── ENDPOINT ── */}
          <Section title="Endpoint" icon={Globe} open={sections.endpoint} onToggle={() => toggleSection('endpoint')}>
            {isIncoming ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="field-label">Accepted HTTP Method</label>
                    <select
                      className="field-input"
                      value={INBOUND_METHODS.includes(form.http_method) ? form.http_method : 'POST'}
                      onChange={(e) => set('http_method', e.target.value as HttpMethod)}
                    >
                      {INBOUND_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Generated Endpoint</p>
                  <GeneratedEndpointPanel
                    url={inboundUrl}
                    method={INBOUND_METHODS.includes(form.http_method) ? form.http_method : 'POST'}
                    isActive={form.is_active}
                    lastRequestAt={lastRequestAt}
                    saved={!!endpointKey && !dirty}
                    onRegenerate={handleRegenerate}
                  />
                  {dirty && !!endpointKey && (
                    <p className="text-[11px] text-amber-500 mt-2">Save to refresh the endpoint status.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-4">
                <div>
                  <label className="field-label">HTTP Method *</label>
                  <select
                    className="field-input"
                    value={form.http_method}
                    onChange={(e) => set('http_method', e.target.value as HttpMethod)}
                  >
                    {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Endpoint URL *</label>
                  <input
                    className={`field-input font-mono text-xs ${errors.endpoint_url ? 'border-red-300' : ''}`}
                    placeholder="https://api.example.com/webhook"
                    value={form.endpoint_url}
                    onChange={(e) => set('endpoint_url', e.target.value)}
                  />
                  <FieldError msg={errors.endpoint_url} />
                </div>
              </div>
            )}
          </Section>

          {/* ── AUTHENTICATION ── */}
          <Section title="Authentication" icon={ShieldCheck} open={sections.auth} onToggle={() => toggleSection('auth')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="field-label">Authentication Type</label>
                <select
                  className="field-input"
                  value={form.auth_type}
                  onChange={(e) => set('auth_type', e.target.value as AuthType)}
                >
                  {AUTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {form.auth_type === 'bearer' && (
                <div className="sm:col-span-2">
                  <label className="field-label">Bearer Token</label>
                  <SecretInput value={form.auth_secret} placeholder={isEdit && !secretChanged ? SECRET_PLACEHOLDER : 'Enter token…'} show={showSecret} onToggleShow={() => setShowSecret((p) => !p)} onChange={(v) => { set('auth_secret', v); setSecretChanged(true); }} />
                </div>
              )}
              {form.auth_type === 'api_key' && (
                <>
                  <div>
                    <label className="field-label">Header Name</label>
                    <input className="field-input" placeholder="e.g. X-API-Key" value={form.auth_key_name} onChange={(e) => set('auth_key_name', e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">API Key</label>
                    <SecretInput value={form.auth_secret} placeholder={isEdit && !secretChanged ? SECRET_PLACEHOLDER : 'Enter API key…'} show={showSecret} onToggleShow={() => setShowSecret((p) => !p)} onChange={(v) => { set('auth_secret', v); setSecretChanged(true); }} />
                  </div>
                </>
              )}
              {form.auth_type === 'basic' && (
                <>
                  <div>
                    <label className="field-label">Username</label>
                    <input className="field-input" placeholder="Username" value={form.auth_username} onChange={(e) => set('auth_username', e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Password</label>
                    <SecretInput value={form.auth_secret} placeholder={isEdit && !secretChanged ? SECRET_PLACEHOLDER : 'Enter password…'} show={showSecret} onToggleShow={() => setShowSecret((p) => !p)} onChange={(v) => { set('auth_secret', v); setSecretChanged(true); }} />
                  </div>
                </>
              )}
              {form.auth_type === 'custom_header' && (
                <>
                  <div>
                    <label className="field-label">Header Name</label>
                    <input className="field-input" placeholder="e.g. X-Custom-Auth" value={form.auth_key_name} onChange={(e) => set('auth_key_name', e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Header Value</label>
                    <SecretInput value={form.auth_secret} placeholder={isEdit && !secretChanged ? SECRET_PLACEHOLDER : 'Enter value…'} show={showSecret} onToggleShow={() => setShowSecret((p) => !p)} onChange={(v) => { set('auth_secret', v); setSecretChanged(true); }} />
                  </div>
                </>
              )}

              {form.auth_type !== 'none' && (
                <div className="sm:col-span-2 text-xs text-slate-400 flex items-start gap-1.5">
                  <Info size={11} className="mt-0.5 shrink-0" />
                  <span>
                    {isIncoming
                      ? 'Incoming requests must present these exact credentials, or they are rejected with 401.'
                      : 'Secrets are stored securely and never returned after saving. To change a secret, type the new value.'}
                  </span>
                </div>
              )}
            </div>
          </Section>

          {/* ── CUSTOM HEADERS ── */}
          <Section
            title={`Custom Headers${form.headers.length ? ` (${form.headers.length})` : ''}`}
            icon={ListPlus} open={sections.headers} onToggle={() => toggleSection('headers')}
          >
            {form.headers.length > 0 && (
              <div className="mb-3 space-y-2">
                <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1">
                  <span>Header Name</span><span>Value</span><span>Secret</span><span />
                </div>
                {form.headers.map((h) => (
                  <div key={h.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                    <input className="field-input text-xs" placeholder="Header-Name" value={h.header_key} onChange={(e) => updateHeader(h.id, { header_key: e.target.value })} />
                    <input className="field-input text-xs font-mono" type={h.is_secret ? 'password' : 'text'} placeholder="Value" value={h.header_value} onChange={(e) => updateHeader(h.id, { header_value: e.target.value })} />
                    <label className="flex items-center justify-center cursor-pointer px-1" title="Mark as secret (masked in logs)">
                      <input type="checkbox" checked={h.is_secret} onChange={(e) => updateHeader(h.id, { is_secret: e.target.checked })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                    </label>
                    <button onClick={() => removeHeader(h.id)} className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={addHeader} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
              <Plus size={13} /> Add Header
            </button>
            {isIncoming && (
              <p className="text-[11px] text-slate-400 mt-2">
                For incoming APIs, each header above must be present and match exactly on the request.
              </p>
            )}
          </Section>

          {/* ── REQUEST BODY / INCOMING MAPPING ── */}
          {(isIncoming || showBodyBuilder) && (
            <Section
              title={isIncoming ? 'Incoming Field Mapping' : 'Request Body'}
              icon={Braces} open={sections.body} onToggle={() => toggleSection('body')}
            >
              {!form.entity_id ? (
                <p className="text-sm text-slate-400 text-center py-4">Select a CRM entity above to configure field mapping.</p>
              ) : fieldsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
                  <Loader2 size={14} className="animate-spin" /> Loading fields…
                </div>
              ) : isIncoming ? (
                <>
                  <InboundMapping
                    fields={entityFields}
                    config={form.inbound_config}
                    operation={form.operation}
                    lookupCache={lookupCache}
                    lookupLoading={lookupLoading}
                    onLoadLookup={loadLookupFields}
                    onChange={(c: InboundConfig) => set('inbound_config', c)}
                    onTestLookup={testLookupResolution}
                  />
                  <FieldError msg={errors.match_field} />
                </>
              ) : (
                <BodyDesigner
                  entityLogical={selectedEntity?.logical_name ?? ''}
                  fields={entityFields}
                  config={form.body_config}
                  lookupCache={lookupCache}
                  lookupLoading={lookupLoading}
                  onLoadLookup={loadLookupFields}
                  onChange={(c: BodyConfig) => set('body_config', c)}
                />
              )}
            </Section>
          )}

          {/* ── TEST AND LOGS ── */}
          <Section title="Test and Logs" icon={FlaskConical} open={sections.test} onToggle={() => toggleSection('test')}>
            {!isEdit ? (
              <p className="text-sm text-slate-400 text-center py-3">Save the integration to enable testing and view execution logs.</p>
            ) : isIncoming ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Send a request to the generated endpoint to test. Example:
                </p>
                <pre className="text-[11px] bg-[#1e2430] text-emerald-300 rounded-lg p-3.5 overflow-auto leading-relaxed">
{`curl -X ${INBOUND_METHODS.includes(form.http_method) ? form.http_method : 'POST'} '${inboundUrl}' \\
  -H 'Content-Type: application/json'${authCurlHeader(form)} \\
  -d '${exampleInbound(form.inbound_config)}'`}
                </pre>
                <LogsList logs={recentLogs} />
              </div>
            ) : (
              <div className="space-y-3">
                {sampleRecords.length > 0 && (
                  <div>
                    <label className="field-label">Test with record</label>
                    <select className="field-input" value={selectedRecordId} onChange={(e) => setSelectedRecordId(e.target.value)}>
                      <option value="">(no record — empty body)</option>
                      {sampleRecords.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                )}
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                >
                  {testing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  {testing ? 'Running…' : 'Run Test'}
                </button>
                {testResult && <TestResultPanel result={testResult} />}
                <LogsList logs={recentLogs} />
              </div>
            )}
          </Section>

        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title, icon: Icon, open, onToggle, children,
}: {
  title: string; icon: typeof Settings; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
        <span className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
          <Icon size={14} className="text-slate-400" /> {title}
        </span>
        <ChevronDown size={15} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5 pt-1 border-t border-gray-100">{children}</div>}
    </div>
  );
}

function DirectionCard({
  active, icon: Icon, title, desc, onClick,
}: { active: boolean; icon: typeof Settings; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border px-3.5 py-3 transition-colors ${
        active ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={15} className={active ? 'text-blue-600' : 'text-slate-400'} />
        <span className={`text-sm font-semibold ${active ? 'text-blue-700' : 'text-gray-700'}`}>{title}</span>
      </div>
      <p className="text-[11px] text-slate-500 leading-snug">{desc}</p>
    </button>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {msg}</p>;
}

function SecretInput({
  value, placeholder, show, onToggleShow, onChange,
}: { value: string; placeholder: string; show: boolean; onToggleShow: () => void; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input className="field-input pr-9 font-mono text-xs" type={show ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" />
      <button type="button" onClick={onToggleShow} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        {show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );
}

function LogsList({ logs }: { logs: ApiIntegrationLog[] }) {
  if (!logs.length) return <p className="text-[11px] text-slate-400">No recent executions.</p>;
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Recent executions</p>
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
        {logs.map((l) => (
          <div key={l.api_integration_log_id} className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="flex items-center gap-2 min-w-0">
              {l.is_success ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> : <XCircle size={12} className="text-red-500 shrink-0" />}
              <span className="text-slate-600 truncate">{l.request_method} · {l.response_status ?? l.error_message ?? '—'}</span>
            </span>
            <span className="text-slate-400 shrink-0">{l.duration_ms ?? 0}ms · {new Date(l.triggered_at).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TestResultPanel({ result }: { result: TestExecutionResult }) {
  function pretty(v: unknown): string {
    try {
      if (typeof v === 'string') return JSON.stringify(JSON.parse(v), null, 2);
      return JSON.stringify(v, null, 2);
    } catch { return String(v ?? ''); }
  }
  const ok = result.ok;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-2.5 text-xs font-semibold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
        <span className="flex items-center gap-1.5 min-w-0 truncate">
          {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
          {result.request.method} {result.request.url}
        </span>
        <span className="shrink-0">{result.status_code || (result.error ? 'Error' : '—')} · {result.duration_ms}ms</span>
      </div>
      {result.error && (
        <div className="px-4 py-2.5 bg-red-50 border-t border-red-200 text-xs text-red-600 flex items-center gap-1.5">
          <AlertCircle size={12} /> {result.error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:divide-x divide-gray-200">
        <div className="p-4">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Request Headers</p>
          <pre className="text-[11px] text-slate-700 overflow-auto max-h-40 leading-relaxed">{pretty(result.request.headers)}</pre>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Request Body</p>
          <pre className="text-[11px] text-slate-700 overflow-auto max-h-40 leading-relaxed">{pretty(result.request.body) || '(none)'}</pre>
        </div>
      </div>
      <div className="border-t border-gray-200 p-4">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Response <span className={`ml-2 font-bold normal-case text-xs ${ok ? 'text-emerald-600' : 'text-red-500'}`}>{result.status_code}</span>
        </p>
        <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-3 text-slate-700 overflow-auto max-h-48 leading-relaxed">
          {result.response_body ? pretty(result.response_body) : '(empty)'}
        </pre>
      </div>
    </div>
  );
}

// ── helpers for curl example ─────────────────────────────────────────────────

function authCurlHeader(form: ApiIntegrationFormData): string {
  switch (form.auth_type) {
    case 'bearer': return ` \\\n  -H 'Authorization: Bearer <token>'`;
    case 'api_key':
    case 'custom_header': return form.auth_key_name ? ` \\\n  -H '${form.auth_key_name}: <secret>'` : '';
    case 'basic': return ` \\\n  -u '${form.auth_username || '<user>'}:<password>'`;
    default: return '';
  }
}

function exampleInbound(config: InboundConfig): string {
  const out: Record<string, unknown> = {};
  for (const f of config.fields) {
    if (!f.json_path) continue;
    let sample: unknown = 'string';
    if (f.target_field_type === 'number' || f.target_field_type === 'decimal' || f.target_field_type === 'money') sample = 0;
    if (f.target_field_type === 'boolean') sample = true;
    if (f.is_lookup) sample = f.lookup_match_by === 'id' ? 'related-guid' : 'related name';
    const parts = f.json_path.split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = sample;
  }
  return JSON.stringify(out);
}
