import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, Search, X, AlertTriangle,
  GitMerge, Hash, Archive, Link2, ChevronDown, ChevronRight,
} from 'lucide-react';
import type { MergeAuditEntry, MergeChangeType } from '../../types/mergeCenter';
import { fetchMergeAuditLog } from '../../services/mergeCenterService';
import { loadEntityFieldCodeMetaByLogical, resolveFieldCode } from '../../app/services/fieldCodeResolver';

const CHANGE_TYPE_META: Record<MergeChangeType, {
  label: string; icon: React.ReactNode; color: string; bg: string;
}> = {
  field_merged:         { label: 'Field Merged',       icon: <Hash size={11} />,    color: '#2563eb', bg: 'bg-blue-50'    },
  record_retired:       { label: 'Record Retired',     icon: <Archive size={11} />, color: '#dc2626', bg: 'bg-red-50'     },
  relation_reparented:  { label: 'Relation Reparented', icon: <Link2 size={11} />,  color: '#059669', bg: 'bg-emerald-50' },
};

interface GroupedDecision {
  merge_decision_id: string;
  entity_logical_name: string;
  master_record_id: string;
  loser_record_id: string;
  performed_by: string | null;
  created_at: string;
  entries: MergeAuditEntry[];
}

function groupByDecision(entries: MergeAuditEntry[]): GroupedDecision[] {
  const map = new Map<string, GroupedDecision>();
  entries.forEach((e) => {
    if (!map.has(e.merge_decision_id)) {
      map.set(e.merge_decision_id, {
        merge_decision_id: e.merge_decision_id,
        entity_logical_name: e.entity_logical_name,
        master_record_id: e.master_record_id,
        loser_record_id: e.loser_record_id,
        performed_by: e.performed_by,
        created_at: e.created_at,
        entries: [],
      });
    }
    map.get(e.merge_decision_id)!.entries.push(e);
  });
  return Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MergeAuditLogPage() {
  const [entries, setEntries] = useState<MergeAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // choice / statecode / statusreason codes → labels, keyed by `${entity}::${field}::${value}`.
  const [codeLabels, setCodeLabels] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMergeAuditLog({ limit: 500 });
      setEntries(rows);

      // Resolve merged field old/new codes to labels, per entity, so the audit
      // trail shows "Active" instead of "1". Lookups (UUIDs) stay as stored.
      const labels: Record<string, string> = {};
      const byEntity = new Map<string, MergeAuditEntry[]>();
      for (const e of rows) {
        if (e.change_type !== 'field_merged' || !e.field_name) continue;
        if (!byEntity.has(e.entity_logical_name)) byEntity.set(e.entity_logical_name, []);
        byEntity.get(e.entity_logical_name)!.push(e);
      }
      await Promise.all([...byEntity.entries()].map(async ([logical, es]) => {
        const cm = await loadEntityFieldCodeMetaByLogical(logical);
        if (!cm) return;
        await Promise.all(es.map(async (e) => {
          for (const val of [e.old_value, e.new_value]) {
            if (val == null || val === '') continue;
            const key = `${logical}::${e.field_name}::${val}`;
            if (labels[key] !== undefined) continue;
            const lbl = await resolveFieldCode(cm, e.field_name ?? '', val);
            if (lbl) labels[key] = lbl;
          }
        }));
      }));
      setCodeLabels(labels);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const groups = groupByDecision(entries);

  const filtered = groups.filter((g) => {
    const q = search.toLowerCase();
    return !q ||
      g.master_record_id.toLowerCase().includes(q) ||
      g.loser_record_id.toLowerCase().includes(q) ||
      g.entity_logical_name.toLowerCase().includes(q) ||
      g.entries.some((e) => e.field_name?.toLowerCase().includes(q) || e.relation_name?.toLowerCase().includes(q));
  });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-2.5">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by record ID, field, entity..."
            className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"><RefreshCw size={14} /></button>
        <span className="text-xs text-gray-400">{filtered.length} merge event{filtered.length !== 1 ? 's' : ''}</span>
        {search && (
          <button onClick={() => setSearch('')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
            <X size={11} />Clear
          </button>
        )}
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle size={12} />{error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="text-sm text-gray-400 text-center py-12">Loading audit log...</div>
        ) : filtered.length === 0 ? (
          <EmptyAuditState hasSearch={!!search} />
        ) : (
          <div className="space-y-3">
            {filtered.map((group) => {
              const isOpen = expanded.has(group.merge_decision_id);
              const fieldCount = group.entries.filter((e) => e.change_type === 'field_merged').length;
              const relationCount = group.entries.filter((e) => e.change_type === 'relation_reparented').length;
              const retired = group.entries.some((e) => e.change_type === 'record_retired');

              return (
                <div key={group.merge_decision_id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  {/* Group header */}
                  <button onClick={() => toggleExpand(group.merge_decision_id)}
                    className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <GitMerge size={14} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-bold text-gray-900 capitalize">{group.entity_logical_name} Merge</span>
                        <span className="text-[10px] text-gray-400">{formatDate(group.created_at)}</span>
                        {group.performed_by && (
                          <span className="text-[10px] text-gray-400 font-mono">{group.performed_by.slice(0, 8)}…</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
                        <span className="font-mono">Master: {group.master_record_id.slice(0, 12)}…</span>
                        <span>→</span>
                        <span className="font-mono text-gray-400 line-through">{group.loser_record_id.slice(0, 12)}…</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {fieldCount > 0 && (
                          <span className="text-[10px] bg-blue-50 border border-blue-100 text-blue-600 rounded px-1.5 py-0.5">
                            {fieldCount} field{fieldCount !== 1 ? 's' : ''} merged
                          </span>
                        )}
                        {relationCount > 0 && (
                          <span className="text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-600 rounded px-1.5 py-0.5">
                            {relationCount} relation{relationCount !== 1 ? 's' : ''} reparented
                          </span>
                        )}
                        {retired && (
                          <span className="text-[10px] bg-red-50 border border-red-100 text-red-600 rounded px-1.5 py-0.5">
                            record archived
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-gray-400 mt-1">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>
                  </button>

                  {/* Entry rows */}
                  {isOpen && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {group.entries.map((entry) => {
                        const meta = CHANGE_TYPE_META[entry.change_type];
                        return (
                          <div key={entry.audit_id} className="flex items-start gap-3 px-5 py-2.5">
                            <span className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5 ${meta.bg}`}
                              style={{ color: meta.color }}>
                              {meta.icon}{meta.label}
                            </span>
                            <div className="flex-1 min-w-0 text-xs text-gray-600">
                              {entry.change_type === 'field_merged' && (() => {
                                const oldDisp = entry.old_value != null
                                  ? (codeLabels[`${group.entity_logical_name}::${entry.field_name}::${entry.old_value}`] ?? entry.old_value)
                                  : null;
                                const newDisp = entry.new_value != null
                                  ? (codeLabels[`${group.entity_logical_name}::${entry.field_name}::${entry.new_value}`] ?? entry.new_value)
                                  : null;
                                return (
                                  <span>
                                    <span className="font-mono font-semibold text-gray-800">{entry.field_name}</span>
                                    {oldDisp && <span className="text-gray-400"> {oldDisp} </span>}
                                    <span className="text-gray-400">→ </span>
                                    <span className="font-semibold text-gray-800">{newDisp ?? '—'}</span>
                                    <span className="ml-1.5 text-gray-400">(from {entry.source_record})</span>
                                  </span>
                                );
                              })()}
                              {entry.change_type === 'record_retired' && (
                                <span className="text-red-600">Loser record archived</span>
                              )}
                              {entry.change_type === 'relation_reparented' && (
                                <span>
                                  <span className="font-semibold capitalize">{entry.relation_name}</span>
                                  <span className="text-gray-400"> reparented to master record</span>
                                  {entry.child_record_id && (
                                    <span className="ml-1 text-gray-400 font-mono">{entry.child_record_id.slice(0, 8)}…</span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyAuditState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
        <GitMerge size={24} className="text-gray-300" />
      </div>
      {hasSearch ? (
        <p className="text-sm font-semibold text-gray-600">No matching audit entries</p>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-600 mb-1">No merge history yet</p>
          <p className="text-xs text-gray-400 max-w-xs">Merge events are recorded here once you execute a merge from the Candidates tab.</p>
        </>
      )}
    </div>
  );
}
