import { useState, useEffect, useCallback } from 'react';
import {
  Save, ArrowLeft, Plus, Trash2, Eye, EyeOff, Play,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2, XCircle,
  Info, Loader2, Database,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type {
  ApiIntegration,
  ApiIntegrationFormData,
  ApiIntegrationHeaderForm,
  BodyConfig,
  BodyFieldMapping,
  EntityFieldInfo,
  LookupEntityField,
  TestExecutionResult,
  AuthType,
  HttpMethod,
  TriggerEvent,
} from '../../types/apiIntegration';
import {
  createApiIntegration,
  updateApiIntegration,
  fetchIntegrationHeaders,
  fetchEntityFieldsForIntegration,
  fetchLookupEntityFields,
  fetchSampleRecords,
  executeApiIntegration,
} from '../../services/apiIntegrationService';
import { fetchEntities } from '../../services/entityService';
import type { EntityDefinition } from '../../types/entity';

interface Props {
  integration?: ApiIntegration;
  onBack: () => void;
  onSaved: (integration: ApiIntegration) => void;
}

const HTTP_METHODS: HttpMethod[] = ['POST', 'GET', 'PUT', 'PATCH', 'DELETE'];
const TRIGGER_OPTIONS: { value: TriggerEvent; label: string }[] = [
  { value: 'manual',  label: 'Manual only' },
  { value: 'created', label: 'Record Created' },
  { value: 'updated', label: 'Record Updated' },
  { value: 'deleted', label: 'Record Deleted' },
];
const AUTH_OPTIONS: { value: AuthType; label: string }[] = [
  { value: 'none',          label: 'No Authentication' },
  { value: 'bearer',        label: 'Bearer Token' },
  { value: 'api_key',       label: 'API Key' },
  { value: 'basic',         label: 'Basic Authentication' },
  { value: 'custom_header', label: 'Custom Header' },
];
const HAS_BODY: HttpMethod[] = ['POST', 'PUT', 'PATCH'];

// Placeholder shown in the secret field when editing an existing integration
const SECRET_PLACEHOLDER = '●●●●●●●●';

function emptyForm(): ApiIntegrationFormData {
  return {
    name: '',
    description: '',
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

  // Entity / field state
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [entityFields, setEntityFields] = useState<EntityFieldInfo[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [lookupCache, setLookupCache] = useState<Record<string, LookupEntityField[]>>({});
  const [lookupLoading, setLookupLoading] = useState<Record<string, boolean>>({});

  // Test state
  const [sampleRecords, setSampleRecords] = useState<{ id: string; label: string }[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestExecutionResult | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  // Collapsible section state
  const [sections, setSections] = useState({
    general: true,
    auth: true,
    headers: true,
    body: true,
    test: false,
  });

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchEntities().then(setEntities).catch(() => {});
  }, []);

  useEffect(() => {
    if (!integration) return;
    fetchIntegrationHeaders(integration.api_integration_id).then((headers) => {
      setForm({
        name: integration.name,
        description: integration.description ?? '',
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
        headers: headers.map((h) => ({
          id: crypto.randomUUID(),
          header_key: h.header_key,
          header_value: h.header_value,
          is_secret: h.is_secret,
        })),
      });
    });
  }, [integration]);

  useEffect(() => {
    if (form.entity_id) loadEntityFields(form.entity_id);
    else setEntityFields([]);
  }, [form.entity_id]);

  async function loadEntityFields(entityId: string) {
    setFieldsLoading(true);
    try {
      const fields = await fetchEntityFieldsForIntegration(entityId);
      setEntityFields(fields);
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
      const fields = await fetchLookupEntityFields(lookupEntityId);
      setLookupCache((p) => ({ ...p, [lookupEntityId]: fields }));
    } catch {
      setLookupCache((p) => ({ ...p, [lookupEntityId]: [] }));
    } finally {
      setLookupLoading((p) => ({ ...p, [lookupEntityId]: false }));
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const set = useCallback(<K extends keyof ApiIntegrationFormData>(
    key: K,
    value: ApiIntegrationFormData[K]
  ) => {
    setForm((p) => ({ ...p, [key]: value }));
    setDirty(true);
  }, []);

  function toggleSection(key: keyof typeof sections) {
    setSections((p) => ({ ...p, [key]: !p[key] }));
  }

  // ── Headers ───────────────────────────────────────────────────────────────────

  function addHeader() {
    set('headers', [...form.headers, newHeaderRow()]);
  }
  function removeHeader(id: string) {
    set('headers', form.headers.filter((h) => h.id !== id));
  }
  function updateHeader(id: string, patch: Partial<ApiIntegrationHeaderForm>) {
    set('headers', form.headers.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }

  // ── Body builder ───────────────────────────────────────────────────────────

  function addBodyField(field: EntityFieldInfo) {
    const isLookup = field.field_type?.name === 'lookup';
    const mapping: BodyFieldMapping = {
      id: crypto.randomUUID(),
      json_key: field.logical_name,
      value_type: 'field',
      field_definition_id: field.field_definition_id,
      field_physical_column: field.physical_column_name,
      field_display_name: field.display_name,
      field_type_name: field.field_type?.name ?? 'text',
      is_lookup: isLookup,
      lookup_value_type: isLookup ? 'id' : undefined,
      lookup_entity_id: field.lookup_entity?.entity_definition_id,
      lookup_entity_physical_table: field.lookup_entity?.physical_table_name,
      lookup_entity_pk: field.lookup_entity
        ? `${field.lookup_entity.logical_name}_id`
        : undefined,
      lookup_entity_primary_field: field.lookup_entity?.primary_field_name,
      is_required: false,
    };
    if (isLookup && field.lookup_entity?.entity_definition_id) {
      loadLookupFields(field.lookup_entity.entity_definition_id);
    }
    updateBodyConfig({
      ...form.body_config,
      fields: [...form.body_config.fields, mapping],
    });
  }

  function addStaticField() {
    const mapping: BodyFieldMapping = {
      id: crypto.randomUUID(),
      json_key: 'value',
      value_type: 'static',
      static_value: '',
      is_required: false,
    };
    updateBodyConfig({ ...form.body_config, fields: [...form.body_config.fields, mapping] });
  }

  function removeBodyField(id: string) {
    updateBodyConfig({
      ...form.body_config,
      fields: form.body_config.fields.filter((f) => f.id !== id),
    });
  }

  function updateBodyField(id: string, patch: Partial<BodyFieldMapping>) {
    updateBodyConfig({
      ...form.body_config,
      fields: form.body_config.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  }

  function updateBodyConfig(config: BodyConfig) {
    set('body_config', config);
  }

  // ── JSON preview ──────────────────────────────────────────────────────────

  function buildPreview(): string {
    const entityLogical =
      entities.find((e) => e.entity_definition_id === form.entity_id)?.logical_name ?? 'record';

    const preview: Record<string, unknown> = {};
    for (const f of form.body_config.fields) {
      let val: unknown;
      if (f.value_type === 'static') {
        val = f.static_value ?? '';
      } else if (f.is_lookup) {
        switch (f.lookup_value_type) {
          case 'id':
            val = `{{${entityLogical}.${f.field_physical_column}}}`;
            break;
          case 'primary_name':
            val = `{{${entityLogical}.${f.field_physical_column}.${f.lookup_entity_primary_field ?? 'name'}}}`;
            break;
          case 'field':
            val = `{{${entityLogical}.${f.field_physical_column}.${f.lookup_field_physical_column ?? 'field'}}}`;
            break;
        }
      } else {
        val = `{{${entityLogical}.${f.field_physical_column ?? f.json_key}}}`;
      }
      setNested(preview, f.json_key, val);
    }
    return JSON.stringify(preview, null, 2);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) { showError('Integration name is required.'); return; }
    if (!form.entity_id)    { showError('Please select a CRM entity.'); return; }
    if (!form.endpoint_url.trim()) { showError('Endpoint URL is required.'); return; }

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
      showSuccess(`Integration "${saved.name}" saved`);
      onSaved(saved);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Test ──────────────────────────────────────────────────────────────────

  async function handleTest() {
    if (!integration) {
      showError('Save the integration first before testing.');
      return;
    }
    setTesting(true);
    setTestResult(null);
    setTestOpen(true);
    try {
      const result = await executeApiIntegration(
        integration.api_integration_id,
        selectedRecordId || undefined
      );
      setTestResult(result);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  }

  function prettyJson(v: unknown): string {
    try {
      if (typeof v === 'string') return JSON.stringify(JSON.parse(v), null, 2);
      return JSON.stringify(v, null, 2);
    } catch { return String(v ?? ''); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const showBodyBuilder = HAS_BODY.includes(form.http_method);
  const selectedEntity = entities.find((e) => e.entity_definition_id === form.entity_id);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={13} /> Back
          </button>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-none">
              {isEdit ? integration!.name : 'New Integration'}
            </p>
            {dirty && <p className="text-[10px] text-amber-500 mt-0.5">Unsaved changes</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEdit && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 border border-blue-300 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {testing
                ? <Loader2 size={12} className="animate-spin" />
                : <Play size={12} />
              }
              Test
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

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto bg-[#f7f8fa] px-6 py-5 space-y-4">

        {/* ── GENERAL ── */}
        <SectionCard
          title="General"
          open={sections.general}
          onToggle={() => toggleSection('general')}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="field-label">Integration Name *</label>
              <input
                className="field-input"
                placeholder="e.g. Send Lead to Automation"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="field-label">Description</label>
              <textarea
                className="field-input resize-none"
                rows={2}
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">CRM Entity *</label>
              <select
                className="field-input"
                value={form.entity_id}
                onChange={(e) => {
                  set('entity_id', e.target.value);
                  setEntityFields([]);
                  updateBodyConfig({ fields: [], exclude_null_fields: form.body_config.exclude_null_fields });
                }}
              >
                <option value="">— Select entity —</option>
                {entities.map((e) => (
                  <option key={e.entity_definition_id} value={e.entity_definition_id}>
                    {e.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Trigger Event</label>
              <select
                className="field-input"
                value={form.trigger_event}
                onChange={(e) => set('trigger_event', e.target.value as TriggerEvent)}
              >
                {TRIGGER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">HTTP Method *</label>
              <select
                className="field-input"
                value={form.http_method}
                onChange={(e) => set('http_method', e.target.value as HttpMethod)}
              >
                {HTTP_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="field-label">Endpoint URL *</label>
                <input
                  className="field-input font-mono text-xs"
                  placeholder="https://api.example.com/webhook"
                  value={form.endpoint_url}
                  onChange={(e) => set('endpoint_url', e.target.value)}
                />
              </div>
            </div>
            <div className="col-span-2">
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

          {form.trigger_event !== 'manual' && (
            <div className="mt-3 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>
                Automatic triggers require a Supabase Database Webhook configured to call the
                <code className="bg-blue-100 px-1 rounded mx-1">execute-api-integration</code>
                edge function. The trigger event setting is stored here for documentation.
              </span>
            </div>
          )}
        </SectionCard>

        {/* ── AUTHENTICATION ── */}
        <SectionCard
          title="Authentication"
          open={sections.auth}
          onToggle={() => toggleSection('auth')}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="field-label">Authentication Type</label>
              <select
                className="field-input"
                value={form.auth_type}
                onChange={(e) => set('auth_type', e.target.value as AuthType)}
              >
                {AUTH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {form.auth_type === 'bearer' && (
              <div className="col-span-2">
                <label className="field-label">Bearer Token</label>
                <SecretInput
                  value={form.auth_secret}
                  placeholder={isEdit && !secretChanged ? SECRET_PLACEHOLDER : 'Enter token…'}
                  show={showSecret}
                  onToggleShow={() => setShowSecret((p) => !p)}
                  onChange={(v) => { set('auth_secret', v); setSecretChanged(true); }}
                />
              </div>
            )}

            {form.auth_type === 'api_key' && (
              <>
                <div>
                  <label className="field-label">Header Name</label>
                  <input
                    className="field-input"
                    placeholder="e.g. X-API-Key"
                    value={form.auth_key_name}
                    onChange={(e) => set('auth_key_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">API Key</label>
                  <SecretInput
                    value={form.auth_secret}
                    placeholder={isEdit && !secretChanged ? SECRET_PLACEHOLDER : 'Enter API key…'}
                    show={showSecret}
                    onToggleShow={() => setShowSecret((p) => !p)}
                    onChange={(v) => { set('auth_secret', v); setSecretChanged(true); }}
                  />
                </div>
              </>
            )}

            {form.auth_type === 'basic' && (
              <>
                <div>
                  <label className="field-label">Username</label>
                  <input
                    className="field-input"
                    placeholder="Username"
                    value={form.auth_username}
                    onChange={(e) => set('auth_username', e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Password</label>
                  <SecretInput
                    value={form.auth_secret}
                    placeholder={isEdit && !secretChanged ? SECRET_PLACEHOLDER : 'Enter password…'}
                    show={showSecret}
                    onToggleShow={() => setShowSecret((p) => !p)}
                    onChange={(v) => { set('auth_secret', v); setSecretChanged(true); }}
                  />
                </div>
              </>
            )}

            {form.auth_type === 'custom_header' && (
              <>
                <div>
                  <label className="field-label">Header Name</label>
                  <input
                    className="field-input"
                    placeholder="e.g. X-Custom-Auth"
                    value={form.auth_key_name}
                    onChange={(e) => set('auth_key_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Header Value</label>
                  <SecretInput
                    value={form.auth_secret}
                    placeholder={isEdit && !secretChanged ? SECRET_PLACEHOLDER : 'Enter value…'}
                    show={showSecret}
                    onToggleShow={() => setShowSecret((p) => !p)}
                    onChange={(v) => { set('auth_secret', v); setSecretChanged(true); }}
                  />
                </div>
              </>
            )}

            {form.auth_type !== 'none' && (
              <div className="col-span-2 text-xs text-slate-400 flex items-center gap-1.5">
                <Info size={11} />
                Secrets are stored securely and never returned after saving. To change a secret, type the new value.
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── CUSTOM HEADERS ── */}
        <SectionCard
          title={`Custom Headers${form.headers.length ? ` (${form.headers.length})` : ''}`}
          open={sections.headers}
          onToggle={() => toggleSection('headers')}
        >
          {form.headers.length > 0 && (
            <div className="mb-3 space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide px-1">
                <span>Header Name</span>
                <span>Value</span>
                <span>Secret</span>
                <span />
              </div>
              {form.headers.map((h) => (
                <div key={h.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                  <input
                    className="field-input text-xs"
                    placeholder="Header-Name"
                    value={h.header_key}
                    onChange={(e) => updateHeader(h.id, { header_key: e.target.value })}
                  />
                  <input
                    className="field-input text-xs font-mono"
                    type={h.is_secret ? 'password' : 'text'}
                    placeholder="Value"
                    value={h.header_value}
                    onChange={(e) => updateHeader(h.id, { header_value: e.target.value })}
                  />
                  <label className="flex items-center justify-center cursor-pointer" title="Mark as secret (masked in logs)">
                    <input
                      type="checkbox"
                      checked={h.is_secret}
                      onChange={(e) => updateHeader(h.id, { is_secret: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                    />
                  </label>
                  <button
                    onClick={() => removeHeader(h.id)}
                    className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={addHeader}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            <Plus size={13} /> Add Header
          </button>
        </SectionCard>

        {/* ── REQUEST BODY ── */}
        {showBodyBuilder && (
          <SectionCard
            title="Request Body"
            open={sections.body}
            onToggle={() => toggleSection('body')}
          >
            {!form.entity_id ? (
              <p className="text-sm text-slate-400 text-center py-4">
                Select a CRM entity in General to configure the request body.
              </p>
            ) : fieldsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
                <Loader2 size={14} className="animate-spin" /> Loading fields…
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.body_config.exclude_null_fields}
                      onChange={(e) =>
                        updateBodyConfig({ ...form.body_config, exclude_null_fields: e.target.checked })
                      }
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                    />
                    <span className="text-sm text-gray-700">Exclude null / empty optional fields</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <AddFieldDropdown
                      fields={entityFields}
                      onAdd={addBodyField}
                    />
                    <button
                      onClick={addStaticField}
                      className="flex items-center gap-1.5 text-xs text-slate-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
                    >
                      <Plus size={12} /> Static Value
                    </button>
                  </div>
                </div>

                {form.body_config.fields.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    <div className="grid grid-cols-[150px_1fr_140px_60px_auto] gap-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide px-1">
                      <span>JSON Key (dot path)</span>
                      <span>Source</span>
                      <span>Lookup sends</span>
                      <span>Required</span>
                      <span />
                    </div>
                    {form.body_config.fields.map((mapping) => (
                      <BodyFieldRow
                        key={mapping.id}
                        mapping={mapping}
                        entityLogical={selectedEntity?.logical_name ?? ''}
                        lookupCache={lookupCache}
                        lookupLoading={lookupLoading}
                        onLoadLookup={loadLookupFields}
                        onChange={(patch) => updateBodyField(mapping.id, patch)}
                        onRemove={() => removeBodyField(mapping.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-4 text-sm text-slate-400 justify-center border border-dashed border-gray-200 rounded-lg mb-4">
                    <Database size={14} />
                    Use "Add Field" to map entity fields into the request body.
                  </div>
                )}

                {/* Live JSON preview */}
                {form.body_config.fields.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                      Live JSON Preview
                    </p>
                    <pre className="text-xs bg-[#1e2430] text-emerald-300 rounded-lg p-4 overflow-auto max-h-56 leading-relaxed">
                      {buildPreview()}
                    </pre>
                  </div>
                )}
              </>
            )}
          </SectionCard>
        )}

        {/* ── TEST PANEL ── */}
        {isEdit && (
          <SectionCard
            title="Test Integration"
            open={sections.test || testOpen}
            onToggle={() => toggleSection('test')}
          >
            <div className="space-y-3">
              {sampleRecords.length > 0 && (
                <div>
                  <label className="field-label">Test with record</label>
                  <select
                    className="field-input"
                    value={selectedRecordId}
                    onChange={(e) => setSelectedRecordId(e.target.value)}
                  >
                    <option value="">(no record — empty body)</option>
                    {sampleRecords.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
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

              {testResult && (
                <TestResultPanel result={testResult} />
              )}
            </div>
          </SectionCard>
        )}

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  title, open, onToggle, children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</span>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function SecretInput({
  value, placeholder, show, onToggleShow, onChange,
}: {
  value: string;
  placeholder: string;
  show: boolean;
  onToggleShow: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <input
        className="field-input pr-9 font-mono text-xs"
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        {show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );
}

function AddFieldDropdown({
  fields,
  onAdd,
}: {
  fields: EntityFieldInfo[];
  onAdd: (field: EntityFieldInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const visible = fields.filter((f) =>
    f.display_name.toLowerCase().includes(search.toLowerCase()) ||
    f.physical_column_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-xs text-blue-600 border border-blue-300 bg-blue-50 rounded-lg px-2.5 py-1.5 hover:bg-blue-100 transition-colors font-medium"
      >
        <Plus size={12} /> Add Field
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className="absolute right-0 top-8 z-20 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100">
              <input
                autoFocus
                type="search"
                placeholder="Search fields…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs border-none outline-none bg-transparent"
              />
            </div>
            <div className="max-h-56 overflow-auto">
              {visible.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No fields match</p>
              ) : (
                visible.map((f) => (
                  <button
                    key={f.field_definition_id}
                    onClick={() => { onAdd(f); setOpen(false); setSearch(''); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-blue-50 transition-colors"
                  >
                    <span className="text-[10px] font-mono bg-gray-100 text-slate-500 px-1.5 py-0.5 rounded shrink-0">
                      {f.field_type?.name ?? 'text'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{f.display_name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{f.physical_column_name}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BodyFieldRow({
  mapping,
  entityLogical,
  lookupCache,
  lookupLoading,
  onLoadLookup,
  onChange,
  onRemove,
}: {
  mapping: BodyFieldMapping;
  entityLogical: string;
  lookupCache: Record<string, LookupEntityField[]>;
  lookupLoading: Record<string, boolean>;
  onLoadLookup: (entityId: string) => void;
  onChange: (patch: Partial<BodyFieldMapping>) => void;
  onRemove: () => void;
}) {
  const relFields = mapping.lookup_entity_id ? (lookupCache[mapping.lookup_entity_id] ?? []) : [];
  const relLoading = mapping.lookup_entity_id ? (lookupLoading[mapping.lookup_entity_id] ?? false) : false;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[150px_1fr_140px_60px_auto] gap-2 items-center">
        {/* JSON Key */}
        <input
          className="field-input text-xs font-mono"
          placeholder="json.key"
          value={mapping.json_key}
          onChange={(e) => onChange({ json_key: e.target.value })}
          title="Dot-notation JSON path, e.g. customer.email"
        />

        {/* Source */}
        {mapping.value_type === 'static' ? (
          <input
            className="field-input text-xs"
            placeholder="Static value"
            value={mapping.static_value ?? ''}
            onChange={(e) => onChange({ static_value: e.target.value })}
          />
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-slate-600 truncate">
            <span className="text-[10px] font-mono bg-gray-200 text-slate-500 px-1 rounded shrink-0">
              {mapping.field_type_name ?? 'field'}
            </span>
            <span className="truncate">{mapping.field_display_name ?? mapping.field_physical_column}</span>
          </div>
        )}

        {/* Lookup sends */}
        {mapping.is_lookup ? (
          <select
            className="field-input text-xs"
            value={mapping.lookup_value_type ?? 'id'}
            onChange={(e) => {
              const v = e.target.value as BodyFieldMapping['lookup_value_type'];
              onChange({ lookup_value_type: v });
              if (v === 'field' && mapping.lookup_entity_id) onLoadLookup(mapping.lookup_entity_id);
            }}
          >
            <option value="id">Record ID (FK)</option>
            <option value="primary_name">Primary Name</option>
            <option value="field">Specific Field…</option>
          </select>
        ) : (
          <div />
        )}

        {/* Required */}
        <div className="flex justify-center">
          <input
            type="checkbox"
            checked={mapping.is_required ?? false}
            onChange={(e) => onChange({ is_required: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
            title="Always include even when null"
          />
        </div>

        {/* Remove */}
        <button
          onClick={onRemove}
          className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Specific field selector for lookup */}
      {mapping.is_lookup && mapping.lookup_value_type === 'field' && (
        <div className="ml-[162px]">
          {relLoading ? (
            <p className="text-xs text-slate-400">Loading fields…</p>
          ) : (
            <select
              className="field-input text-xs"
              value={mapping.lookup_field_physical_column ?? ''}
              onChange={(e) => {
                const chosen = relFields.find((f) => f.physical_column_name === e.target.value);
                onChange({
                  lookup_field_physical_column: e.target.value,
                  lookup_field_display_name: chosen?.display_name,
                });
              }}
            >
              <option value="">— choose field —</option>
              {relFields.map((f) => (
                <option key={f.field_definition_id} value={f.physical_column_name}>
                  {f.display_name} ({f.physical_column_name})
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

function TestResultPanel({ result }: { result: TestExecutionResult }) {
  function prettyJson(v: unknown): string {
    try {
      if (typeof v === 'string') return JSON.stringify(JSON.parse(v), null, 2);
      return JSON.stringify(v, null, 2);
    } catch { return String(v ?? ''); }
  }

  const statusOk = result.ok;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mt-3">
      {/* Status bar */}
      <div className={`flex items-center justify-between px-4 py-2.5 text-xs font-semibold ${statusOk ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
        <span className="flex items-center gap-1.5">
          {statusOk
            ? <CheckCircle2 size={13} />
            : <XCircle size={13} />
          }
          {result.request.method} {result.request.url}
        </span>
        <span>{result.status_code || (result.error ? 'Error' : '—')} · {result.duration_ms}ms</span>
      </div>

      {result.error && (
        <div className="px-4 py-2.5 bg-red-50 border-t border-red-200 text-xs text-red-600 flex items-center gap-1.5">
          <AlertCircle size={12} /> {result.error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-0 divide-x divide-gray-200">
        <div className="p-4">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Request Headers</p>
          <pre className="text-[11px] text-slate-700 overflow-auto max-h-40 leading-relaxed">
            {prettyJson(result.request.headers)}
          </pre>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Request Body</p>
          <pre className="text-[11px] text-slate-700 overflow-auto max-h-40 leading-relaxed">
            {prettyJson(result.request.body) || '(none)'}
          </pre>
        </div>
      </div>

      <div className="border-t border-gray-200 p-4">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Response
          <span className={`ml-2 font-bold normal-case text-xs ${statusOk ? 'text-emerald-600' : 'text-red-500'}`}>
            {result.status_code}
          </span>
        </p>
        <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-3 text-slate-700 overflow-auto max-h-48 leading-relaxed">
          {result.response_body ? prettyJson(result.response_body) : '(empty)'}
        </pre>
      </div>
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}
