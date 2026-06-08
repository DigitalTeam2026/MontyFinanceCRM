import { useState, useRef, useEffect } from 'react';
import { X, RefreshCw, ChevronDown, Circle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface StatusReason {
  status_reason_id: string;
  display_label: string;
  reason_value: number;
  is_default: boolean;
  color: string;
}

export interface ReopenReasonResult {
  reason: string;
  statusReasonValue: number;
}

interface Props {
  disqualifyReason?: string | null;
  disqualifiedAt?: string | null;
  entityDefId?: string | null;
  isQualified?: boolean;
  onConfirm: (result: ReopenReasonResult) => void;
  onCancel: () => void;
}

export default function ReopenLeadModal({ disqualifyReason, disqualifiedAt, entityDefId, isQualified, onConfirm, onCancel }: Props) {
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const [statusReasons, setStatusReasons] = useState<StatusReason[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<StatusReason | null>(null);

  useEffect(() => {
    if (!entityDefId) {
      const fallback: StatusReason[] = [
        { status_reason_id: '1', display_label: 'New', reason_value: 1, is_default: true, color: '#3B82F6' },
        { status_reason_id: '2', display_label: 'Contacted', reason_value: 2, is_default: false, color: '#8B5CF6' },
        { status_reason_id: '3', display_label: 'Engaged', reason_value: 3, is_default: false, color: '#06B6D4' },
      ];
      setStatusReasons(fallback);
      setSelectedStatus(fallback[0]);
      return;
    }
    supabase
      .from('status_reason_definition')
      .select('status_reason_id, display_label, reason_value, is_default, color, statecode_definition!inner(state_value)')
      .eq('entity_definition_id', entityDefId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (!data) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const open = (data as any[]).filter((r) => r.statecode_definition?.state_value === 1).map((r) => ({
          status_reason_id: r.status_reason_id,
          display_label: r.display_label,
          reason_value: r.reason_value,
          is_default: r.is_default,
          color: r.color ?? '#3B82F6',
        }));
        setStatusReasons(open);
        setSelectedStatus(open.find((r) => r.is_default) ?? open[0] ?? null);
      });
  }, [entityDefId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const formattedDate = disqualifiedAt
    ? new Date(disqualifiedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5">
              <RefreshCw size={15} className="text-blue-500" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">Reactivate Lead</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isQualified
                  ? 'The lead will become editable so you can update and qualify again.'
                  : 'Lead will return to active status for follow-up.'}
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
            <X size={13} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {isQualified && (
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <p className="text-[12px] text-emerald-800">
                The existing linked opportunity will be preserved. After reactivating you can edit the lead and qualify again — the system will ask what to do with the existing opportunity.
              </p>
            </div>
          )}

          {!isQualified && disqualifyReason && (
            <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Disqualified{formattedDate ? ` on ${formattedDate}` : ''}
                </p>
                <p className="text-[12px] text-slate-700 mt-0.5">{disqualifyReason}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Status Reason <span className="text-red-500">*</span>
            </label>
            <div ref={statusRef} className="relative">
              <button
                type="button"
                onClick={() => setStatusOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-[13px] bg-white border border-slate-200 rounded-lg hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition"
              >
                {selectedStatus ? (
                  <span className="flex items-center gap-2">
                    <Circle size={9} fill={selectedStatus.color} stroke="none" />
                    <span className="text-slate-800">{selectedStatus.display_label}</span>
                  </span>
                ) : (
                  <span className="text-slate-400">Select status reason…</span>
                )}
                <ChevronDown size={13} className={`text-slate-400 transition-transform ${statusOpen ? 'rotate-180' : ''}`} />
              </button>
              {statusOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                  {statusReasons.map((sr) => (
                    <button
                      key={sr.status_reason_id}
                      type="button"
                      onClick={() => { setSelectedStatus(sr); setStatusOpen(false); }}
                      className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-2 hover:bg-slate-50 transition ${selectedStatus?.status_reason_id === sr.status_reason_id ? 'font-semibold text-blue-700 bg-blue-50' : 'text-slate-700'}`}
                    >
                      <Circle size={9} fill={sr.color} stroke="none" className="shrink-0" />
                      {sr.display_label}
                      {sr.is_default && <span className="ml-auto text-[10px] text-slate-400 font-normal">default</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedStatus}
            onClick={() => onConfirm({ reason: selectedStatus!.display_label, statusReasonValue: selectedStatus!.reason_value })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={13} />
            Reactivate Lead
          </button>
        </div>
      </div>
    </div>
  );
}
