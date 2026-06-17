import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import Modal from '../Modal';
import FilterSelect from '../FilterSelect';

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
  const [statusReasons, setStatusReasons] = useState<StatusReason[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    if (!entityDefId) {
      const fallback: StatusReason[] = [
        { status_reason_id: '1', display_label: 'New', reason_value: 1, is_default: true, color: '#3B82F6' },
        { status_reason_id: '2', display_label: 'Contacted', reason_value: 2, is_default: false, color: '#8B5CF6' },
        { status_reason_id: '3', display_label: 'Engaged', reason_value: 3, is_default: false, color: '#06B6D4' },
      ];
      setStatusReasons(fallback);
      setSelectedId(fallback[0].status_reason_id);
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
        setSelectedId((open.find((r) => r.is_default) ?? open[0])?.status_reason_id ?? '');
      });
  }, [entityDefId]);

  const selectedStatus = statusReasons.find((r) => r.status_reason_id === selectedId) ?? null;

  const formattedDate = disqualifiedAt
    ? new Date(disqualifiedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : null;

  return (
    <Modal
      width={480}
      onClose={onCancel}
      icon={<RefreshCw size={16} />}
      title="Reactivate Lead"
      description={
        isQualified
          ? 'The lead will become editable so you can update and qualify again.'
          : 'Lead will return to active status for follow-up.'
      }
      footer={
        <>
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
            onClick={() => selectedStatus && onConfirm({ reason: selectedStatus.display_label, statusReasonValue: selectedStatus.reason_value })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={13} />
            Reactivate
          </button>
        </>
      }
    >
      <div className="space-y-4">
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
          <FilterSelect
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            placeholder="Select status reason…"
            className="w-full px-3 py-2.5 text-[13px] text-slate-800 bg-white border border-slate-200 rounded-lg hover:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none transition"
          >
            {statusReasons.map((sr) => (
              <option key={sr.status_reason_id} value={sr.status_reason_id}>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sr.color }} />
                  {sr.display_label}
                  {sr.is_default && <span className="ml-auto text-[10px] text-slate-400 font-normal">default</span>}
                </span>
              </option>
            ))}
          </FilterSelect>
        </div>
      </div>
    </Modal>
  );
}
