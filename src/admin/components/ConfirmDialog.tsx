import { AlertTriangle, Info } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  /** Alias for `danger` — renders the destructive (red) styling. */
  destructive?: boolean;
  /** Disables the buttons and shows a pending label while the action runs. */
  loading?: boolean;
  /** Optional third choice (e.g. "Discard & continue") shown between Cancel and Confirm. */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export default function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  onConfirm, onCancel, danger = false, destructive = false, loading = false,
  secondaryLabel, onSecondary,
}: ConfirmDialogProps) {
  const isDanger = danger || destructive;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded border border-slate-200 shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
          <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 mt-0.5 ${isDanger ? 'bg-red-100' : 'bg-blue-100'}`}>
            {isDanger
              ? <AlertTriangle size={14} className="text-red-600" />
              : <Info size={14} className="text-blue-600" />
            }
          </div>
          <div className="flex-1">
            <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
            <p className="mt-1 text-[12px] text-slate-500 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 bg-slate-50">
          <button onClick={onCancel} disabled={loading} className="px-3 py-1.5 text-[12px] text-slate-600 border border-slate-300 rounded hover:bg-white transition-colors disabled:opacity-50">
            {cancelLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button onClick={onSecondary} disabled={loading} className="px-3 py-1.5 text-[12px] font-medium text-slate-700 border border-slate-300 rounded bg-white hover:bg-slate-100 transition-colors disabled:opacity-50">
              {secondaryLabel}
            </button>
          )}
          <button onClick={onConfirm} disabled={loading}
            className={`px-3 py-1.5 text-[12px] font-medium text-white rounded transition-colors disabled:opacity-60 ${isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
