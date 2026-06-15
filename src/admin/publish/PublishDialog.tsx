import { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Loader2, UploadCloud } from 'lucide-react';
import {
  getLatestVersion,
  runValidation,
  publishAll,
  type PendingSummary,
  type ValidationIssue,
  type PublishResult,
  PublishError,
} from './publicationService';
import { moduleLabel } from './customizationRegistry';

interface Props {
  summary: PendingSummary;
  onClose: () => void;
  onPublished: (result: PublishResult) => void;
}

type Phase = 'review' | 'publishing' | 'success' | 'error';

export default function PublishDialog({ summary, onClose, onPublished }: Props) {
  const [phase, setPhase] = useState<Phase>('review');
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [validating, setValidating] = useState(true);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<{ message: string; issues?: ValidationIssue[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await runValidation();
        if (!cancelled) setIssues(found);
      } catch {
        if (!cancelled) setIssues([]);
      } finally {
        if (!cancelled) setValidating(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const errors = (issues ?? []).filter((i) => i.severity === 'error');
  const warnings = (issues ?? []).filter((i) => i.severity !== 'error');
  const canPublish = phase === 'review' && !validating && errors.length === 0 && summary.total > 0;

  const handlePublish = async () => {
    setPhase('publishing');
    try {
      const base = await getLatestVersion();
      const res = await publishAll(base);
      setResult(res);
      setPhase('success');
      onPublished(res);
    } catch (e) {
      const pe = e as PublishError;
      setError({ message: pe.message, issues: pe.issues });
      if (pe.kind === 'validation_failed' && pe.issues) setIssues(pe.issues);
      setPhase('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 h-12 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <UploadCloud size={16} className="text-blue-600" />
            <h2 className="text-[13px] font-semibold text-slate-800">Publish All Customizations</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 text-[12px] text-slate-700">
          {phase === 'review' && (
            <>
              <p className="mb-3">
                <span className="font-semibold">{summary.total}</span> unpublished change{summary.total === 1 ? '' : 's'} will be published.
                The Sales application configuration will be updated for all users.
              </p>

              {summary.groups.length > 0 ? (
                <div className="border border-slate-200 rounded mb-3 divide-y divide-slate-100">
                  {summary.groups.map((g) => (
                    <div key={g.key} className="flex items-center justify-between px-3 py-1.5">
                      <span>{g.label}</span>
                      <span className="font-semibold text-slate-900">{g.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic mb-3">No pending changes.</p>
              )}

              <div className="flex items-center gap-2 mb-2">
                {validating ? (
                  <><Loader2 size={14} className="animate-spin text-slate-400" /><span>Validating…</span></>
                ) : errors.length === 0 ? (
                  <><CheckCircle2 size={14} className="text-emerald-600" /><span>Validation passed.</span></>
                ) : (
                  <><AlertTriangle size={14} className="text-red-600" /><span className="text-red-700 font-medium">{errors.length} validation error{errors.length === 1 ? '' : 's'} — fix before publishing.</span></>
                )}
              </div>

              {errors.length > 0 && <IssueList issues={errors} tone="error" />}
              {warnings.length > 0 && (
                <>
                  <p className="mt-3 mb-1 text-amber-700 font-medium">{warnings.length} warning{warnings.length === 1 ? '' : 's'}</p>
                  <IssueList issues={warnings} tone="warn" />
                </>
              )}
            </>
          )}

          {phase === 'publishing' && (
            <div className="flex items-center gap-2 py-6 justify-center text-slate-600">
              <Loader2 size={18} className="animate-spin text-blue-600" /> Publishing…
            </div>
          )}

          {phase === 'success' && result && (
            <div className="py-4 text-center">
              <CheckCircle2 size={32} className="text-emerald-600 mx-auto mb-2" />
              <p className="font-medium text-slate-800 mb-1">All customizations were published successfully.</p>
              <p className="text-slate-500">The updated configuration is now available in the Sales application (version {result.version}).</p>
            </div>
          )}

          {phase === 'error' && error && (
            <div className="py-2">
              <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                <AlertTriangle size={16} /> Publication failed
              </div>
              <p className="mb-3">{error.message}</p>
              {error.issues && error.issues.length > 0 && <IssueList issues={error.issues} tone="error" />}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 h-12 border-t border-slate-200 shrink-0">
          {phase === 'success' ? (
            <button onClick={onClose} className="px-3 py-1.5 text-[12px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700">Done</button>
          ) : (
            <>
              <button onClick={onClose} className="px-3 py-1.5 text-[12px] font-medium rounded border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
              <button
                onClick={handlePublish}
                disabled={!canPublish}
                className="px-3 py-1.5 text-[12px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Publish
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function IssueList({ issues, tone }: { issues: ValidationIssue[]; tone: 'error' | 'warn' }) {
  const color = tone === 'error' ? 'text-red-700 bg-red-50 border-red-100' : 'text-amber-700 bg-amber-50 border-amber-100';
  return (
    <ul className={`border rounded text-[11px] divide-y ${color} ${tone === 'error' ? 'divide-red-100' : 'divide-amber-100'}`}>
      {issues.map((i, idx) => (
        <li key={idx} className="px-3 py-1.5">
          <span className="font-medium">{moduleLabel(i.component_type)}{i.component_label ? ` · ${i.component_label}` : ''}:</span> {i.message}
        </li>
      ))}
    </ul>
  );
}
