// Power Automation — client-side detection + enqueue.
//
// Called from recordService.saveRecord() where the before/after values of a
// create/update are both in scope. It evaluates enabled rules for the table
// cheaply in memory and, for each match, enqueues a durable automation_job row.
// It NEVER executes actions inline and NEVER throws into the save path — a
// failure here must not break the user's save. The server worker drains the
// queue and runs the actions.

import { supabase } from '../../../lib/supabase';
import type { AutomationRule } from '../../../types/automationRule';
import { ruleMatches, computeChangedFields, type RecordValues } from './ruleMatch';

interface CacheEntry { rules: AutomationRule[]; ts: number }
const RULE_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

/** Invalidate the in-memory rule cache (call after admin edits/publish). */
export function invalidateRuleCache(table?: string): void {
  if (table) RULE_CACHE.delete(table);
  else RULE_CACHE.clear();
}

async function loadEnabledRules(table: string): Promise<AutomationRule[]> {
  const cached = RULE_CACHE.get(table);
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.rules;

  const { data, error } = await supabase
    .from('automation_rule')
    .select('*')
    .eq('table_logical_name', table)
    .eq('enabled', true);
  if (error) {
    // Don't cache failures; just skip this dispatch.
    return cached?.rules ?? [];
  }
  const rules = (data ?? []) as AutomationRule[];
  RULE_CACHE.set(table, { rules, ts: now });
  return rules;
}

/** Stable-ish "change version" so the same save can't enqueue a rule twice. */
function changeVersion(after: RecordValues): string {
  return String(after.modified_at ?? after.modifiedon ?? after.updated_at ?? Date.now());
}

/**
 * Detect matching rules for a saved record and enqueue one job per match.
 * Best-effort and fire-and-forget from the caller's perspective.
 */
export async function dispatchAutomationForEvent(
  table: string,
  event: 'create' | 'update',
  recordId: string | null,
  after: RecordValues,
  before: RecordValues | null,
  userId: string | null,
): Promise<void> {
  try {
    if (!recordId) return;
    const rules = await loadEnabledRules(table);
    if (rules.length === 0) return;

    const changed = computeChangedFields(before, after);
    const version = changeVersion(after);

    const jobs = rules
      .filter((r) => ruleMatches(r, event, before, after))
      .map((r) => {
        // Batched rules defer execution by the window so sibling events accumulate
        // into one run (the worker coalesces them and sets {{count}}).
        const win = r.batch_window_seconds ?? 0;
        const nextAttempt = win > 0 ? new Date(Date.now() + win * 1000).toISOString() : undefined;
        return {
          rule_id: r.automation_rule_id,
          record_table: table,
          record_id: recordId,
          trigger_event: event,
          change_snapshot: { before, after, changed_fields: changed },
          status: 'pending',
          depth: 0,
          idempotency_key: `${r.automation_rule_id}:${recordId}:${version}`,
          created_by: userId,
          ...(nextAttempt ? { next_attempt_at: nextAttempt } : {}),
        };
      });

    if (jobs.length === 0) return;

    // Duplicate idempotency keys (e.g. a double save of the same change) are
    // rejected by the unique constraint — insert per-row so one dup doesn't drop
    // the rest, and swallow dup errors.
    await Promise.all(
      jobs.map((job) =>
        supabase.from('automation_job').insert(job).then(
          () => {},
          () => {}, // ignore (likely duplicate idempotency_key)
        ),
      ),
    );
  } catch {
    // Never propagate into the save pipeline.
  }
}
