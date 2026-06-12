import { useState, useEffect, useRef } from 'react';
import { X, LogIn, AlertTriangle, CheckCircle2, Loader2, ChevronDown, ChevronRight, ExternalLink, Info } from 'lucide-react';
import type { RecordData } from '../../services/recordService';
import {
  loadProspectConversionPreview,
  convertProspectToLead,
  type ConversionPreview,
  type ConversionResult,
} from '../../services/prospectConversionService';

interface Props {
  prospectId: string;
  prospectValues: RecordData;
  userId: string;
  onSuccess: (result: ConversionResult) => void;
  onCancel: () => void;
}

interface FieldRow {
  targetField: string;
  value: string;
}

function fieldLabel(physical: string): string {
  return physical
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ConvertProspectModal({
  prospectId,
  prospectValues,
  userId,
  onSuccess,
  onCancel,
}: Props) {
  const [preview, setPreview] = useState<ConversionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [showFieldPreview, setShowFieldPreview] = useState(false);

  // Guard against double-click / concurrent submissions
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    loadProspectConversionPreview(prospectValues)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load conversion settings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [prospectValues]);

  const missingRequired = preview?.missingRequired ?? [];
  const isBlocked = missingRequired.length > 0;

  const mappedFields: FieldRow[] = preview
    ? Object.entries(preview.targetValues)
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
        .map(([k, v]) => ({ targetField: k, value: String(v) }))
    : [];

  const handleConvert = async () => {
    if (submittingRef.current || isBlocked || converting) return;
    submittingRef.current = true;
    setConverting(true);
    setConvertError(null);

    try {
      const result = await convertProspectToLead(prospectId, userId);
      onSuccess(result);
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : 'Conversion failed. Please try again.');
      setConverting(false);
    } finally {
      submittingRef.current = false;
    }
  };

  const prospectName =
    [prospectValues.first_name, prospectValues.last_name].filter(Boolean).join(' ') ||
    String(prospectValues.company_name ?? '') ||
    'this Prospect';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'color-mix(in srgb, var(--success) 14%, transparent)',
                color: 'var(--success)',
              }}
            >
              <LogIn size={16} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-800">Convert to Lead</h2>
              <p className="text-[12px] text-slate-500 mt-0.5 truncate max-w-xs">{prospectName}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={converting}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-3 text-slate-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-[13px]">Loading conversion settings…</span>
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex gap-2">
                <AlertTriangle size={15} className="shrink-0 text-red-500 mt-0.5" />
                <p className="text-[12px] text-red-700">{loadError}</p>
              </div>
            </div>
          ) : preview === null ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-2">
                <Info size={15} className="shrink-0 text-amber-600 mt-0.5" />
                <p className="text-[12px] text-amber-700">
                  No active Prospect→Lead conversion rule is configured. Please contact your administrator.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Intro text */}
              <p className="text-[13px] text-slate-600">
                A new <strong>Lead</strong> will be created using the field mappings defined in{' '}
                <em>{preview.rule.name}</em>. The Prospect will be marked{' '}
                <strong>Converted</strong> and become read-only.
              </p>

              {/* Missing required fields */}
              {isBlocked && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
                  <div className="flex gap-2 items-start">
                    <AlertTriangle size={14} className="shrink-0 text-red-500 mt-0.5" />
                    <div>
                      <p className="text-[12px] font-semibold text-red-700">
                        Conversion blocked – required fields are empty
                      </p>
                      <ul className="mt-1.5 list-disc list-inside space-y-0.5">
                        {missingRequired.map(({ sourceField }) => (
                          <li key={sourceField} className="text-[11px] text-red-600">
                            {fieldLabel(sourceField)}
                          </li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-red-500 mt-1.5">
                        Save the Prospect with these fields filled in before converting.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Lead preview card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200 bg-white">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center"
                      style={{ background: 'color-mix(in srgb, var(--link) 14%, transparent)', color: 'var(--link)' }}
                    >
                      <LogIn size={12} />
                    </div>
                    <span className="text-[13px] font-semibold text-slate-700">New Lead</span>
                  </div>
                  {mappedFields.length > 0 && (
                    <button
                      onClick={() => setShowFieldPreview((v) => !v)}
                      className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 transition"
                    >
                      {showFieldPreview ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {showFieldPreview ? 'Hide' : `Preview ${mappedFields.length} mapped field${mappedFields.length !== 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>

                {showFieldPreview && mappedFields.length > 0 && (
                  <div className="px-3.5 py-2.5 space-y-0.5 max-h-48 overflow-y-auto">
                    {mappedFields.map(({ targetField, value }) => (
                      <div key={targetField} className="flex items-start gap-2 py-0.5">
                        <span className="text-[11px] text-slate-400 w-28 shrink-0 pt-px">
                          {fieldLabel(targetField)}
                        </span>
                        <span className="text-[12px] text-slate-700 font-medium break-all">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {mappedFields.length === 0 && !isBlocked && (
                  <p className="px-3.5 py-3 text-[12px] text-slate-400">
                    No field values will be copied (all source fields are empty or no mappings are configured).
                  </p>
                )}
              </div>

              {/* Conversion error */}
              {convertError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
                  <div className="flex gap-2">
                    <AlertTriangle size={14} className="shrink-0 text-red-500 mt-0.5" />
                    <p className="text-[12px] text-red-700">{convertError}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {!loading && !loadError && preview !== null && (
          <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-100 bg-slate-50/60">
            <button
              onClick={onCancel}
              disabled={converting}
              className="px-4 py-2 text-[13px] font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleConvert}
              disabled={isBlocked || converting || loadError !== null}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-xl text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: isBlocked ? undefined : 'var(--success)' }}
            >
              {converting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Converting…
                </>
              ) : (
                <>
                  <LogIn size={14} />
                  Convert to Lead
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Post-conversion success toast / navigation prompt ────────────────────────

interface ConversionSuccessPromptProps {
  result: ConversionResult;
  onOpenLead: (leadId: string) => void;
  onDismiss: () => void;
}

export function ConversionSuccessPrompt({
  result,
  onOpenLead,
  onDismiss,
}: ConversionSuccessPromptProps) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-4">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'color-mix(in srgb, var(--success) 14%, transparent)',
              color: 'var(--success)',
            }}
          >
            <CheckCircle2 size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-slate-800">
              Prospect converted to Lead successfully.
            </p>
            {result.leadName && (
              <p className="text-[12px] text-slate-500 mt-0.5 truncate">{result.leadName}</p>
            )}
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={() => onOpenLead(result.leadId)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg text-white transition"
                style={{ background: 'var(--success)' }}
              >
                <ExternalLink size={12} />
                Open Lead
              </button>
              <button
                onClick={onDismiss}
                className="px-3 py-1.5 text-[12px] font-medium rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
              >
                Stay on Prospect
              </button>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 transition"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
