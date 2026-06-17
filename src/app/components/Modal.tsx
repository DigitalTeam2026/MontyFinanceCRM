import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Reusable modal shell with a fixed header, a scrollable body, and a fixed
 * footer. Use this for every status-action dialog (Activate, Deactivate,
 * Qualify, Disqualify, Close, Reactivate, …) so they all share the same
 * overflow-safe structure.
 *
 * Why a shared shell fixes the recurring "clipped dropdown / hidden buttons"
 * bug class:
 *   - The body is the ONLY scroll region (`overflow-y-auto`); the header and
 *     footer never scroll away, so action buttons are always visible.
 *   - The whole dialog is capped at the viewport height (`max-h`), so on small
 *     screens it stays fully visible and the body scrolls instead of pushing the
 *     footer off-screen.
 *   - The shell renders at Tailwind `z-50` (= 50), which is intentionally BELOW
 *     the popover band (`OVERLAY_Z.popover` = 1000). Any portalled dropdown
 *     (e.g. `FilterSelect`) therefore stacks ABOVE the modal and is never
 *     clipped by the modal's overflow. NEVER raise this above 1000 or in-modal
 *     dropdowns will be hidden behind the dialog.
 *
 * Pair this with a portalled select (`FilterSelect`) for any in-modal dropdown —
 * do not hand-roll an absolutely-positioned menu inside the body, it will be
 * clipped by the body's `overflow-y-auto`.
 */
interface ModalProps {
  title: ReactNode;
  description?: ReactNode;
  /** Optional leading icon shown in a rounded badge in the header. */
  icon?: ReactNode;
  /** Tailwind classes for the icon badge (background / border / text colour). */
  iconClassName?: string;
  /** Max width of the dialog in px. Defaults to 480. */
  width?: number;
  /** Footer content — typically the Cancel + primary action buttons. */
  footer?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  /** Disable the close button + backdrop/Esc dismissal (e.g. while submitting). */
  closeDisabled?: boolean;
  /** When true, clicking the backdrop does not close the dialog. */
  disableBackdropClose?: boolean;
}

export default function Modal({
  title,
  description,
  icon,
  iconClassName = 'bg-blue-50 border border-blue-100 text-blue-500',
  width = 480,
  footer,
  children,
  onClose,
  closeDisabled = false,
  disableBackdropClose = false,
}: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeDisabled) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, closeDisabled]);

  const dismiss = () => {
    if (!closeDisabled && !disableBackdropClose) onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop — a separate element so clicks on the dialog (or on a
          portalled dropdown rendered above it) never bubble here. */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={dismiss} />

      <div
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: width }}
        className="relative w-full bg-white rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden"
      >
        {/* Header — fixed */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            {icon && (
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${iconClassName}`}>
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-slate-900 leading-tight">{title}</h3>
              {description && (
                <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">{description}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body — the only scroll region */}
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>

        {/* Footer — fixed */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
