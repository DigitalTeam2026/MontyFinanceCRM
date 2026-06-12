import FilterSelect from '../FilterSelect';
import { useState, useEffect } from 'react';
import { X, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface ReopenOpportunityModalProps {
  previousState: 'won' | 'lost';
  entityDefId: string | null;
  onConfirm: (fields: Record<string, unknown>) => void;
  onCancel: () => void;
}

export default function ReopenOpportunityModal({
  previousState,
  entityDefId,
  onConfirm,
  onCancel,
}: ReopenOpportunityModalProps) {
  const [statusReasons, setStatusReasons] = useState<{ value: number; label: string }[]>([]);
  const [selectedReason, setSelectedReason] = useState<number>(1);
  const [reopenNote, setReopenNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!entityDefId) {
      setStatusReasons([{ value: 1, label: 'In Progress' }]);
      return;
    }
    supabase
      .from('status_reason_definition')
      .select('reason_value, display_label, statecode_definition!inner(state_value)')
      .eq('entity_definition_id', entityDefId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (!data) return;
        const openReasons = (data as unknown as { reason_value: number; display_label: string; statecode_definition: { state_value: number } }[])
          .filter((d) => d.statecode_definition.state_value === 1)
          .map((d) => ({ value: d.reason_value, label: d.display_label }));
        if (openReasons.length === 0) openReasons.push({ value: 1, label: 'In Progress' });
        setStatusReasons(openReasons);
        setSelectedReason(openReasons[0].value);
      });
  }, [entityDefId]);

  const handleConfirm = () => {
    setSubmitting(true);
    onConfirm({
      statecode: '1',
      statusreason: String(selectedReason),
      reopen_note: reopenNote || null,
      reopened_at: new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-100 bg-blue-50/50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <RefreshCw size={16} className="text-blue-600" />
            <h2 className="text-[14px] font-semibold text-slate-800">Reopen Opportunity</h2>
          </div>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <RefreshCw size={14} className="text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-blue-700 leading-relaxed">
              This opportunity was previously closed as <span className="font-semibold">{previousState === 'won' ? 'Won' : 'Lost'}</span>.
              Reopening will set it back to an active/open state.
            </p>
          </div>

          {statusReasons.length > 0 && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                New Status Reason
              </label>
              <FilterSelect
                value={selectedReason}
                onChange={e => setSelectedReason(Number(e.target.value))}
                className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none bg-white"
              >
                {statusReasons.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </FilterSelect>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
              Reopen Note (optional)
            </label>
            <textarea
              rows={3}
              value={reopenNote}
              onChange={e => setReopenNote(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none resize-none"
              placeholder="Reason for reopening this opportunity..."
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
            className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Reopen Opportunity
          </button>
        </div>
      </div>
    </div>
  );
}
