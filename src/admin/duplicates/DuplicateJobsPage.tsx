import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  RefreshCw, Play, CheckCircle2, Clock, AlertTriangle, X,
  ChevronDown, ChevronRight, Database, BarChart2, Loader2,
  StopCircle, Trash2,
} from 'lucide-react';
import type { DuplicateJob, DuplicateDetectionRule } from '../../types/duplicateDetection';
import { JOB_STATUS_META } from '../../types/duplicateDetection';
import {
  fetchDuplicateJobs, fetchDuplicateRules, createDuplicateJob,
  stopDuplicateJob, deleteDuplicateJob,
} from '../../services/duplicateDetectionService';
import { supabase } from '../../lib/supabase';

const POLL_INTERVAL_MS = 2500;

export default function DuplicateJobsPage() {
  const [jobs, setJobs] = useState<DuplicateJob[]>([]);
  const [rules, setRules] = useState<DuplicateDetectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobData, ruleData] = await Promise.all([fetchDuplicateJobs(), fetchDuplicateRules()]);
      setJobs(jobData);
      setRules(ruleData.filter((r) => r.is_active));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasRunningJobs = jobs.some((j) => j.status === 'running' || j.status === 'pending');

  const refreshJobs = useCallback(async () => {
    try {
      const jobData = await fetchDuplicateJobs();
      setJobs(jobData);
    } catch {
    }
  }, []);

  useEffect(() => {
    if (hasRunningJobs) {
      pollTimerRef.current = setInterval(refreshJobs, POLL_INTERVAL_MS);
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [hasRunningJobs, refreshJobs]);

  const handleJobCreated = (job: DuplicateJob) => {
    setJobs((prev) => [job, ...prev]);
    setShowRunModal(false);
  };

  const handleStop = useCallback(async (jobId: string) => {
    try {
      await stopDuplicateJob(jobId);
      setJobs((prev) => prev.map((j) =>
        j.duplicate_job_id === jobId
          ? { ...j, status: 'failed', error_message: 'Stopped by user', completed_at: new Date().toISOString() }
          : j
      ));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to stop job');
    }
  }, []);

  const handleDelete = useCallback(async (jobId: string) => {
    try {
      await deleteDuplicateJob(jobId);
      setJobs((prev) => prev.filter((j) => j.duplicate_job_id !== jobId));
      if (expandedJob === jobId) setExpandedJob(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete job');
    }
  }, [expandedJob]);

  const stats = {
    total: jobs.length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    running: jobs.filter((j) => j.status === 'running' || j.status === 'pending').length,
    totalDuplicates: jobs.reduce((sum, j) => sum + (j.duplicates_found ?? 0), 0),
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-gray-800">Scan Jobs</h3>
          <span className="text-xs text-gray-400">{jobs.length} total</span>
          {hasRunningJobs && (
            <span className="flex items-center gap-1 text-[11px] text-blue-600 font-medium">
              <Loader2 size={11} className="animate-spin" />
              Scanning…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowRunModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Play size={12} />
            Run New Scan
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-0 border-b border-gray-200">
        {[
          { label: 'Total Jobs',       value: stats.total,            icon: <Database  size={14} className="text-gray-400"    /> },
          { label: 'Completed',        value: stats.completed,        icon: <CheckCircle2 size={14} className="text-emerald-500" /> },
          { label: 'Running',          value: stats.running,          icon: <Clock     size={14} className="text-blue-500"    /> },
          { label: 'Duplicates Found', value: stats.totalDuplicates,  icon: <BarChart2 size={14} className="text-amber-500"   /> },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center gap-3 px-5 py-3 border-r border-gray-100 last:border-r-0">
            {stat.icon}
            <div>
              <p className="text-lg font-bold text-gray-900 leading-none">{stat.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle size={12} />{error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-gray-400">Loading jobs…</div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
              <Play size={20} className="text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-600 mb-1">No scan jobs yet</p>
            <p className="text-xs text-gray-400 mb-4">Run a scan to detect existing duplicates in your data</p>
            <button
              onClick={() => setShowRunModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Play size={12} />Run First Scan
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-2">
            {jobs.map((job) => (
              <JobRow
                key={job.duplicate_job_id}
                job={job}
                isExpanded={expandedJob === job.duplicate_job_id}
                onToggle={() => setExpandedJob((prev) =>
                  prev === job.duplicate_job_id ? null : job.duplicate_job_id
                )}
                onStop={handleStop}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {showRunModal && (
        <RunScanModal
          rules={rules}
          onClose={() => setShowRunModal(false)}
          onCreated={handleJobCreated}
        />
      )}
    </div>
  );
}

// ─── Job Row ──────────────────────────────────────────────────────────────────

function JobRow({ job, isExpanded, onToggle, onStop, onDelete }: {
  job: DuplicateJob;
  isExpanded: boolean;
  onToggle: () => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = JOB_STATUS_META[job.status];
  const duration = job.started_at && job.completed_at
    ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)
    : null;

  const ruleName = (job as unknown as { rule?: { name?: string } }).rule?.name ?? '—';
  const isActive = job.status === 'running' || job.status === 'pending';

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 transition-colors">
        <button onClick={onToggle} className="flex-shrink-0">
          <StatusDot status={job.status} />
        </button>
        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-gray-800 truncate">{ruleName}</span>
            <span
              className="text-[10px] font-medium rounded-full px-1.5 py-0"
              style={{ backgroundColor: meta.bg, color: meta.color }}
            >
              {meta.label}
            </span>
            {isActive && <Loader2 size={11} className="text-blue-500 animate-spin" />}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <span className="capitalize">{job.entity_logical_name}</span>
            <span>·</span>
            <span>{new Date(job.created_at).toLocaleString()}</span>
            {duration !== null && <><span>·</span><span>{duration}s</span></>}
          </div>
        </button>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs font-bold text-gray-800">{job.records_scanned.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400">scanned</p>
          </div>
          <div className="text-right">
            <p className={`text-xs font-bold ${job.duplicates_found > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              {job.duplicates_found.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-400">found</p>
          </div>

          <div className="flex items-center gap-1">
            {isActive && (
              <button
                onClick={(e) => { e.stopPropagation(); onStop(job.duplicate_job_id); }}
                title="Stop job"
                className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
              >
                <StopCircle size={14} />
              </button>
            )}
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-red-600 font-medium">Delete?</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(job.duplicate_job_id); }}
                  className="px-2 py-0.5 text-[10px] bg-red-600 text-white rounded font-medium hover:bg-red-700 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                  className="px-2 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded font-medium hover:bg-gray-200 transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                title="Delete job"
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <button onClick={onToggle}>
            {isExpanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <DetailItem label="Job ID" value={<code className="font-mono text-[10px]">{job.duplicate_job_id.slice(0, 8)}…</code>} />
            <DetailItem label="Started"   value={job.started_at   ? new Date(job.started_at).toLocaleString()   : '—'} />
            <DetailItem label="Completed" value={job.completed_at ? new Date(job.completed_at).toLocaleString() : '—'} />
          </div>
          {job.error_message && (
            <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={12} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{job.error_message}</p>
            </div>
          )}
          {job.result_summary && (
            <ResultSummary summary={job.result_summary} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Result Summary ───────────────────────────────────────────────────────────

interface SummaryPair {
  record_a_id: string;
  record_a_label: string;
  record_b_id: string;
  record_b_label: string;
  matched_fields: Array<{ field: string; match_type: 'exact' | 'fuzzy'; score?: number }>;
}

interface SummaryData {
  entity?: string;
  rule_name?: string;
  pairs?: SummaryPair[];
  total_pairs?: number;
}

function ResultSummary({ summary }: { summary: unknown }) {
  const [showRaw, setShowRaw] = useState(false);

  const data = summary as SummaryData;
  const pairs: SummaryPair[] = data?.pairs ?? [];
  const totalPairs = data?.total_pairs ?? pairs.length;

  if (pairs.length === 0) {
    return (
      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex items-center gap-2">
        <CheckCircle2 size={12} />
        No duplicate pairs found.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-700">
          {totalPairs} duplicate pair{totalPairs !== 1 ? 's' : ''} found
          {totalPairs > pairs.length && ` (showing first ${pairs.length})`}
        </p>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="text-[10px] text-blue-600 hover:underline"
        >
          {showRaw ? 'Hide raw' : 'View raw JSON'}
        </button>
      </div>

      {showRaw ? (
        <pre className="text-[10px] text-gray-600 font-mono overflow-auto max-h-40 p-2.5 bg-white border border-gray-200 rounded-lg">
          {JSON.stringify(summary, null, 2)}
        </pre>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {pairs.map((pair, i) => (
            <div key={i} className="bg-white border border-amber-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-800 mb-1">
                <span className="truncate max-w-[35%]">{pair.record_a_label}</span>
                <span className="text-gray-400 shrink-0">↔</span>
                <span className="truncate max-w-[35%]">{pair.record_b_label}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {pair.matched_fields.map((mf, fi) => (
                  <span
                    key={fi}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700"
                  >
                    {mf.field}
                    {mf.match_type === 'fuzzy' && mf.score !== undefined ? ` (${mf.score}%)` : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: DuplicateJob['status'] }) {
  const colors: Record<string, string> = {
    pending:   'bg-gray-400 animate-pulse',
    running:   'bg-blue-500 animate-pulse',
    completed: 'bg-emerald-500',
    failed:    'bg-red-500',
  };
  return <div className={`w-2.5 h-2.5 rounded-full ${colors[status] ?? 'bg-gray-300'}`} />;
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <div className="text-xs text-gray-700">{value}</div>
    </div>
  );
}

// ─── Run Scan Modal ───────────────────────────────────────────────────────────

function RunScanModal({ rules, onClose, onCreated }: {
  rules: DuplicateDetectionRule[];
  onClose: () => void;
  onCreated: (job: DuplicateJob) => void;
}) {
  const [selectedRule, setSelectedRule] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!selectedRule) { setError('Please select a rule.'); return; }
    setRunning(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const rule = rules.find((r) => r.duplicate_rule_id === selectedRule);
      if (!rule) throw new Error('Rule not found');

      const job = await createDuplicateJob(selectedRule, rule.entity_logical_name, user?.id ?? '');
      onCreated(job);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? anonKey;

      fetch(`${supabaseUrl}/functions/v1/scan-duplicates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ job_id: job.duplicate_job_id }),
      }).catch(() => {});

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start scan');
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-gray-900">Run Duplicate Scan</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
          <AlertTriangle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Batch scans compare all existing records against the selected rule. No records are modified. Results appear in the job list in real time.
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />{error}
          </div>
        )}

        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Select Rule <span className="text-red-500">*</span></label>
          <FilterSelect
            value={selectedRule}
            onChange={(e) => setSelectedRule(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="">Choose a detection rule…</option>
            {rules.map((r) => (
              <option key={r.duplicate_rule_id} value={r.duplicate_rule_id}>
                {r.name} ({r.entity_logical_name})
              </option>
            ))}
          </FilterSelect>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors">Cancel</button>
          <button
            onClick={handleRun}
            disabled={running || !selectedRule}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? 'Starting…' : 'Start Scan'}
          </button>
        </div>
      </div>
    </div>
  );
}
