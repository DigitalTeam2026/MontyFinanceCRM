import { useState, useEffect, useCallback } from 'react';
import { FolderCog, Plus, Check, X, CreditCard as Edit2, Trash2, ToggleLeft, ToggleRight, FolderOpen } from 'lucide-react';
import SearchableSelect from '../../app/components/SearchableSelect';
import { useToast } from '../../app/context/ToastContext';
import { fetchEntities } from '../../services/entityService';
import {
  fetchDocumentLocations,
  upsertDocumentLocation,
  deleteDocumentLocation,
} from '../../services/documentLocationService';
import type { DocumentLocationConfig } from '../../types/documentLocation';
import type { EntityDefinition } from '../../types/entity';
import ConfirmDialog from '../components/ConfirmDialog';

interface EditRow {
  entity_logical_name: string;
  entity_display_name: string;
  root_location: string;
  is_active: boolean;
  isNew: boolean;
}

export default function DocumentLocationPage() {
  const { showSuccess, showError } = useToast();
  const [configs, setConfigs] = useState<DocumentLocationConfig[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editRow, setEditRow] = useState<EditRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentLocationConfig | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, ents] = await Promise.all([fetchDocumentLocations(), fetchEntities()]);
      setConfigs(cfg);
      setEntities(ents);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const configuredNames = new Set(configs.map((c) => c.entity_logical_name));

  // For a new row, only offer entities that aren't configured yet.
  const entityOptions = entities
    .filter((e) => editRow && !editRow.isNew ? true : !configuredNames.has(e.logical_name))
    .map((e) => ({ value: e.logical_name, label: e.display_name, sublabel: e.logical_name }));

  const startNew = () => {
    setEditRow({ entity_logical_name: '', entity_display_name: '', root_location: '', is_active: true, isNew: true });
  };

  const startEdit = (c: DocumentLocationConfig) => {
    setEditRow({
      entity_logical_name: c.entity_logical_name,
      entity_display_name: c.entity_display_name,
      root_location: c.root_location,
      is_active: c.is_active,
      isNew: false,
    });
  };

  const handleSave = async () => {
    if (!editRow) return;
    if (!editRow.entity_logical_name) {
      showError('Please select an entity.');
      return;
    }
    if (!editRow.root_location.trim()) {
      showError('Root location is required (e.g. C:\\Users\\you\\MontyFinanceStorage\\Lead).');
      return;
    }
    setSaving(true);
    try {
      await upsertDocumentLocation({
        entity_logical_name: editRow.entity_logical_name,
        entity_display_name: editRow.entity_display_name,
        root_location: editRow.root_location.trim(),
        is_active: editRow.is_active,
      });
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
        is_active: !c.is_active,
      });
      await load();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
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
            <p className="font-semibold text-gray-900 mb-0.5">Per-entity storage roots</p>
            Choose the root folder where uploaded files are stored for each entity. Files are saved as
            <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded mx-1">&lt;root&gt;/&lt;record id&gt;/&lt;file&gt;</span>
            by the local file server, which auto-creates a subfolder per record. The relative path is recorded in the database.
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

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 w-56">Entity</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Root Location</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3 w-24">Status</th>
                <th className="px-5 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {editRow?.isNew && (
                <EditRowComponent
                  row={editRow}
                  entityOptions={entityOptions}
                  onChange={setEditRow}
                  onSave={handleSave}
                  onCancel={() => setEditRow(null)}
                  saving={saving}
                />
              )}
              {configs.map((c) =>
                editRow && !editRow.isNew && editRow.entity_logical_name === c.entity_logical_name ? (
                  <EditRowComponent
                    key={c.entity_logical_name}
                    row={editRow}
                    entityOptions={entityOptions}
                    onChange={setEditRow}
                    onSave={handleSave}
                    onCancel={() => setEditRow(null)}
                    saving={saving}
                  />
                ) : (
                  <ConfigRow
                    key={c.entity_logical_name}
                    config={c}
                    disabled={saving || !!editRow}
                    onEdit={() => startEdit(c)}
                    onToggleActive={() => handleToggleActive(c)}
                    onDelete={() => setDeleteTarget(c)}
                  />
                )
              )}
            </tbody>
          </table>

          {configs.length === 0 && !editRow && (
            <div className="py-12 text-center text-sm text-gray-400">
              No document locations configured yet. Add one to start storing files per entity.
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          The root location is a path on the machine running the file server (your PC for local testing).
          Example: <span className="font-mono">C:\Users\habib.serhan\Desktop\MontyFinanceStorage\Lead</span>.
          Deactivating a location blocks new uploads for that entity without removing existing files.
        </p>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Remove document location"
          message={`Remove the storage configuration for "${deleteTarget.entity_display_name || deleteTarget.entity_logical_name}"? Existing files on disk are not deleted.`}
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
  disabled: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

function ConfigRow({ config: c, disabled, onEdit, onToggleActive, onDelete }: ConfigRowProps) {
  return (
    <tr className={`group transition-colors ${c.is_active ? 'hover:bg-gray-50' : 'bg-gray-50/60 opacity-60'}`}>
      <td className="px-5 py-3">
        <div className="font-medium text-gray-800">{c.entity_display_name || c.entity_logical_name}</div>
        <div className="text-xs text-gray-400 font-mono">{c.entity_logical_name}</div>
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

interface EditRowComponentProps {
  row: EditRow;
  entityOptions: { value: string; label: string; sublabel?: string }[];
  onChange: (r: EditRow) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

function EditRowComponent({ row, entityOptions, onChange, onSave, onCancel, saving }: EditRowComponentProps) {
  return (
    <tr className={row.isNew ? 'bg-green-50/40' : 'bg-blue-50/40'}>
      <td className="px-5 py-2 align-top">
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
      </td>
      <td className="px-3 py-2 align-top">
        <input
          value={row.root_location}
          onChange={(e) => onChange({ ...row, root_location: e.target.value })}
          placeholder="C:\Users\you\MontyFinanceStorage\Lead"
          className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </td>
      <td className="px-3 py-2 align-top">
        <button
          onClick={() => onChange({ ...row, is_active: !row.is_active })}
          className="mt-1.5 text-gray-500 hover:text-gray-700"
          title={row.is_active ? 'Active' : 'Inactive'}
          type="button"
        >
          {row.is_active ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} />}
        </button>
      </td>
      <td className="px-5 py-2 align-top">
        <div className="flex items-center justify-end gap-1 mt-1">
          <button onClick={onSave} disabled={saving} className="p-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50">
            <Check size={13} />
          </button>
          <button onClick={onCancel} disabled={saving} className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors disabled:opacity-50">
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}
