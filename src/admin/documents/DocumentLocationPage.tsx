import FilterSelect from '../../app/components/FilterSelect';
import { useState, useEffect, useCallback } from 'react';
import { FolderCog, Plus, Check, X, CreditCard as Edit2, Trash2, ToggleLeft, ToggleRight, FolderOpen, Plug, KeyRound, Loader2 } from 'lucide-react';
import SearchableSelect from '../../app/components/SearchableSelect';
import { useToast } from '../../app/context/ToastContext';
import { fetchEntities } from '../../services/entityService';
import {
  fetchDocumentLocations,
  upsertDocumentLocation,
  deleteDocumentLocation,
  setStorageSecret,
  hasStorageSecret,
  deleteStorageSecret,
  testStorageConnection,
} from '../../services/documentLocationService';
import type { DocumentLocationConfig, StorageType, StorageCredentials } from '../../types/documentLocation';
import { STORAGE_TYPES } from '../../types/documentLocation';
import type { EntityDefinition } from '../../types/entity';
import ConfirmDialog from '../components/ConfirmDialog';

const CREDENTIALED: StorageType[] = ['s3', 'sharepoint'];

interface EditRow {
  entity_logical_name: string;
  entity_display_name: string;
  root_location: string;
  storage_type: StorageType;
  is_active: boolean;
  isNew: boolean;
  creds: Record<string, string>;
  forcePathStyle: boolean;
}

const ROOT_PLACEHOLDER: Record<StorageType, string> = {
  local: 'C:\\Users\\you\\MontyFinanceStorage\\Lead',
  nas: '\\\\nas-server\\share\\MontyFinanceStorage\\Lead',
  s3: 'my-bucket/leads',
  sharepoint: 'Leads   (folder within the document library)',
};

const TYPE_LABEL: Record<StorageType, string> = Object.fromEntries(
  STORAGE_TYPES.map((t) => [t.value, t.label])
) as Record<StorageType, string>;

function buildCreds(row: EditRow): StorageCredentials | null {
  const c = row.creds;
  if (row.storage_type === 's3') {
    if (!c.accessKeyId && !c.secretAccessKey && !c.region && !c.endpoint) return null;
    return {
      accessKeyId: c.accessKeyId ?? '',
      secretAccessKey: c.secretAccessKey ?? '',
      region: c.region ?? '',
      ...(c.endpoint ? { endpoint: c.endpoint } : {}),
      forcePathStyle: row.forcePathStyle,
    };
  }
  if (row.storage_type === 'sharepoint') {
    if (!c.tenantId && !c.clientId && !c.clientSecret && !c.driveId) return null;
    return {
      tenantId: c.tenantId ?? '',
      clientId: c.clientId ?? '',
      clientSecret: c.clientSecret ?? '',
      driveId: c.driveId ?? '',
    };
  }
  return null;
}

export default function DocumentLocationPage() {
  const { showSuccess, showError } = useToast();
  const [configs, setConfigs] = useState<DocumentLocationConfig[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [secretsPresent, setSecretsPresent] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<EditRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentLocationConfig | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, ents] = await Promise.all([fetchDocumentLocations(), fetchEntities()]);
      setConfigs(cfg);
      setEntities(ents);
      const credentialed = cfg.filter((c) => CREDENTIALED.includes(c.storage_type));
      const flags = await Promise.all(
        credentialed.map(async (c) => [c.entity_logical_name, await hasStorageSecret(c.entity_logical_name).catch(() => false)] as const)
      );
      setSecretsPresent(Object.fromEntries(flags));
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const configuredNames = new Set(configs.map((c) => c.entity_logical_name));
  const entityOptions = entities
    .filter((e) => (editRow && !editRow.isNew ? true : !configuredNames.has(e.logical_name)))
    .map((e) => ({ value: e.logical_name, label: e.display_name, sublabel: e.logical_name }));

  const startNew = () => setEditRow({
    entity_logical_name: '', entity_display_name: '', root_location: '',
    storage_type: 'local', is_active: true, isNew: true, creds: {}, forcePathStyle: false,
  });

  const startEdit = (c: DocumentLocationConfig) => setEditRow({
    entity_logical_name: c.entity_logical_name,
    entity_display_name: c.entity_display_name,
    root_location: c.root_location,
    storage_type: c.storage_type,
    is_active: c.is_active,
    isNew: false,
    creds: {},
    forcePathStyle: false,
  });

  const handleSave = async () => {
    if (!editRow) return;
    if (!editRow.entity_logical_name) return showError('Please select an entity.');
    if (!editRow.root_location.trim()) return showError('Root location / URL is required.');

    const needsCreds = CREDENTIALED.includes(editRow.storage_type);
    const creds = buildCreds(editRow);
    if (needsCreds && !creds && !secretsPresent[editRow.entity_logical_name]) {
      return showError(`Enter ${TYPE_LABEL[editRow.storage_type]} credentials before saving.`);
    }

    setSaving(true);
    try {
      await upsertDocumentLocation({
        entity_logical_name: editRow.entity_logical_name,
        entity_display_name: editRow.entity_display_name,
        root_location: editRow.root_location.trim(),
        storage_type: editRow.storage_type,
        is_active: editRow.is_active,
      });
      if (needsCreds && creds) {
        await setStorageSecret(editRow.entity_logical_name, creds);
      }
      setEditRow(null);
      await load();
      showSuccess('Document location saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (c: DocumentLocationConfig) => {
    setSaving(true);
    try {
      await upsertDocumentLocation({
        entity_logical_name: c.entity_logical_name,
        entity_display_name: c.entity_display_name,
        root_location: c.root_location,
        storage_type: c.storage_type,
        is_active: !c.is_active,
      });
      await load();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (c: DocumentLocationConfig) => {
    setTesting(c.entity_logical_name);
    try {
      const result = await testStorageConnection(c.entity_logical_name);
      if (result.ok) showSuccess(`✓ ${result.message}`);
      else showError(result.message);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      if (CREDENTIALED.includes(deleteTarget.storage_type)) {
        await deleteStorageSecret(deleteTarget.entity_logical_name).catch(() => {});
      }
      await deleteDocumentLocation(deleteTarget.entity_logical_name);
      setDeleteTarget(null);
      await load();
      showSuccess('Document location removed');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <FolderOpen size={18} className="text-blue-500" />
          </div>
          <div className="flex-1 min-w-0 text-sm text-gray-600 leading-relaxed">
            <p className="font-semibold text-gray-900 mb-0.5">Per-entity storage</p>
            Pick a storage type and root for each entity. Files are stored at
            <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded mx-1">&lt;root&gt;/&lt;record id&gt;/&lt;file&gt;</span>
            — a per-record subfolder (Local/NAS) or key prefix (S3/SharePoint). The path is recorded in the database.
            S3 &amp; SharePoint credentials are stored encrypted in Supabase Vault.
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <FolderCog size={15} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-800">Document Locations</span>
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{configs.length}</span>
            </div>
            {!editRow && (
              <button
                onClick={startNew}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 py-1.5 transition-colors"
              >
                <Plus size={13} />
                Add Location
              </button>
            )}
          </div>

          {editRow && (
            <EditForm
              row={editRow}
              entityOptions={entityOptions}
              secretSaved={!!secretsPresent[editRow.entity_logical_name]}
              onChange={setEditRow}
              onSave={handleSave}
              onCancel={() => setEditRow(null)}
              saving={saving}
            />
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 w-52">Entity</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3 w-32">Type</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Root Location / URL</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3 w-24">Status</th>
                <th className="px-5 py-3 w-36"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {configs.map((c) => (
                <ConfigRow
                  key={c.entity_logical_name}
                  config={c}
                  credentialed={CREDENTIALED.includes(c.storage_type)}
                  secretSaved={!!secretsPresent[c.entity_logical_name]}
                  testing={testing === c.entity_logical_name}
                  disabled={saving || !!editRow}
                  onEdit={() => startEdit(c)}
                  onTest={() => handleTest(c)}
                  onToggleActive={() => handleToggleActive(c)}
                  onDelete={() => setDeleteTarget(c)}
                />
              ))}
            </tbody>
          </table>

          {configs.length === 0 && !editRow && (
            <div className="py-12 text-center text-sm text-gray-400">
              No document locations configured yet. Add one to start storing files per entity.
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          Local/NAS roots are reached by the file server on the machine it runs on. S3 uses
          <span className="font-mono mx-1">bucket/prefix</span>; SharePoint uses a folder within the configured library drive.
          Deactivating blocks new uploads without removing existing files.
        </p>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Remove document location"
          message={`Remove the storage configuration${CREDENTIALED.includes(deleteTarget.storage_type) ? ' and saved credentials' : ''} for "${deleteTarget.entity_display_name || deleteTarget.entity_logical_name}"? Existing files are not deleted.`}
          confirmLabel="Remove"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

interface ConfigRowProps {
  config: DocumentLocationConfig;
  credentialed: boolean;
  secretSaved: boolean;
  testing: boolean;
  disabled: boolean;
  onEdit: () => void;
  onTest: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

function ConfigRow({ config: c, credentialed, secretSaved, testing, disabled, onEdit, onTest, onToggleActive, onDelete }: ConfigRowProps) {
  return (
    <tr className={`group transition-colors ${c.is_active ? 'hover:bg-gray-50' : 'bg-gray-50/60 opacity-60'}`}>
      <td className="px-5 py-3">
        <div className="font-medium text-gray-800">{c.entity_display_name || c.entity_logical_name}</div>
        <div className="text-xs text-gray-400 font-mono">{c.entity_logical_name}</div>
      </td>
      <td className="px-3 py-3">
        <span className="text-[11px] font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">{TYPE_LABEL[c.storage_type]}</span>
        {credentialed && (
          <div className={`mt-1 inline-flex items-center gap-1 text-[10px] ${secretSaved ? 'text-green-600' : 'text-amber-600'}`}>
            <KeyRound size={10} />
            {secretSaved ? 'Credentials set' : 'No credentials'}
          </div>
        )}
      </td>
      <td className="px-3 py-3 font-mono text-xs text-gray-600 break-all">{c.root_location}</td>
      <td className="px-3 py-3">
        {c.is_active ? (
          <span className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">Active</span>
        ) : (
          <span className="text-[11px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">Inactive</span>
        )}
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onTest} disabled={disabled || testing} title="Test connection" className="p-1.5 rounded hover:bg-indigo-50 text-gray-400 hover:text-indigo-500 transition-colors disabled:opacity-40">
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
          </button>
          <button onClick={onEdit} disabled={disabled} title="Edit" className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-40">
            <Edit2 size={13} />
          </button>
          <button onClick={onToggleActive} disabled={disabled} title={c.is_active ? 'Deactivate' : 'Activate'} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40">
            {c.is_active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
          </button>
          <button onClick={onDelete} disabled={disabled} title="Remove" className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40">
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

interface EditFormProps {
  row: EditRow;
  entityOptions: { value: string; label: string; sublabel?: string }[];
  secretSaved: boolean;
  onChange: (r: EditRow) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

function EditForm({ row, entityOptions, secretSaved, onChange, onSave, onCancel, saving }: EditFormProps) {
  const setCred = (key: string, value: string) => onChange({ ...row, creds: { ...row.creds, [key]: value } });
  const credLabel = `text-[11px] font-medium text-gray-500 mb-1`;
  const inputCls = `w-full text-xs border border-gray-300 rounded px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400`;

  return (
    <div className={`px-5 py-4 border-b border-gray-100 ${row.isNew ? 'bg-green-50/40' : 'bg-blue-50/40'}`}>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className={credLabel}>Entity</div>
          {row.isNew ? (
            <SearchableSelect
              options={entityOptions}
              value={row.entity_logical_name}
              onChange={(value) => {
                const opt = entityOptions.find((o) => o.value === value);
                onChange({ ...row, entity_logical_name: value, entity_display_name: opt?.label ?? value });
              }}
              placeholder="Select entity…"
              heightClass="h-9"
            />
          ) : (
            <div className="py-1.5">
              <div className="font-medium text-gray-800 text-sm">{row.entity_display_name || row.entity_logical_name}</div>
              <div className="text-xs text-gray-400 font-mono">{row.entity_logical_name}</div>
            </div>
          )}
        </div>

        <div>
          <div className={credLabel}>Storage type</div>
          <FilterSelect
            value={row.storage_type}
            onChange={(e) => onChange({ ...row, storage_type: e.target.value as StorageType })}
            className={`${inputCls} h-9`}
          >
            {STORAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </FilterSelect>
        </div>

        <div className="col-span-2">
          <div className={credLabel}>Root location / URL</div>
          <input
            value={row.root_location}
            onChange={(e) => onChange({ ...row, root_location: e.target.value })}
            placeholder={ROOT_PLACEHOLDER[row.storage_type]}
            className={`${inputCls} font-mono`}
          />
        </div>

        {row.storage_type === 's3' && (
          <>
            <div className="col-span-2 flex items-center gap-1.5 text-[11px] text-gray-500 mt-1">
              <KeyRound size={12} /> S3 credentials {secretSaved && <span className="text-green-600">· saved (leave blank to keep)</span>}
            </div>
            <div><div className={credLabel}>Access Key ID</div><input className={inputCls} value={row.creds.accessKeyId ?? ''} onChange={(e) => setCred('accessKeyId', e.target.value)} /></div>
            <div><div className={credLabel}>Secret Access Key</div><input type="password" autoComplete="new-password" className={inputCls} value={row.creds.secretAccessKey ?? ''} onChange={(e) => setCred('secretAccessKey', e.target.value)} /></div>
            <div><div className={credLabel}>Region</div><input className={inputCls} placeholder="us-east-1" value={row.creds.region ?? ''} onChange={(e) => setCred('region', e.target.value)} /></div>
            <div><div className={credLabel}>Endpoint (optional, S3-compatible)</div><input className={inputCls} placeholder="https://…" value={row.creds.endpoint ?? ''} onChange={(e) => setCred('endpoint', e.target.value)} /></div>
            <label className="col-span-2 flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={row.forcePathStyle} onChange={(e) => onChange({ ...row, forcePathStyle: e.target.checked })} />
              Force path-style addressing (for MinIO / some S3-compatible stores)
            </label>
          </>
        )}

        {row.storage_type === 'sharepoint' && (
          <>
            <div className="col-span-2 flex items-center gap-1.5 text-[11px] text-gray-500 mt-1">
              <KeyRound size={12} /> SharePoint (Microsoft Graph app) credentials {secretSaved && <span className="text-green-600">· saved (leave blank to keep)</span>}
            </div>
            <div><div className={credLabel}>Tenant ID</div><input className={inputCls} value={row.creds.tenantId ?? ''} onChange={(e) => setCred('tenantId', e.target.value)} /></div>
            <div><div className={credLabel}>Client ID</div><input className={inputCls} value={row.creds.clientId ?? ''} onChange={(e) => setCred('clientId', e.target.value)} /></div>
            <div><div className={credLabel}>Client Secret</div><input type="password" autoComplete="new-password" className={inputCls} value={row.creds.clientSecret ?? ''} onChange={(e) => setCred('clientSecret', e.target.value)} /></div>
            <div><div className={credLabel}>Drive ID (document library)</div><input className={inputCls} value={row.creds.driveId ?? ''} onChange={(e) => setCred('driveId', e.target.value)} /></div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        <button
          type="button"
          onClick={() => onChange({ ...row, is_active: !row.is_active })}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800"
        >
          {row.is_active ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} />}
          {row.is_active ? 'Active' : 'Inactive'}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} disabled={saving} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors disabled:opacity-50">
            <X size={13} /> Cancel
          </button>
          <button onClick={onSave} disabled={saving} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
