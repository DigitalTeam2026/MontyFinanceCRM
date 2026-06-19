import { supabase } from '../lib/supabase';

/**
 * Schema synchronization + metadata-health helpers.
 *
 * The Supabase Data API (PostgREST) keeps an in-memory schema cache. Tables and
 * columns created from Admin Studio via DDL RPCs are invisible to the API until
 * that cache is reloaded. Call {@link reloadPostgrestSchema} after any DDL so the
 * new object is immediately usable; the runtime also calls it to self-heal when a
 * read/write fails with a stale-cache error.
 */

/** True for PostgREST errors that mean "the schema cache doesn't know this object yet". */
export function isSchemaCacheError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  const code = e.code ?? '';
  const msg = (e.message ?? '').toLowerCase();
  return (
    code === 'PGRST205' || // table not found in schema cache
    code === 'PGRST204' || // column not found in schema cache
    code === '42P01' ||    // undefined_table
    code === '42703' ||    // undefined_column
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the') // "...column '<x>' ... in the schema cache"
  );
}

/**
 * Ask PostgREST to re-introspect the database schema. Best-effort and idempotent —
 * resolves to false (never throws) if the RPC is missing or fails, so callers can
 * use it freely in catch/finally paths.
 */
export async function reloadPostgrestSchema(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('reload_postgrest_schema');
    if (error) return false;
    const r = data as { ok?: boolean } | null;
    return !!r?.ok;
  } catch {
    return false;
  }
}

export interface MetadataHealthEntityRef {
  entity_definition_id: string;
  logical_name: string;
  display_name: string;
  physical_table_name?: string;
  is_custom?: boolean;
}

export interface MetadataHealthColumnRef {
  entity_logical_name: string;
  entity_display_name: string;
  physical_table_name: string;
  field_definition_id: string;
  field_logical_name: string;
  field_display_name: string;
  physical_column_name: string;
}

export interface MetadataHealthReport {
  ok: boolean;
  error?: string;
  generated_at?: string;
  missing_tables: MetadataHealthEntityRef[];
  missing_columns: MetadataHealthColumnRef[];
  entities_missing_main_form: MetadataHealthEntityRef[];
  entities_missing_active_view: MetadataHealthEntityRef[];
  entities_missing_admin_privilege: MetadataHealthEntityRef[];
}

const EMPTY_REPORT: MetadataHealthReport = {
  ok: false,
  missing_tables: [],
  missing_columns: [],
  entities_missing_main_form: [],
  entities_missing_active_view: [],
  entities_missing_admin_privilege: [],
};

/** Run the server-side drift report (admin only). */
export async function fetchMetadataHealthReport(): Promise<MetadataHealthReport> {
  const { data, error } = await supabase.rpc('metadata_health_report');
  if (error) throw error;
  const r = data as Partial<MetadataHealthReport> | null;
  if (!r || !r.ok) throw new Error((r as { error?: string } | null)?.error ?? 'Health report failed');
  return { ...EMPTY_REPORT, ...r, ok: true };
}

/** Total number of drift issues in a report — 0 means the platform is in sync. */
export function countHealthIssues(report: MetadataHealthReport): number {
  return (
    report.missing_tables.length +
    report.missing_columns.length +
    report.entities_missing_main_form.length +
    report.entities_missing_active_view.length +
    report.entities_missing_admin_privilege.length
  );
}
