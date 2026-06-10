import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronRight, Clock, Wifi } from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { ApiIntegrationLog } from '../../types/apiIntegration';
import { fetchIntegrationLogs } from '../../services/apiIntegrationService';

interface Props {
  integrationId?: string;
  integrationName?: string;
}

export default function ApiIntegrationLogs({ integrationId, integrationName }: Props) {
  const { showError } = useToast();
  const [logs, setLogs] = useState<ApiIntegrationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
  }, [integrationId]);

  async function load() {
    setLoading(true);
    try {
      setLogs(await fetchIntegrationLogs(integrationId));
    } catch {
      showError('Failed to load execution logs');
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  function statusColor(log: ApiIntegrationLog) {
    if (log.is_success) return 'text-emerald-600';
    if (log.response_status && log.response_status >= 400) return 'text-red-500';
    return 'text-amber-500';
  }

  function prettyJson(value: unknown): string {
    try {
      if (typeof value === 'string') {
        return JSON.stringify(JSON.parse(value), null, 2);
      }
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value ?? '');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
        <p className="text-sm font-medium text-gray-700">
          {integrationName ? `Logs — ${integrationName}` : 'All Execution Logs'}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 gap-2 text-center">
            <Clock size={28} className="text-slate-300" />
            <p className="text-sm text-slate-400">No execution logs yet.</p>
            <p className="text-xs text-slate-400">Use the Test button in an integration to generate logs.</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="w-5 px-4 py-2.5" />
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Timestamp</th>
                {!integrationId && (
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Integration</th>
                )}
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Method</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">URL</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Duration</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Trigger</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const isOpen = expanded.has(log.api_integration_log_id);
                return (
                  <>
                    <tr
                      key={log.api_integration_log_id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => toggleExpand(log.api_integration_log_id)}
                    >
                      <td className="px-4 py-2.5 text-slate-400">
                        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                        {formatDate(log.triggered_at)}
                      </td>
                      {!integrationId && (
                        <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[140px] truncate">
                          {log.api_integration_id}
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-mono font-semibold text-slate-700">
                          {log.request_method ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[220px] truncate" title={log.request_url ?? ''}>
                        {log.request_url ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${statusColor(log)}`}>
                          {log.is_success
                            ? <CheckCircle2 size={12} />
                            : log.error_message
                              ? <Wifi size={12} className="text-amber-500" />
                              : <XCircle size={12} />
                          }
                          {log.response_status ?? (log.error_message ? 'ERR' : '—')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">
                        {log.duration_ms != null ? `${log.duration_ms}ms` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 capitalize">
                        {log.trigger_event ?? '—'}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={`${log.api_integration_log_id}-detail`} className="border-b border-gray-100 bg-gray-50">
                        <td colSpan={integrationId ? 7 : 8} className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Request Headers</p>
                              <pre className="text-[11px] bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-40 text-slate-700 leading-relaxed">
                                {prettyJson(log.request_headers_json)}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Request Body</p>
                              <pre className="text-[11px] bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-40 text-slate-700 leading-relaxed">
                                {prettyJson(log.request_body_json) || '(none)'}
                              </pre>
                            </div>
                            <div className="col-span-2">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                Response Body
                                {log.response_status && (
                                  <span className={`ml-2 font-bold normal-case ${log.is_success ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {log.response_status}
                                  </span>
                                )}
                              </p>
                              {log.error_message && (
                                <p className="text-xs text-red-500 mb-1.5">{log.error_message}</p>
                              )}
                              <pre className="text-[11px] bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-40 text-slate-700 leading-relaxed">
                                {log.response_body ? prettyJson(log.response_body) : '(empty)'}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
