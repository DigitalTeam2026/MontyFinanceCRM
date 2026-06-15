// Frontend-only persistence for the Admin Dashboard layout.
//
// The customization (which widgets are shown, in what order, and how each custom
// widget is configured) is a UI preference, NOT data. Per the requirement it must
// not touch backend tables, so it lives entirely in localStorage (per browser).
// Resetting removes the key and falls back to DEFAULT_LAYOUT.

import { DEFAULT_LAYOUT, WIDGET_BY_ID, type LayoutItem } from './widgets';

const STORAGE_KEY = 'monty_admin_dashboard_layout_v2';

let idCounter = 0;
/** A unique instance id for a newly added widget. */
export function newInstanceId(def: string): string {
  idCounter += 1;
  return `${def}.${Date.now().toString(36)}.${idCounter}`;
}

function cloneDefault(): LayoutItem[] {
  return DEFAULT_LAYOUT.map((it) => ({ ...it, cfg: it.cfg ? { ...it.cfg } : undefined }));
}

/** Coerce an unknown parsed value into a valid LayoutItem, or null to drop it. */
function coerceItem(raw: unknown, index: number): LayoutItem | null {
  // Back-compat: a bare string is a v1 layout entry (id === def === instance).
  if (typeof raw === 'string') {
    return WIDGET_BY_ID[raw] ? { i: raw, def: raw } : null;
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const def = typeof o.def === 'string' ? o.def : undefined;
    if (!def || !WIDGET_BY_ID[def]) return null;
    const i = typeof o.i === 'string' ? o.i : `${def}.${index}`;
    const cfg = o.cfg && typeof o.cfg === 'object' ? (o.cfg as LayoutItem['cfg']) : undefined;
    return { i, def, cfg };
  }
  return null;
}

export function loadLayout(): LayoutItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefault();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return cloneDefault();
    const items = parsed.map(coerceItem).filter((x): x is LayoutItem => x !== null);
    // De-dupe instance ids (defensive).
    const seen = new Set<string>();
    const deduped = items.filter((it) => (seen.has(it.i) ? false : (seen.add(it.i), true)));
    return deduped.length > 0 ? deduped : cloneDefault();
  } catch {
    return cloneDefault();
  }
}

export function saveLayout(items: LayoutItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage disabled / quota — non-fatal, layout stays in memory for the session */
  }
}

export function clearLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

export function defaultLayout(): LayoutItem[] {
  return cloneDefault();
}

export function layoutsEqual(a: LayoutItem[], b: LayoutItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
