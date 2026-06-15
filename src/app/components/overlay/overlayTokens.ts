/**
 * Centralized stacking scale for floating UI. Every overlay in the app should
 * pull its z-index from here instead of hard-coding an arbitrary number, so the
 * layering order is defined in one place and stays internally consistent.
 *
 *   base content      0–10   (in-flow cards, charts, tables)
 *   sticky headers    20     (sticky table head / frozen columns)
 *   popovers          1000   (dropdowns, anchored menus, column filters, view pickers)
 *   dialogs           1100   (modal dialogs that should sit above popovers)
 *   toasts            1200   (transient notifications — always on top)
 *
 * Anchored popovers all share one band (POPOVER) because only one interactive
 * popover tree is meant to be open at a time; nested popovers (e.g. the operator
 * select inside the column filter) live in the same band and are disambiguated
 * by the `data-overlay-portal` marker rather than by competing z-indexes.
 */
export const OVERLAY_Z = {
  stickyHeader: 20,
  popover: 1000,
  dialog: 1100,
  toast: 1200,
} as const;

/**
 * Marker attribute placed on every portal-rendered overlay root. Outside-click
 * logic uses it to tell "clicked truly outside all overlays" apart from "clicked
 * inside a sibling/nested overlay portal" (which lives elsewhere in the DOM tree
 * because it is portalled to document.body).
 */
export const OVERLAY_PORTAL_ATTR = 'data-overlay-portal';
