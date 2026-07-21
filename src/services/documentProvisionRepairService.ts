/**
 * Document folder provisioning — failure queue + repair sweep.
 *
 * When a record is created the browser asks the file server to create its
 * storage folder. That call is best-effort, and when it fails (file server
 * down, entity not configured yet, network blip) the record silently ends up
 * with no folder. This module is the safety net:
 *
 *   1. `logProvisionFailure` records the miss in document_provision_failure so
 *      the failure is visible instead of swallowed.
 *   2. `repairFailedQueue` re-provisions everything in that queue.
 *   3. `repairEntitySweep` walks an entity's whole table and provisions any
 *      record whose folder is missing — this catches records that predate the
 *      queue, or whose failure was never logged (e.g. the browser tab closed).
 *
 * Provisioning is idempotent, and the sweep passes each record's created_at so
 * a rebuilt folder lands on the record's own day (<root>/YYYY/MM/DD/<id>/)
 * rather than today's.
 */
import { supabase } from '../lib/supabase';
import {
  provisionRecordStorageBatch,
  PROVISION_BATCH_SIZE,
  type BatchProvisionItem,
} from './documentService';

export interface ProvisionFailure {
  document_provision_failure_id: string;
  entity_logical_name: string;
  record_id: string;
  record_label: string | null;
  last_error: string | null;
  attempts: number;
  first_failed_at: string;
  last_failed_at: string;
  resolved_at: string | null;
}

export interface RepairSummary {
  /** Folders that did not exist and were created by this run. */
  repaired: number;
  /** Records checked whose folder was already there. */
  alreadyPresent: number;
  /** Records that still could not be provisioned. */
  failed: number;
  /** Per-entity failure messages (first few), for the admin toast/detail. */
  errors: string[];
}

const emptySummary = (): RepairSummary => ({ repaired: 0, alreadyPresent: 0, failed: 0, errors: [] });

function mergeSummary(into: RepairSummary, from: RepairSummary): RepairSummary {
  into.repaired += from.repaired;
  into.alreadyPresent += from.alreadyPresent;
  into.failed += from.failed;
  into.errors.push(...from.errors);
  return into;
}

/**
 * Record (or bump) a failed provision attempt. Called from the record-create
 * path, which must never fail because of this — callers swallow any error.
 * Keyed by (entity, record) so repeated failures increment `attempts` rather
 * than piling up duplicate rows.
 */
export async function logProvisionFailure(
  entityLogicalName: string,
  recordId: string,
  error: unknown,
  recordLabel?: string | null
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error ?? 'Provision failed.');
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('document_provision_failure')
    .select('document_provision_failure_id, attempts')
    .eq('entity_logical_name', entityLogicalName)
    .eq('record_id', recordId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('document_provision_failure')
      .update({
        attempts: (existing.attempts ?? 1) + 1,
        last_error: message,
        last_failed_at: now,
        // A record that fails again after a repair is open once more.
        resolved_at: null,
        resolved_by: null,
      })
      .eq('document_provision_failure_id', existing.document_provision_failure_id);
    return;
  }

  await supabase.from('document_provision_failure').insert({
    entity_logical_name: entityLogicalName,
    record_id: recordId,
    record_label: recordLabel ?? null,
    last_error: message,
    attempts: 1,
    first_failed_at: now,
    last_failed_at: now,
  });
}

/** Outstanding (unresolved) provision failures, newest first. */
export async function fetchProvisionFailures(includeResolved = false): Promise<ProvisionFailure[]> {
  let query = supabase
    .from('document_provision_failure')
    .select('*')
    .order('last_failed_at', { ascending: false })
    .limit(500);
  if (!includeResolved) query = query.is('resolved_at', null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProvisionFailure[];
}

async function markResolved(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { data: session } = await supabase.auth.getUser();
  await supabase
    .from('document_provision_failure')
    .update({ resolved_at: new Date().toISOString(), resolved_by: session?.user?.id ?? null })
    .in('document_provision_failure_id', ids);
}

interface EntityTableMeta {
  table: string;
  pk: string;
  hasCreatedAt: boolean;
}

const tableMetaCache = new Map<string, EntityTableMeta>();

/**
 * Resolve an entity's physical table + primary key from its LOGICAL name (the
 * key document_location_config is stored under). The PK is asked of the DB
 * because prefixed tables don't follow table+'_id' (crm_partners → partners_id).
 */
async function resolveTableMeta(entityLogicalName: string): Promise<EntityTableMeta> {
  const cached = tableMetaCache.get(entityLogicalName);
  if (cached) return cached;

  const { data } = await supabase
    .from('entity_definition')
    .select('physical_table_name, primary_key_column')
    .eq('logical_name', entityLogicalName)
    .is('deleted_at', null)
    .maybeSingle();

  const table = data?.physical_table_name as string | undefined;
  if (!table) throw new Error(`No entity definition found for "${entityLogicalName}".`);

  let pk = (data?.primary_key_column as string | null) ?? null;
  if (!pk) {
    const { data: pkCol } = await supabase.rpc('get_table_pk_column', { p_table: table });
    pk = (pkCol as string | null) ?? `${entityLogicalName}_id`;
  }

  // Not every table carries created_at; without it the sweep falls back to
  // today's day folder, which is still better than no folder at all.
  const probe = await supabase.from(table).select('created_at').limit(1);
  const meta: EntityTableMeta = { table, pk, hasCreatedAt: !probe.error };
  tableMetaCache.set(entityLogicalName, meta);
  return meta;
}

function summarize(results: { ok: boolean; created?: boolean; error?: string }[]): RepairSummary {
  const s = emptySummary();
  for (const r of results) {
    if (!r.ok) {
      s.failed += 1;
      if (r.error && s.errors.length < 5 && !s.errors.includes(r.error)) s.errors.push(r.error);
    } else if (r.created) s.repaired += 1;
    else s.alreadyPresent += 1;
  }
  return s;
}

/**
 * Retry every unresolved row in the failure queue. Rows that provision cleanly
 * are marked resolved; rows that fail again have their error/attempts updated
 * so the admin sees the current reason.
 */
export async function repairFailedQueue(
  onProgress?: (done: number, total: number) => void
): Promise<RepairSummary> {
  const failures = await fetchProvisionFailures(false);
  const total = failures.length;
  const summary = emptySummary();
  if (total === 0) return summary;

  // Group by entity so each batch resolves the entity's storage config once.
  const byEntity = new Map<string, ProvisionFailure[]>();
  for (const f of failures) {
    const list = byEntity.get(f.entity_logical_name) ?? [];
    list.push(f);
    byEntity.set(f.entity_logical_name, list);
  }

  let done = 0;
  for (const [entity, rows] of byEntity) {
    for (let i = 0; i < rows.length; i += PROVISION_BATCH_SIZE) {
      const chunk = rows.slice(i, i + PROVISION_BATCH_SIZE);
      const items: BatchProvisionItem[] = chunk.map((r) => ({
        recordId: r.record_id,
        on: r.first_failed_at,
      }));

      try {
        const results = await provisionRecordStorageBatch(entity, items);
        const byId = new Map(results.map((r) => [r.recordId, r]));
        const resolvedIds: string[] = [];
        for (const row of chunk) {
          const r = byId.get(row.record_id);
          if (r?.ok) resolvedIds.push(row.document_provision_failure_id);
          else if (r?.error) {
            await supabase
              .from('document_provision_failure')
              .update({ last_error: r.error, last_failed_at: new Date().toISOString() })
              .eq('document_provision_failure_id', row.document_provision_failure_id);
          }
        }
        await markResolved(resolvedIds);
        mergeSummary(summary, summarize(results));
      } catch (e: unknown) {
        // Whole batch failed (file server down / entity unconfigured) — none of
        // these get resolved; surface why once rather than per record.
        summary.failed += chunk.length;
        const msg = `${entity}: ${e instanceof Error ? e.message : String(e)}`;
        if (!summary.errors.includes(msg)) summary.errors.push(msg);
      }

      done += chunk.length;
      onProgress?.(done, total);
    }
  }
  return summary;
}

/**
 * Walk one entity's table and ensure every record has a folder. Pages through
 * the table so a large entity doesn't build one giant request. Records already
 * holding a folder are cheap no-ops (mkdir -p), and are reported separately
 * from the ones this run actually repaired.
 */
export async function repairEntitySweep(
  entityLogicalName: string,
  onProgress?: (done: number) => void
): Promise<RepairSummary> {
  const meta = await resolveTableMeta(entityLogicalName);
  const summary = emptySummary();
  const columns = meta.hasCreatedAt ? `${meta.pk}, created_at` : meta.pk;

  let from = 0;
  let done = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(meta.table)
      .select(columns)
      .order(meta.pk, { ascending: true })
      .range(from, from + PROVISION_BATCH_SIZE - 1);
    if (error) throw error;

    const rows = (data ?? []) as unknown as Record<string, string>[];
    if (rows.length === 0) break;

    const items: BatchProvisionItem[] = rows.map((r) => ({
      recordId: r[meta.pk],
      on: meta.hasCreatedAt ? r.created_at ?? null : null,
    }));

    try {
      const results = await provisionRecordStorageBatch(entityLogicalName, items);
      mergeSummary(summary, summarize(results));

      // Anything the sweep just fixed that was also sitting in the queue is now
      // resolved — keeps the two views consistent.
      const fixed = results.filter((r) => r.ok).map((r) => r.recordId);
      if (fixed.length > 0) {
        await supabase
          .from('document_provision_failure')
          .update({ resolved_at: new Date().toISOString() })
          .eq('entity_logical_name', entityLogicalName)
          .is('resolved_at', null)
          .in('record_id', fixed);
      }
    } catch (e: unknown) {
      // A whole-batch failure is a config/transport problem, not a per-record
      // one — retrying the remaining pages would just repeat it.
      summary.failed += rows.length;
      summary.errors.push(e instanceof Error ? e.message : String(e));
      break;
    }

    done += rows.length;
    onProgress?.(done);
    if (rows.length < PROVISION_BATCH_SIZE) break;
    from += PROVISION_BATCH_SIZE;
  }

  return summary;
}

/** Sweep every entity that has an ACTIVE document location configured. */
export async function repairAllEntitiesSweep(
  onProgress?: (entity: string, done: number) => void
): Promise<RepairSummary> {
  const { data, error } = await supabase
    .from('document_location_config')
    .select('entity_logical_name')
    .eq('is_active', true);
  if (error) throw error;

  const summary = emptySummary();
  for (const cfg of (data ?? []) as { entity_logical_name: string }[]) {
    try {
      const one = await repairEntitySweep(cfg.entity_logical_name, (done) =>
        onProgress?.(cfg.entity_logical_name, done)
      );
      mergeSummary(summary, one);
    } catch (e: unknown) {
      summary.errors.push(`${cfg.entity_logical_name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return summary;
}
