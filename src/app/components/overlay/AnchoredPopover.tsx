import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { OVERLAY_PORTAL_ATTR, OVERLAY_Z } from './overlayTokens';
import { useAnchoredPosition, type AnchorPlacement } from './useAnchoredPosition';

interface AnchoredPopoverProps {
  /** The element the popover is anchored to (the trigger). */
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  placement?: AnchorPlacement;
  /** Fixed width in px. */
  width?: number;
  /** Use the anchor width as a minimum width. */
  matchWidth?: boolean;
  minWidth?: number;
  maxHeight?: number;
  /** Extra class names applied to the floating card. */
  className?: string;
  style?: CSSProperties;
  zIndex?: number;
  /** ARIA role for the floating surface (e.g. "menu", "dialog", "listbox"). */
  role?: string;
  /** id forwarded to the floating surface so a trigger can aria-controls it. */
  id?: string;
  /** Close when the Escape key is pressed (default true). */
  closeOnEscape?: boolean;
}

/**
 * Shared anchored popover. Renders its children into a `document.body` portal
 * with collision-aware fixed positioning (see useAnchoredPosition), so it is
 * never clipped by an ancestor's `overflow: hidden` and never mis-placed by
 * page/scroll offsets.
 *
 * Outside-click and Escape close it. Because nested popovers (e.g. an operator
 * <FilterSelect/> inside a column filter) are ALSO portalled to document.body,
 * a plain "is the click inside my DOM node" test would wrongly treat a click on
 * a child popover as outside. We therefore ignore any click that lands inside
 * *any* element marked with the overlay-portal attribute, plus the anchor.
 */
export default function AnchoredPopover({
  anchorEl,
  open,
  onClose,
  children,
  placement = 'bottom-start',
  width,
  matchWidth,
  minWidth = 0,
  maxHeight = 520,
  className = '',
  style,
  zIndex = OVERLAY_Z.popover,
  role,
  id,
  closeOnEscape = true,
}: AnchoredPopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { rect } = useAnchoredPosition(anchorEl, open, { placement, width, matchWidth, minWidth, maxHeight });

  // Outside-click + Escape. Re-bound while open so handlers see fresh props.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (anchorEl && anchorEl.contains(target)) return;          // the trigger itself
      if (target.closest(`[${OVERLAY_PORTAL_ATTR}]`)) return;      // this or a nested popover
      onClose();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        // Return focus to the trigger for keyboard users.
        anchorEl?.focus?.();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, anchorEl, onClose, closeOnEscape]);

  if (!open || !rect) return null;

  return createPortal(
    <div
      ref={cardRef}
      id={id}
      role={role}
      {...{ [OVERLAY_PORTAL_ATTR]: '' }}
      className={className}
      style={{
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        ...(rect.openUp ? { bottom: rect.bottom } : { top: rect.top }),
        maxHeight: rect.maxHeight,
        zIndex,
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
