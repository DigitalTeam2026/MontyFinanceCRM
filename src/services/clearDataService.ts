import { sendRaw } from '../lib/api';

// One clearable item inside a category (a physical table, or a metadata
// definition row). `protected`/`locked` are safe DEFAULTS — the admin can
// unlock and move anything, including system rows.
export interface ClearItem {
  id: string;
  label: string;
  count: number | null;
  protected: boolean;
  locked: boolean;
}

export interface ClearCategory {
  key: string;
  label: string;
  kind: 'physical' | 'metadata';
  items: ClearItem[];
}

export interface ClearManifest {
  confirmPhrase: string;
  categories: ClearCategory[];
}

export interface ClearResult {
  cleared: { category: string; label: string; rows: number }[];
  failed: { category: string; label: string; error: string }[];
  totalRows: number;
}

/** Load every clearable item, grouped by category, with protected defaults. */
export async function fetchClearManifest(): Promise<ClearManifest> {
  const { ok, body } = await sendRaw<{ data?: ClearManifest; error?: { message: string } }>(
    '/api/admin/clear/manifest',
  );
  if (!ok || !body?.data) throw new Error(body?.error?.message ?? 'Failed to load clearable tables');
  return body.data;
}

/**
 * Permanently clear the selected items. `selections` maps a category key to the
 * list of ids to delete (table names for `tables`, primary keys for metadata).
 * `confirm` must equal the manifest's confirm phrase.
 */
export async function executeClear(
  confirm: string,
  selections: Record<string, string[]>,
): Promise<ClearResult> {
  const { ok, body } = await sendRaw<{ data?: ClearResult; error?: { message: string } }>(
    '/api/admin/clear',
    { method: 'POST', body: JSON.stringify({ confirm, selections }) },
  );
  if (!ok || !body?.data) throw new Error(body?.error?.message ?? 'Failed to clear data');
  return body.data;
}
