import type { AppEntity } from '../types';
import { Check, X } from 'lucide-react';

export interface StatusOption {
  value: string;
  label: string;
}

export const ENTITY_STATUSES: Partial<Record<AppEntity, StatusOption[]>> = {
  accounts: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
  contacts: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
  leads: [
    { value: 'new', label: 'New' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'qualified', label: 'Qualified' },
    { value: 'disqualified', label: 'Disqualified' },
  ],
  opportunities: [
    { value: 'open', label: 'Open' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
  tickets: [
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'pending', label: 'Pending' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' },
  ],
};

interface InlineRowActionsProps {
  rowId: string;
  entity: AppEntity;
  canWrite: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onChangeStatus: (status: string) => void;
  onAssign: (userId: string, userName: string) => void;
  assignUsers: { id: string; email: string }[];
}

export default function InlineRowActions({
  canWrite,
  isEditing,
  onSave,
  onCancel,
}: InlineRowActionsProps) {
  if (!canWrite || !isEditing) return null;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); onSave(); }}
        className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 transition"
        title="Save changes"
      >
        <Check size={11} />
        Save
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onCancel(); }}
        className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition"
        title="Cancel"
      >
        <X size={11} />
      </button>
    </div>
  );
}
