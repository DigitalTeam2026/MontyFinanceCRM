import { useEffect, useState, useCallback } from 'react';
import {
  Search, RefreshCw, Plus, X, ChevronRight,
  AlertTriangle, GitMerge, Zap, User, Building2,
  Filter,
} from 'lucide-react';
import type { MergeCandidate, MergeCandidateStatus } from '../../types/mergeCenter';
import { CANDIDATE_STATUS_META, KNOWN_ENTITIES_MERGE } from '../../types/mergeCenter';
import {
  fetchMergeCandidates,
  updateCandidateStatus,
  fetchMergeSummaryStats,
} from '../../services/mergeCenterService';

interface Props {
  onOpen: (candidate: MergeCandidate) => void;
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  account:     <Building2 size={12} />,
  contact:     <User size={12} />,
  lead:        <Zap size={12} />,
  opportunity: <GitMerge size={12} />,
};

function SimScore({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400 text-xs">—</span>;
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#6b7280';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}

export default function MergeCandidatesListPage({ onOpen }: Props) {
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<MergeCandidateStatus | ''>('pending');
  const [stats, setStats] = useState<Record<string, number>>({});
  const [dismissing, setDismissing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, s] = await Promise.all([
        fetchMergeCandidates({ entity: entityFilter || undefined, status: statusFilter || undefined }),
        fetchMergeSummaryStats(),
      ]);
      setCandidates(data);
      setStats(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [entityFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDismiss = async (candidate: MergeCandidate, status: 'not_duplicate' | 'skipped') => {
    setDismissing(candidate.merge_candidate_id);
    try {
      await updateCandidateStatus(candidate.merge_candidate_id, status);
      setCandidates((prev) => prev.filter((c) => c.merge_candidate_id !== candidate.merge_candidate_id));
      setStats((prev) => ({
        ...prev,
        [candidate.status]: (prev[candidate.status] ?? 1) - 1,
        [status]: (prev[status] ?? 0) + 1,
        total: prev.total ?? 0,
      }));
    } finally { setDismissing(null); }
  };

  const filtered = candidates.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.record_a_label.toLowerCase().includes(q) || c.record_b_label.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
        {(['pending', 'in_review', 'merged', 'not_duplicate', 'skipped'] as MergeCandidateStatus[]).map((s) => {
          const meta = CANDIDATE_STATUS_META[s];
          const count = stats[s] ?? 0;
          return (
            <button key={s} onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                statusFilter === s ? meta.border + ' ' + meta.bg : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
              }`}
              style={statusFilter === s ? { color: meta.color } : {}}>
              <span className="tabular-nums">{count}</span>
              <span>{meta.label}</span>
            </button>
          );
        })}
        <span className="ml-auto text-xs text-gray-400">{stats.total ?? 0} total pairs</span>
      </div>

      {/* Toolbar */}
      <div className="px-5 py-2.5 border-b border-gray-200 bg-white flex items-center gap-2.5 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by record name..."
            className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
          <option value="">All entities</option>
          {KNOWN_ENTITIES_MERGE.map((e) => <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>)}
        </select>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"><RefreshCw size={14} /></button>
        <span className="text-xs text-gray-400">{filtered.length} pair{filtered.length !== 1 ? 's' : ''}</span>

        {(search || entityFilter || statusFilter) && (
          <button onClick={() => { setSearch(''); setEntityFilter(''); setStatusFilter(''); }}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
            <X size={11} />Clear filters
          </button>
        )}

        <button
          onClick={() => onOpen({ merge_candidate_id: '__new__' } as MergeCandidate)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={13} />Flag Pair
        </button>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle size={12} />{error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-gray-400">Loading candidates...</div>
        ) : filtered.length === 0 ? (
          <EmptyState hasFilters={!!(search || entityFilter || statusFilter)} />
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((candidate) => (
              <CandidateRow
                key={candidate.merge_candidate_id}
                candidate={candidate}
                dismissing={dismissing === candidate.merge_candidate_id}
                onOpen={() => onOpen(candidate)}
                onDismiss={(status) => handleDismiss(candidate, status)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Candidate Row ────────────────────────────────────────────────────────────

function CandidateRow({ candidate, dismissing, onOpen, onDismiss }: {
  candidate: MergeCandidate;
  dismissing: boolean;
  onOpen: () => void;
  onDismiss: (status: 'not_duplicate' | 'skipped') => void;
}) {
  const statusMeta = CANDIDATE_STATUS_META[candidate.status];
  const entityIcon = ENTITY_ICONS[candidate.entity_logical_name] ?? <Filter size={12} />;
  const entityLabel = KNOWN_ENTITIES_MERGE.find((e) => e.logical_name === candidate.entity_logical_name)?.display_name ?? candidate.entity_logical_name;
  const matchedFields = (candidate.match_fields ?? []) as { field: string; score: number }[];
  const isMerged = candidate.status === 'merged';
  const canAct = candidate.status === 'pending' || candidate.status === 'in_review';

  return (
    <div className={`group flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors ${isMerged ? 'opacity-60' : ''}`}>
      {/* Score */}
      <div className="flex flex-col items-center gap-1 pt-0.5 w-20 flex-shrink-0">
        <SimScore score={candidate.similarity_score} />
        <span className="text-[10px] text-gray-400">similarity</span>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-gray-400">{entityIcon}</span>
          <span className="text-[10px] font-semibold text-gray-500">{entityLabel}</span>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusMeta.bg} ${statusMeta.border}`}
            style={{ color: statusMeta.color }}>
            {statusMeta.label}
          </span>
          {candidate.source === 'manual' && (
            <span className="text-[10px] text-gray-400 bg-gray-100 border border-gray-200 rounded px-1.5">manual</span>
          )}
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{candidate.record_a_label}</p>
            <p className="text-[10px] text-gray-400 font-mono truncate">{candidate.record_a_id}</p>
          </div>
          <div className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-gray-100">
            <GitMerge size={13} className="text-gray-400" />
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-sm font-semibold text-gray-900 truncate">{candidate.record_b_label}</p>
            <p className="text-[10px] text-gray-400 font-mono truncate">{candidate.record_b_id}</p>
          </div>
        </div>

        {matchedFields.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-400">Matched on:</span>
            {matchedFields.map((mf) => (
              <span key={mf.field} className="text-[10px] bg-blue-50 border border-blue-100 text-blue-600 rounded px-1.5 py-0.5 font-mono">
                {mf.field}
                <span className="ml-1 text-blue-400">{Math.round(mf.score * 100)}%</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0 pt-1">
        {canAct && !dismissing && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onDismiss('not_duplicate'); }}
              className="px-2.5 py-1.5 text-[10px] font-semibold text-gray-500 border border-gray-200 rounded-lg hover:border-gray-400 hover:text-gray-700 transition-all">
              Not Duplicate
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDismiss('skipped'); }}
              className="px-2.5 py-1.5 text-[10px] font-semibold text-gray-500 border border-gray-200 rounded-lg hover:border-gray-400 hover:text-gray-700 transition-all">
              Skip
            </button>
          </>
        )}
        {dismissing && <span className="text-xs text-gray-400">Updating...</span>}
        <button onClick={onOpen}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-[10px] font-semibold rounded-lg hover:bg-blue-700 transition-colors">
          Review <ChevronRight size={11} />
        </button>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
        <GitMerge size={24} className="text-emerald-300" />
      </div>
      {hasFilters ? (
        <>
          <p className="text-sm font-semibold text-gray-700 mb-1">No matching pairs</p>
          <p className="text-xs text-gray-400">Try adjusting your filters</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-700 mb-1">No duplicate candidates</p>
          <p className="text-xs text-gray-400 max-w-xs">Run a duplicate detection scan or manually flag two records to see them here.</p>
        </>
      )}
    </div>
  );
}
