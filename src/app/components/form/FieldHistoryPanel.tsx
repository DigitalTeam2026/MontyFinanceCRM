import { useState, useEffect, useCallback } from 'react';
import { History, ChevronDown, ChevronUp, User, RefreshCw, DollarSign, ArrowRight, ShieldAlert, AlertTriangle } from 'lucide-react';
import type { AppEntity } from '../../types';
import { fetchFieldHistory, type FieldChangeEntry } from '../../services/recordService';
import { useToast } from '../../context/ToastContext';
import { fetchCurrencyAuditLog, type CurrencyAuditLogRow } from '../../services/currencyService';
import { getEntityTable } from '../../services/recordService';
import { supabase } from '../../../lib/supabase';

interface Props {
  entity: AppEntity;
  recordId: string;
}

function formatLabel(fieldName: string): string {
  if (fieldName === '__currency__') return 'Currency Change';
  if (fieldName === '__currency_change_reason__') return 'Currency Change Reason';
  if (fieldName === '__cleared_by_currency_change__') return 'Cleared by Currency Change';
  return fieldName
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HIDDEN_FIELDS = new Set([
  'modifiedon', 'modified_on', 'modified_at',
  'custom_fields',
  'currency_locked', 'currency_lock_reason',
]);

function formatValue(v: string | null, resolvedNames?: Record<string, string>): string {
  if (v === null) return '—';
  if (v === 'true') return 'Yes';
  if (v === 'false') return 'No';
  if (UUID_RE.test(v) && resolvedNames?.[v]) return resolvedNames[v];
  try {
    const parsed = JSON.parse(v);
    if (typeof parsed === 'object') return JSON.stringify(parsed);
  } catch { /* not JSON */ }
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
  return v;
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAmount(amount: number | null, symbol: string | null): string {
  if (amount === null) return '—';
  const sym = symbol ?? '';
  return `${sym}${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatFieldLabel(fieldName: string): string {
  const map: Record<string, string> = {
    estimated_value: 'Estimated Value',
    actual_value: 'Actual Value',
    annual_revenue: 'Annual Revenue',
    __currency__: 'Currency',
  };
  return map[fieldName] ?? fieldName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  system_save: { label: 'System Save', color: 'blue' },
  controlled_currency_change: { label: 'Admin Change', color: 'amber' },
  workflow: { label: 'Workflow', color: 'emerald' },
  import: { label: 'Import', color: 'slate' },
  status_lock: { label: 'Status Lock', color: 'orange' },
};

const SOURCE_COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
};

function getDateLabel(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

type ActiveTab = 'all' | 'currency';

export default function FieldHistoryPanel({ entity, recordId }: Props) {
  const { showError } = useToast();
  const [entries, setEntries] = useState<FieldChangeEntry[]>([]);
  const [currencyLogs, setCurrencyLogs] = useState<CurrencyAuditLogRow[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterField, setFilterField] = useState<string>('');
  const [expandedSave, setExpandedSave] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');

  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entityName = await getEntityTable(entity);
      const [hist, currencyHist] = await Promise.all([
        fetchFieldHistory(entity, recordId),
        fetchCurrencyAuditLog(entityName, recordId),
      ]);

      // Filter out noisy system fields
      const cleaned = hist.filter((e) => !HIDDEN_FIELDS.has(e.field_name));
      setEntries(cleaned);
      setCurrencyLogs(currencyHist);

      // Collect unique user IDs from both history entries and currency logs
      const allUserIds = [
        ...cleaned.map((e) => e.changed_by),
        ...currencyHist.map((e) => e.changed_by),
      ].filter((id): id is string => !!id);
      const userIds = [...new Set(allUserIds)];
      const map: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data } = await supabase.rpc('fn_get_user_display_map', { p_user_ids: userIds });
        for (const row of (data ?? []) as { user_id: string; display_name: string }[]) {
          map[row.user_id] = row.display_name;
        }
      }
      setUserMap(map);

      // Collect UUIDs from old_value / new_value that might be lookup references
      const uuids = new Set<string>();
      for (const e of cleaned) {
        if (e.old_value && UUID_RE.test(e.old_value)) uuids.add(e.old_value);
        if (e.new_value && UUID_RE.test(e.new_value)) uuids.add(e.new_value);
      }
      if (uuids.size > 0) {
        const names: Record<string, string> = {};
        const lookupTables = ['product', 'contact', 'account', 'lead', 'opportunity', 'crm_user', 'currency', 'country', 'crm_source', 'product_family', 'line_of_business'];
        for (const table of lookupTables) {
          const remaining = [...uuids].filter((id) => !names[id]);
          if (remaining.length === 0) break;
          const pkCol = table === 'crm_user' ? 'user_id'
            : table === 'product_family' ? 'family_id'
            : table === 'line_of_business' ? 'lob_id'
            : table === 'crm_source' ? 'source_id'
            : `${table}_id`;
          const nameCol = table === 'crm_user' ? 'email'
            : table === 'contact' ? 'full_name'
            : table === 'lead' ? 'full_name'
            : table === 'currency' ? 'code'
            : 'name';
          const { data } = await supabase
            .from(table)
            .select(`${pkCol}, ${nameCol}`)
            .in(pkCol, remaining)
            .limit(remaining.length);
          for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
            const id = String(row[pkCol] ?? '');
            const label = String(row[nameCol] ?? '');
            if (id && label) names[id] = label;
          }
        }
        setResolvedNames(names);
      }
    } catch {
      const msg = 'Unable to load field history. Please try again.';
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  }, [entity, recordId]);

  useEffect(() => { load(); }, [load]);

  const allFields = Array.from(new Set(entries.map((e) => e.field_name))).sort();

  const filtered = filterField
    ? entries.filter((e) => e.field_name === filterField)
    : entries;

  const groupedBySave = ((): { saveKey: string; changedAt: string; changedBy: string | null; fields: FieldChangeEntry[] }[] => {
    const map = new Map<string, FieldChangeEntry[]>();
    for (const e of filtered) {
      const key = `${e.changed_at}__${e.changed_by}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).map(([key, fields]) => ({
      saveKey: key,
      changedAt: fields[0].changed_at,
      changedBy: fields[0].changed_by,
      fields,
    }));
  })();

  const toggleSave = (key: string) => {
    setExpandedSave((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
        <RefreshCw size={14} className="animate-spin" />
        <span className="text-[13px]">Loading history…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-[13px] text-red-500">{error}</div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition ${
              activeTab === 'all'
                ? 'bg-white text-slate-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <History size={12} />
            All Changes
            {entries.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold">
                {entries.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('currency')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition ${
              activeTab === 'currency'
                ? 'bg-white text-slate-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <DollarSign size={12} />
            Currency Audit
            {currencyLogs.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                {currencyLogs.length}
              </span>
            )}
          </button>
        </div>
        <button
          onClick={load}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {activeTab === 'all' && (
        <>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
              Filter field
            </label>
            <select
              value={filterField}
              onChange={(e) => setFilterField(e.target.value)}
              className="flex-1 text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">All fields</option>
              {allFields.map((f) => (
                <option key={f} value={f}>{formatLabel(f)}</option>
              ))}
            </select>
          </div>

          {entries.length === 0 ? (
            <div className="py-12 text-center">
              <History size={28} className="mx-auto mb-2 text-slate-200" />
              <p className="text-[13px] text-slate-400">No field changes recorded yet.</p>
              <p className="text-[12px] text-slate-300 mt-1">Changes will appear here after the first save.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {groupedBySave.length === 0 && (
                <p className="text-[13px] text-slate-400 text-center py-6">No changes for this field.</p>
              )}
              {(() => {
                const dateLabels = new Set<string>();
                return groupedBySave.map((save) => {
                  const dateLabel = getDateLabel(save.changedAt);
                  const showDateHeader = !dateLabels.has(dateLabel);
                  if (showDateHeader) dateLabels.add(dateLabel);
                  const isExpanded = expandedSave.has(save.saveKey);
                  const userEmail = save.changedBy ? (userMap[save.changedBy] ?? 'Unknown user') : 'System';

                  return (
                    <div key={save.saveKey}>
                      {showDateHeader && (
                        <div className="flex items-center gap-2 py-2 mb-1">
                          <div className="flex-1 h-px bg-slate-100" />
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                            {dateLabel}
                          </span>
                          <div className="flex-1 h-px bg-slate-100" />
                        </div>
                      )}

                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden mb-2 hover:border-slate-300 transition">
                        <button
                          type="button"
                          onClick={() => toggleSave(save.saveKey)}
                          className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-slate-50 transition"
                        >
                          <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                            <History size={11} className="text-blue-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[12px] font-semibold text-slate-700">
                                {save.fields.length} field{save.fields.length !== 1 ? 's' : ''} changed
                              </span>
                              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                <User size={10} />
                                {userEmail}
                              </span>
                              <span className="ml-auto text-[11px] text-slate-400 shrink-0">
                                {formatRelative(save.changedAt)}
                              </span>
                            </div>
                          </div>
                          <span className="text-slate-300 shrink-0">
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-slate-100 divide-y divide-slate-50">
                            {save.fields.map((entry) => (
                              <div key={entry.log_id} className="px-4 py-2.5 bg-slate-50/50">
                                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                                  {formatLabel(entry.field_name)}
                                </div>
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">Before</div>
                                    <div className={`text-[12px] px-2 py-1 rounded-md font-mono break-all ${
                                      entry.old_value === null
                                        ? 'text-slate-300 italic bg-slate-100'
                                        : 'text-slate-600 bg-white border border-slate-200'
                                    }`}>
                                      {formatValue(entry.old_value, resolvedNames)}
                                    </div>
                                  </div>
                                  <div className="text-slate-300 shrink-0 mt-5">→</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">After</div>
                                    <div className={`text-[12px] px-2 py-1 rounded-md font-mono break-all ${
                                      entry.new_value === null
                                        ? 'text-slate-300 italic bg-slate-100'
                                        : 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                                    }`}>
                                      {formatValue(entry.new_value, resolvedNames)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </>
      )}

      {activeTab === 'currency' && (
        <CurrencyAuditTab logs={currencyLogs} userMap={userMap} />
      )}
    </div>
  );
}

function CurrencyAuditTab({
  logs,
  userMap,
}: {
  logs: CurrencyAuditLogRow[];
  userMap: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (logs.length === 0) {
    return (
      <div className="py-12 text-center">
        <DollarSign size={28} className="mx-auto mb-2 text-slate-200" />
        <p className="text-[13px] text-slate-400">No currency or monetary changes recorded yet.</p>
        <p className="text-[12px] text-slate-300 mt-1">
          Currency audit entries appear when monetary values or the record currency changes.
        </p>
      </div>
    );
  }

  const dateLabels = new Set<string>();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg mb-2">
        <ShieldAlert size={12} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-[11px] text-amber-700 leading-relaxed">
          This audit trail records every monetary value and currency change, including old/new amounts,
          currencies, exchange rates, and the source of each change. It is immutable.
        </p>
      </div>

      {logs.map((log) => {
        const dateLabel = getDateLabel(log.changed_at);
        const showDateHeader = !dateLabels.has(dateLabel);
        if (showDateHeader) dateLabels.add(dateLabel);

        const isExpanded = expanded.has(log.log_id);
        const userEmail = log.changed_by ? (userMap[log.changed_by] ?? 'Unknown user') : 'System';
        const src = SOURCE_LABELS[log.change_source] ?? { label: log.change_source, color: 'slate' };
        const srcCls = SOURCE_COLOR_MAP[src.color] ?? SOURCE_COLOR_MAP.slate;

        const isCurrencySwitch = log.field_name === '__currency__';
        const hasAmountChange = log.old_amount !== null || log.new_amount !== null;

        return (
          <div key={log.log_id}>
            {showDateHeader && (
              <div className="flex items-center gap-2 py-2 mb-1">
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  {dateLabel}
                </span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>
            )}

            <div className={`rounded-xl border overflow-hidden mb-2 transition ${
              log.change_source === 'controlled_currency_change'
                ? 'border-amber-200 bg-amber-50/30'
                : 'border-slate-200 bg-white'
            } hover:border-slate-300`}>
              <button
                type="button"
                onClick={() => toggle(log.log_id)}
                className="w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-slate-50/60 transition"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  log.change_source === 'controlled_currency_change'
                    ? 'bg-amber-100 border border-amber-300'
                    : 'bg-blue-50 border border-blue-200'
                }`}>
                  <DollarSign size={11} className={
                    log.change_source === 'controlled_currency_change' ? 'text-amber-600' : 'text-blue-500'
                  } />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-slate-700">
                      {formatFieldLabel(log.field_name)}
                    </span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${srcCls}`}>
                      {src.label}
                    </span>
                    {log.conversion_occurred && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-orange-50 text-orange-700 border-orange-200 text-[10px] font-semibold">
                        <AlertTriangle size={9} />
                        FX Conversion
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {(log.old_currency_code || log.new_currency_code) && (
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span className="font-mono font-semibold text-slate-600">{log.old_currency_code ?? '—'}</span>
                        <ArrowRight size={9} className="text-slate-300" />
                        <span className="font-mono font-semibold text-emerald-700">{log.new_currency_code ?? '—'}</span>
                      </span>
                    )}
                    {hasAmountChange && (
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span className="font-mono text-slate-600">
                          {formatAmount(log.old_amount, log.old_currency_symbol)}
                        </span>
                        <ArrowRight size={9} className="text-slate-300" />
                        <span className="font-mono text-emerald-700">
                          {formatAmount(log.new_amount, log.new_currency_symbol)}
                        </span>
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[11px] text-slate-400 ml-auto shrink-0">
                      <User size={9} />
                      {userEmail}
                      <span className="mx-1">·</span>
                      {formatRelative(log.changed_at)}
                    </span>
                  </div>
                </div>
                <span className="text-slate-300 shrink-0 mt-1">
                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100 px-4 py-3 space-y-3 bg-slate-50/50">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        Previous State
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">Currency</span>
                          <span className="text-[12px] font-mono font-semibold text-slate-600">
                            {log.old_currency_code
                              ? `${log.old_currency_symbol ?? ''} ${log.old_currency_code}`
                              : '—'}
                          </span>
                        </div>
                        {!isCurrencySwitch && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">Amount</span>
                            <span className="text-[12px] font-mono text-slate-600">
                              {formatAmount(log.old_amount, log.old_currency_symbol)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        New State
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-emerald-600">Currency</span>
                          <span className="text-[12px] font-mono font-semibold text-emerald-700">
                            {log.new_currency_code
                              ? `${log.new_currency_symbol ?? ''} ${log.new_currency_code}`
                              : '—'}
                          </span>
                        </div>
                        {!isCurrencySwitch && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-emerald-600">Amount</span>
                            <span className="text-[12px] font-mono text-emerald-700">
                              {formatAmount(log.new_amount, log.new_currency_symbol)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {log.conversion_occurred && log.exchange_rate_snapshot !== null && (
                    <div className="flex items-center gap-2 px-2.5 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                      <AlertTriangle size={11} className="text-orange-500 shrink-0" />
                      <span className="text-[11px] text-orange-700">
                        Exchange rate snapshot:{' '}
                        <span className="font-semibold font-mono">
                          1 {log.old_currency_code} = {log.exchange_rate_snapshot} {log.new_currency_code}
                        </span>
                      </span>
                    </div>
                  )}

                  {log.reason && (
                    <div className="px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-0.5">
                        Reason for change
                      </div>
                      <p className="text-[12px] text-amber-800 leading-relaxed">{log.reason}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                    <span>
                      Changed by <span className="font-semibold text-slate-600">
                        {log.changed_by ? (userMap[log.changed_by] ?? 'Unknown') : 'System'}
                      </span>
                    </span>
                    <span>·</span>
                    <span>
                      {new Date(log.changed_at).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </span>
                    <span>·</span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
                      SOURCE_COLOR_MAP[SOURCE_LABELS[log.change_source]?.color ?? 'slate']
                    }`}>
                      {SOURCE_LABELS[log.change_source]?.label ?? log.change_source}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
