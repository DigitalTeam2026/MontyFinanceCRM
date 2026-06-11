import { useState, useEffect } from 'react';
import { X, Trophy, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface CloseOpportunityModalProps {
  mode: 'won' | 'lost';
  values: Record<string, unknown>;
  entityDefId: string | null;
  onConfirm: (closingFields: Record<string, unknown>) => void;
  onCancel: () => void;
}

export default function CloseOpportunityModal({
  mode,
  values,
  entityDefId,
  onConfirm,
  onCancel,
}: CloseOpportunityModalProps) {
  const [statusReasons, setStatusReasons] = useState<{ value: number; label: string }[]>([]);
  const [selectedReason, setSelectedReason] = useState<number | null>(null);
  const [actualRevenue, setActualRevenue] = useState(String(values.actual_revenue ?? values.estimated_value ?? ''));
  const [closeDate, setCloseDate] = useState(
    (values.estimated_close_date as string)?.slice(0, 10) ??
    (values.actual_close_date as string)?.slice(0, 10) ??
    new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState(String(values.close_description ?? ''));
  const [lossReason, setLossReason] = useState('');
  const [competitorName, setCompetitorName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const targetState = mode === 'won' ? 2 : 3;
  const isWon = mode === 'won';
  const Icon = isWon ? Trophy : XCircle;
  const accent = isWon ? 'emerald' : 'red';

  useEffect(() => {
    if (!entityDefId) return;
    supabase
      .from('status_reason_definition')
      .select('reason_value, display_label, color, statecode_definition!inner(state_value)')
      .eq('entity_definition_id', entityDefId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (!data) return;
        const stateReasons = (data as unknown as { reason_value: number; display_label: string; color: string | null; statecode_definition: { state_value: number } }[])
          .filter((d) => d.statecode_definition.state_value === targetState)
          .map((d) => ({ value: d.reason_value, label: d.display_label }));

        if (stateReasons.length === 0) {
          stateReasons.push(isWon
            ? { value: 3, label: 'Won' }
            : { value: 4, label: 'Lost' }
          );
        }
        setStatusReasons(stateReasons);
        setSelectedReason(stateReasons[0]?.value ?? null);
      });
  }, [entityDefId, isWon, targetState]);

  const handleConfirm = () => {
    setSubmitting(true);
    const fields: Record<string, unknown> = {
      statecode: String(targetState),
      statusreason: String(selectedReason ?? (isWon ? 3 : 4)),
      actual_close_date: closeDate || null,
      estimated_close_date: closeDate || null,
      close_description: description || null,
    };
    if (isWon) {
      fields.actual_revenue = actualRevenue ? Number(actualRevenue) : null;
    } else {
      fields.loss_reason = lossReason || null;
      fields.competitor_name = competitorName || null;
    }
    onConfirm(fields);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg mx-4">
        <div className={`flex items-center justify-between px-5 py-4 border-b border-${accent}-100 bg-${accent}-50/50 rounded-t-xl`}>
          <div className="flex items-center gap-2">
            <Icon size={16} className={`text-${accent}-600`} />
            <h2 className="text-[14px] font-semibold text-slate-800">
              {isWon ? 'Close as Won' : 'Close as Lost'}
            </h2>
          </div>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {statusReasons.length > 0 && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                Status Reason
              </label>
              <select
                value={selectedReason ?? ''}
                onChange={e => setSelectedReason(Number(e.target.value))}
                className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none bg-white"
              >
                {statusReasons.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          {isWon && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                Actual Revenue
              </label>
              <input
                type="number"
                value={actualRevenue}
                onChange={e => setActualRevenue(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
                placeholder="0.00"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
              Close Date
            </label>
            <input
              type="date"
              value={closeDate}
              onChange={e => setCloseDate(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
            />
          </div>

          {!isWon && (
            <>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Loss Reason
                </label>
                <input
                  type="text"
                  value={lossReason}
                  onChange={e => setLossReason(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
                  placeholder="Why was this opportunity lost?"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Competitor
                </label>
                <input
                  type="text"
                  value={competitorName}
                  onChange={e => setCompetitorName(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
                  placeholder="Competitor name (optional)"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
              Description / Remarks
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none resize-none"
              placeholder="Add any closing remarks..."
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-[12px] text-slate-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium rounded-lg transition disabled:opacity-50 ${
              isWon
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
            {isWon ? 'Close as Won' : 'Close as Lost'}
          </button>
        </div>
      </div>
    </div>
  );
}