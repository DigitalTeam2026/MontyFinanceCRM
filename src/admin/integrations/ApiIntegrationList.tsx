import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Zap, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { ApiIntegration, HttpMethod, TriggerEvent } from '../../types/apiIntegration';
import {
  fetchApiIntegrations,
  deleteApiIntegration,
} from '../../services/apiIntegrationService';
import ConfirmDialog from '../components/ConfirmDialog';

interface Props {
  onNew: () => void;
  onEdit: (integration: ApiIntegration) => void;
}

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  POST:   'bg-blue-50   text-blue-700   border-blue-200',
  PUT:    'bg-amber-50  text-amber-700  border-amber-200',
  PATCH:  'bg-purple-50 text-purple-700 border-purple-200',
  DELETE: 'bg-red-50    text-red-700    border-red-200',
};

const TRIGGER_LABELS: Record<TriggerEvent, string> = {
  created: 'On Create',
  updated: 'On Update',
  deleted: 'On Delete',
  manual:  'Manual',
};

export default function ApiIntegrationList({ onNew, onEdit }: Props) {
  const { showSuccess, showError } = useToast();
  const [integrations, setIntegrations] = useState<ApiIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ApiIntegration | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setIntegrations(await fetchApiIntegrations());
    } catch {
      showError('Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(integration: ApiIntegration) {
    try {
      await deleteApiIntegration(integration.api_integration_id);
      setIntegrations((prev) => prev.filter((i) => i.api_integration_id !== integration.api_integration_id));
      showSuccess(`"${integration.name}" deleted`);
    } catch {
      showError('Failed to delete integration');
    }
    setConfirmDelete(null);
  }

  const filtered = integrations.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.entity?.display_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
        <input
          type="search"
          placeholder="Search integrations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          <Plus size={13} />
          New Integration
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onNew={onNew} hasSearch={search.length > 0} />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Entity</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Method</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Trigger</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((intg) => (
                <tr
                  key={intg.api_integration_id}
                  className="border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer transition-colors"
                  onClick={() => onEdit(intg)}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Zap size={13} className="text-blue-500 shrink-0" />
                      <span className="font-medium text-gray-900">{intg.name}</span>
                    </div>
                    {intg.description && (
                      <p className="text-xs text-slate-400 mt-0.5 ml-5 truncate max-w-xs">{intg.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {intg.entity?.display_name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${METHOD_COLORS[intg.http_method]}`}>
                      {intg.http_method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {TRIGGER_LABELS[intg.trigger_event]}
                  </td>
                  <td className="px-4 py-3">
                    {intg.is_active ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                        <CheckCircle2 size={12} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 text-xs font-medium">
                        <XCircle size={12} /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onEdit(intg)}
                        className="p-1.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(intg)}
                        className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Integration"
          message={`Delete "${confirmDelete.name}"? This action cannot be undone and will also delete all execution logs.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ onNew, hasSearch }: { onNew: () => void; hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-56 gap-3 text-center">
      {hasSearch ? (
        <>
          <AlertCircle size={28} className="text-slate-300" />
          <p className="text-sm text-slate-400">No integrations match your search.</p>
        </>
      ) : (
        <>
          <Zap size={28} className="text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No API integrations yet</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Connect CRM entity events to external APIs — webhooks, automation tools, or custom endpoints.
          </p>
          <button
            onClick={onNew}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg mt-1 transition-colors"
          >
            <Plus size={13} /> Create First Integration
          </button>
        </>
      )}
    </div>
  );
}
