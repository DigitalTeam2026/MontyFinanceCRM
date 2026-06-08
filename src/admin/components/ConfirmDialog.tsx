import { AlertTriangle, Info } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export default function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  onConfirm, onCancel, danger = false,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded border border-slate-200 shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
          <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 mt-0.5 ${danger ? 'bg-red-100' : 'bg-blue-100'}`}>
            {danger
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
          <button onClick={onCancel} className="px-3 py-1.5 text-[12px] text-slate-600 border border-slate-300 rounded hover:bg-white transition-colors">
            {cancelLabel}
          </button>
          <button onClick={onConfirm}
            className={`px-3 py-1.5 text-[12px] font-medium text-white rounded transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
