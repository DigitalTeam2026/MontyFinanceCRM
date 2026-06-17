import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { handleAuthError } from '../../lib/supabase';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={15} />,
  error: <AlertCircle size={15} />,
  info: <Info size={15} />,
};

const STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-slate-700 text-white',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  return (
    <div
      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg min-w-[240px] max-w-[380px] text-[13px] font-medium pointer-events-auto animate-slide-up ${STYLES[toast.type]}`}
    >
      <span className="shrink-0 opacity-90">{ICONS[toast.type]}</span>
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 opacity-60 hover:opacity-100 transition ml-1"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
    const duration = type === 'error' ? 5000 : 3500;
    const timer = setTimeout(() => dismiss(id), duration);
    timers.current.set(id, timer);
  }, [dismiss]);

  const showSuccess = useCallback((m: string) => showToast('success', m), [showToast]);
  const showError = useCallback((m: string) => showToast('error', m), [showToast]);
  const showInfo = useCallback((m: string) => showToast('info', m), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showInfo }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function toFriendlyError(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  // Supabase/PostgREST errors are thrown as plain objects ({message, hint, code}),
  // not Error instances — read the text/hint from either shape.
  const raw = e instanceof Error
    ? e.message
    : (e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message ?? '') : '');
  const hint = e && typeof e === 'object' && 'hint' in e ? String((e as { hint?: unknown }).hint ?? '') : '';
  if (!raw && !hint) return fallback;
  const msg = raw.toLowerCase();

  // Read-only converted record (BEFORE UPDATE trigger on crm_prospect).
  if (hint.includes('CONVERTED_RECORD_READONLY') || msg.includes('converted prospect cannot be edited')) {
    return 'A converted Prospect cannot be edited.';
  }

  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) {
    return 'Unable to connect. Please check your connection and try again.';
  }
  if (msg.includes('jwt') || msg.includes('token') || msg.includes('unauthorized') || msg.includes('401')) {
    handleAuthError(e).catch(() => {});
    return 'Your session has expired. Please sign in again.';
  }
  if (msg.includes('42501') || msg.includes('permission denied') || (msg.includes('403') && msg.includes('rls'))) {
    handleAuthError(e).catch(() => {});
    return 'Your session may have expired. Please refresh or sign in again.';
  }
  if (msg.includes('403') || msg.includes('forbidden') || msg.includes('permission')) {
    return "You don't have permission to do that.";
  }
  if (msg.includes('404') || msg.includes('not found')) {
    return 'The record could not be found. It may have been deleted.';
  }
  if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('already exists')) {
    return 'A record with those details already exists.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'The request took too long. Please try again.';
  }
  if (msg.includes('required') || msg.includes('null value') || msg.includes('not-null')) {
    return 'Please fill in all required fields.';
  }
  if (msg.includes('foreign key') || msg.includes('violates')) {
    return 'This record is linked to other data and cannot be changed right now.';
  }

  return fallback;
}
