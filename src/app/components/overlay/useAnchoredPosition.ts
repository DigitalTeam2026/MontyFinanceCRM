import { useCallback, useLayoutEffect, useState } from 'react';

export type AnchorPlacement = 'bottom-start' | 'bottom-end';

export interface AnchoredPositionOptions {
  /** Preferred horizontal alignment relative to the anchor. */
  placement?: AnchorPlacement;
  /** Fixed pixel width for the floating element. Overrides matchWidth. */
  width?: number;
  /** Match the anchor's width (used as a minimum, never shrinks below minWidth). */
  matchWidth?: boolean;
  /** Lower bound on width. */
  minWidth?: number;
  /** Upper bound on height before the content scrolls internally. */
  maxHeight?: number;
  /** Gap between anchor and floating element. */
  offset?: number;
  /** Viewport gutter kept clear on every edge. */
  gutter?: number;
}

export interface AnchoredRect {
  /** Resolved `left` in viewport coordinates (for position: fixed). */
  left: number;
  /** Resolved `top` when opening downward; undefined when flipped up. */
  top?: number;
  /** Resolved `bottom` (distance from viewport bottom) when flipped up. */
  bottom?: number;
  width: number;
  /** Max height the floating element may occupy in the chosen direction. */
  maxHeight: number;
  /** True when the element was flipped to open above the anchor. */
  openUp: boolean;
}

/**
 * Floating-UI–style anchored positioning for a portal-rendered overlay using
 * `position: fixed` (viewport coordinates — NEVER add scrollX/scrollY).
 *
 * Handles, in one place, the collision behaviour every dropdown in the app needs:
 *  - flip above the anchor when there isn't room below,
 *  - clamp horizontally so the element never leaves the viewport,
 *  - cap the height to the available space (content scrolls internally),
 *  - recompute on scroll (capture phase, so inner scroll containers count) and
 *    on resize so the element stays anchored.
 *
 * Returns the computed rect plus a `reposition` callback for manual triggers.
 */
export function useAnchoredPosition(
  anchorEl: HTMLElement | null,
  open: boolean,
  opts: AnchoredPositionOptions = {},
): { rect: AnchoredRect | null; reposition: () => void } {
  const {
    placement = 'bottom-start',
    width,
    matchWidth = false,
    minWidth = 0,
    maxHeight = 520,
    offset = 4,
    gutter = 8,
  } = opts;

  const [rect, setRect] = useState<AnchoredRect | null>(null);

  const reposition = useCallback(() => {
    const el = anchorEl;
    if (!el) return;
    const a = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Width: explicit > match-anchor > minWidth, clamped to the viewport.
    let w = width ?? (matchWidth ? a.width : minWidth);
    if (w < minWidth) w = minWidth;
    w = Math.min(w, vw - gutter * 2);

    // Horizontal: align to the requested edge, then clamp into view.
    let left = placement === 'bottom-end' ? a.right - w : a.left;
    if (left + w > vw - gutter) left = vw - gutter - w;
    if (left < gutter) left = gutter;

    // Vertical: prefer below; flip above when there's more room up there.
    const spaceBelow = vh - a.bottom - gutter;
    const spaceAbove = a.top - gutter;
    const openUp = spaceBelow < Math.min(maxHeight, 240) && spaceAbove > spaceBelow;
    const avail = openUp ? spaceAbove : spaceBelow;
    const cappedHeight = Math.max(120, Math.min(maxHeight, avail));

    if (openUp) {
      setRect({ left, bottom: vh - a.top + offset, width: w, maxHeight: cappedHeight, openUp: true });
    } else {
      setRect({ left, top: a.bottom + offset, width: w, maxHeight: cappedHeight, openUp: false });
    }
  }, [anchorEl, placement, width, matchWidth, minWidth, maxHeight, offset, gutter]);

  useLayoutEffect(() => {
    if (!open) { setRect(null); return; }
    reposition();
    const handler = () => reposition();
    // `true` => capture phase, so scrolling of any ancestor (including inner
    // overflow:auto grid containers) repositions the popover, not just window.
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, reposition]);

  return { rect, reposition };
}
