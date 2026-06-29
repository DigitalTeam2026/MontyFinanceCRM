// Shared run-history view for a single workflow. Used both in the editor's
// "Run history" tab and in the Logs modal on the workflow list (so you can check
// runs without opening the flow).

import { useEffect, useState } from 'react';
import { RefreshCw, XCircle, CheckCircle2, PlayCircle, ChevronRight, ChevronDown } from 'lucide-react';
import { fetchWorkflowRuns, type WorkflowRunLog } from '../../services/workflowService';

export default function WorkflowRunsPanel({ workflowId }: { workflowId: string }) {
  const [runs, setRuns] = useState<WorkflowRunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchWorkflowRuns(workflowId)
      .then((r) => { setRuns(r); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load runs'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [workflowId]);

  const failed = runs.filter((r) => r.status === 'failed').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-bold text-slate-600">Run history</p>
          <p className="text-[10px] text-slate-400">
            Each time this flow fires it logs a run with the full step trace. Only runs whose trigger matched appear here.
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {runs.length > 0 && (
        <div className="flex items-center gap-3 mb-3 text-[11px]">
          <span className="inline-flex items-center gap-1 text-slate-500">{runs.length} run{runs.length !== 1 ? 's' : ''}</span>
          {failed > 0 && <span className="inline-flex items-center gap-1 text-rose-600"><XCircle size={11} /> {failed} failed</span>}
        </div>
      )}

      {error && <div className="text-[11px] text-rose-600 mb-2">{error}</div>}

      {loading && runs.length === 0 ? (
        <div className="flex items-center justify-center h-32"><RefreshCw size={16} className="animate-spin text-slate-400" /></div>
      ) : runs.length === 0 ? (
        <div className="text-center py-12 text-[12px] text-slate-400">
          No runs yet. Make sure the flow is <strong>Active</strong>, then change a matching record to trigger it.
        </div>
      ) : (
        <div className="space-y-1.5">
          {runs.map((r) => <RunRow key={r.run_id} run={r} />)}
        </div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: WorkflowRunLog }) {
  const [open, setOpen] = useState(false);
  const ok = run.status === 'completed';
  const failed = run.status === 'failed';
  const badge = ok
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : failed
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  const when = new Date(run.completed_at ?? run.started_at);

  return (
    <div className={`border rounded-xl overflow-hidden ${failed ? 'border-rose-200' : 'border-slate-200'}`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left">
        {open ? <ChevronDown size={13} className="text-slate-400 shrink-0" /> : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
        {ok ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" /> : failed ? <XCircle size={13} className="text-rose-500 shrink-0" /> : <PlayCircle size={13} className="text-amber-500 shrink-0" />}
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${badge}`}>{run.status}</span>
        <span className="text-[11px] text-slate-500">{run.trigger_type}</span>
        <span className="text-[11px] text-slate-400 truncate">{run.entity_name}</span>
        <span className="ml-auto text-[10px] text-slate-400 shrink-0">{run.steps_executed} step{run.steps_executed !== 1 ? 's' : ''}</span>
        <span className="text-[10px] text-slate-400 shrink-0">{when.toLocaleString()}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 space-y-2">
          {run.error_message && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5 font-mono break-words">
              {run.error_message}
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-slate-500">
            <div><span className="text-slate-400">Record:</span> {run.record_id ?? '—'}</div>
            <div><span className="text-slate-400">Started:</span> {new Date(run.started_at).toLocaleString()}</div>
          </div>
          <div>
            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Step trace</p>
            {Array.isArray(run.trace_json) && run.trace_json.length > 0 ? (
              <pre className="text-[10px] font-mono text-slate-600 bg-white border border-slate-200 rounded-lg p-2 overflow-x-auto max-h-72">
                {JSON.stringify(run.trace_json, null, 2)}
              </pre>
            ) : (
              <p className="text-[10px] text-slate-400">No trace recorded for this run.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
