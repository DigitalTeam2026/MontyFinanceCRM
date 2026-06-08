import { X, AlertTriangle, ShieldAlert, ExternalLink, Copy } from 'lucide-react';
import type { DuplicateMatch } from '../../services/duplicateCheckingEngine';

interface Props {
  matches: DuplicateMatch[];
  mustBlock: boolean;
  onSaveAnyway: () => void;
  onCancel: () => void;
  onOpenRecord?: (entityName: string, recordId: string) => void;
}

function fieldLabel(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bId\b/, 'ID');
}

export default function DuplicateWarningModal({
  matches,
  mustBlock,
  onSaveAnyway,
  onCancel,
  onOpenRecord,
}: Props) {
  const blockCount = matches.filter((m) => m.behavior === 'block').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className={`px-5 py-4 border-b flex items-start justify-between gap-3 ${mustBlock ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
          <div className="flex items-start gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${mustBlock ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
              {mustBlock ? <ShieldAlert size={17} /> : <AlertTriangle size={17} />}
            </div>
            <div>
              <h3 className={`text-[14px] font-semibold ${mustBlock ? 'text-red-900' : 'text-amber-900'}`}>
                {mustBlock ? 'Duplicate Detected — Save Blocked' : 'Potential Duplicate Found'}
              </h3>
              <p className={`text-[11px] mt-0.5 ${mustBlock ? 'text-red-600' : 'text-amber-600'}`}>
                {mustBlock
                  ? `${matches.length} existing record${matches.length > 1 ? 's' : ''} match${matches.length === 1 ? 'es' : ''} this data. You must review before saving.`
                  : `${matches.length} potential duplicate${matches.length > 1 ? 's' : ''} found. You can still save or review.`}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-white/60 transition shrink-0"
          >
            <X size={13} />
          </button>
        </div>

        {/* Match list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {mustBlock && blockCount > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-1">
              <ShieldAlert size={12} className="text-red-500 shrink-0" />
              <p className="text-[11px] text-red-700">
                {blockCount} rule{blockCount > 1 ? 's are' : ' is'} set to <strong>block</strong> saving. Review the records below.
              </p>
            </div>
          )}

          {matches.map((match, i) => (
            <div
              key={match.recordId + i}
              className={`rounded-xl border overflow-hidden ${match.behavior === 'block' ? 'border-red-200' : 'border-amber-200'}`}
            >
              {/* Match header */}
              <div className={`flex items-center justify-between px-3.5 py-2.5 gap-2 ${match.behavior === 'block' ? 'bg-red-50' : 'bg-amber-50'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${match.behavior === 'block' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <span className="text-[13px] font-semibold text-slate-800 truncate">{match.recordLabel}</span>
                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                    match.behavior === 'block'
                      ? 'text-red-700 bg-red-100 border-red-200'
                      : 'text-amber-700 bg-amber-100 border-amber-200'
                  }`}>
                    {match.behavior === 'block' ? 'Block' : 'Warn'}
                  </span>
                </div>
                {onOpenRecord && (
                  <button
                    onClick={() => onOpenRecord(match.entityName, match.recordId)}
                    className="shrink-0 flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium transition"
                    title="Open record"
                  >
                    <ExternalLink size={11} />
                    View
                  </button>
                )}
              </div>

              {/* Rule + matched fields */}
              <div className="px-3.5 py-2.5 bg-white space-y-2">
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                  Rule: <span className="normal-case font-semibold text-slate-600">{match.ruleName}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {match.matchedFields.map((mf, fi) => (
                    <div
                      key={fi}
                      className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-1"
                    >
                      {mf.matchType === 'exact'
                        ? <Copy size={9} className="text-slate-400 shrink-0" />
                        : <AlertTriangle size={9} className="text-amber-400 shrink-0" />
                      }
                      <span className="text-[11px] text-slate-600">{fieldLabel(mf.fieldName)}</span>
                      {mf.matchType === 'fuzzy' && mf.score !== undefined && (
                        <span className="text-[10px] text-amber-600 font-semibold">{mf.score}%</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <p className="text-[11px] text-slate-400">
            {mustBlock
              ? 'Consider opening existing records to merge or update instead.'
              : 'You may save the record or go back to review.'}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-white border border-slate-200 rounded-lg transition"
            >
              {mustBlock ? 'Go Back' : 'Review'}
            </button>
            {!mustBlock && (
              <button
                onClick={onSaveAnyway}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-[13px] font-semibold rounded-lg hover:bg-amber-700 transition"
              >
                <AlertTriangle size={12} />
                Save Anyway
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
