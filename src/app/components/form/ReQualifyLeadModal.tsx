import { useState } from 'react';
import { X, Briefcase, Plus, Loader2, AlertTriangle } from 'lucide-react';
import type { RecordData } from '../../services/recordService';
import { executeQualifyLead } from '../../services/leadQualificationEngine';
import type { LoadedProcessFlow } from '../../services/processFlowEngine';
import { supabase } from '../../../lib/supabase';

interface Props {
  leadId: string;
  leadValues: RecordData;
  userId: string;
  processFlow?: LoadedProcessFlow | null;
  existingOpportunityId: string;
  onSuccess: (result: { accountId: string | null; contactId: string | null; opportunityId: string | null }) => void;
  onCancel: () => void;
}

export default function ReQualifyLeadModal({
  leadId, leadValues, userId, processFlow, existingOpportunityId, onSuccess, onCancel,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdateExisting = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { buildQualifyPreview } = await import('../../services/leadQualificationEngine');
      const preview = await buildQualifyPreview(leadValues);
      if (!preview) throw new Error('No active qualification rule found.');

      // Sync lead field values into the existing opportunity
      await supabase
        .from('opportunity')
        .update({ ...preview.opportunityValues, modified_at: new Date().toISOString(), modified_by: userId })
        .eq('opportunity_id', existingOpportunityId);

      // Re-mark the lead as qualified, pointing to the same opportunity
      await supabase
        .from('lead')
        .update({
          is_qualified: true,
          state_code: 2,
          status_reason: 4,
          qualified_opportunity_id: existingOpportunityId,
          modified_at: new Date().toISOString(),
          modified_by: userId,
        })
        .eq('lead_id', leadId);

      onSuccess({ accountId: null, contactId: null, opportunityId: existingOpportunityId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.');
      setSubmitting(false);
    }
  };

  const handleCreateNew = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Lead must be in active state for the qualification engine to accept it.
      // If it was reopened it's already state_code 1; if somehow still 2, reset it.
      const currentState = Number(leadValues['state_code'] ?? 1);
      if (currentState !== 1) {
        await supabase
          .from('lead')
          .update({ state_code: 1, status_reason: 1, is_qualified: false, modified_at: new Date().toISOString(), modified_by: userId })
          .eq('lead_id', leadId);
      }

      const result = await executeQualifyLead({
        leadId,
        leadValues: { ...leadValues, state_code: 1, status_reason: 1, is_qualified: false },
        userId,
        createAccount: false,
        createContact: false,
        createOpportunity: true,
        processFlow,
      });
      onSuccess(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Qualify Lead</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              An opportunity already exists for this lead. What would you like to do?
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-3">

          {/* Option 1: Update existing */}
          <button
            type="button"
            onClick={handleUpdateExisting}
            disabled={submitting}
            className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-amber-300 hover:bg-amber-50/40 transition text-left group disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5 text-amber-600 group-hover:bg-amber-200 transition">
              <Briefcase size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-slate-800">Update existing opportunity</p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Sync the lead's current data into the existing opportunity. No new record is created.
              </p>
            </div>
          </button>

          {/* Option 2: Create new */}
          <button
            type="button"
            onClick={handleCreateNew}
            disabled={submitting}
            className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition text-left group disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5 text-emerald-600 group-hover:bg-emerald-200 transition">
              <Plus size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-slate-800">Create a new opportunity</p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Create a fresh opportunity from this lead's current data. The previous opportunity is kept.
              </p>
            </div>
          </button>

          {submitting && (
            <div className="flex items-center justify-center gap-2 py-2 text-[12px] text-slate-500">
              <Loader2 size={14} className="animate-spin" />
              Processing...
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-[12px] text-red-700">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
